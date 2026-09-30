import { createRecordingEngine, retryDeadline } from '../../src/features/recording/engine';
import { CHUNK_ROTATION_SECONDS } from '../../src/features/recording/recorder';
import { useSessionStore } from '../../src/state/session';
import { MAX_RETRY_WINDOW_MS } from '../../src/storage/types';
import {
  advance,
  bytesOf,
  createHarness,
  isoAfter,
  makeScheduledSession,
  permission,
  SESSION_ID,
  sha256Hex,
  useFakeClock,
  uuidSequence,
} from './testKit';

const ROTATION_MS = CHUNK_ROTATION_SECONDS * 1000;

async function setup() {
  const harness = await createHarness();
  const engine = createRecordingEngine({
    repositories: harness.repositories,
    recorder: harness.recorder,
    native: harness.disk.native,
    files: harness.disk.recordingFiles,
    uuid: uuidSequence(),
  });
  const session = async () => {
    const stored = await harness.repositories.recordingSessions.getById(SESSION_ID);
    if (stored === null) {
      throw new Error('session missing');
    }
    return stored;
  };
  const chunks = async () =>
    (await harness.repositories.audioChunks.list()).sort((a, b) => a.sequence - b.sequence);
  const operations = () =>
    harness.database.native
      .prepare(
        'SELECT operation_kind AS kind, status FROM recording_operations ORDER BY created_at',
      )
      .all() as { kind: string; status: string }[];
  return { ...harness, engine, session, chunks, operations };
}

describe('recording engine', () => {
  beforeEach(() => {
    useFakeClock();
    useSessionStore.getState().resetSession();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('lifecycle', () => {
    it('runs start, two rotations, pause, resume and stop with contiguous sequences', async () => {
      const { engine, session, chunks, repositories, disk } = await setup();

      const started = await engine.start(SESSION_ID);
      expect(started).toMatchObject({ ok: true, session: { status: 'recording' } });
      await advance(ROTATION_MS);
      await advance(ROTATION_MS);
      await advance(15_000);
      expect(await engine.pause()).toMatchObject({ ok: true, session: { status: 'paused' } });
      await advance(30_000);
      expect(await engine.resume()).toMatchObject({ ok: true, session: { status: 'recording' } });
      await advance(10_000);
      expect(await engine.stop()).toMatchObject({ ok: true, session: { status: 'transcribing' } });

      const stored = await chunks();
      expect(stored.map((chunk) => chunk.sequence)).toEqual([0, 1, 2, 3]);
      expect(stored.map((chunk) => chunk.state)).toEqual(['closed', 'closed', 'closed', 'closed']);
      expect(stored.map((chunk) => [chunk.startedAt, chunk.endedAt])).toEqual([
        [isoAfter(0), isoAfter(30_000)],
        [isoAfter(30_000), isoAfter(60_000)],
        [isoAfter(60_000), isoAfter(75_000)],
        [isoAfter(105_000), isoAfter(115_000)],
      ]);
      for (const [index, chunk] of stored.entries()) {
        expect(await repositories.readAudioChunkBytes(chunk.id)).toEqual(
          bytesOf(`audio-${index + 1}`),
        );
      }
      expect(disk.files.size).toBe(0);
      expect(await session()).toMatchObject({
        status: 'transcribing',
        actualStart: isoAfter(0),
        actualEnd: isoAfter(115_000),
        pauseIntervals: [{ startedAt: isoAfter(75_000), endedAt: isoAfter(105_000) }],
      });
      expect(useSessionStore.getState().recordingSession?.status).toBe('transcribing');
    });

    it('ignores a repeated start and reports unknown or unstartable sessions', async () => {
      const { engine, recorder, repositories } = await setup();

      await engine.start(SESSION_ID);
      expect(await engine.start(SESSION_ID)).toMatchObject({ ok: true });
      expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);

      expect(await engine.start('33333333-3333-4333-8333-333333333333')).toEqual({
        ok: false,
        code: 'not-found',
        session: null,
      });
      await repositories.recordingSessions.save(
        makeScheduledSession({
          id: '44444444-4444-4444-8444-444444444444',
          scheduledStart: '2026-03-11T09:00:00.000Z',
          scheduledEnd: '2026-03-11T17:00:00.000Z',
          status: 'discarded',
        }),
      );
      expect(await engine.start('44444444-4444-4444-8444-444444444444')).toMatchObject({
        ok: false,
        code: 'rejected',
      });
    });

    it('rejects pause and resume outside their states without touching capture', async () => {
      const { engine, recorder } = await setup();

      expect(await engine.stop()).toMatchObject({ ok: false, code: 'not-found' });
      await engine.start(SESSION_ID);
      expect(await engine.resume()).toMatchObject({ ok: true });
      await engine.pause();
      expect(await engine.pause()).toMatchObject({ ok: true, session: { status: 'paused' } });
      expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    });

    it('returns a typed failure and pauses when the recorder cannot start', async () => {
      const { engine, recorder, session } = await setup();
      recorder.prepareToRecordAsync.mockRejectedValueOnce(new Error('recorder busy'));

      expect(await engine.start(SESSION_ID)).toMatchObject({
        ok: false,
        code: 'capture-failed',
        session: { status: 'paused', failureCode: 'capture-failed' },
      });
      expect(await session()).toMatchObject({ status: 'paused', failureCode: 'capture-failed' });
      expect(recorder.record).not.toHaveBeenCalled();
    });
  });

  describe('timing', () => {
    it('rotates the chunk exactly at the rotation interval', async () => {
      const { engine, recorder, chunks } = await setup();
      await engine.start(SESSION_ID);

      await advance(ROTATION_MS - 1);
      expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
      expect((await chunks()).map((chunk) => chunk.state)).toEqual(['active']);

      await advance(1);
      expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(2);
      expect((await chunks()).map((chunk) => chunk.state)).toEqual(['closed', 'active']);

      await advance(ROTATION_MS);
      expect((await chunks()).map((chunk) => chunk.state)).toEqual(['closed', 'closed', 'active']);
    });

    it('persists pause interval timestamps across repeated pauses', async () => {
      const { engine, session } = await setup();
      await engine.start(SESSION_ID);
      await advance(10_000);
      await engine.pause();
      await advance(20_000);
      await engine.resume();
      await advance(5_000);
      await engine.pause();
      await advance(1_000);
      await engine.resume();

      expect((await session()).pauseIntervals).toEqual([
        { startedAt: isoAfter(10_000), endedAt: isoAfter(30_000) },
        { startedAt: isoAfter(35_000), endedAt: isoAfter(36_000) },
      ]);
    });

    it('does not rotate or record while paused', async () => {
      const { engine, recorder } = await setup();
      await engine.start(SESSION_ID);
      await engine.pause();
      await advance(10 * ROTATION_MS);

      expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
      expect(recorder.record).toHaveBeenCalledTimes(1);
    });

    it('ends the session at its scheduled end and ignores the rotation due at the same instant', async () => {
      const { engine, repositories, session, chunks, operations, recorder } = await setup();
      await repositories.recordingSessions.save(
        makeScheduledSession({ scheduledEnd: isoAfter(2 * ROTATION_MS) }),
      );
      await engine.start(SESSION_ID);

      await advance(2 * ROTATION_MS);

      expect(await session()).toMatchObject({
        status: 'transcribing',
        actualEnd: isoAfter(2 * ROTATION_MS),
      });
      expect((await chunks()).map((chunk) => chunk.state)).toEqual(['closed', 'closed']);
      expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(2);
      expect(operations().filter((op) => op.kind === 'scheduled_end_recording')).toEqual([
        { kind: 'scheduled_end_recording', status: 'applied' },
      ]);
    });
  });

  describe('chunk integrity', () => {
    it('stores the sha256 of the exact bytes that were captured', async () => {
      const { engine, recorder, chunks, repositories } = await setup();
      recorder.nextBytes = bytesOf('abc');
      await engine.start(SESSION_ID);
      await engine.stop();

      const [chunk] = await chunks();
      expect(chunk.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
      const stored = await repositories.readAudioChunkBytes(chunk.id);
      expect(stored).toEqual(bytesOf('abc'));
      expect(sha256Hex(stored!)).toBe(chunk.sha256);
    });

    it('commits the closed chunk before the next record call and deletes the plaintext after', async () => {
      const { engine, log } = await setup();
      await engine.start(SESSION_ID);
      await advance(ROTATION_MS);

      expect(log).toEqual([
        'prepare:1',
        'record:1',
        'stop:1',
        'commit:0',
        'delete:file:///cache/chunk-1.m4a',
        'prepare:2',
        'record:2',
      ]);
    });

    it('keeps the file and opens no new chunk when the commit fails, then retries on resume', async () => {
      const { engine, faults, disk, chunks, session, log, recorder } = await setup();
      await engine.start(SESSION_ID);
      faults.failCommits = 1;

      await advance(ROTATION_MS);

      expect(log).toEqual(['prepare:1', 'record:1', 'stop:1']);
      expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
      expect(disk.files.has('file:///cache/chunk-1.m4a')).toBe(true);
      expect((await chunks()).map((chunk) => chunk.state)).toEqual(['active']);
      expect(await session()).toMatchObject({ status: 'paused', failureCode: 'capture-failed' });

      expect(await engine.resume()).toMatchObject({ ok: true, session: { status: 'recording' } });
      expect((await chunks()).map((chunk) => chunk.state)).toEqual(['closed', 'active']);
      expect(disk.files.has('file:///cache/chunk-1.m4a')).toBe(false);
      expect(log.indexOf('commit:0')).toBeLessThan(log.indexOf('record:2'));
    });

    it('retries a failed commit on stop and finishes in the same transaction', async () => {
      const { engine, faults, disk, chunks, session } = await setup();
      await engine.start(SESSION_ID);
      faults.failCommits = 1;

      expect(await engine.stop()).toMatchObject({ ok: false, code: 'capture-failed' });
      expect(disk.files.size).toBe(1);
      expect((await session()).status).toBe('paused');

      expect(await engine.stop()).toMatchObject({ ok: true, session: { status: 'transcribing' } });
      expect((await chunks()).map((chunk) => chunk.state)).toEqual(['closed']);
      expect(disk.files.size).toBe(0);
    });

    it('discards a chunk whose file is empty instead of storing it', async () => {
      const { engine, recorder, chunks, repositories, session } = await setup();
      recorder.nextBytes = new Uint8Array(0);
      await engine.start(SESSION_ID);

      expect(await engine.stop()).toMatchObject({ ok: true, session: { status: 'transcribing' } });
      const [chunk] = await chunks();
      expect(chunk.state).toBe('deleted');
      expect(await repositories.readAudioChunkBytes(chunk.id)).toBeNull();
      expect((await session()).status).toBe('transcribing');
    });
  });

  describe('duplicate and concurrent ends', () => {
    it('performs one final close and one transition for a duplicate stop', async () => {
      const { engine, commitSpy, operations, session } = await setup();
      await engine.start(SESSION_ID);

      const results = await Promise.all([engine.stop(), engine.stop()]);

      expect(results.map((result) => result.ok)).toEqual([true, true]);
      expect(commitSpy).toHaveBeenCalledTimes(1);
      expect(operations().filter((op) => op.kind === 'stop_recording')).toHaveLength(1);
      expect((await session()).status).toBe('transcribing');
    });

    it('performs one final close and one transition for concurrent stop and scheduledEnd', async () => {
      const { engine, commitSpy, operations, session, chunks } = await setup();
      await engine.start(SESSION_ID);

      const results = await Promise.all([engine.stop(), engine.scheduledEnd()]);

      expect(results.map((result) => result.ok)).toEqual([true, true]);
      expect(commitSpy).toHaveBeenCalledTimes(1);
      expect(
        operations().filter((op) =>
          ['stop_recording', 'scheduled_end_recording'].includes(op.kind),
        ),
      ).toHaveLength(1);
      expect(await chunks()).toHaveLength(1);
      expect((await session()).status).toBe('transcribing');
    });

    it('treats a scheduled end after a stop as already done', async () => {
      const { engine, session } = await setup();
      await engine.start(SESSION_ID);
      await engine.stop();
      const before = await session();

      expect(await engine.scheduledEnd()).toMatchObject({ ok: true });
      await advance(24 * 60 * 60 * 1000);
      expect(await session()).toEqual(before);
    });
  });

  describe('start preconditions', () => {
    it('refuses to start and leaves the session scheduled when a precondition fails', async () => {
      const { engine, disk, recorder, session, repositories } = await setup();

      disk.native.getRecordingPermissionsAsync = async () =>
        permission({ granted: false, status: 'denied', canAskAgain: true });
      expect(await engine.start(SESSION_ID)).toMatchObject({
        ok: false,
        code: 'permission-denied',
        session: { status: 'scheduled' },
      });

      disk.native.getRecordingPermissionsAsync = async () => permission();
      await repositories.voiceProfiles.deleteById('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
      expect(await engine.start(SESSION_ID)).toMatchObject({
        ok: false,
        code: 'voice-profile-missing',
      });

      expect((await session()).status).toBe('scheduled');
      expect(recorder.prepareToRecordAsync).not.toHaveBeenCalled();
    });

    it('re-checks preconditions before resuming', async () => {
      const { engine, disk, session } = await setup();
      await engine.start(SESSION_ID);
      await engine.pause();
      disk.freeBytes = 1024;

      expect(await engine.resume()).toMatchObject({ ok: false, code: 'low-storage' });
      expect((await session()).status).toBe('paused');
    });
  });

  describe('interruptions', () => {
    it.each(['call', 'route-loss', 'low-storage', 'os-interruption'] as const)(
      'persists a %s interruption as paused with its failure code and never auto-resumes',
      async (code) => {
        const { engine, session, chunks, recorder } = await setup();
        await engine.start(SESSION_ID);
        await advance(10_000);

        expect(await engine.interrupt(code)).toMatchObject({
          ok: true,
          session: { status: 'paused', failureCode: code },
        });
        await advance(10 * 60 * 1000);

        expect(await session()).toMatchObject({ status: 'paused', failureCode: code });
        expect((await chunks()).map((chunk) => chunk.state)).toEqual(['closed']);
        expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
        expect(recorder.record).toHaveBeenCalledTimes(1);

        expect(await engine.resume()).toMatchObject({
          ok: true,
          session: { status: 'recording', failureCode: undefined },
        });
      },
    );

    it('pauses with low-storage when free space runs out at a rotation', async () => {
      const { engine, disk, session, chunks, recorder } = await setup();
      await engine.start(SESSION_ID);
      disk.freeBytes = 10 * 1024 * 1024;

      await advance(ROTATION_MS);

      expect(await session()).toMatchObject({ status: 'paused', failureCode: 'low-storage' });
      expect((await chunks()).map((chunk) => chunk.state)).toEqual(['closed']);
      expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('fail and abandon', () => {
    it('fails the session with a retry window capped at 24 hours and keeps the audio', async () => {
      const { engine, session, chunks } = await setup();
      await engine.start(SESSION_ID);
      await advance(10_000);

      const result = await engine.fail('microphone_failed', 'transcribing');

      expect(result).toMatchObject({ ok: true, session: { status: 'failed' } });
      expect(await session()).toMatchObject({
        status: 'failed',
        failureCode: 'microphone_failed',
        retryTarget: 'transcribing',
        retryUntil: isoAfter(10_000 + MAX_RETRY_WINDOW_MS),
      });
      expect((await chunks()).map((chunk) => chunk.state)).toEqual(['closed']);
    });

    it('never extends a retry deadline beyond 24 hours from the failure', () => {
      const failedAt = '2026-03-10T10:00:00.000Z';
      const cap = '2026-03-11T10:00:00.000Z';
      expect(retryDeadline(undefined, failedAt)).toBe(cap);
      expect(retryDeadline('2026-03-10T12:00:00.000Z', failedAt)).toBe('2026-03-10T12:00:00.000Z');
      expect(retryDeadline('2026-03-20T00:00:00.000Z', failedAt)).toBe(cap);
    });

    it('abandon stops capture and timers without persisting a transition', async () => {
      const { engine, recorder, session, chunks } = await setup();
      await engine.start(SESSION_ID);

      await engine.abandon();
      await advance(10 * ROTATION_MS);

      expect(recorder.stop).toHaveBeenCalledTimes(1);
      expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
      expect((await session()).status).toBe('recording');
      expect((await chunks()).map((chunk) => chunk.state)).toEqual(['active']);
    });
  });
});
