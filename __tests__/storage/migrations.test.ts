// @ts-expect-error Node 22 provides this built-in, but the app's configured type list omits Node types.
import { DatabaseSync } from 'node:sqlite';

import type { SQLiteBindValue, SQLiteRunResult } from 'expo-sqlite';

import {
  DATABASE_NAME,
  initializeDatabase,
  type SQLiteDatabaseLike,
} from '../../src/storage/database';
import {
  applyMigrations,
  MIGRATIONS,
  type Migration,
  type MigrationDatabase,
} from '../../src/storage/migrations';

type TestDatabase = MigrationDatabase & {
  closeAsync: () => Promise<void>;
  native: DatabaseSync;
  execAsync: jest.Mock<Promise<void>, [string]>;
};

function createTestDatabase(): TestDatabase {
  const native = new DatabaseSync(':memory:');
  const database: TestDatabase = {
    native,
    execAsync: jest.fn(async (source: string) => {
      native.exec(source);
    }),
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
    withExclusiveTransactionAsync: async (task) => {
      native.exec('BEGIN');
      try {
        await task(database);
        native.exec('COMMIT');
      } catch (error) {
        native.exec('ROLLBACK');
        throw error;
      }
    },
    closeAsync: async () => {
      native.close();
    },
  };
  return database;
}

const tableNames = [
  'app_preferences',
  'voice_profiles',
  'recording_sessions',
  'audio_chunks',
  'transcript_segments',
  'extracted_events',
  'clarification_questions',
  'clarification_answers',
  'journal_entries',
  'cleanup_receipts',
  'recording_operations',
];

const sessionId = '11111111-1111-4111-8111-111111111111';
const chunkId = '22222222-2222-4222-8222-222222222222';
const operationId = '44444444-4444-4444-8444-444444444444';

describe('storage schema migrations', () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = createTestDatabase();
  });

  afterEach(async () => {
    await database.closeAsync();
  });

  it('creates the section-5 tables and operation identity table at schema version four', async () => {
    await applyMigrations(database);

    const version = database.native.prepare('PRAGMA user_version').get() as {
      user_version: number;
    };
    const rows = database.native
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];

    expect(version.user_version).toBe(4);
    expect(rows.map((row) => row.name)).toEqual([...tableNames].sort());
    expect(
      (database.native.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number })
        .foreign_keys,
    ).toBe(1);

    for (const tableName of tableNames) {
      const primaryKey = database.native.prepare(`PRAGMA table_info(${tableName})`).all() as {
        name: string;
        pk: number;
      }[];
      expect(primaryKey.find((column) => column.name === 'id')?.pk).toBe(1);
    }
  });

  it('reruns schema migration without changing version or duplicating tables', async () => {
    await applyMigrations(database);
    database.execAsync.mockClear();

    await applyMigrations(database);

    expect(database.execAsync).toHaveBeenCalledTimes(1);
    expect(database.execAsync).toHaveBeenCalledWith('PRAGMA foreign_keys = ON;');
    expect(
      (database.native.prepare('PRAGMA user_version').get() as { user_version: number })
        .user_version,
    ).toBe(4);
  });

  it('upgrades an existing version-one database with operation identity and retry support', async () => {
    await applyMigrations(database, [MIGRATIONS[0]]);

    expect(
      (database.native.prepare('PRAGMA user_version').get() as { user_version: number })
        .user_version,
    ).toBe(1);
    expect(
      database.native
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recording_operations'",
        )
        .get(),
    ).toBeUndefined();

    await applyMigrations(database);

    expect(
      (database.native.prepare('PRAGMA user_version').get() as { user_version: number })
        .user_version,
    ).toBe(4);
    expect(
      database.native
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recording_operations'",
        )
        .get(),
    ).toEqual({ name: 'recording_operations' });
    expect(
      (
        database.native.prepare('PRAGMA table_info(recording_sessions)').all() as { name: string }[]
      ).map((column) => column.name),
    ).toContain('retry_target');
  });

  it('upgrades a version-two database with a retry target column', async () => {
    await applyMigrations(database, [MIGRATIONS[0], MIGRATIONS[1]]);
    expect(
      (database.native.prepare('PRAGMA user_version').get() as { user_version: number })
        .user_version,
    ).toBe(2);

    await applyMigrations(database);

    expect(
      (database.native.prepare('PRAGMA user_version').get() as { user_version: number })
        .user_version,
    ).toBe(4);
    expect(
      (
        database.native.prepare('PRAGMA table_info(recording_sessions)').all() as { name: string }[]
      ).map((column) => column.name),
    ).toContain('retry_target');
  });

  it('rolls back a failing migration without changing schema or user_version', async () => {
    const failingMigration: Migration = {
      version: 1,
      statements: [
        'CREATE TABLE rollback_probe (id TEXT PRIMARY KEY)',
        'CREATE TABLE this statement is invalid',
      ],
    };

    await expect(applyMigrations(database, [failingMigration])).rejects.toThrow();

    expect(
      (database.native.prepare('PRAGMA user_version').get() as { user_version: number })
        .user_version,
    ).toBe(0);
    expect(
      database.native
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rollback_probe'")
        .get(),
    ).toBeUndefined();
  });

  it('rejects malformed UUIDs and UTC timestamps in direct SQLite inserts', async () => {
    await applyMigrations(database);

    const insertSession = database.native.prepare(
      `INSERT INTO recording_sessions
        (id, scheduled_start, scheduled_end, timezone, status, pause_intervals, created_at, updated_at)
       VALUES (?, ?, ?, 'UTC', 'scheduled', '[]', ?, ?)`,
    );
    const validTimestamp = '2026-01-01T00:00:00.000Z';

    expect(() =>
      insertSession.run(
        'not-a-uuid',
        validTimestamp,
        '2026-01-01T00:30:00.000Z',
        validTimestamp,
        validTimestamp,
      ),
    ).toThrow(/CHECK/);
    expect(() =>
      insertSession.run(
        '33333333-3333-4333-8333-333333333333',
        '2026-01-01T00:00:00.000',
        '2026-01-01T00:30:00.000Z',
        validTimestamp,
        validTimestamp,
      ),
    ).toThrow(/CHECK/);
    expect(() =>
      insertSession.run(
        '33333333-3333-4333-8333-333333333333',
        '2026-02-31T00:00:00.000Z',
        '2026-01-01T00:30:00.000Z',
        validTimestamp,
        validTimestamp,
      ),
    ).toThrow(/CHECK/);
    expect(() =>
      insertSession.run(
        '33333333-3333-4333-8333-333333333333',
        'abcd-01-01T00:00:00.000Z',
        '2026-01-01T00:30:00.000Z',
        validTimestamp,
        validTimestamp,
      ),
    ).toThrow(/CHECK/);
  });

  it('enforces foreign keys and cascades session deletion to dependent records', async () => {
    await applyMigrations(database);

    expect(() =>
      database.native
        .prepare(
          `INSERT INTO audio_chunks
            (id, session_id, sequence, started_at, codec, sample_rate, encrypted_path, sha256, state, delete_after, created_at)
           VALUES (?, ?, 0, ?, 'aac', 16000, 'encrypted', ?, 'active', ?, ?)`,
        )
        .run(
          chunkId,
          sessionId,
          '2026-01-01T00:00:00.000Z',
          'a'.repeat(64),
          '2026-01-02T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z',
        ),
    ).toThrow(/FOREIGN KEY/);

    database.native
      .prepare(
        `INSERT INTO recording_sessions
          (id, scheduled_start, scheduled_end, timezone, status, pause_intervals, created_at, updated_at)
         VALUES (?, ?, ?, 'UTC', 'scheduled', '[]', ?, ?)`,
      )
      .run(
        sessionId,
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:30:00.000Z',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      );
    database.native
      .prepare(
        `INSERT INTO audio_chunks
          (id, session_id, sequence, started_at, codec, sample_rate, encrypted_path, sha256, state, delete_after, created_at)
         VALUES (?, ?, 0, ?, 'aac', 16000, 'encrypted', ?, 'active', ?, ?)`,
      )
      .run(
        chunkId,
        sessionId,
        '2026-01-01T00:00:00.000Z',
        'a'.repeat(64),
        '2026-01-02T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      );

    database.native.prepare('DELETE FROM recording_sessions WHERE id = ?').run(sessionId);
    const remaining = database.native
      .prepare('SELECT count(*) AS count FROM audio_chunks WHERE id = ?')
      .get(chunkId) as { count: number };
    expect(remaining.count).toBe(0);
  });

  it('persists a content-free operation identity and rejects duplicate operation ids', async () => {
    await applyMigrations(database);

    database.native
      .prepare(
        `INSERT INTO recording_sessions
          (id, scheduled_start, scheduled_end, timezone, status, pause_intervals, created_at, updated_at)
         VALUES (?, ?, ?, 'UTC', 'scheduled', '[]', ?, ?)`,
      )
      .run(
        sessionId,
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:30:00.000Z',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      );

    const insertOperation = database.native.prepare(
      `INSERT INTO recording_operations
        (id, session_id, operation_kind, status, created_at)
       VALUES (?, ?, ?, 'pending', ?)`,
    );
    const createdAt = '2026-01-01T00:00:00.000Z';

    insertOperation.run(operationId, sessionId, 'stop', createdAt);
    expect(() => insertOperation.run(operationId, sessionId, 'stop', createdAt)).toThrow(/UNIQUE/);
    expect(
      database.native
        .prepare('SELECT id, session_id, operation_kind, status FROM recording_operations')
        .get(),
    ).toEqual({
      id: operationId,
      session_id: sessionId,
      operation_kind: 'stop',
      status: 'pending',
    });
  });

  it('keys and migrates a database through the injectable Expo seam', async () => {
    const injectedDatabase = createTestDatabase();
    const secureKey = {
      secureStore: {
        getItemAsync: jest.fn(async () => 'test-key'),
        setItemAsync: jest.fn(async () => undefined),
        deleteItemAsync: jest.fn(async () => undefined),
      },
      crypto: {
        getRandomBytesAsync: jest.fn(async () => new Uint8Array(32)),
      },
    };

    const initialized = await initializeDatabase({
      secureKey,
      openDatabase: async () => injectedDatabase as SQLiteDatabaseLike,
    });

    expect(initialized).toBe(injectedDatabase);
    expect(injectedDatabase.execAsync.mock.calls[0][0]).toBe("PRAGMA key = 'test-key';");
    expect(injectedDatabase.native.prepare('PRAGMA user_version').get()).toEqual({
      user_version: 4,
    });
    expect(DATABASE_NAME).toBe('daytale.db');
  });
});
