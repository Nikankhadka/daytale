// @ts-expect-error Node 22 provides this built-in, but the app's configured type list omits Node types.
import { DatabaseSync } from 'node:sqlite';

import type { SQLiteBindValue, SQLiteRunResult } from 'expo-sqlite';

import { applyMigrations, type MigrationDatabase } from '../../src/storage/migrations';
import { createStorageRepositories, StorageRepositoryError } from '../../src/storage/repositories';
import type {
  AppPreferences,
  AudioChunk,
  ClarificationAnswer,
  ClarificationQuestion,
  CleanupReceipt,
  ExtractedEvent,
  JournalEntry,
  RecordingOperation,
  RecordingSession,
  TranscriptSegment,
  VoiceProfile,
} from '../../src/storage/types';
import { StorageValidationError } from '../../src/storage/types';

type TestDatabase = MigrationDatabase & {
  closeAsync: () => Promise<void>;
  native: DatabaseSync;
  failNextSessionWrite: boolean;
};

function createTestDatabase(): TestDatabase {
  const native = new DatabaseSync(':memory:');
  let exclusiveQueue = Promise.resolve();
  const database: TestDatabase = {
    native,
    failNextSessionWrite: false,
    execAsync: async (source: string) => {
      native.exec(source);
    },
    runAsync: async (source: string, ...params: SQLiteBindValue[]) => {
      if (database.failNextSessionWrite && source.includes('INSERT INTO recording_sessions')) {
        database.failNextSessionWrite = false;
        throw new Error('induced lifecycle write failure');
      }
      native.prepare(source).run(...params);
      return { changes: 0, lastInsertRowId: 0 } as SQLiteRunResult;
    },
    getFirstAsync: async <T>(source: string, ...params: SQLiteBindValue[]) => {
      const row = native.prepare(source).get(...params);
      return (row as T | undefined) ?? null;
    },
    getAllAsync: async <T>(source: string, ...params: SQLiteBindValue[]) => {
      return native.prepare(source).all(...params) as T[];
    },
    withExclusiveTransactionAsync: (task) => {
      const run = exclusiveQueue.then(async () => {
        native.exec('BEGIN');
        try {
          await task(database);
          native.exec('COMMIT');
        } catch (error) {
          native.exec('ROLLBACK');
          throw error;
        }
      });
      exclusiveQueue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    closeAsync: async () => {
      native.close();
    },
  };
  return database;
}

const t0 = '2026-01-01T00:00:00.000Z';
const t1 = '2026-01-01T00:01:00.000Z';
const t2 = '2026-01-01T00:02:00.000Z';
const t3 = '2026-01-01T00:03:00.000Z';
const sha256 = 'a'.repeat(64);

const ids = {
  preferences: '11111111-1111-4111-8111-111111111111',
  session: '22222222-2222-4222-8222-222222222222',
  secondSession: '33333333-3333-4333-8333-333333333333',
  chunk: '44444444-4444-4444-8444-444444444444',
  secondChunk: '55555555-5555-4555-8555-555555555555',
  transcript: '66666666-6666-4666-8666-666666666666',
  event: '77777777-7777-4777-8777-777777777777',
  questionOne: '88888888-8888-4888-8888-888888888888',
  questionTwo: '99999999-9999-4999-8999-999999999999',
  questionThree: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  answer: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  journal: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  voice: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  receipt: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  operation: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  concurrentOperation: '12121212-1212-4121-8121-121212121212',
  rollbackOperation: '13131313-1313-4131-8131-131313131313',
  rejectedOperation: '14141414-1414-4141-8141-141414141414',
  immutableOperation: '15151515-1515-4151-8151-151515151515',
  failOperation: '16161616-1616-4161-8161-161616161616',
  retryOperation: '17171717-1717-4171-8171-171717171717',
};

function makeSession(
  id = ids.session,
  overrides: Partial<RecordingSession> = {},
): RecordingSession {
  return {
    id,
    scheduledStart: t0,
    scheduledEnd: '2026-01-01T01:00:00.000Z',
    timezone: 'UTC',
    status: 'scheduled',
    pauseIntervals: [],
    createdAt: t0,
    updatedAt: t0,
    ...overrides,
  };
}

function makeChunk(id = ids.chunk, sessionId = ids.session, sequence = 0): AudioChunk {
  return {
    id,
    sessionId,
    sequence,
    startedAt: t1,
    codec: 'aac',
    sampleRate: 16_000,
    encryptedPath: 'opaque-encrypted-path',
    sha256,
    state: 'closed',
    deleteAfter: '2026-01-08T00:00:00.000Z',
    createdAt: t1,
  };
}

describe('storage repositories', () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = createTestDatabase();
    await applyMigrations(database);
  });

  afterEach(async () => {
    await database.closeAsync();
  });

  it('round-trips all section-5 records and JSON array fields', async () => {
    const repositories = createStorageRepositories(database);
    const preferences: AppPreferences = {
      id: ids.preferences,
      firstName: 'opaque-name',
      spokenLanguages: ['en', 'ne'],
      journalLanguage: 'en',
      scheduleStartLocal: '08:00',
      scheduleEndLocal: '20:00',
      timezone: 'UTC',
      notificationsEnabled: true,
      microphonePermissionState: 'granted',
      onboardingComplete: true,
      theme: 'system',
      reducedMotion: false,
      createdAt: t0,
      updatedAt: t1,
    };
    const voiceProfile: VoiceProfile = {
      id: ids.voice,
      status: 'ready',
      sampleCount: 1,
      encryptedEmbeddingBlob: 'opaque-encrypted-embedding',
      modelVersion: 'model-1',
      createdAt: t0,
      updatedAt: t1,
    };
    const session = makeSession();
    const chunk = makeChunk();
    const transcript: TranscriptSegment = {
      id: ids.transcript,
      sessionId: ids.session,
      chunkId: ids.chunk,
      startMs: 0,
      endMs: 900,
      text: 'opaque transcript',
      language: 'en',
      speaker: 'user',
      speakerConfidence: 0.9,
      transcriptConfidence: 0.8,
      createdAt: t2,
    };
    const event: ExtractedEvent = {
      id: ids.event,
      sessionId: ids.session,
      startMs: 0,
      endMs: 900,
      kind: 'task',
      summary: 'opaque summary',
      evidenceSegmentIds: [ids.transcript],
      speaker: 'user',
      confidence: 0.8,
      supported: true,
      createdAt: t2,
    };
    const question: ClarificationQuestion = {
      id: ids.questionOne,
      sessionId: ids.session,
      startMs: 0,
      endMs: 900,
      question: 'opaque question',
      reason: 'opaque reason',
      status: 'open',
      createdAt: t2,
    };
    const answer: ClarificationAnswer = {
      id: ids.answer,
      questionId: ids.questionOne,
      answerText: 'opaque answer',
      createdAt: t3,
    };
    const journal: JournalEntry = {
      id: ids.journal,
      sessionId: ids.session,
      date: '2026-01-01',
      timezone: 'UTC',
      title: 'opaque title',
      paragraphs: ['opaque paragraph one', 'opaque paragraph two'],
      contextTags: ['tag-one', 'tag-two'],
      sourceEventIds: [ids.event],
      language: 'en',
      editedAt: t3,
      createdAt: t2,
      updatedAt: t3,
    };
    const receipt: CleanupReceipt = {
      id: ids.receipt,
      sessionId: ids.session,
      reason: 'success',
      deletedKinds: ['audio_chunks', 'transcript_segments'],
      completedAt: t3,
      contentFreeHash: sha256,
    };
    const operation: RecordingOperation = {
      id: ids.operation,
      sessionId: ids.session,
      operationKind: 'start_recording',
      status: 'pending',
      createdAt: t3,
    };

    await repositories.appPreferences.save(preferences);
    await repositories.voiceProfiles.save(voiceProfile);
    await repositories.recordingSessions.save(session);
    await repositories.audioChunks.save(chunk);
    await repositories.recordingSessions.save({
      ...session,
      lastRecoveredChunkId: ids.chunk,
      updatedAt: t2,
    });
    await repositories.transcriptSegments.save(transcript);
    await repositories.extractedEvents.save(event);
    await repositories.clarificationQuestions.save(question);
    await repositories.clarificationAnswers.save(answer);
    await repositories.journalEntries.save(journal);
    await repositories.cleanupReceipts.save(receipt);
    await repositories.recordingOperations.save(operation);

    expect(await repositories.appPreferences.getById(ids.preferences)).toEqual(preferences);
    expect(await repositories.voiceProfiles.getById(ids.voice)).toEqual(voiceProfile);
    expect(await repositories.recordingSessions.getById(ids.session)).toEqual({
      ...session,
      lastRecoveredChunkId: ids.chunk,
      updatedAt: t2,
    });
    expect(await repositories.audioChunks.getById(ids.chunk)).toEqual(chunk);
    expect(await repositories.transcriptSegments.getById(ids.transcript)).toEqual(transcript);
    expect(await repositories.extractedEvents.getById(ids.event)).toEqual(event);
    expect(await repositories.clarificationQuestions.getById(ids.questionOne)).toEqual(question);
    expect(await repositories.clarificationAnswers.getById(ids.answer)).toEqual(answer);
    expect(await repositories.journalEntries.getById(ids.journal)).toEqual(journal);
    expect(await repositories.cleanupReceipts.getById(ids.receipt)).toEqual(receipt);
    expect(await repositories.recordingOperations.getById(ids.operation)).toEqual(operation);

    const stored = database.native
      .prepare('SELECT pause_intervals FROM recording_sessions WHERE id = ?')
      .get(ids.session) as { pause_intervals: string };
    expect(stored.pause_intervals).toBe('[]');
  });

  it('validates writes and validates JSON arrays when reading', async () => {
    const repositories = createStorageRepositories(database);
    await expect(
      repositories.recordingSessions.save(makeSession('not-a-uuid')),
    ).rejects.toBeInstanceOf(StorageValidationError);

    await repositories.recordingSessions.save(makeSession());
    database.native
      .prepare('UPDATE recording_sessions SET pause_intervals = ? WHERE id = ?')
      .run('not-json', ids.session);

    await expect(repositories.recordingSessions.getById(ids.session)).rejects.toBeInstanceOf(
      StorageValidationError,
    );
  });

  it('round-trips a persisted retry target without losing it', async () => {
    const repositories = createStorageRepositories(database);
    const failedSession = makeSession(ids.secondSession, {
      status: 'failed',
      actualStart: t1,
      actualEnd: t2,
      failureCode: 'microphone_interrupted',
      retryUntil: t3,
      retryTarget: 'transcribing',
      updatedAt: t2,
    });

    await repositories.recordingSessions.save(failedSession);

    expect(await repositories.recordingSessions.getById(ids.secondSession)).toEqual(failedSession);
  });

  it('validates retry metadata pairing and the 24-hour storage boundary', async () => {
    const repositories = createStorageRepositories(database);
    const base = makeSession(ids.secondSession, {
      status: 'failed',
      actualStart: t1,
      actualEnd: t2,
      failureCode: 'microphone_interrupted',
      updatedAt: t2,
    });
    const exactDeadline = '2026-01-02T00:02:00.000Z';

    await repositories.recordingSessions.save({
      ...base,
      retryTarget: 'transcribing',
      retryUntil: exactDeadline,
    });
    await expect(
      repositories.recordingSessions.save({
        ...base,
        retryTarget: 'transcribing',
        retryUntil: '2026-01-02T00:02:00.001Z',
      }),
    ).rejects.toBeInstanceOf(StorageValidationError);
    await expect(
      repositories.recordingSessions.save({ ...base, retryTarget: 'transcribing' }),
    ).rejects.toBeInstanceOf(StorageValidationError);
    await expect(
      repositories.recordingSessions.save({ ...base, retryUntil: exactDeadline }),
    ).rejects.toBeInstanceOf(StorageValidationError);
  });

  it('enforces chunk ownership for recovered chunks and transcript segments', async () => {
    const repositories = createStorageRepositories(database);
    await repositories.recordingSessions.save(makeSession());
    await repositories.recordingSessions.save(makeSession(ids.secondSession));
    await repositories.audioChunks.save(makeChunk());

    await expect(
      repositories.recordingSessions.save(
        makeSession(ids.secondSession, {
          lastRecoveredChunkId: ids.chunk,
          updatedAt: t1,
        }),
      ),
    ).rejects.toBeInstanceOf(StorageRepositoryError);

    await expect(
      repositories.transcriptSegments.save({
        id: ids.transcript,
        sessionId: ids.secondSession,
        chunkId: ids.chunk,
        startMs: 0,
        endMs: 1,
        text: 'opaque transcript',
        language: 'en',
        speaker: 'unknown',
        speakerConfidence: 0,
        transcriptConfidence: 0,
        createdAt: t1,
      }),
    ).rejects.toBeInstanceOf(StorageRepositoryError);
  });

  it('rejects a third open clarification question atomically', async () => {
    const repositories = createStorageRepositories(database);
    await repositories.recordingSessions.save(makeSession());

    const makeQuestion = (id: string): ClarificationQuestion => ({
      id,
      sessionId: ids.session,
      startMs: 0,
      endMs: 1,
      question: 'opaque question',
      reason: 'opaque reason',
      status: 'open',
      createdAt: t1,
    });

    await repositories.clarificationQuestions.save(makeQuestion(ids.questionOne));
    await repositories.clarificationQuestions.save(makeQuestion(ids.questionTwo));
    await expect(
      repositories.clarificationQuestions.save(makeQuestion(ids.questionThree)),
    ).rejects.toThrow('more than two open questions');
    expect(await repositories.clarificationQuestions.list()).toHaveLength(2);
  });

  it('persists operation identity across repository recreation and applies duplicates once', async () => {
    const repositories = createStorageRepositories(database);
    await repositories.recordingSessions.save(makeSession());
    const operation: RecordingOperation = {
      id: ids.operation,
      sessionId: ids.session,
      operationKind: 'start_recording',
      status: 'pending',
      createdAt: t1,
    };
    const first = await repositories.applyRecordingSessionOperation(operation, {
      type: 'start',
      at: t1,
    });
    const reopenedRepositories = createStorageRepositories(database);
    const duplicate = await reopenedRepositories.applyRecordingSessionOperation(operation, {
      type: 'start',
      at: t1,
    });

    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.operation.status).toBe('applied');
    expect(duplicate.session.status).toBe('recording');
    expect(duplicate.session.actualStart).toBe(t1);
  });

  it('applies reducer-driven failure and retry across repository recreation', async () => {
    const repositories = createStorageRepositories(database);
    await repositories.recordingSessions.save(makeSession(ids.secondSession));

    await repositories.applyRecordingSessionOperation(
      {
        id: ids.failOperation,
        sessionId: ids.secondSession,
        operationKind: 'fail_recording',
        status: 'pending',
        createdAt: t1,
      },
      {
        type: 'fail',
        at: t1,
        failureCode: 'microphone_interrupted',
        retryUntil: t3,
        retryTarget: 'transcribing',
      },
    );

    const reopenedRepositories = createStorageRepositories(database);
    const retried = await reopenedRepositories.applyRecordingSessionOperation(
      {
        id: ids.retryOperation,
        sessionId: ids.secondSession,
        operationKind: 'retry_recording',
        status: 'pending',
        createdAt: t2,
      },
      { type: 'retry', at: t2 },
    );

    expect(retried.session.status).toBe('transcribing');
    expect(retried.session.retryTarget).toBeUndefined();
    expect(retried.session.failureCode).toBeUndefined();
  });

  it('serializes concurrent duplicate operation IDs to one effect', async () => {
    const repositories = createStorageRepositories(database);
    await repositories.recordingSessions.save(makeSession(ids.secondSession));
    const operation: RecordingOperation = {
      id: ids.concurrentOperation,
      sessionId: ids.secondSession,
      operationKind: 'start_recording',
      status: 'pending',
      createdAt: t1,
    };
    const results = await Promise.all([
      repositories.applyRecordingSessionOperation(operation, { type: 'start', at: t1 }),
      repositories.applyRecordingSessionOperation(operation, { type: 'start', at: t1 }),
    ]);

    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    expect(results.filter((result) => result.duplicate)).toHaveLength(1);
  });

  it('rolls back a lifecycle write and operation record together on failure', async () => {
    const repositories = createStorageRepositories(database);
    await repositories.recordingSessions.save(makeSession(ids.secondSession));
    database.failNextSessionWrite = true;

    await expect(
      repositories.applyRecordingSessionOperation(
        {
          id: ids.rollbackOperation,
          sessionId: ids.secondSession,
          operationKind: 'start_recording',
          status: 'pending',
          createdAt: t1,
        },
        { type: 'start', at: t1 },
      ),
    ).rejects.toThrow('induced lifecycle write failure');

    expect((await repositories.recordingSessions.getById(ids.secondSession))?.status).toBe(
      'scheduled',
    );
    expect(await repositories.recordingOperations.getById(ids.rollbackOperation)).toBeNull();
  });

  it('records a rejected operation without mutating the session', async () => {
    const repositories = createStorageRepositories(database);
    await repositories.recordingSessions.save(makeSession(ids.secondSession));

    const result = await repositories.applyRecordingSessionOperation(
      {
        id: ids.rejectedOperation,
        sessionId: ids.secondSession,
        operationKind: 'pause_recording',
        status: 'pending',
        createdAt: t1,
      },
      { type: 'pause', at: t1 },
    );

    expect(result.operation.status).toBe('rejected');
    expect(result.session.status).toBe('scheduled');
    expect(await repositories.recordingSessions.getById(ids.secondSession)).toEqual(
      makeSession(ids.secondSession),
    );
    expect(await repositories.recordingOperations.getById(ids.rejectedOperation)).toMatchObject({
      status: 'rejected',
    });
  });

  it('keeps generic recording operation records insert-only', async () => {
    const repositories = createStorageRepositories(database);
    await repositories.recordingSessions.save(makeSession());
    const operation: RecordingOperation = {
      id: ids.immutableOperation,
      sessionId: ids.session,
      operationKind: 'start_recording',
      status: 'pending',
      createdAt: t1,
    };

    await repositories.recordingOperations.save(operation);
    await expect(
      repositories.recordingOperations.save({
        ...operation,
        operationKind: 'stop_recording',
        status: 'applied',
        completedAt: t2,
      }),
    ).rejects.toThrow(/UNIQUE/);
    expect(await repositories.recordingOperations.getById(operation.id)).toEqual(operation);
  });

  it('requires evidence and journal references to belong to the same session', async () => {
    const repositories = createStorageRepositories(database);
    await repositories.recordingSessions.save(makeSession());
    await repositories.recordingSessions.save(makeSession(ids.secondSession));
    await repositories.audioChunks.save(makeChunk());
    await repositories.transcriptSegments.save({
      id: ids.transcript,
      sessionId: ids.session,
      chunkId: ids.chunk,
      startMs: 0,
      endMs: 1,
      text: 'opaque transcript',
      language: 'en',
      speaker: 'unknown',
      speakerConfidence: 0,
      transcriptConfidence: 0,
      createdAt: t1,
    });

    await expect(
      repositories.extractedEvents.save({
        id: ids.event,
        sessionId: ids.secondSession,
        startMs: 0,
        endMs: 1,
        kind: 'task',
        summary: 'opaque summary',
        evidenceSegmentIds: [ids.transcript],
        speaker: 'unknown',
        confidence: 0,
        supported: false,
        createdAt: t2,
      }),
    ).rejects.toBeInstanceOf(StorageRepositoryError);

    await expect(
      repositories.journalEntries.save({
        id: ids.journal,
        sessionId: ids.secondSession,
        date: '2026-01-01',
        timezone: 'UTC',
        title: 'opaque title',
        paragraphs: ['opaque paragraph'],
        contextTags: [],
        sourceEventIds: [ids.event],
        language: 'en',
        createdAt: t2,
        updatedAt: t2,
      }),
    ).rejects.toBeInstanceOf(StorageRepositoryError);
  });

  it('validates lookup ids at the repository boundary', async () => {
    const repositories = createStorageRepositories(database);
    await expect(repositories.recordingSessions.getById('not-a-uuid')).rejects.toBeInstanceOf(
      StorageValidationError,
    );
  });
});
