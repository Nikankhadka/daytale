import type { SQLiteDatabaseLike } from '../../storage/database';

export async function deleteAllAppData(_database: SQLiteDatabaseLike): Promise<void> {
  throw new Error('Secure data deletion is unavailable on web.');
}
