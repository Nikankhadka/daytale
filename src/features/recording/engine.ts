import { randomUUID } from 'expo-crypto';

import type { RecordingSessionAction } from '../../state/recordingSessionReducer';
import { useSessionStore } from '../../state/session';
import type {
  RecordingSessionOperationResult,
  StorageRepositories,
} from '../../storage/repositories';
import {
  MAX_RETRY_WINDOW_MS,
  type AudioChunk,
  type RecordingSession,
  type RecordingSessionRetryTarget,
  type RecordingSessionStatus,
} from '../../storage/types';
import { closeChunk, newActiveChunk } from './chunk';
import { expoRecordingFiles, type RecordingFiles } from './files';
import {
  checkStartPreconditions,
  MIN_FREE_STORAGE_BYTES,
  type StartBlocker,
} from './preconditions';
import {
  CHUNK_ROTATION_SECONDS,
  createSerialQueue,
  expoAudioNative,
  RECORDING_AUDIO_MODE,
  RECORDING_OPTIONS,
  type RecordingNative,
  type RecordingRecorder,
} from './recorder';

export type InterruptCode = 'call' | 'route-loss' | 'low-storage' | 'os-interruption';

export type CommandFailure = StartBlocker | 'not-found' | 'rejected' | 'capture-failed';

export type CommandResult =
  | { ok: true; session: RecordingSession }
  | { ok: false; code: CommandFailure; session: RecordingSession | null };

export type RecordingEngineDependencies = {
  repositories: StorageRepositories;
  recorder: RecordingRecorder;
  native?: RecordingNative;
  files?: RecordingFiles;
  now?: () => Date;
  uuid?: () => string;
};

export type RecordingEngine = {
  start: (sessionId: string) => Promise<CommandResult>;
  /** Closes the active chunk and pauses. `reason` is stored as the session failureCode. */
  pause: (reason?: string) => Promise<CommandResult>;
  resume: () => Promise<CommandResult>;
  /** Closes the final chunk and hands the session to processing (`transcribing`). */
  stop: () => Promise<CommandResult>;
  scheduledEnd: () => Promise<CommandResult>;
  /** Pauses durably with a failureCode; capture never resumes without an explicit `resume`. */
  interrupt: (code: InterruptCode) => Promise<CommandResult>;
  /** Closes capture and fails the session with a retry window capped at 24 hours. */
  fail: (code: string, retryTarget: RecordingSessionRetryTarget) => Promise<CommandResult>;
  /** Stops the recorder and timers without persisting anything; for delete-all `stopActiveCapture`. */
  abandon: () => Promise<void>;
};

const ENDED_STATUSES: readonly RecordingSessionStatus[] = [
  'transcribing',
  'analyzing',
  'awaiting clarification',
  'generating',
  'ready',
];

/** A failure never extends the retry window: the earlier of the existing deadline and 24 hours out. */
export function retryDeadline(existing: string | undefined, failedAt: string): string {
  const cap = Date.parse(failedAt) + MAX_RETRY_WINDOW_MS;
  return new Date(Math.min(existing === undefined ? cap : Date.parse(existing), cap)).toISOString();
}

export function createRecordingEngine(dependencies: RecordingEngineDependencies): RecordingEngine {
  const { repositories, recorder } = dependencies;
  const native = dependencies.native ?? expoAudioNative;
  const files = dependencies.files ?? expoRecordingFiles;
  const now = dependencies.now ?? (() => new Date());
  const uuid = dependencies.uuid ?? randomUUID;
  const enqueue = createSerialQueue();
  const chunkDependencies = { repositories, native, files };

  let sessionId: string | undefined;
  /** The chunk whose file is open, or whose commit failed and must be retried before moving on. */
  let capture: AudioChunk | null = null;
  let nextSequence: { sessionId: string; value: number } | null = null;
  let rotationTimer: ReturnType<typeof setTimeout> | undefined;
  let endTimer: ReturnType<typeof setTimeout> | undefined;

  const ok = (session: RecordingSession): CommandResult => ({ ok: true, session });
  const failed = (code: CommandFailure, session: RecordingSession | null): CommandResult => ({
    ok: false,
    code,
    session,
  });

  const command = (task: () => Promise<CommandResult>): Promise<CommandResult> =>
    enqueue(async () => {
      try {
        return await task();
      } catch {
        return failed('capture-failed', null);
      }
    });

  const load = async (): Promise<RecordingSession | null> => {
    const id = sessionId ?? useSessionStore.getState().recordingSession?.id;
    return id === undefined ? null : repositories.recordingSessions.getById(id);
  };

  // The reducer rejects timestamps that move backwards, so never go earlier than the last update.
  const stamp = (session: RecordingSession): string =>
    new Date(Math.max(now().getTime(), Date.parse(session.updatedAt))).toISOString();

  const clearRotation = () => {
    clearTimeout(rotationTimer);
    rotationTimer = undefined;
  };

  const publish = (session: RecordingSession) => {
    useSessionStore.getState().setRecordingSession(session);
    if (session.status !== 'recording' && session.status !== 'paused') {
      clearTimeout(endTimer);
      endTimer = undefined;
    }
  };

  const finish = (result: RecordingSessionOperationResult): CommandResult => {
    publish(result.session);
    return result.operation.status === 'applied'
      ? ok(result.session)
      : failed('rejected', result.session);
  };

  const operationFor = (session: RecordingSession, kind: string, at: string) => ({
    id: uuid(),
    sessionId: session.id,
    operationKind: kind,
    status: 'pending' as const,
    createdAt: at,
  });

  const haltRecorder = async () => {
    await recorder.stop().catch(() => undefined);
  };

  /**
   * The chunk could not be committed. Never leave the session `recording` while nothing records:
   * pause it (best effort) and keep the open chunk so stop or resume retries the commit.
   */
  const halt = async (session: RecordingSession): Promise<CommandResult> => {
    clearRotation();
    const current =
      (await repositories.recordingSessions.getById(session.id).catch(() => null)) ?? session;
    if (current.status === 'recording') {
      const at = stamp(current);
      const paused = await repositories
        .applyRecordingSessionOperation(operationFor(current, 'pause_recording', at), {
          type: 'pause',
          at,
          failureCode: 'capture-failed',
        })
        .catch(() => null);
      if (paused !== null) {
        publish(paused.session);
        return failed('capture-failed', paused.session);
      }
    }
    return failed('capture-failed', current);
  };

  /** Applies a session action, committing the open chunk in the same transaction. */
  const settle = async (
    session: RecordingSession,
    kind: string,
    action: RecordingSessionAction,
  ): Promise<CommandResult> => {
    clearRotation();
    const operation = operationFor(session, kind, action.at);
    try {
      let result: RecordingSessionOperationResult | null;
      if (capture === null) {
        result = await repositories.applyRecordingSessionOperation(operation, action);
      } else {
        await haltRecorder();
        ({ result } = await closeChunk(chunkDependencies, capture, action.at, {
          sessionOperation: { operation, action },
        }));
        capture = null;
      }
      return result === null ? failed('capture-failed', session) : finish(result);
    } catch {
      return halt(session);
    }
  };

  const armEndTimer = (session: RecordingSession) => {
    if (endTimer === undefined) {
      const delay = Math.max(0, Date.parse(session.scheduledEnd) - now().getTime());
      endTimer = setTimeout(() => void end('scheduled_end_recording', 'scheduledEnd'), delay);
    }
  };

  const openChunk = async (session: RecordingSession): Promise<void> => {
    if (nextSequence?.sessionId !== session.id) {
      const chunks = await repositories.audioChunks.list();
      const sequences = chunks.filter((c) => c.sessionId === session.id).map((c) => c.sequence);
      nextSequence = { sessionId: session.id, value: Math.max(-1, ...sequences) + 1 };
    }
    await recorder.prepareToRecordAsync(RECORDING_OPTIONS);
    const uri = recorder.uri;
    if (!uri) {
      throw new Error('The recorder did not provide a capture file.');
    }
    const chunk = newActiveChunk({
      id: uuid(),
      sessionId: session.id,
      sequence: nextSequence.value,
      uri,
      startedAt: now().toISOString(),
    });
    // The active row is durable before capture starts, so a crash always leaves a recoverable row.
    await repositories.audioChunks.save(chunk);
    capture = chunk;
    nextSequence = { sessionId: session.id, value: chunk.sequence + 1 };
    recorder.record();
    rotationTimer = setTimeout(() => void rotate(chunk.id), CHUNK_ROTATION_SECONDS * 1000);
    armEndTimer(session);
  };

  const rotate = (chunkId: string): Promise<CommandResult | void> =>
    enqueue(async () => {
      const session = await load();
      if (session?.status !== 'recording' || capture?.id !== chunkId) {
        return;
      }
      try {
        await haltRecorder();
        await closeChunk(chunkDependencies, capture, stamp(session));
        capture = null;
        if ((await files.availableBytes()) < MIN_FREE_STORAGE_BYTES) {
          const at = stamp(session);
          await settle(session, 'pause_recording', {
            type: 'pause',
            at,
            failureCode: 'low-storage',
          });
          return;
        }
        // ponytail: stop-then-prepare leaves a capture gap of up to a few hundred milliseconds per
        // rotation; the upgrade path is a native double-buffered recorder that opens the next file
        // before closing the current one.
        await openChunk(session);
      } catch {
        await halt(session);
      }
    });

  const begin = async (
    session: RecordingSession,
    kind: string,
    action: RecordingSessionAction,
  ): Promise<CommandResult> => {
    const result = await repositories.applyRecordingSessionOperation(
      operationFor(session, kind, action.at),
      action,
    );
    const outcome = finish(result);
    if (!outcome.ok) {
      return outcome;
    }
    try {
      await native.setAudioModeAsync(RECORDING_AUDIO_MODE);
      await openChunk(result.session);
    } catch {
      return halt(result.session);
    }
    return outcome;
  };

  const end = (
    kind: 'stop_recording' | 'scheduled_end_recording',
    type: 'stop' | 'scheduledEnd',
  ): Promise<CommandResult> =>
    command(async () => {
      const session = await load();
      if (session === null) {
        return failed('not-found', null);
      }
      if (ENDED_STATUSES.includes(session.status)) {
        return ok(session);
      }
      if (session.status !== 'recording' && session.status !== 'paused') {
        return failed('rejected', session);
      }
      return settle(session, kind, { type, at: stamp(session) });
    });

  const pause = (reason?: string): Promise<CommandResult> =>
    command(async () => {
      const session = await load();
      if (session === null) {
        return failed('not-found', null);
      }
      if (session.status === 'paused') {
        return ok(session);
      }
      if (session.status !== 'recording') {
        return failed('rejected', session);
      }
      return settle(session, 'pause_recording', {
        type: 'pause',
        at: stamp(session),
        failureCode: reason,
      });
    });

  return {
    start: (id) =>
      command(async () => {
        const session = await repositories.recordingSessions.getById(id);
        if (session === null) {
          return failed('not-found', null);
        }
        if (session.status === 'recording' && capture !== null && sessionId === id) {
          return ok(session);
        }
        if (session.status !== 'scheduled' || capture !== null) {
          return failed('rejected', session);
        }
        const blocker = await checkStartPreconditions({ repositories, native, files });
        if (blocker !== null) {
          return failed(blocker, session);
        }
        sessionId = id;
        return begin(session, 'start_recording', { type: 'start', at: stamp(session) });
      }),
    pause,
    resume: () =>
      command(async () => {
        const session = await load();
        if (session === null) {
          return failed('not-found', null);
        }
        if (session.status === 'recording' && capture !== null) {
          return ok(session);
        }
        if (session.status !== 'paused') {
          return failed('rejected', session);
        }
        const blocker = await checkStartPreconditions({ repositories, native, files });
        if (blocker !== null) {
          return failed(blocker, session);
        }
        if (capture !== null) {
          // An earlier commit failed; it must succeed before a new chunk can open.
          await haltRecorder();
          await closeChunk(chunkDependencies, capture, stamp(session));
          capture = null;
        }
        sessionId = session.id;
        return begin(session, 'resume_recording', { type: 'resume', at: stamp(session) });
      }),
    stop: () => end('stop_recording', 'stop'),
    scheduledEnd: () => end('scheduled_end_recording', 'scheduledEnd'),
    interrupt: (code) => pause(code),
    fail: (code, retryTarget) =>
      command(async () => {
        const session = await load();
        if (session === null) {
          return failed('not-found', null);
        }
        const at = stamp(session);
        return settle(session, 'fail_recording', {
          type: 'fail',
          at,
          failureCode: code,
          retryTarget,
          retryUntil: retryDeadline(session.retryUntil, at),
        });
      }),
    abandon: () =>
      enqueue(async () => {
        clearRotation();
        clearTimeout(endTimer);
        endTimer = undefined;
        capture = null;
        sessionId = undefined;
        nextSequence = null;
        await haltRecorder();
      }),
  };
}
