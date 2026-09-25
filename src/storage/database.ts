import * as SQLite from 'expo-sqlite';

import { applyMigrations, type MigrationDatabase, type MigrationTransaction } from './migrations';
import { getDatabaseKey, type SecureKeyDependencies } from './secureKey';

export const DATABASE_NAME = 'daytale.db';

export type SQLiteDatabaseLike = MigrationDatabase & {
  closeAsync: () => Promise<void>;
};

export type DatabaseDependencies = {
  openDatabase?: (databaseName: string) => Promise<SQLiteDatabaseLike>;
  secureKey?: SecureKeyDependencies;
};

export class DatabaseInitializationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'DatabaseInitializationError';
  }
}

const nativeDependencies: Required<Pick<DatabaseDependencies, 'openDatabase'>> = {
  openDatabase: async (databaseName) =>
    (await SQLite.openDatabaseAsync(databaseName)) as unknown as SQLiteDatabaseLike,
};

export async function initializeDatabase(
  dependencies: DatabaseDependencies = {},
): Promise<SQLiteDatabaseLike> {
  const databaseKey = await getDatabaseKey(dependencies.secureKey);
  const openDatabase = dependencies.openDatabase ?? nativeDependencies.openDatabase;
  let database: SQLiteDatabaseLike | undefined;

  try {
    database = await openDatabase(DATABASE_NAME);
    await database.execAsync(`PRAGMA key = '${escapeSqliteString(databaseKey)}';`);
    await database.execAsync('PRAGMA foreign_keys = ON;');
    await database.getFirstAsync<{ table_count: number }>(
      "SELECT count(*) AS table_count FROM sqlite_master WHERE type = 'table';",
    );
    await applyMigrations(database);
    return database;
  } catch {
    await database?.closeAsync().catch(() => undefined);
    throw new DatabaseInitializationError('Secure database initialization failed.');
  }
}

export async function withStorageTransaction<T>(
  database: SQLiteDatabaseLike,
  task: (database: MigrationTransaction) => Promise<T>,
): Promise<T> {
  let result!: T;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    result = await task(transaction);
  });
  return result;
}

export const openEncryptedDatabase = initializeDatabase;

function escapeSqliteString(value: string): string {
  return value.replaceAll("'", "''");
}
