import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import {
  PROCESSING_RECONCILE_INTERVAL_MS,
  useProcessingReconciliation,
  type ProcessingHost,
} from '../../src/features/processing';
import { useSessionStore } from '../../src/state/session';

function fakeHost() {
  const detach = jest.fn();
  const host: ProcessingHost = {
    kick: jest.fn(async () => undefined),
    reconcile: jest.fn(async () => undefined),
    attach: jest.fn(() => detach),
  };
  return { host, detach };
}

describe('processing host hooks', () => {
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

  it('does nothing until onboarding is complete', async () => {
    const { host } = fakeHost();

    await renderHook(() => useProcessingReconciliation(host));

    expect(host.reconcile).not.toHaveBeenCalled();
    expect(host.attach).not.toHaveBeenCalled();
  });

  it('reconciles on mount, every minute, and on foreground, and attaches', async () => {
    useSessionStore.getState().completeOnboarding();
    const { host } = fakeHost();

    await renderHook(() => useProcessingReconciliation(host));

    expect(host.reconcile).toHaveBeenCalledTimes(1);
    expect(host.attach).toHaveBeenCalledTimes(1);

    await act(async () => jest.advanceTimersByTime(PROCESSING_RECONCILE_INTERVAL_MS));
    expect(host.reconcile).toHaveBeenCalledTimes(2);

    await act(async () => appStateListener?.('background'));
    expect(host.reconcile).toHaveBeenCalledTimes(2);
    await act(async () => appStateListener?.('active'));
    expect(host.reconcile).toHaveBeenCalledTimes(3);
  });

  it('detaches and stops its timer and listener on unmount', async () => {
    useSessionStore.getState().completeOnboarding();
    const { host, detach } = fakeHost();
    const { unmount } = await renderHook(() => useProcessingReconciliation(host));

    await unmount();
    jest.advanceTimersByTime(PROCESSING_RECONCILE_INTERVAL_MS * 3);

    expect(host.reconcile).toHaveBeenCalledTimes(1);
    expect(detach).toHaveBeenCalledTimes(1);
    expect(removeAppState).toHaveBeenCalledTimes(1);
  });
});
