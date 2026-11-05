import * as React from 'react';
import { AppState } from 'react-native';

import {
  getRecordingControls,
  subscribeRecordingIntents,
} from '../../../../modules/recording-controls';
import { useSessionStore } from '../../../state/session';
import type { RecordingSession, RecordingSessionStatus } from '../../../storage/types';
import type { RecordingHost } from '../host';
import { recordingHost } from '../useRecordingEngine';
import { drainRecordingIntents } from './drain';
import { nativeRecordingIntentStore, type RecordingIntentStore } from './intentStore';
import {
  liveActivityPort,
  type LiveActivityEndStatus,
  type LiveActivityPort,
  type LiveActivityStatus,
} from './liveActivity';

type UseRecordingControlsOptions = {
  host?: RecordingHost;
  store?: RecordingIntentStore;
  activity?: LiveActivityPort;
};

/** Runs a native call and swallows every failure. Nothing is logged. */
async function quietly(task: () => unknown): Promise<void> {
  try {
    await task();
  } catch {
    // Native surfaces are best-effort; the persisted session stays the source of truth.
  }
}

function endStatusFor(status: RecordingSessionStatus): LiveActivityEndStatus {
  if (status === 'failed') {
    return 'interrupted';
  }
  if (status === 'expired') {
    return 'expired';
  }
  if (status === 'discarded') {
    return 'discarded';
  }
  return 'completed';
}

/**
 * Drains native recording intents and keeps the native surfaces (active session, paused
 * notification, Live Activity) in step with the persisted session. All work runs through one
 * local serial queue so a drain and the surface sync it triggers never interleave.
 */
export function useRecordingControls(options: UseRecordingControlsOptions = {}): void {
  const host = options.host ?? recordingHost;
  const store = options.store ?? nativeRecordingIntentStore;
  const activity = options.activity ?? liveActivityPort;

  const hostRef = React.useRef(host);
  const storeRef = React.useRef(store);
  const activityRef = React.useRef(activity);

  React.useEffect(() => {
    hostRef.current = host;
    storeRef.current = store;
    activityRef.current = activity;
  }, [host, store, activity]);

  const queue = React.useRef<Promise<void>>(Promise.resolve());
  const enqueue = React.useCallback((task: () => Promise<void>) => {
    const next = queue.current.then(task, task);
    queue.current = next.then(
      () => undefined,
      () => undefined,
    );
  }, []);

  const activitySessionRef = React.useRef<string | null>(null);
  const lastActivityRef = React.useRef<{
    sessionId: string | null;
    status: RecordingSessionStatus | null;
  } | null>(null);

  const syncActivity = React.useCallback(async (session: RecordingSession | null) => {
    const port = activityRef.current;

    // Gate before any start/update/end so a disabled Live Activity never relies on a swallowed
    // native throw. Nothing is recorded as synced while unsupported, so a later status change
    // retries once the surface becomes available.
    let supported = false;
    try {
      supported = await port.isSupported();
    } catch {
      supported = false;
    }
    if (!supported) {
      return;
    }

    const nextKey = { sessionId: session?.id ?? null, status: session?.status ?? null };
    const lastKey = lastActivityRef.current;
    if (
      lastKey !== null &&
      lastKey.sessionId === nextKey.sessionId &&
      lastKey.status === nextKey.status
    ) {
      return;
    }
    lastActivityRef.current = nextKey;

    if (session === null || session.status === 'scheduled') {
      if (activitySessionRef.current !== null) {
        activitySessionRef.current = null;
        await quietly(() => port.end({ status: 'completed' }));
      }
      return;
    }

    if (session.status === 'recording' || session.status === 'paused') {
      const status: LiveActivityStatus = session.status;
      if (activitySessionRef.current === session.id) {
        await quietly(() => port.update({ status, updatedAt: new Date().toISOString() }));
      } else {
        // Only mark the session as started once the native activity really exists. A false or
        // throwing start leaves the ref unset so the next status change tries start again.
        let started = false;
        try {
          started = await port.start({
            sessionId: session.id,
            status,
            startedAt: session.actualStart ?? session.createdAt,
            scheduledEnd: session.scheduledEnd,
          });
        } catch {
          started = false;
        }
        if (started) {
          activitySessionRef.current = session.id;
        }
      }
      return;
    }

    if (activitySessionRef.current !== null) {
      activitySessionRef.current = null;
      await quietly(() => port.end({ status: endStatusFor(session.status) }));
    }
  }, []);

  const syncSession = React.useCallback(
    async (session: RecordingSession | null) => {
      const status = session?.status ?? null;
      const active = status === 'recording' || status === 'paused';

      await quietly(() =>
        getRecordingControls()?.setActiveSession(active && session !== null ? session.id : null),
      );

      if (status === 'paused' && session !== null) {
        await quietly(() => getRecordingControls()?.showPausedNotification(session.id));
      } else {
        await quietly(() => getRecordingControls()?.hidePausedNotification());
      }

      await syncActivity(session);
    },
    [syncActivity],
  );

  const drain = React.useCallback(async (foreground: boolean) => {
    if (foreground) {
      await quietly(async () => {
        const controls = getRecordingControls();
        if (controls === null) {
          return;
        }
        const pendingResume = await controls.consumePendingResume();
        if (pendingResume) {
          await controls.enqueueIntent('resume');
        }
      });
    }

    await quietly(() =>
      drainRecordingIntents({
        store: storeRef.current,
        engine: hostRef.current.engine,
        isForeground: () => foreground,
      }),
    );
  }, []);

  React.useEffect(() => {
    enqueue(() => drain(true));

    const appStateSubscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        enqueue(() => drain(true));
      }
    });

    const unsubscribe = subscribeRecordingIntents(() => {
      enqueue(() => drain(false));
    });

    return () => {
      appStateSubscription.remove();
      unsubscribe();
    };
  }, [drain, enqueue]);

  React.useEffect(() => {
    const syncLatest = () => syncSession(useSessionStore.getState().recordingSession);
    enqueue(syncLatest);

    const unsubscribe = useSessionStore.subscribe((state, previous) => {
      const next = state.recordingSession;
      const before = previous.recordingSession;
      const nextId = next?.id ?? null;
      const beforeId = before?.id ?? null;
      const nextStatus = next?.status ?? null;
      const beforeStatus = before?.status ?? null;
      if (nextId === beforeId && nextStatus === beforeStatus) {
        return;
      }
      enqueue(syncLatest);
    });

    return unsubscribe;
  }, [enqueue, syncSession]);
}
