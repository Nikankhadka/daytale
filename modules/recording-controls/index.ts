import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

export type NativeRecordingIntent = {
  version: number;
  id: string;
  kind: string;
  sessionId: string;
  createdAt: string;
  source: string;
};

export type RecordingControlsNativeModule = {
  isLiveActivitySupported: () => boolean;
  setActiveSession: (sessionId: string | null) => Promise<void>;
  startLiveActivity: (input: {
    sessionId: string;
    status: string;
    startedAt: string;
    scheduledEnd: string;
  }) => Promise<boolean>;
  updateLiveActivity: (input: { status: string; updatedAt: string }) => Promise<boolean>;
  endLiveActivity: (input: { status: string }) => Promise<void>;
  readPendingIntents: () => Promise<NativeRecordingIntent[]>;
  removePendingIntents: (ids: string[]) => Promise<void>;
  showPausedNotification: (sessionId: string) => Promise<void>;
  hidePausedNotification: () => Promise<void>;
  consumePendingResume: () => Promise<boolean>;
  enqueueIntent: (kind: 'pause' | 'resume' | 'stop') => Promise<void>;
  addListener: (
    event: 'onRecordingIntent',
    listener: (intent: NativeRecordingIntent) => void,
  ) => { remove: () => void };
};

// Resolved on first use so web and unit tests never need the native module.
let cached: RecordingControlsNativeModule | null | undefined;

/** The native controls module, or null on web and when the native module is unavailable. */
export function getRecordingControls(): RecordingControlsNativeModule | null {
  if (Platform.OS === 'web') {
    return null;
  }
  if (cached !== undefined) {
    return cached;
  }
  try {
    cached = requireNativeModule<RecordingControlsNativeModule>('DaytaleRecordingControls');
  } catch {
    cached = null;
  }
  return cached;
}

/** Listens for native recording intents; returns a no-op unsubscribe when native is absent. */
export function subscribeRecordingIntents(
  listener: (intent: NativeRecordingIntent) => void,
): () => void {
  const controls = getRecordingControls();
  if (controls === null) {
    return () => {};
  }
  const subscription = controls.addListener('onRecordingIntent', listener);
  return () => subscription.remove();
}
