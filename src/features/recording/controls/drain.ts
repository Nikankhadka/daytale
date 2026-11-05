import { AppState } from 'react-native';

import { useSessionStore } from '../../../state/session';
import type { RecordingSession } from '../../../storage/types';
import type { CommandResult, RecordingEngine } from '../engine';
import { recordingHost } from '../useRecordingEngine';
import { parseRecordingIntentRecord, type RecordingIntentKind } from './intents';
import { nativeRecordingIntentStore, type RecordingIntentStore } from './intentStore';

export const RECORDING_INTENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const RECORDING_RESUME_MAX_AGE_MS = 2 * 60 * 1000;

export type RecordingIntentOutcomeStatus =
  | 'applied'
  | 'noop'
  | 'stale'
  | 'unknown-session'
  | 'invalid'
  | 'duplicate'
  | 'deferred'
  | 'failed';

export type RecordingIntentOutcome = {
  id: string;
  kind: RecordingIntentKind | 'invalid';
  status: RecordingIntentOutcomeStatus;
};

export type DrainRecordingIntentsOptions = {
  store?: RecordingIntentStore;
  engine?: Pick<RecordingEngine, 'pause' | 'resume' | 'stop'>;
  getSession?: () => RecordingSession | null;
  isForeground?: () => boolean;
  now?: () => Date;
};

type Entry = {
  value: unknown;
  /** The raw string id when the record can be removed through the store API. */
  id: string | undefined;
  createdAt: number;
};

type Context = {
  store: RecordingIntentStore;
  engine: Pick<RecordingEngine, 'pause' | 'resume' | 'stop'>;
  getSession: () => RecordingSession | null;
  isForeground: () => boolean;
  now: () => Date;
};

function removableId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const id = (value as Record<string, unknown>).id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function sortTimestamp(value: unknown): number {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 0;
  }
  const createdAt = (value as Record<string, unknown>).createdAt;
  if (typeof createdAt !== 'string') {
    return 0;
  }
  const parsed = Date.parse(createdAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function kindOf(value: unknown): RecordingIntentKind | 'invalid' {
  return parseRecordingIntentRecord(value)?.kind ?? 'invalid';
}

async function removeRecord(store: RecordingIntentStore, id: string): Promise<void> {
  await store.remove([id]);
}

async function processRecord(record: unknown, id: string | undefined, context: Context) {
  const parsed = parseRecordingIntentRecord(record);
  if (parsed === null) {
    // A record with no removable string id cannot be deleted through the store API; it is reported
    // and skipped so the batch keeps moving.
    if (id !== undefined) {
      await removeRecord(context.store, id);
    }
    return { id: id ?? '', kind: 'invalid' as const, status: 'invalid' as const };
  }

  const session = context.getSession();
  if (session === null || session.id !== parsed.sessionId) {
    await removeRecord(context.store, parsed.id);
    return { id: parsed.id, kind: parsed.kind, status: 'unknown-session' as const };
  }

  const age = context.now().getTime() - Date.parse(parsed.createdAt);
  if (
    age > RECORDING_INTENT_MAX_AGE_MS ||
    (parsed.kind === 'resume' && age > RECORDING_RESUME_MAX_AGE_MS)
  ) {
    await removeRecord(context.store, parsed.id);
    return { id: parsed.id, kind: parsed.kind, status: 'stale' as const };
  }

  if (parsed.kind === 'resume' && !context.isForeground()) {
    return { id: parsed.id, kind: parsed.kind, status: 'deferred' as const };
  }

  const statusBefore = session.status;
  const result: CommandResult =
    parsed.kind === 'pause'
      ? await context.engine.pause()
      : parsed.kind === 'resume'
        ? await context.engine.resume()
        : await context.engine.stop();

  const status = mapResult(result, statusBefore);
  await removeRecord(context.store, parsed.id);
  return { id: parsed.id, kind: parsed.kind, status };
}

function mapResult(
  result: CommandResult,
  statusBefore: RecordingSession['status'],
): RecordingIntentOutcomeStatus {
  if (result.ok) {
    return result.session.status === statusBefore ? 'noop' : 'applied';
  }
  if (result.code === 'rejected') {
    return 'noop';
  }
  if (result.code === 'not-found') {
    return 'unknown-session';
  }
  return 'failed';
}

/**
 * Applies every queued native intent to the recording engine, oldest first. A record is durable
 * before its command runs, so the drain never throws and a failed record is not retried here.
 */
export async function drainRecordingIntents(
  options: DrainRecordingIntentsOptions = {},
): Promise<RecordingIntentOutcome[]> {
  const context: Context = {
    store: options.store ?? nativeRecordingIntentStore,
    engine: options.engine ?? recordingHost.engine,
    getSession: options.getSession ?? (() => useSessionStore.getState().recordingSession),
    isForeground: options.isForeground ?? (() => AppState.currentState === 'active'),
    now: options.now ?? (() => new Date()),
  };

  let records: unknown[];
  try {
    records = await context.store.read();
  } catch {
    return [];
  }

  const entries: Entry[] = records
    .map((value) => ({ value, id: removableId(value), createdAt: sortTimestamp(value) }))
    .sort((left, right) => {
      if (left.createdAt !== right.createdAt) {
        return left.createdAt - right.createdAt;
      }
      return (left.id ?? '').localeCompare(right.id ?? '');
    });

  const seen = new Set<string>();
  const reportedDuplicates = new Set<string>();
  const outcomes: RecordingIntentOutcome[] = [];

  for (const entry of entries) {
    if (entry.id !== undefined) {
      if (seen.has(entry.id)) {
        if (!reportedDuplicates.has(entry.id)) {
          reportedDuplicates.add(entry.id);
          outcomes.push({ id: entry.id, kind: kindOf(entry.value), status: 'duplicate' });
        }
        continue;
      }
      seen.add(entry.id);
    }

    try {
      outcomes.push(await processRecord(entry.value, entry.id, context));
    } catch {
      // A command that throws is a failure, but the record is still removed so it is not retried
      // on the next drain. Removal is best-effort because the throw may have come from the store.
      if (entry.id !== undefined) {
        try {
          await context.store.remove([entry.id]);
        } catch {
          // The batch must continue even when removal fails.
        }
      }
      outcomes.push({ id: entry.id ?? '', kind: kindOf(entry.value), status: 'failed' });
    }
  }

  return outcomes;
}
