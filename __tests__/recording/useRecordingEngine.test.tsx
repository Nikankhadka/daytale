import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import type { RecordingHost } from '../../src/features/recording/host';
import {
  RECONCILE_INTERVAL_MS,
  useIsCapturing,
  useRecordingReconciliation,
} from '../../src/features/recording/useRecordingEngine';
import { createDefaultAppPreferences, mergeAppPreferences } from '../../src/features/preferences';
import { useSessionStore } from '../../src/state/session';

function fakeHost() {
  const listeners = new Set<() => void>();
  let capturing = false;
  const host: RecordingHost = {
    engine: {} as RecordingHost['engine'],
    isCapturing: () => capturing,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    reconcile: jest.fn(async () => undefined),
  };
  return {
    host,
    setCapturing: (next: boolean) => {
      capturing = next;
      listeners.forEach((listener) => listener());
    },
  };
}

describe('recording engine hooks', () => {
  let appStateListener: ((state: string) => void) | undefined;
  const removeAppState = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    useSessionStore.getState().resetSession();
    appStateListener = undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      listener: (state: string) => void,
    ) => {
      appStateListener = listener;
      return { remove: removeAppState };
    }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('follows whether the host holds an open capture', async () => {
    const { host, setCapturing } = fakeHost();
    const { result } = await renderHook(() => useIsCapturing(host));
    expect(result.current).toBe(false);

    await act(async () => setCapturing(true));
    expect(result.current).toBe(true);
  });

  it('reconciles on launch, every minute, and when the app returns to the foreground', async () => {
    const { host } = fakeHost();
    await renderHook(() => useRecordingReconciliation(host));
    expect(host.reconcile).toHaveBeenCalledTimes(1);

    await act(async () => jest.advanceTimersByTime(RECONCILE_INTERVAL_MS));
    expect(host.reconcile).toHaveBeenCalledTimes(2);

    await act(async () => appStateListener?.('background'));
    expect(host.reconcile).toHaveBeenCalledTimes(2);
    await act(async () => appStateListener?.('active'));
    expect(host.reconcile).toHaveBeenCalledTimes(3);
  });

  it('reconciles again as soon as the schedule changes', async () => {
    const { host } = fakeHost();
    const preferences = createDefaultAppPreferences('2026-03-10T00:00:00.000Z', 'UTC');
    useSessionStore.getState().setAppPreferences(preferences);
    await renderHook(() => useRecordingReconciliation(host));
    expect(host.reconcile).toHaveBeenCalledTimes(1);

    await act(async () =>
      useSessionStore
        .getState()
        .setAppPreferences(mergeAppPreferences(preferences, { scheduleStartLocal: '09:00' })),
    );
    expect(host.reconcile).toHaveBeenCalledTimes(2);
  });

  it('stops its timer and foreground listener on unmount', async () => {
    const { host } = fakeHost();
    const { unmount } = await renderHook(() => useRecordingReconciliation(host));

    await unmount();
    jest.advanceTimersByTime(RECONCILE_INTERVAL_MS * 3);

    expect(host.reconcile).toHaveBeenCalledTimes(1);
    expect(removeAppState).toHaveBeenCalledTimes(1);
  });
});
