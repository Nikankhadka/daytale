import { deleteAllData } from '../../storage/cleanup';
import type { SQLiteDatabaseLike } from '../../storage/database';
import { endBreak } from '../recording/breaks';
import { cancelAllReminders } from '../recording/notifications';
import { recordingHost } from '../recording/useRecordingEngine';

export async function deleteAllAppData(database: SQLiteDatabaseLike): Promise<void> {
  await deleteAllData(database, {
    // Recording must be silent before the files and the database go.
    stopActiveCapture: async () => {
      endBreak();
      await recordingHost.engine.abandon();
    },
  });
  await cancelAllReminders();
}
