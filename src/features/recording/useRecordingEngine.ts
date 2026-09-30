import * as React from 'react';
import { AppState, Platform } from 'react-native';

import { useSessionStore } from '../../state/session';
import { getBootstrappedStorage } from '../../storage/bootstrap';
import { createRecordingHost, type HostRecorder, type RecordingHost } from './host';
import { RECORDING_OPTIONS } from './recorder';

/** The one engine of the app: created on first use, never on web where nothing can record. */
export const recordingHost: RecordingHost = createRecordingHost({
  getRepositories: () => getBootstrappedStorage()?.repositories,
  createRecorder: async () => {
    if (Platform.OS === 'web') {
      throw new Error('Recording is unavailable on web.');
    }
    const { AudioModule } = await import('expo-audio');
    return new AudioModule.AudioRecorder(RECORDING_OPTIONS) as unknown as HostRecorder;
  },
});

/** Catches the stored session up with the clock while the app stays open. */
export const RECONCILE_INTERVAL_MS = 60_000;

/** True only while this process really holds an open capture, never just because the store says so. */
export function useIsCapturing(host: RecordingHost = recordingHost): boolean {
  return React.useSyncExternalStore(host.subscribe, host.isCapturing);
}

/**
 * Keeps today's session, the schedule end, and interruptions honest: on launch, every minute,
 * whenever the app returns to the foreground, and when the schedule or onboarding changes.
 */
export function useRecordingReconciliation(host: RecordingHost = recordingHost): void {
  const onboardingComplete = useSessionStore((state) => state.onboardingComplete);
  const preferences = useSessionStore((state) => state.appPreferences);
  const { scheduleStartLocal, scheduleEndLocal, timezone } = preferences ?? {};

  React.useEffect(() => {
    const run = () => void host.reconcile(new Date());
    run();
    const interval = setInterval(run, RECONCILE_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        run();
      }
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [host, onboardingComplete, scheduleStartLocal, scheduleEndLocal, timezone]);
}
