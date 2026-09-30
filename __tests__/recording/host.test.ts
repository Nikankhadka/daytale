import type { RecordingStatus } from 'expo-audio';

import { createRecordingHost } from '../../src/features/recording/host';
import { CHUNK_ROTATION_SECONDS } from '../../src/features/recording/recorder';
import { createDefaultAppPreferences } from '../../src/features/preferences';
import { useSessionStore } from '../../src/state/session';
import {
  advance,
  createHarness,
  isoAfter,
  makeScheduledSession,
  SESSION_ID,
  T0,
  useFakeClock,
  uuidSequence,
} from './testKit';

const ROTATION_MS = CHUNK_ROTATION_SECONDS * 1000;

const status = (overrides: Partial<RecordingStatus> = {}): RecordingStatus => ({
  id: 'recorder',
  isFinished: false,
  hasError: false,
  error: null,
  url: null,
  ...overrides,
});

// A preferences row whose daily window matches the harness session (09:00-17:00 UTC).
const preferences = {
  ...createDefaultAppPreferences('2026-03-01T00:00:00.000Z', 'UTC'),
  scheduleStartLocal: '09:00',
  scheduleEndLocal: '17:00',
  onboardingComplete: true,
  onboardingStage: 'ready' as const,
};

async function setup() {
  const harness = await createHarness();
  let listener: (next: RecordingStatus) => void = () => undefined;
  const subscription = { remove: jest.fn() };
  const recorder = Object.assign(harness.recorder, {
    addListener: jest.fn((_event: 'recordingStatusUpdate', next: typeof listener) => {
      listener = next;
      return subscription;
    }),
  });
  const createRecorder = jest.fn(async () => recorder);
  const host = createRecordingHost({
    getRepositories: () => harness.repositories,
    createRecorder,
    engine: {
      native: harness.disk.native,
      files: harness.disk.recordingFiles,
      uuid: uuidSequence(),
    },
  });
  const session = async () => {
    const stored = await harness.repositories.recordingSessions.getById(SESSION_ID);
    if (stored === null) {
      throw new Error('session missing');
    }
    return stored;
  };
  const emit = async (next: RecordingStatus) => {
    listener(next);
    await advance(0);
  };
  return { ...harness, recorder, host, createRecorder, subscription, session, emit };
}

describe('recording host', () => {
  beforeEach(() => {
    useFakeClock();
    useSessionStore.getState().resetSession();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('engine lifetime', () => {
    it('creates one recorder lazily and tracks whether capture is open', async () => {
      const { host, createRecorder, recorder } = await setup();
      const changes = jest.fn();
      host.subscribe(changes);
      expect(createRecorder).not.toHaveBeenCalled();
      expect(host.isCapturing()).toBe(false);

      const started = await host.engine.start(SESSION_ID);
      await host.engine.resume();

      expect(started).toMatchObject({ ok: true, session: { status: 'recording' } });
      expect(createRecorder).toHaveBeenCalledTimes(1);
      expect(recorder.addListener).toHaveBeenCalledWith(
        'recordingStatusUpdate',
        expect.any(Function),
      );
      expect(host.isCapturing()).toBe(true);
      expect(changes).toHaveBeenCalledTimes(1);

      await host.engine.pause();
      expect(host.isCapturing()).toBe(false);
    });

    it('reports a failed command when storage or the recorder is unavailable', async () => {
      const { repositories } = await setup();
      const missingStorage = createRecordingHost({
        getRepositories: () => undefined,
        createRecorder: jest.fn(),
      });
      const brokenRecorder = createRecordingHost({
        getRepositories: () => repositories,
        createRecorder: async () => {
          throw new Error('no native module');
        },
      });

      expect(await missingStorage.engine.start(SESSION_ID)).toEqual({
        ok: false,
        code: 'capture-failed',
        session: null,
      });
      expect(await brokenRecorder.engine.start(SESSION_ID)).toEqual({
        ok: false,
        code: 'capture-failed',
        session: null,
      });
    });

    it('drops capture state when the scheduled end timer finishes the session', async () => {
      const { host, session } = await setup();
      await host.engine.start(SESSION_ID);

      await advance(8 * 60 * 60 * 1000);

      expect((await session()).status).toBe('transcribing');
      expect(host.isCapturing()).toBe(false);
    });

    it('abandon stops the recorder, forgets capture and builds a fresh engine next time', async () => {
      const { host, recorder, createRecorder, subscription } = await setup();
      await host.engine.start(SESSION_ID);

      await host.engine.abandon();

      expect(recorder.stop).toHaveBeenCalled();
      expect(subscription.remove).toHaveBeenCalledTimes(1);
      expect(host.isCapturing()).toBe(false);

      await host.engine.start(SESSION_ID);
      expect(createRecorder).toHaveBeenCalledTimes(2);
    });
  });

  describe('interruptions', () => {
    it.each([
      ['a recorder error', { hasError: true, error: 'audio engine failed' }],
      ['a media services reset', { mediaServicesDidReset: true }],
      ['a stop nobody asked for', { isFinished: true }],
    ])('pauses durably and never auto-resumes after %s', async (_name, event) => {
      const { host, session, emit, recorder } = await setup();
      await host.engine.start(SESSION_ID);
      expect(recorder.record).toHaveBeenCalledTimes(1);

      await emit(status(event));

      expect(await session()).toMatchObject({ status: 'paused', failureCode: 'os-interruption' });
      expect(host.isCapturing()).toBe(false);
      await advance(ROTATION_MS * 2);
      expect(recorder.record).toHaveBeenCalledTimes(1);
    });

    it('treats the stop that ends a chunk rotation as expected', async () => {
      const { host, session, emit } = await setup();
      await host.engine.start(SESSION_ID);

      await advance(ROTATION_MS);
      await emit(status({ isFinished: true }));

      expect(await session()).toMatchObject({ status: 'recording' });
      expect(host.isCapturing()).toBe(true);
    });

    it('ignores status events while no capture is open', async () => {
      const { host, session, emit } = await setup();
      await host.engine.start(SESSION_ID);
      await host.engine.pause();

      await emit(status({ hasError: true, error: 'late event' }));

      expect(await session()).toMatchObject({ status: 'paused' });
      expect((await session()).failureCode).toBeUndefined();
    });
  });

  describe('reconcile', () => {
    beforeEach(() => {
      useSessionStore.getState().setAppPreferences(preferences);
    });

    it('does nothing before onboarding is complete', async () => {
      const { host, repositories } = await setup();
      useSessionStore.getState().setAppPreferences({ ...preferences, onboardingComplete: false });

      await host.reconcile(new Date('2026-03-11T10:00:00.000Z'));

      expect(await repositories.recordingSessions.list()).toHaveLength(1);
    });

    it('shows the new day session once the previous one is settled', async () => {
      const { host, repositories } = await setup();
      useSessionStore.getState().setRecordingSession(makeScheduledSession());

      await host.reconcile(new Date('2026-03-11T10:00:00.000Z'));

      expect(await repositories.recordingSessions.list()).toHaveLength(2);
      expect(useSessionStore.getState().recordingSession).toMatchObject({
        status: 'scheduled',
        scheduledStart: '2026-03-11T09:00:00.000Z',
      });
    });

    it('keeps a failed session in front of the user until they decide', async () => {
      const { host, repositories } = await setup();
      const failed = await repositories.recordingSessions.save(
        makeScheduledSession({
          status: 'failed',
          actualStart: '2026-03-10T09:00:00.000Z',
          actualEnd: '2026-03-10T10:00:00.000Z',
          failureCode: 'transcription-failed',
          retryTarget: 'transcribing',
          retryUntil: '2026-03-11T10:00:00.000Z',
          updatedAt: '2026-03-10T10:00:00.000Z',
        }),
      );
      useSessionStore.getState().setRecordingSession(failed);

      await host.reconcile(new Date('2026-03-11T10:00:00.000Z'));

      expect(useSessionStore.getState().recordingSession).toMatchObject({
        id: SESSION_ID,
        status: 'failed',
      });
    });

    it('ends a paused session whose window is over', async () => {
      const { host, session, repositories } = await setup();
      const paused = await repositories.recordingSessions.save(
        makeScheduledSession({
          status: 'paused',
          actualStart: T0.toISOString(),
          pauseIntervals: [{ startedAt: isoAfter(3_600_000) }],
          failureCode: 'crash-recovered',
          updatedAt: isoAfter(3_600_000),
        }),
      );
      useSessionStore.getState().setRecordingSession(paused);
      const after = new Date('2026-03-10T17:00:01.000Z');
      jest.setSystemTime(after);

      await host.reconcile(after);

      expect(await session()).toMatchObject({ status: 'transcribing' });
      expect(useSessionStore.getState().recordingSession?.status).toBe('transcribing');
    });

    it('pauses a session stored as recording when the engine has no open capture', async () => {
      const { host, session, repositories } = await setup();
      const recording = await repositories.recordingSessions.save(
        makeScheduledSession({
          status: 'recording',
          actualStart: T0.toISOString(),
          updatedAt: T0.toISOString(),
        }),
      );
      useSessionStore.getState().setRecordingSession(recording);

      await host.reconcile(new Date(T0.getTime() + 60_000));

      expect(await session()).toMatchObject({ status: 'paused', failureCode: 'os-interruption' });
    });

    it('leaves a session alone while a start command is still opening capture', async () => {
      const { host, session, recorder } = await setup();
      let release: () => void = () => undefined;
      recorder.prepareToRecordAsync.mockImplementationOnce(
        () => new Promise<void>((resolve) => (release = resolve)),
      );
      const started = host.engine.start(SESSION_ID);
      await advance(0);
      expect(useSessionStore.getState().recordingSession?.status).toBe('recording');

      await host.reconcile(new Date(T0.getTime() + 1_000));
      expect((await session()).status).toBe('recording');

      recorder.uri = 'file:///cache/chunk-1.m4a';
      release();
      expect(await started).toMatchObject({ ok: true });
      expect(host.isCapturing()).toBe(true);
    });
  });
});
