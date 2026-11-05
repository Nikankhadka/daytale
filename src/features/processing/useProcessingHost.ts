import * as React from 'react';
import { AppState } from 'react-native';

import { createAppCheckTokenProvider } from '../../services/appCheck';
import { createJournalApiClient } from '../../services/journalApi';
import { useSessionStore } from '../../state/session';
import { getBootstrappedStorage } from '../../storage/bootstrap';
import { createProcessingHost, type ProcessingHost } from './host';

/** The one processing host of the app, wired to the real client and persisted storage. */
export const processingHost: ProcessingHost = createProcessingHost({
  getStorage: getBootstrappedStorage,
  getClient: () =>
    createJournalApiClient({
      baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? '',
      getToken: createAppCheckTokenProvider(),
    }),
});

/** Catches persisted processing state up with the clock while the app stays open. */
export const PROCESSING_RECONCILE_INTERVAL_MS = 60_000;

/**
 * Resumes persisted processing work on launch, every minute, and whenever the app returns to the
 * foreground, and follows store changes that hand a session to the pipeline.
 */
export function useProcessingReconciliation(host: ProcessingHost = processingHost): void {
  const onboardingComplete = useSessionStore((state) => state.onboardingComplete);

  React.useEffect(() => {
    if (!onboardingComplete) {
      return;
    }
    const run = () => void host.reconcile(new Date());
    run();
    const interval = setInterval(run, PROCESSING_RECONCILE_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        run();
      }
    });
    const detach = host.attach();
    return () => {
      clearInterval(interval);
      subscription.remove();
      detach();
    };
  }, [host, onboardingComplete]);
}
