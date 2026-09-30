import {
  discardFailedSession,
  retrySession,
  skipSession,
} from '../../src/features/recording/sessionCommands';
import { useSessionStore } from '../../src/state/session';
import type { RecordingSession } from '../../src/storage/types';
import { createHarness, makeScheduledSession, SESSION_ID, uuidSequence } from './testKit';

const NOW = new Date('2026-03-10T12:00:00.000Z');

async function setup(session: Partial<RecordingSession> = {}) {
  const harness = await createHarness();
  const saved = await harness.repositories.recordingSessions.save(makeScheduledSession(session));
  useSessionStore.getState().resetSession();
  const deleted: string[] = [];
  const clock = {
    now: () => NOW,
    uuid: uuidSequence(),
    cleanup: {
      uuid: uuidSequence(),
      hash: async () => 'c'.repeat(64),
      deleteFile: async (path: string) => void deleted.push(path),
    },
  };
  return { ...harness, saved, deleted, clock, storage: harness };
}

const failed: Partial<RecordingSession> = {
  status: 'failed',
  actualStart: '2026-03-10T09:00:00.000Z',
  actualEnd: '2026-03-10T11:00:00.000Z',
  failureCode: 'transcription-failed',
  retryTarget: 'transcribing',
  retryUntil: '2026-03-10T23:00:00.000Z',
  updatedAt: '2026-03-10T11:00:00.000Z',
};

describe('session commands', () => {
  describe('skipSession', () => {
    it('discards a scheduled session, records the operation, and shows the result', async () => {
      const { storage, clock, repositories } = await setup();

      const skipped = await skipSession(storage, SESSION_ID, clock);

      expect(skipped).toBe(true);
      expect((await repositories.recordingSessions.getById(SESSION_ID))?.status).toBe('discarded');
      expect(useSessionStore.getState().recordingSession?.status).toBe('discarded');
      const operations = await repositories.recordingOperations.list();
      expect(operations.map((operation) => operation.operationKind)).toContain('skip_recording');
    });

    it('reports a session it cannot skip without changing it', async () => {
      const { storage, clock, repositories } = await setup(failed);

      expect(await skipSession(storage, SESSION_ID, clock)).toBe(false);
      expect((await repositories.recordingSessions.getById(SESSION_ID))?.status).toBe('failed');
    });

    it('reports a missing session', async () => {
      const { storage, clock } = await setup();

      expect(await skipSession(storage, '99999999-9999-4999-8999-999999999999', clock)).toBe(false);
    });

    it('never acts earlier than the last update of the session', async () => {
      const { storage, repositories } = await setup({ updatedAt: '2026-03-10T13:00:00.000Z' });

      const skipped = await skipSession(storage, SESSION_ID, {
        now: () => NOW,
        uuid: uuidSequence(),
      });

      expect(skipped).toBe(true);
      expect((await repositories.recordingSessions.getById(SESSION_ID))?.updatedAt).toBe(
        '2026-03-10T13:00:00.000Z',
      );
    });
  });

  describe('retrySession', () => {
    const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    it('moves a failed session to its retry target and publishes it', async () => {
      const { storage, clock } = await setup(failed);

      const outcome = await retrySession(storage, SESSION_ID, operationId, clock);

      expect(outcome).toBe('retried');
      expect(useSessionStore.getState().recordingSession).toMatchObject({
        status: 'transcribing',
        retryUntil: undefined,
      });
    });

    it('applies a repeated tap with the same operation id only once', async () => {
      const { storage, clock, repositories } = await setup({
        ...failed,
        retryTarget: 'recording',
      });

      await retrySession(storage, SESSION_ID, operationId, clock);
      const again = await retrySession(storage, SESSION_ID, operationId, clock);

      expect(again).toBe('retried');
      const operations = (await repositories.recordingOperations.list()).filter(
        (operation) => operation.operationKind === 'retry_recording',
      );
      expect(operations).toHaveLength(1);
      expect((await repositories.recordingSessions.getById(SESSION_ID))?.status).toBe('recording');
    });

    it('expires the session and deletes its retry material once the deadline has passed', async () => {
      const { storage, clock, repositories } = await setup({
        ...failed,
        retryUntil: '2026-03-10T11:30:00.000Z',
      });

      const outcome = await retrySession(storage, SESSION_ID, operationId, clock);

      expect(outcome).toBe('expired');
      expect((await repositories.recordingSessions.getById(SESSION_ID))?.status).toBe('expired');
      expect(useSessionStore.getState().recordingSession?.status).toBe('expired');
    });

    it('refuses a session that is not failed without expiring it', async () => {
      const { storage, clock, repositories } = await setup();

      const outcome = await retrySession(storage, SESSION_ID, operationId, clock);

      expect(outcome).toBe('rejected');
      expect((await repositories.recordingSessions.getById(SESSION_ID))?.status).toBe('scheduled');
    });
  });

  describe('discardFailedSession', () => {
    it('gives up on a failed session now, before its deadline, and deletes its audio', async () => {
      const { storage, clock, repositories, deleted } = await setup(failed);
      await repositories.audioChunks.save({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        sessionId: SESSION_ID,
        sequence: 0,
        startedAt: '2026-03-10T09:00:00.000Z',
        endedAt: '2026-03-10T09:05:00.000Z',
        codec: 'aac',
        sampleRate: 16000,
        encryptedPath: 'file:///encrypted/chunk-0.bin',
        sha256: 'd'.repeat(64),
        state: 'closed',
        deleteAfter: '2026-03-11T09:00:00.000Z',
        createdAt: '2026-03-10T09:05:00.000Z',
      });

      const discarded = await discardFailedSession(storage, SESSION_ID, clock);

      expect(discarded).toBe(true);
      expect(deleted).toEqual(['file:///encrypted/chunk-0.bin']);
      expect(useSessionStore.getState().recordingSession?.status).toBe('expired');
    });

    it('leaves a session that has not failed alone', async () => {
      const { storage, clock, repositories } = await setup();

      expect(await discardFailedSession(storage, SESSION_ID, clock)).toBe(false);
      expect((await repositories.recordingSessions.getById(SESSION_ID))?.status).toBe('scheduled');
    });
  });
});
