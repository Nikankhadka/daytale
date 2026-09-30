import { newActiveChunk } from '../../src/features/recording/chunk';
import { recoverOnLaunch } from '../../src/features/recording/recovery';
import { sweepExpiredSessions } from '../../src/storage/cleanup';
import type { AudioChunk, RecordingSession } from '../../src/storage/types';
import {
  bytesOf,
  createHarness,
  makeScheduledSession,
  SESSION_ID,
  sha256Hex,
  uuidSequence,
} from './testKit';

const NOW = new Date('2026-03-10T12:00:00.000Z');
const STARTED = '2026-03-10T09:00:00.000Z';
const OTHER_SESSION_ID = '99999999-9999-4999-8999-999999999999';

const chunkId = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const uriOf = (n: number) => `file:///cache/crash-${n}.m4a`;

function recordingSession(overrides: Partial<RecordingSession> = {}): RecordingSession {
  return makeScheduledSession({
    status: 'recording',
    actualStart: STARTED,
    updatedAt: '2026-03-10T09:30:00.000Z',
    ...overrides,
  });
}

async function seed(session: RecordingSession = recordingSession()) {
  const harness = await createHarness();
  await harness.repositories.recordingSessions.save(session);
  const addActive = async (sequence: number, contents: string | null, sessionId = session.id) => {
    const chunk = newActiveChunk({
      id: chunkId(sequence),
      sessionId,
      sequence,
      uri: uriOf(sequence),
      startedAt: STARTED,
    });
    await harness.repositories.audioChunks.save(chunk);
    if (contents !== null) {
      harness.disk.files.set(chunk.encryptedPath, bytesOf(contents));
    }
    return chunk;
  };
  const addClosed = async (sequence: number, contents: string) => {
    const audio = bytesOf(contents);
    const chunk: AudioChunk = {
      ...newActiveChunk({
        id: chunkId(sequence),
        sessionId: session.id,
        sequence,
        uri: uriOf(sequence),
        startedAt: STARTED,
      }),
      endedAt: '2026-03-10T09:00:30.000Z',
      sha256: sha256Hex(audio),
      state: 'closed',
    };
    await harness.repositories.saveClosedAudioChunk({ chunk, audio });
    return chunk;
  };
  const recover = () =>
    recoverOnLaunch(harness.repositories, NOW, {
      native: harness.disk.native,
      files: harness.disk.recordingFiles,
      uuid: uuidSequence(),
    });
  const chunkState = async (sequence: number) =>
    (await harness.repositories.audioChunks.getById(chunkId(sequence)))?.state;
  const session$ = async () => harness.repositories.recordingSessions.getById(session.id);
  return { ...harness, addActive, addClosed, recover, chunkState, session$ };
}

describe('crash recovery', () => {
  it('closes a readable active chunk, records it as recovered and pauses the session', async () => {
    const { addActive, addClosed, recover, repositories, disk, session$ } = await seed();
    const untouched = await addClosed(0, 'first');
    const active = await addActive(1, 'second');

    const recovered = await recover();

    const chunk = await repositories.audioChunks.getById(active.id);
    expect(chunk).toMatchObject({
      state: 'closed',
      sha256: sha256Hex(bytesOf('second')),
      endedAt: NOW.toISOString(),
    });
    expect(await repositories.readAudioChunkBytes(active.id)).toEqual(bytesOf('second'));
    expect(disk.files.has(active.encryptedPath)).toBe(false);
    expect(await session$()).toMatchObject({
      status: 'paused',
      failureCode: 'crash-recovered',
      lastRecoveredChunkId: active.id,
      pauseIntervals: [{ startedAt: NOW.toISOString() }],
    });
    expect(recovered.map((session) => session.id)).toEqual([SESSION_ID]);
    expect(await repositories.audioChunks.getById(untouched.id)).toEqual(untouched);
    expect(await repositories.readAudioChunkBytes(untouched.id)).toEqual(bytesOf('first'));
  });

  it.each([
    ['missing', null],
    ['empty', ''],
  ])('discards an active chunk whose file is %s', async (_label, contents) => {
    const { addActive, recover, repositories, disk, session$ } = await seed();
    const active = await addActive(0, contents);
    if (contents === '') {
      disk.files.set(active.encryptedPath, new Uint8Array(0));
    }

    await recover();

    expect(await repositories.audioChunks.getById(active.id)).toMatchObject({ state: 'deleted' });
    expect(await repositories.readAudioChunkBytes(active.id)).toBeNull();
    expect(await session$()).toMatchObject({
      status: 'paused',
      failureCode: 'crash-recovered',
      lastRecoveredChunkId: undefined,
    });
  });

  it('discards an active chunk whose file cannot be read', async () => {
    const { addActive, recover, repositories, disk, chunkState, session$ } = await seed();
    await addActive(0, 'unreadable');
    disk.recordingFiles.readBytes = async () => {
      throw new Error('i/o error');
    };

    await recover();

    expect(await chunkState(0)).toBe('deleted');
    expect(disk.files.has(uriOf(0))).toBe(false);
    expect((await session$())?.status).toBe('paused');
    expect(await repositories.audioChunks.list()).toHaveLength(1);
  });

  it('recovers every active chunk in order and points at the last one that survived', async () => {
    const { addActive, recover, chunkState, session$ } = await seed();
    await addActive(2, null);
    await addActive(0, 'zero');
    await addActive(1, 'one');

    await recover();

    expect([await chunkState(0), await chunkState(1), await chunkState(2)]).toEqual([
      'closed',
      'closed',
      'deleted',
    ]);
    expect((await session$())?.lastRecoveredChunkId).toBe(chunkId(1));
    expect((await session$())?.status).toBe('paused');
  });

  it('pauses a recording session that has no active chunk', async () => {
    const { addClosed, recover, session$ } = await seed();
    await addClosed(0, 'done');

    await recover();

    expect(await session$()).toMatchObject({
      status: 'paused',
      failureCode: 'crash-recovered',
      lastRecoveredChunkId: undefined,
    });
  });

  it('closes chunks of a paused session without changing the session state', async () => {
    const { addActive, recover, chunkState, session$ } = await seed(
      recordingSession({
        status: 'paused',
        pauseIntervals: [{ startedAt: '2026-03-10T09:20:00.000Z' }],
        failureCode: 'call',
      }),
    );
    await addActive(0, 'late');

    await recover();

    expect(await chunkState(0)).toBe('closed');
    expect(await session$()).toMatchObject({ status: 'paused', failureCode: 'call' });
  });

  it('leaves sessions that are not recording or paused alone', async () => {
    const { addActive, recover, repositories, chunkState } = await seed();
    await repositories.recordingSessions.save(
      recordingSession({
        id: OTHER_SESSION_ID,
        scheduledStart: '2026-03-09T09:00:00.000Z',
        scheduledEnd: '2026-03-09T17:00:00.000Z',
        status: 'transcribing',
        actualEnd: '2026-03-09T16:00:00.000Z',
      }),
    );
    await addActive(5, 'orphan', OTHER_SESSION_ID);

    const recovered = await recover();

    expect(recovered.map((session) => session.id)).toEqual([SESSION_ID]);
    expect(await chunkState(5)).toBe('active');
    expect((await repositories.recordingSessions.getById(OTHER_SESSION_ID))?.status).toBe(
      'transcribing',
    );
  });

  it('keeps the file and the session as-is when the commit fails, then recovers on the next launch', async () => {
    const { addActive, recover, faults, disk, chunkState, session$ } = await seed();
    await addActive(0, 'fragile');
    faults.failCommits = 1;

    await recover();

    expect(await chunkState(0)).toBe('active');
    expect(disk.files.has(uriOf(0))).toBe(true);
    expect((await session$())?.status).toBe('recording');

    await recover();

    expect(await chunkState(0)).toBe('closed');
    expect((await session$())?.status).toBe('paused');
  });

  it('is idempotent across launches', async () => {
    const { addActive, recover, database, session$ } = await seed();
    await addActive(0, 'once');
    await recover();
    const after = await session$();
    const operations = () =>
      database.native.prepare('SELECT count(*) AS total FROM recording_operations').get();

    const before = operations();
    await recover();

    expect(await session$()).toEqual(after);
    expect(operations()).toEqual(before);
  });
});

describe('expiry sweep', () => {
  function failedSession(overrides: Partial<RecordingSession> = {}): RecordingSession {
    return recordingSession({
      status: 'failed',
      actualEnd: '2026-03-10T10:00:00.000Z',
      failureCode: 'microphone_failed',
      retryTarget: 'transcribing',
      retryUntil: '2026-03-10T11:00:00.000Z',
      updatedAt: '2026-03-10T10:00:00.000Z',
      ...overrides,
    });
  }

  const cleanupDependencies = () => ({
    deleteFile: jest.fn(async (_path: string) => undefined),
    hash: async () => 'a'.repeat(64),
    uuid: uuidSequence(),
  });

  it('deletes expired chunks including their blobs and writes a receipt', async () => {
    const { addClosed, database, repositories } = await seed(failedSession());
    await addClosed(0, 'first');
    await addClosed(1, 'second');
    const dependencies = cleanupDependencies();

    const receipts = await sweepExpiredSessions(database, repositories, NOW, dependencies);

    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ sessionId: SESSION_ID, reason: 'expired' });
    expect(receipts[0].deletedKinds).toContain('audio_chunks');
    expect(await repositories.audioChunks.list()).toEqual([]);
    expect(database.native.prepare('SELECT count(*) AS total FROM audio_chunks').get()).toEqual({
      total: 0,
    });
    expect(dependencies.deleteFile.mock.calls.map(([path]) => path)).toEqual([uriOf(0), uriOf(1)]);
    expect((await repositories.recordingSessions.getById(SESSION_ID))?.status).toBe('expired');
    expect(await repositories.cleanupReceipts.list()).toHaveLength(1);
  });

  it('keeps sessions whose retry window is still open or that did not fail', async () => {
    const { addClosed, database, repositories } = await seed(
      failedSession({ retryUntil: '2026-03-10T12:00:00.001Z' }),
    );
    await addClosed(0, 'first');
    await repositories.recordingSessions.save(
      recordingSession({
        id: OTHER_SESSION_ID,
        scheduledStart: '2026-03-09T09:00:00.000Z',
        scheduledEnd: '2026-03-09T17:00:00.000Z',
        status: 'paused',
        pauseIntervals: [{ startedAt: '2026-03-09T10:00:00.000Z' }],
      }),
    );
    const dependencies = cleanupDependencies();

    const receipts = await sweepExpiredSessions(database, repositories, NOW, dependencies);

    expect(receipts).toEqual([]);
    expect(await repositories.audioChunks.list()).toHaveLength(1);
    expect(dependencies.deleteFile).not.toHaveBeenCalled();
    expect((await repositories.recordingSessions.getById(SESSION_ID))?.status).toBe('failed');
  });

  it('expires a session exactly at its deadline', async () => {
    const { database, repositories } = await seed(failedSession({ retryUntil: NOW.toISOString() }));

    const receipts = await sweepExpiredSessions(database, repositories, NOW, cleanupDependencies());

    expect(receipts).toHaveLength(1);
  });

  it('carries on with the remaining sessions when one cleanup fails', async () => {
    const { addClosed, database, repositories } = await seed(failedSession());
    await addClosed(0, 'first');
    await repositories.recordingSessions.save(
      failedSession({
        id: OTHER_SESSION_ID,
        scheduledStart: '2026-03-09T09:00:00.000Z',
        scheduledEnd: '2026-03-09T17:00:00.000Z',
      }),
    );
    const dependencies = cleanupDependencies();
    dependencies.deleteFile.mockRejectedValueOnce(new Error('disk error'));

    const receipts = await sweepExpiredSessions(database, repositories, NOW, dependencies);

    expect(receipts).toHaveLength(1);
    expect(await repositories.cleanupReceipts.list()).toHaveLength(1);
  });
});
