import {
  getRecordingControls,
  type RecordingControlsNativeModule,
} from '../../../../modules/recording-controls';

export type RecordingIntentStore = {
  read: () => Promise<unknown[]>;
  remove: (ids: string[]) => Promise<void>;
};

/**
 * A best-effort port over the native intent queue. The store never parses records; the drain owns
 * validation. Native failures resolve to an empty read or a no-op remove.
 */
export function createNativeRecordingIntentStore(
  load: () => Promise<RecordingControlsNativeModule | null> = async () => getRecordingControls(),
): RecordingIntentStore {
  return {
    read: async () => {
      try {
        const controls = await load();
        if (controls === null) {
          return [];
        }
        return await controls.readPendingIntents();
      } catch {
        return [];
      }
    },
    remove: async (ids) => {
      if (ids.length === 0) {
        return;
      }
      try {
        const controls = await load();
        if (controls === null) {
          return;
        }
        await controls.removePendingIntents(ids);
      } catch {
        // Removal is best-effort; a native failure must not escape the drain.
      }
    },
  };
}

export const nativeRecordingIntentStore = createNativeRecordingIntentStore();
