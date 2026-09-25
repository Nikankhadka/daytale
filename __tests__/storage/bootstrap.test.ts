// @ts-expect-error Node 22 provides this built-in, but the app's configured type list omits Node types.
import { DatabaseSync } from 'node:sqlite';

import type { SQLiteBindValue, SQLiteRunResult } from 'expo-sqlite';

import { bootstrapStorage, invalidateStorageBootstrap } from '../../src/storage/bootstrap';
import { deleteAllData } from '../../src/storage/cleanup';
import { applyMigrations, type MigrationDatabase } from '../../src/storage/migrations';
import { useSessionStore } from '../../src/state/session';

type TestDatabase = MigrationDatabase & {
  native: DatabaseSync;
  closeAsync: () => Promise<void>;
};

function createTestDatabase(): TestDatabase {
  const native = new DatabaseSync(':memory:');
  let exclusiveQueue = Promise.resolve();
  let database!: TestDatabase;
  database = {
    native,
    execAsync: async (source: string) => {
      native.exec(source);
    },
    runAsync: async (source: string, ...params: SQLiteBindValue[]) => {
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

const olderSessionId = '11111111-1111-4111-8111-111111111111';
const latestSessionId = '22222222-2222-4222-8222-222222222222';
const createdAt = '2026-01-01T00:00:00.000Z';
const latestUpdatedAt = '2026-01-01T00:02:00.000Z';

async function insertSession(
  database: MigrationDatabase,
  id: string,
  updatedAt: string,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO recording_sessions
     (id, scheduled_start, scheduled_end, actual_start, actual_end, timezone,
      status, pause_intervals, last_recovered_chunk_id, failure_code, retry_until,
      retry_target, created_at, updated_at)
     VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
    id,
    createdAt,
    '2026-01-01T00:30:00.000Z',
    'UTC',
    'scheduled',
    '[]',
    createdAt,
    updatedAt,
  );
}

describe('storage bootstrap', () => {
  beforeEach(() => {
    invalidateStorageBootstrap();
  });

  it('initializes once and hydrates the latest persisted session', async () => {
    const database = createTestDatabase();
    await applyMigrations(database);
    await insertSession(database, olderSessionId, createdAt);
    await insertSession(database, latestSessionId, latestUpdatedAt);
    const openDatabase = jest.fn(async () => database);
    const secureStore = {
      getItemAsync: jest.fn(async () => 'test-key'),
      setItemAsync: jest.fn(async () => undefined),
      deleteItemAsync: jest.fn(async () => undefined),
    };

    const first = bootstrapStorage({
      openDatabase,
      secureKey: {
        secureStore,
        crypto: { getRandomBytesAsync: async () => new Uint8Array(32) },
      },
    });
    const second = bootstrapStorage({
      openDatabase,
      secureKey: {
        secureStore,
        crypto: { getRandomBytesAsync: async () => new Uint8Array(32) },
      },
    });
    const result = await first;

    expect(second).toBe(first);
    expect(openDatabase).toHaveBeenCalledTimes(1);
    expect(result.repositories.recordingSessions).toBeDefined();
    expect(useSessionStore.getState().recordingSession).toMatchObject({
      id: latestSessionId,
      updatedAt: latestUpdatedAt,
      status: 'scheduled',
    });
  });

  it('clears a failed bootstrap promise so a later mount can retry', async () => {
    const database = createTestDatabase();
    await applyMigrations(database);
    let attempts = 0;
    const openDatabase = jest.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('initialization failed');
      }
      return database;
    });
    const secureKey = {
      secureStore: {
        getItemAsync: jest.fn(async () => 'test-key'),
        setItemAsync: jest.fn(async () => undefined),
        deleteItemAsync: jest.fn(async () => undefined),
      },
      crypto: { getRandomBytesAsync: async () => new Uint8Array(32) },
    };

    await expect(bootstrapStorage({ openDatabase, secureKey })).rejects.toThrow(
      'Secure storage bootstrap failed.',
    );
    expect(useSessionStore.getState().recordingSession).toBeNull();

    await expect(bootstrapStorage({ openDatabase, secureKey })).resolves.toBeDefined();
    expect(openDatabase).toHaveBeenCalledTimes(2);
  });

  it('invalidates the cached database and allows a clean remount after deletion', async () => {
    const database = createTestDatabase();
    const reopenedDatabase = createTestDatabase();
    await applyMigrations(database);
    await applyMigrations(reopenedDatabase);
    const secureKey = {
      secureStore: {
        getItemAsync: jest.fn(async () => 'test-key'),
        setItemAsync: jest.fn(async () => undefined),
        deleteItemAsync: jest.fn(async () => undefined),
      },
      crypto: { getRandomBytesAsync: async () => new Uint8Array(32) },
    };
    const openDatabase = jest.fn(async () => database);

    await bootstrapStorage({ openDatabase, secureKey });
    await deleteAllData(database, {
      secureKey,
      stopActiveCapture: async () => undefined,
      deleteDatabase: async () => undefined,
    });

    const reopen = jest.fn(async () => reopenedDatabase);
    await expect(bootstrapStorage({ openDatabase: reopen, secureKey })).resolves.toBeDefined();
    expect(reopen).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().recordingSession).toBeNull();
  });
});
