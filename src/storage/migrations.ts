import type { SQLiteBindValue, SQLiteRunResult } from 'expo-sqlite';

import {
  CREATE_OPERATION_SCHEMA_STATEMENTS,
  CREATE_RETRY_TARGET_SCHEMA_STATEMENTS,
  CREATE_SCHEMA_STATEMENTS,
  DATABASE_SCHEMA_VERSION,
} from './schema';

export type MigrationDatabase = {
  execAsync: (source: string) => Promise<void>;
  runAsync: (source: string, ...params: SQLiteBindValue[]) => Promise<SQLiteRunResult>;
  getFirstAsync: <T>(source: string, ...params: SQLiteBindValue[]) => Promise<T | null>;
  getAllAsync: <T>(source: string, ...params: SQLiteBindValue[]) => Promise<T[]>;
  withExclusiveTransactionAsync: (
    task: (transaction: MigrationTransaction) => Promise<void>,
  ) => Promise<void>;
};

export type MigrationTransaction = Pick<
  MigrationDatabase,
  'execAsync' | 'runAsync' | 'getFirstAsync' | 'getAllAsync'
>;

export type Migration = {
  version: number;
  statements: readonly string[];
};

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: CREATE_SCHEMA_STATEMENTS,
  },
  {
    version: 2,
    statements: CREATE_OPERATION_SCHEMA_STATEMENTS,
  },
  {
    version: DATABASE_SCHEMA_VERSION,
    statements: CREATE_RETRY_TARGET_SCHEMA_STATEMENTS,
  },
];

export class DatabaseMigrationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'DatabaseMigrationError';
  }
}

type UserVersionRow = {
  user_version: number;
};

export async function applyMigrations(
  database: MigrationDatabase,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<void> {
  await database.execAsync('PRAGMA foreign_keys = ON;');

  const versionRow = await database.getFirstAsync<UserVersionRow>('PRAGMA user_version;');
  const currentVersion = versionRow?.user_version ?? 0;
  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    throw new DatabaseMigrationError('Database schema version is invalid.');
  }
  if (currentVersion > DATABASE_SCHEMA_VERSION) {
    throw new DatabaseMigrationError('Database schema version is newer than this app.');
  }

  for (const migration of migrations) {
    if (migration.version <= currentVersion) {
      continue;
    }
    await database.withExclusiveTransactionAsync(async (transaction) => {
      for (const statement of migration.statements) {
        await transaction.execAsync(`${statement};`);
      }
      await transaction.execAsync(`PRAGMA user_version = ${migration.version};`);
    });
  }
}

export const migrateDatabase = applyMigrations;
