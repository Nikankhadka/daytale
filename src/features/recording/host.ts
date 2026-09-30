import type { RecordingStatus } from 'expo-audio';

import { useSessionStore } from '../../state/session';
import type { StorageRepositories } from '../../storage/repositories';
import {
  createRecordingEngine,
  type CommandResult,
  type RecordingEngine,
  type RecordingEngineDependencies,
} from './engine';
import { createSerialQueue, type RecordingRecorder } from './recorder';
import { ensureTodaySession, supersedes } from './schedule';

/** The platform recorder the engine drives, plus the status events the host watches. */
export type HostRecorder = RecordingRecorder & {
  addListener: (
    event: 'recordingStatusUpdate',
    listener: (status: RecordingStatus) => void,
  ) => { remove: () => void };
};

export type RecordingHostDependencies = {
  getRepositories: () => StorageRepositories | undefined;
  createRecorder: () => Promise<HostRecorder>;
  engine?: Pick<RecordingEngineDependencies, 'native' | 'files' | 'uuid' | 'now'>;
};

export type RecordingHost = {
  /** The engine commands, creating the recorder on first use; `capture-failed` if unavailable. */
  engine: RecordingEngine;
  /** True only while this process holds an open capture, never just because the store says so. */
  isCapturing: () => boolean;
  subscribe: (listener: () => void) => () => void;
  /** Brings the stored session in line with the clock and with what the engine is really doing. */
  reconcile: (now: Date) => Promise<void>;
};

const UNAVAILABLE: CommandResult = { ok: false, code: 'capture-failed', session: null };

/** The recorder reports its own stop asynchronously; events this soon after a stop are expected. */
const STOP_GRACE_MS = 2_000;

type Instance = { engine: RecordingEngine; dispose: () => void };

/**
 * One engine per process plus what the engine does not know: whether capture is really open,
 * interruptions the OS reports behind its back, and catching the stored session up with the clock.
 */
export function createRecordingHost(dependencies: RecordingHostDependencies): RecordingHost {
  const listeners = new Set<() => void>();
  const enqueueReconcile = createSerialQueue();
  let pending: Promise<Instance | null> | undefined;
  let capturing = false;
  let inFlight = 0;
  let stopping = false;
  let lastStopAt = Number.NEGATIVE_INFINITY;

  const setCapturing = (next: boolean) => {
    if (capturing !== next) {
      capturing = next;
      listeners.forEach((listener) => listener());
    }
  };

  const build = async (): Promise<Instance | null> => {
    const repositories = dependencies.getRepositories();
    if (repositories === undefined) {
      return null;
    }
    try {
      const raw = await dependencies.createRecorder();
      // The engine stops the recorder itself (rotation, pause, stop); remember when so the
      // recorder's own "finished" event is not mistaken for the OS taking the microphone away.
      const recorder: RecordingRecorder = {
        prepareToRecordAsync: (options) => raw.prepareToRecordAsync(options),
        record: () => raw.record(),
        pause: () => raw.pause(),
        stop: async () => {
          stopping = true;
          try {
            await raw.stop();
          } finally {
            stopping = false;
            lastStopAt = Date.now();
          }
        },
        get uri() {
          return raw.uri;
        },
        get currentTime() {
          return raw.currentTime;
        },
      };
      const inner = createRecordingEngine({ ...dependencies.engine, repositories, recorder });
      const subscription = raw.addListener('recordingStatusUpdate', (status) => {
        const unexpectedStop =
          status.isFinished && !stopping && Date.now() - lastStopAt > STOP_GRACE_MS;
        if (capturing && (status.hasError || status.mediaServicesDidReset || unexpectedStop)) {
          // Never resumes by itself: the user decides, from the paused view.
          void engine.interrupt('os-interruption');
        }
      });
      // The engine ends sessions on its own timers; whatever it publishes decides if capture is open.
      const unsubscribe = useSessionStore.subscribe((state) => {
        if (state.recordingSession?.status !== 'recording') {
          setCapturing(false);
        }
      });
      return {
        engine: inner,
        dispose: () => {
          subscription.remove();
          unsubscribe();
        },
      };
    } catch {
      return null;
    }
  };

  const instance = async (): Promise<Instance | null> => {
    const attempt = (pending ??= build());
    const built = await attempt;
    if (built === null && pending === attempt) {
      pending = undefined;
    }
    return built;
  };

  const run = async (
    task: (inner: RecordingEngine) => Promise<CommandResult>,
    opensCapture = false,
  ): Promise<CommandResult> => {
    inFlight += 1;
    try {
      const built = await instance();
      if (built === null) {
        return UNAVAILABLE;
      }
      const result = await task(built.engine);
      if (!opensCapture) {
        setCapturing(false);
      } else if (result.ok) {
        setCapturing(result.session.status === 'recording');
      }
      return result;
    } finally {
      inFlight -= 1;
    }
  };

  const engine: RecordingEngine = {
    start: (sessionId) => run((inner) => inner.start(sessionId), true),
    pause: (reason) => run((inner) => inner.pause(reason)),
    resume: () => run((inner) => inner.resume(), true),
    stop: () => run((inner) => inner.stop()),
    scheduledEnd: () => run((inner) => inner.scheduledEnd()),
    interrupt: (code) => run((inner) => inner.interrupt(code)),
    fail: (code, retryTarget) => run((inner) => inner.fail(code, retryTarget)),
    abandon: async () => {
      const built = await pending;
      pending = undefined;
      setCapturing(false);
      await built?.engine.abandon();
      built?.dispose();
    },
  };

  const reconcile = (now: Date) =>
    enqueueReconcile(async () => {
      const repositories = dependencies.getRepositories();
      const { appPreferences } = useSessionStore.getState();
      if (repositories === undefined || !appPreferences?.onboardingComplete) {
        return;
      }
      const today = await ensureTodaySession(
        repositories,
        appPreferences,
        now,
        dependencies.engine?.uuid,
      );
      const { recordingSession, setRecordingSession } = useSessionStore.getState();
      if (supersedes(today, recordingSession)) {
        setRecordingSession(today);
      }
      const shown = useSessionStore.getState().recordingSession;
      if (shown?.status === 'recording' || shown?.status === 'paused') {
        if (now.getTime() >= Date.parse(shown.scheduledEnd)) {
          await engine.scheduledEnd();
        } else if (shown.status === 'recording' && !capturing && inFlight === 0) {
          // The store says recording but nothing is: show the recovery view, never a fake timer.
          await engine.interrupt('os-interruption');
        }
      }
    });

  return {
    engine,
    isCapturing: () => capturing,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    reconcile,
  };
}
