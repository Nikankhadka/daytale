import { randomUUID } from 'expo-crypto';

import type { JournalApiClient } from '../../services/journalApi';
import { useSessionStore } from '../../state/session';
import type { StorageBootstrapResult } from '../../storage/bootstrap';
import type { RecordingSession, RecordingSessionStatus } from '../../storage/types';
import { retrySession } from '../recording/sessionCommands';
import { processGeneration, processSession } from './orchestrator';
import type { GenerationDependencies, TranscribeDependency } from './orchestrator';

export const RETRY_BASE_MS = 30_000;
export const RETRY_CAP_MS = 900_000;

/** Exponential backoff with no jitter: 30 s, 60 s, 120 s, ... capped at 15 minutes. */
export function retryDelayMs(attempt: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_CAP_MS);
}

export type ProcessingHostDependencies = {
  getStorage: () => StorageBootstrapResult | undefined;
  getClient: () => JournalApiClient;
  /** Optional passthrough; the orchestrator builds the real local pipeline when omitted. */
  transcribe?: TranscribeDependency;
  now?: () => Date;
  uuid?: () => string;
  /** Defaults to publishing the session into the zustand store. */
  publish?: (session: RecordingSession) => void;
};

export type ProcessingHost = {
  kick: (sessionId: string) => Promise<void>;
  reconcile: (now: Date) => Promise<void>;
  attach: () => () => void;
};

type RetryState = { attempts: number; nextAt: number };

const RETRYABLE_CODES = new Set(['network', 'timeout', 'rate-limited', 'upstream-unavailable']);

const PROCESSING_STATUSES: ReadonlySet<RecordingSessionStatus> = new Set([
  'transcribing',
  'analyzing',
  'generating',
]);

const RETRY_TARGETS: ReadonlySet<string> = new Set(['transcribing', 'analyzing', 'generating']);

function isProcessing(status: RecordingSessionStatus): boolean {
  return PROCESSING_STATUSES.has(status);
}

/**
 * Drives the processing pipeline whenever a session is ready for it and keeps durable retry
 * timing for transient failures. It owns no timers: the reconciler asks it to catch up, the
 * store subscription asks it to continue, and the persisted session stays the source of truth.
 */
export function createProcessingHost(dependencies: ProcessingHostDependencies): ProcessingHost {
  const now = dependencies.now ?? (() => new Date());
  const uuid = dependencies.uuid ?? randomUUID;
  const publish =
    dependencies.publish ??
    ((session: RecordingSession) => useSessionStore.getState().setRecordingSession(session));
  const inFlight = new Set<string>();
  const retries = new Map<string, RetryState>();

  const pipeline = (storage: StorageBootstrapResult): GenerationDependencies => {
    const client = dependencies.getClient();
    return {
      storage,
      analyze: client.analyze,
      generate: client.generate,
      transcribe: dependencies.transcribe,
      now,
      uuid,
    };
  };

  const noteFailure = (session: RecordingSession): void => {
    const at = now().getTime();
    const code = session.failureCode;
    const target = session.retryTarget;
    const retryable =
      code !== undefined &&
      RETRYABLE_CODES.has(code) &&
      target !== undefined &&
      RETRY_TARGETS.has(target) &&
      session.retryUntil !== undefined &&
      Date.parse(session.retryUntil) > at;
    if (!retryable) {
      retries.delete(session.id);
      return;
    }
    const attempts = (retries.get(session.id)?.attempts ?? 0) + 1;
    retries.set(session.id, { attempts, nextAt: at + retryDelayMs(attempts - 1) });
  };

  const generate = async (storage: StorageBootstrapResult, sessionId: string): Promise<void> => {
    const result = await processGeneration(pipeline(storage), sessionId);
    if (result.status === 'noop') {
      // A journal or a settled session means no retry is owed; a concurrent failure keeps its state.
      if (result.session === null || result.session.status !== 'failed') {
        retries.delete(sessionId);
      }
      return;
    }
    publish(result.session);
    if (result.session.status === 'failed') {
      noteFailure(result.session);
    } else {
      retries.delete(sessionId);
    }
  };

  const kick = async (sessionId: string): Promise<void> => {
    // `publish` can synchronously refire the attach subscription, so guard before any await.
    if (inFlight.has(sessionId)) return;
    inFlight.add(sessionId);
    try {
      const storage = dependencies.getStorage();
      if (storage === undefined) return;
      const session = await storage.repositories.recordingSessions.getById(sessionId);
      if (session === null) return;

      if (session.status === 'failed') {
        noteFailure(session);
        return;
      }
      if (!isProcessing(session.status)) {
        retries.delete(sessionId);
        return;
      }

      if (session.status !== 'generating') {
        const result = await processSession(pipeline(storage), sessionId);
        if (result.status !== 'noop') {
          publish(result.session);
        }
        const next = result.session;
        if (next === null) return;
        if (next.status === 'generating') {
          await generate(storage, sessionId);
          return;
        }
        if (next.status === 'failed') {
          noteFailure(next);
          return;
        }
        retries.delete(sessionId);
        return;
      }

      await generate(storage, sessionId);
    } catch {
      // Leave the persisted state untouched; the next reconcile picks it up.
    } finally {
      inFlight.delete(sessionId);
    }
  };

  const reconcile = async (at: Date): Promise<void> => {
    try {
      const storage = dependencies.getStorage();
      if (storage === undefined) return;
      const sessions = await storage.repositories.recordingSessions.list();
      for (const session of sessions) {
        if (isProcessing(session.status)) {
          await kick(session.id);
          continue;
        }
        if (session.status !== 'failed') continue;

        const code = session.failureCode;
        const target = session.retryTarget;
        const retryable =
          code !== undefined &&
          RETRYABLE_CODES.has(code) &&
          target !== undefined &&
          RETRY_TARGETS.has(target) &&
          session.retryUntil !== undefined &&
          Date.parse(session.retryUntil) > at.getTime();
        if (!retryable) {
          retries.delete(session.id);
          continue;
        }

        const state = retries.get(session.id);
        if (state !== undefined && at.getTime() < state.nextAt) {
          continue;
        }

        let outcome: Awaited<ReturnType<typeof retrySession>>;
        try {
          outcome = await retrySession(storage, session.id, uuid(), { now: () => at, uuid });
        } catch {
          // Leave the session for the next reconcile rather than losing the attempt.
          continue;
        }
        if (outcome === 'retried') {
          await kick(session.id);
        } else {
          retries.delete(session.id);
        }
      }
    } catch {
      // Leave the persisted state untouched; the next reconcile picks it up.
    }
  };

  const attach = (): (() => void) => {
    const current = useSessionStore.getState().recordingSession;
    let previousId = current?.id;
    let previousStatus = current?.status;
    const unsubscribe = useSessionStore.subscribe((state) => {
      const session = state.recordingSession;
      if (session?.id === previousId && session?.status === previousStatus) {
        return;
      }
      previousId = session?.id;
      previousStatus = session?.status;
      if (session !== null && isProcessing(session.status)) {
        void kick(session.id);
      }
    });
    if (current !== null && isProcessing(current.status)) {
      void kick(current.id);
    }
    return unsubscribe;
  };

  return { kick, reconcile, attach };
}
