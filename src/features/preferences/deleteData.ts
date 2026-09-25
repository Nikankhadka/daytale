import type { SQLiteDatabaseLike } from '../../storage/database';

export async function deleteAllAppData(database: SQLiteDatabaseLike): Promise<void> {
  const { deleteAllData } = await import('../../storage/cleanup');
  await deleteAllData(database);
}
