// @ts-expect-error Node 22 provides this built-in, but the app's configured type list omits Node types.
import { DatabaseSync } from 'node:sqlite';

import type { SQLiteBindValue, SQLiteRunResult } from 'expo-sqlite';

import {
  cleanupExpiredSession,
  deleteAllData,
  type CleanupDatabase,
} from '../../src/storage/cleanup';
import { applyMigrations, type MigrationDatabase } from '../../src/storage/migrations';
import { DATABASE_KEY_NAME } from '../../src/storage/secureKey';
import { useSessionStore } from '../../src/state/session';

type TestDatabase = CleanupDatabase & {
  native: DatabaseSync;
  closeCalls: number;
  events: string[];
  failStatement?: string;
  statements: string[];
};

function createTestDatabase(events: string[] = []): TestDatabase {
  const native = new DatabaseSync(':memory:');
  let exclusiveQueue = Promise.resolve();
  let database!: TestDatabase;
  database = {
    native,
    closeCalls: 0,
    events,
    statements: [],
    execAsync: async (source: string) => {
      native.exec(source);
    },
    runAsync: async (source: string, ...params: SQLiteBindValue[]) => {
      database.statements.push(source);
      if (database.failStatement !== undefined && source.includes(database.failStatement)) {
        database.failStatement = undefined;
        throw new Error('induced cleanup database failure');
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
      database.closeCalls += 1;
      database.events.push('close');
      native.close();
    },
  };
  return database;
}

const timestamps = {
  created: '2026-01-01T00:00:00.000Z',
  retryUntil: '2026-01-01T00:01:00.000Z',
  completed: '2026-01-01T00:02:00.000Z',
  later: '2026-01-01T00:03:00.000Z',
};

const ids = {
  session: '22222222-2222-4222-8222-222222222222',
  chunk: '44444444-4444-4444-8444-444444444444',
  transcript: '66666666-6666-4666-8666-666666666666',
  event: '77777777-7777-4777-8777-777777777777',
  question: '88888888-8888-4888-8888-888888888888',
  answer: '99999999-9999-4999-8999-999999999999',
  journal: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  preferences: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  voice: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  receipt: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  cleanupOperation: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  cleanupReceipt: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
};

const sha256 = 'a'.repeat(64);

async function createMigratedDatabase(events: string[] = []): Promise<TestDatabase> {
  const database = createTestDatabase(events);
  await applyMigrations(database);
  return database;
}

async function insertExpiredMaterial(database: MigrationDatabase): Promise<void> {
  await database.runAsync(
    `INSERT INTO recording_sessions
     (id, scheduled_start, scheduled_end, actual_start, actual_end, timezone,
      status, pause_intervals, last_recovered_chunk_id, failure_code, retry_until,
      retry_target, created_at, updated_at)
     VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
    ids.session,
    timestamps.created,
    timestamps.later,
    'UTC',
    'failed',
    '[]',
    'capture_failed',
    timestamps.retryUntil,
    'transcribing',
    timestamps.created,
    timestamps.created,
  );
  await database.runAsync(
    `INSERT INTO audio_chunks
     (id, session_id, sequence, started_at, ended_at, codec, sample_rate,
      encrypted_path, sha256, state, delete_after, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ids.chunk,
    ids.session,
    0,
    timestamps.created,
    timestamps.retryUntil,
    'aac',
    16000,
    'file:///private/chunk.enc',
    sha256,
    'closed',
    timestamps.later,
    timestamps.created,
  );
  await database.runAsync(
    `INSERT INTO transcript_segments
     (id, session_id, chunk_id, start_ms, end_ms, text, language, speaker,
      speaker_confidence, transcript_confidence, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ids.transcript,
    ids.session,
    ids.chunk,
    0,
    1000,
    'transient transcript',
    'en',
    'user',
    1,
    1,
    timestamps.created,
  );
  await database.runAsync(
    `INSERT INTO extracted_events
     (id, session_id, start_ms, end_ms, kind, summary, evidence_segment_ids,
      speaker, confidence, supported, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ids.event,
    ids.session,
    0,
    1000,
    'event',
    'transient event',
    JSON.stringify([ids.transcript]),
    'user',
    1,
    1,
    timestamps.created,
  );
  await database.runAsync(
    `INSERT INTO clarification_questions
     (id, session_id, start_ms, end_ms, question, reason, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ids.question,
    ids.session,
    0,
    1000,
    'transient question',
    'transient reason',
    'open',
    timestamps.created,
  );
  await database.runAsync(
    `INSERT INTO clarification_answers (id, question_id, answer_text, created_at)
     VALUES (?, ?, ?, ?)`,
    ids.answer,
    ids.question,
    'transient answer',
    timestamps.created,
  );
}

async function insertPreservedMaterial(database: MigrationDatabase): Promise<void> {
  await database.runAsync(
    `INSERT INTO app_preferences
     (id, first_name, spoken_languages, journal_language, schedule_start_local,
      schedule_end_local, timezone, notifications_enabled, microphone_permission_state,
      onboarding_complete, theme, reduced_motion, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ids.preferences,
    'Private',
    JSON.stringify(['en']),
    'en',
    '08:00',
    '20:00',
    'UTC',
    1,
    'granted',
    1,
    'system',
    0,
    timestamps.created,
    timestamps.created,
  );
  await database.runAsync(
    `INSERT INTO voice_profiles
     (id, status, sample_count, encrypted_embedding_blob, model_version,
      created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    ids.voice,
    'ready',
    1,
    'encrypted embedding',
    'v1',
    timestamps.created,
    timestamps.created,
  );
  await database.runAsync(
    `INSERT INTO journal_entries
     (id, session_id, date, timezone, title, paragraphs, context_tags,
      source_event_ids, language, edited_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ids.journal,
    ids.session,
    '2026-01-01',
    'UTC',
    'Private journal',
    JSON.stringify(['Private paragraph']),
    JSON.stringify([]),
    JSON.stringify([ids.event]),
    'en',
    timestamps.created,
    timestamps.created,
  );
  await database.runAsync(
    `INSERT INTO cleanup_receipts
     (id, session_id, reason, deleted_kinds, completed_at, content_free_hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ids.receipt,
    null,
    'success',
    JSON.stringify([]),
    timestamps.created,
    sha256,
  );
}

async function countRows(database: MigrationDatabase, table: string): Promise<number> {
  const row = await database.getFirstAsync<{ count: number }>(
    `SELECT count(*) AS count FROM ${table}`,
  );
  return row?.count ?? 0;
}

describe('cleanup', () => {
  it('expires eligible retry material, preserves durable records, and is idempotent', async () => {
    const database = await createMigratedDatabase();
    await insertExpiredMaterial(database);
    await insertPreservedMaterial(database);
    const deletedPaths: string[] = [];

    const dependencies = {
      deleteFile: async (path: string) => {
        deletedPaths.push(path);
      },
      hash: async () => sha256,
      uuid: (() => {
        const values = [ids.cleanupOperation, ids.cleanupReceipt];
        return () => values.shift() as string;
      })(),
      now: () => timestamps.completed,
    };

    const receipt = await cleanupExpiredSession(database, ids.session, dependencies);

    expect(receipt?.id).toBe(ids.cleanupReceipt);
    expect(deletedPaths).toEqual(['file:///private/chunk.enc']);
    expect(await countRows(database, 'audio_chunks')).toBe(0);
    expect(await countRows(database, 'transcript_segments')).toBe(0);
    expect(await countRows(database, 'extracted_events')).toBe(0);
    expect(await countRows(database, 'clarification_questions')).toBe(0);
    expect(await countRows(database, 'clarification_answers')).toBe(0);
    expect(await countRows(database, 'journal_entries')).toBe(1);
    expect(await countRows(database, 'app_preferences')).toBe(1);
    expect(await countRows(database, 'voice_profiles')).toBe(1);
    expect(await countRows(database, 'cleanup_receipts')).toBe(2);
    expect(await countRows(database, 'recording_operations')).toBe(1);
    expect(
      await database.getFirstAsync<{ status: string; operation_kind: string }>(
        'SELECT status, operation_kind FROM recording_operations WHERE id = ?',
        ids.cleanupOperation,
      ),
    ).toEqual({ status: 'applied', operation_kind: 'expire_recording' });
    expect(
      await database.getFirstAsync<{
        status: string;
        retry_until: string | null;
        retry_target: string | null;
      }>(
        'SELECT status, retry_until, retry_target FROM recording_sessions WHERE id = ?',
        ids.session,
      ),
    ).toEqual({ status: 'expired', retry_until: null, retry_target: null });

    const second = await cleanupExpiredSession(database, ids.session, {
      ...dependencies,
      uuid: () => {
        throw new Error('idempotent cleanup generated a second receipt');
      },
      deleteFile: async () => {
        throw new Error('idempotent cleanup deleted a missing file');
      },
    });

    expect(second).toBeNull();
    expect(await countRows(database, 'cleanup_receipts')).toBe(2);
  });

  it('skips retry material whose deadline has not expired', async () => {
    const database = await createMigratedDatabase();
    await insertExpiredMaterial(database);
    await database.runAsync(
      'UPDATE recording_sessions SET retry_until = ? WHERE id = ?',
      timestamps.later,
      ids.session,
    );
    const deleteFile = jest.fn<Promise<void>, [string]>(async () => undefined);

    const result = await cleanupExpiredSession(database, ids.session, {
      now: () => timestamps.completed,
      deleteFile,
    });

    expect(result).toBeNull();
    expect(deleteFile).not.toHaveBeenCalled();
    expect(await countRows(database, 'audio_chunks')).toBe(1);
  });

  it('rolls back metadata and receipts when file deletion fails', async () => {
    const database = await createMigratedDatabase();
    await insertExpiredMaterial(database);

    await expect(
      cleanupExpiredSession(database, ids.session, {
        now: () => timestamps.completed,
        deleteFile: async () => {
          throw new Error('file deletion failed');
        },
        uuid: () => ids.cleanupOperation,
      }),
    ).rejects.toThrow('file deletion failed');

    expect(await countRows(database, 'audio_chunks')).toBe(1);
    expect(await countRows(database, 'cleanup_receipts')).toBe(0);
    expect(
      await database.getFirstAsync<{ status: string }>(
        'SELECT status FROM recording_sessions WHERE id = ?',
        ids.session,
      ),
    ).toEqual({ status: 'failed' });
  });

  it('rolls back metadata and receipts when the database transaction fails', async () => {
    const database = await createMigratedDatabase();
    await insertExpiredMaterial(database);
    database.failStatement = 'INSERT INTO recording_sessions';
    const deletedPaths: string[] = [];

    await expect(
      cleanupExpiredSession(database, ids.session, {
        now: () => timestamps.completed,
        deleteFile: async (path: string) => {
          deletedPaths.push(path);
        },
        uuid: () => ids.cleanupOperation,
      }),
    ).rejects.toThrow('induced cleanup database failure');

    expect(deletedPaths).toEqual([]);
    expect(await countRows(database, 'audio_chunks')).toBe(1);
    expect(await countRows(database, 'cleanup_receipts')).toBe(0);
    expect(
      await database.getFirstAsync<{ status: string; retry_until: string }>(
        'SELECT status, retry_until FROM recording_sessions WHERE id = ?',
        ids.session,
      ),
    ).toEqual({ status: 'failed', retry_until: timestamps.retryUntil });
  });

  it('caps overlong retry metadata and cleans overdue material exactly once', async () => {
    const database = await createMigratedDatabase();
    await insertExpiredMaterial(database);
    await database.runAsync(
      'UPDATE recording_sessions SET retry_until = ? WHERE id = ?',
      '2026-01-02T00:00:00.001Z',
      ids.session,
    );
    const deleteFile = jest.fn<Promise<void>, [string]>(async () => undefined);
    const uuid = jest
      .fn<string, []>()
      .mockReturnValueOnce(ids.cleanupOperation)
      .mockReturnValueOnce(ids.cleanupReceipt);

    const receipt = await cleanupExpiredSession(database, ids.session, {
      now: () => '2026-01-03T00:00:00.000Z',
      deleteFile,
      hash: async () => sha256,
      uuid,
    });

    expect(receipt?.id).toBe(ids.cleanupReceipt);
    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(await countRows(database, 'audio_chunks')).toBe(0);
    expect(await countRows(database, 'recording_operations')).toBe(1);
    expect(await countRows(database, 'cleanup_receipts')).toBe(1);

    const second = await cleanupExpiredSession(database, ids.session, {
      now: () => '2026-01-03T00:00:00.000Z',
      deleteFile: async () => {
        throw new Error('cleanup attempted to delete a file twice');
      },
      uuid: () => {
        throw new Error('cleanup attempted to create a receipt twice');
      },
    });

    expect(second).toBeNull();
    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(await countRows(database, 'cleanup_receipts')).toBe(1);
  });

  it('expires a legacy v2 failed session with a retry deadline but no target exactly once', async () => {
    const database = await createMigratedDatabase();
    await insertExpiredMaterial(database);
    await database.runAsync(
      'UPDATE recording_sessions SET retry_target = NULL WHERE id = ?',
      ids.session,
    );
    const deleteFile = jest.fn<Promise<void>, [string]>(async () => undefined);
    const uuid = jest
      .fn<string, []>()
      .mockReturnValueOnce(ids.cleanupOperation)
      .mockReturnValueOnce(ids.cleanupReceipt);

    const receipt = await cleanupExpiredSession(database, ids.session, {
      now: () => timestamps.completed,
      deleteFile,
      hash: async () => sha256,
      uuid,
    });

    expect(receipt?.id).toBe(ids.cleanupReceipt);
    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(await countRows(database, 'audio_chunks')).toBe(0);
    expect(await countRows(database, 'transcript_segments')).toBe(0);
    expect(await countRows(database, 'cleanup_receipts')).toBe(1);
    expect(
      await database.getFirstAsync<{ status: string; retry_until: string | null }>(
        'SELECT status, retry_until FROM recording_sessions WHERE id = ?',
        ids.session,
      ),
    ).toEqual({ status: 'expired', retry_until: null });

    const second = await cleanupExpiredSession(database, ids.session, {
      now: () => timestamps.completed,
      deleteFile: async () => {
        throw new Error('legacy cleanup attempted to delete a file twice');
      },
      uuid: () => {
        throw new Error('legacy cleanup attempted to create a receipt twice');
      },
    });

    expect(second).toBeNull();
    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(await countRows(database, 'cleanup_receipts')).toBe(1);
  });

  it('stops active capture before delete-all-data and removes the key last', async () => {
    const order: string[] = [];
    const database = await createMigratedDatabase(order);
    await insertExpiredMaterial(database);
    await insertPreservedMaterial(database);
    useSessionStore.getState().setRecordingSession({
      id: ids.session,
      scheduledStart: timestamps.created,
      scheduledEnd: timestamps.later,
      timezone: 'UTC',
      status: 'failed',
      pauseIntervals: [],
      failureCode: 'capture_failed',
      retryUntil: timestamps.retryUntil,
      retryTarget: 'transcribing',
      createdAt: timestamps.created,
      updatedAt: timestamps.created,
    });
    const secureStore = {
      getItemAsync: jest.fn(async () => 'unused'),
      setItemAsync: jest.fn(async () => undefined),
      deleteItemAsync: jest.fn(async (key: string) => {
        expect(key).toBe(DATABASE_KEY_NAME);
        order.push('key');
      }),
    };

    await deleteAllData(database, {
      stopActiveCapture: async () => {
        order.push('stop');
      },
      deleteFile: async () => {
        order.push('file');
      },
      deleteDatabase: async () => {
        order.push('delete-database');
      },
      secureKey: {
        secureStore,
        crypto: { getRandomBytesAsync: async () => new Uint8Array(32) },
      },
    });

    expect(order[0]).toBe('stop');
    expect(order.indexOf('stop')).toBeLessThan(order.indexOf('file'));
    expect(order.indexOf('delete-database')).toBeLessThan(order.indexOf('key'));
    expect(database.closeCalls).toBe(1);
    expect(useSessionStore.getState().recordingSession).toBeNull();
    expect(database.statements.filter((statement) => statement.startsWith('DELETE')).length).toBe(
      11,
    );
  });

  it('does not perform destructive work when active capture cannot be stopped', async () => {
    const database = await createMigratedDatabase();
    await insertExpiredMaterial(database);
    const deleteDatabase = jest.fn(async () => undefined);
    const deleteKey = jest.fn(async () => undefined);

    await expect(
      deleteAllData(database, {
        stopActiveCapture: async () => {
          throw new Error('active capture stop failed');
        },
        deleteDatabase,
        secureKey: {
          secureStore: {
            getItemAsync: async () => null,
            setItemAsync: async () => undefined,
            deleteItemAsync: deleteKey,
          },
          crypto: { getRandomBytesAsync: async () => new Uint8Array(32) },
        },
      }),
    ).rejects.toThrow('active capture stop failed');

    expect(database.closeCalls).toBe(0);
    expect(deleteDatabase).not.toHaveBeenCalled();
    expect(deleteKey).not.toHaveBeenCalled();
    expect(await countRows(database, 'recording_sessions')).toBe(1);
  });
});
