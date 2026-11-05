import { Platform } from 'react-native';

import {
  getRecordingControls,
  type RecordingControlsNativeModule,
} from '../../../../modules/recording-controls';

export type LiveActivityStatus = 'recording' | 'paused';
export type LiveActivityEndStatus = 'completed' | 'interrupted' | 'expired' | 'discarded';

export type LiveActivityPort = {
  isSupported: () => Promise<boolean>;
  start: (input: {
    sessionId: string;
    status: LiveActivityStatus;
    startedAt: string;
    scheduledEnd: string;
  }) => Promise<boolean>;
  update: (input: { status: LiveActivityStatus; updatedAt: string }) => Promise<boolean>;
  end: (input: { status: LiveActivityEndStatus }) => Promise<void>;
};

/**
 * A best-effort port over the native Live Activity surface. Every method is a no-op or `false`
 * outside iOS, and every native failure is swallowed so the app never has to care.
 */
export function createLiveActivityPort(
  load: () => Promise<RecordingControlsNativeModule | null> = async () => getRecordingControls(),
): LiveActivityPort {
  const isIos = () => Platform.OS === 'ios';

  return {
    isSupported: async () => {
      if (!isIos()) {
        return false;
      }
      try {
        const controls = await load();
        return controls?.isLiveActivitySupported() ?? false;
      } catch {
        return false;
      }
    },

    start: async (input) => {
      if (!isIos()) {
        return false;
      }
      try {
        const controls = await load();
        if (controls === null) {
          return false;
        }
        return await controls.startLiveActivity(input);
      } catch {
        return false;
      }
    },

    update: async (input) => {
      if (!isIos()) {
        return false;
      }
      try {
        const controls = await load();
        if (controls === null) {
          return false;
        }
        return await controls.updateLiveActivity(input);
      } catch {
        return false;
      }
    },

    end: async (input) => {
      if (!isIos()) {
        return;
      }
      try {
        const controls = await load();
        if (controls === null) {
          return;
        }
        await controls.endLiveActivity(input);
      } catch {
        // Ending is best-effort; a native failure must not escape the caller.
      }
    },
  };
}

export const liveActivityPort = createLiveActivityPort();
