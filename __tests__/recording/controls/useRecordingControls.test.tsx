import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import type { RecordingControlsNativeModule } from '../../../modules/recording-controls';
import {
  getRecordingControls,
  subscribeRecordingIntents,
} from '../../../modules/recording-controls';
import { drainRecordingIntents } from '../../../src/features/recording/controls/drain';
import { useRecordingControls } from '../../../src/features/recording/controls/useRecordingControls';
import type { RecordingHost } from '../../../src/features/recording/host';
import { useSessionStore } from '../../../src/state/session';
import type { RecordingSessionStatus } from '../../../src/storage/types';
import { makeScheduledSession, SESSION_ID } from '../testKit';

jest.mock('../../../modules/recording-controls', () => ({
  getRecordingControls: jest.fn(),
  subscribeRecordingIntents: jest.fn(),
}));

jest.mock('../../../src/features/recording/useRecordingEngine', () => ({
  recordingHost: { engine: { pause: jest.fn(), resume: jest.fn(), stop: jest.fn() } },
}));

jest.mock('../../../src/features/recording/controls/drain', () => ({
  drainRecordingIntents: jest.fn(async () => []),
}));

jest.mock('../../../src/features/recording/controls/intentStore', () => ({
  nativeRecordingIntentStore: {
    read: jest.fn(async () => []),
    remove: jest.fn(async () => undefined),
  },
}));

jest.mock('../../../src/features/recording/controls/liveActivity', () => ({
  liveActivityPort: {
    isSupported: jest.fn(async () => true),
    start: jest.fn(async () => true),
    update: jest.fn(async () => true),
    end: jest.fn(async () => undefined),
  },
}));

const mockControls = {
  consumePendingResume: jest.fn(async () => false),
  enqueueIntent: jest.fn(async (_kind: 'pause' | 'resume' | 'stop') => undefined),
  setActiveSession: jest.fn(async (_sessionId: string | null) => undefined),
  showPausedNotification: jest.fn(async (_sessionId: string) => undefined),
  hidePausedNotification: jest.fn(async () => undefined),
};

const mockUnsubscribe = jest.fn();
const mockState: { intentListener?: () => void } = {};
const mockDrain = jest.mocked(drainRecordingIntents);

let appStateListener: ((state: string) => void) | undefined;
const removeAppState = jest.fn();

function makeHost(): RecordingHost {
  return {
    engine: { pause: jest.fn(), resume: jest.fn(), stop: jest.fn() },
  } as unknown as RecordingHost;
}

function makeStore() {
  return {
    read: jest.fn(async () => [] as unknown[]),
    remove: jest.fn(async (_ids: string[]) => undefined),
  };
}

function makeActivity() {
  return {
    isSupported: jest.fn(async () => true),
    start: jest.fn(async () => true),
    update: jest.fn(async () => true),
    end: jest.fn(async () => undefined),
  };
}

function makeSession(status: RecordingSessionStatus, actualStart?: string) {
  return makeScheduledSession({ status, actualStart });
}

async function renderControls(overrides: { activity?: ReturnType<typeof makeActivity> } = {}) {
  const host = makeHost();
  const store = makeStore();
  const activity = overrides.activity ?? makeActivity();
  const view = await renderHook(() => useRecordingControls({ host, store, activity }));
  return { ...view, host, store, activity };
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.getState().resetSession();
  mockState.intentListener = undefined;
  appStateListener = undefined;

  mockControls.consumePendingResume.mockResolvedValue(false);
  mockControls.enqueueIntent.mockResolvedValue(undefined);
  mockControls.setActiveSession.mockResolvedValue(undefined);
  mockControls.showPausedNotification.mockResolvedValue(undefined);
  mockControls.hidePausedNotification.mockResolvedValue(undefined);

  jest
    .mocked(getRecordingControls)
    .mockReturnValue(mockControls as unknown as RecordingControlsNativeModule);
  jest.mocked(subscribeRecordingIntents).mockImplementation((listener) => {
    mockState.intentListener = () => listener({} as never);
    return mockUnsubscribe;
  });
  mockDrain.mockResolvedValue([]);

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
  useSessionStore.getState().resetSession();
});

describe('useRecordingControls', () => {
  it('drains on mount', async () => {
    const { host, store } = await renderControls();
    await flush();

    expect(mockDrain).toHaveBeenCalledTimes(1);
    expect(mockDrain).toHaveBeenCalledWith({
      store,
      engine: host.engine,
      isForeground: expect.any(Function),
    });
    expect(mockControls.consumePendingResume).toHaveBeenCalledTimes(1);
  });

  it('drains again when the app becomes active and ignores other app states', async () => {
    await renderControls();
    await flush();
    expect(mockDrain).toHaveBeenCalledTimes(1);

    await act(async () => appStateListener?.('background'));
    await flush();
    expect(mockDrain).toHaveBeenCalledTimes(1);

    await act(async () => appStateListener?.('active'));
    await flush();
    expect(mockDrain).toHaveBeenCalledTimes(2);
    expect(mockControls.consumePendingResume).toHaveBeenCalledTimes(2);
  });

  it('drains on a native intent event without consuming a pending resume', async () => {
    await renderControls();
    await flush();
    expect(mockDrain).toHaveBeenCalledTimes(1);
    expect(mockControls.consumePendingResume).toHaveBeenCalledTimes(1);

    await act(async () => mockState.intentListener?.());
    await flush();

    expect(mockDrain).toHaveBeenCalledTimes(2);
    expect(mockControls.consumePendingResume).toHaveBeenCalledTimes(1);
  });

  it('serializes rapid drains in trigger order', async () => {
    const order: string[] = [];
    const pending: (() => void)[] = [];
    let call = 0;

    mockDrain.mockImplementation(() => {
      call += 1;
      const id = call;
      order.push(`start:${id}`);
      return new Promise((resolve) => {
        pending.push(() => {
          order.push(`end:${id}`);
          resolve([]);
        });
      });
    });

    await renderControls();
    await flush();
    expect(order).toEqual(['start:1']);

    await act(async () => {
      appStateListener?.('active');
      mockState.intentListener?.();
    });
    await flush();
    expect(order).toEqual(['start:1']);

    await act(async () => pending.shift()?.());
    await flush();
    expect(order).toEqual(['start:1', 'end:1', 'start:2']);

    await act(async () => pending.shift()?.());
    await flush();
    expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2', 'start:3']);

    await act(async () => pending.shift()?.());
    await flush();
    expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2', 'start:3', 'end:3']);
  });

  it('enqueues a resume before draining on the foreground path so it applies', async () => {
    mockControls.consumePendingResume.mockResolvedValueOnce(true);
    const order: string[] = [];
    let foregroundDuringDrain = false;
    mockControls.enqueueIntent.mockImplementation(async () => {
      order.push('enqueue');
    });
    mockDrain.mockImplementation(async (options) => {
      order.push('drain');
      foregroundDuringDrain = options?.isForeground?.() ?? false;
      return [];
    });

    await renderControls();
    await flush();

    expect(mockControls.enqueueIntent).toHaveBeenCalledWith('resume');
    expect(mockDrain).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['enqueue', 'drain']);
    expect(foregroundDuringDrain).toBe(true);
  });

  it('tells the drain whether it is foreground so the AppState path and the drain agree', async () => {
    const foregroundFlags: boolean[] = [];
    mockDrain.mockImplementation(async (options) => {
      foregroundFlags.push(options?.isForeground?.() ?? false);
      return [];
    });

    await renderControls();
    await flush();
    expect(foregroundFlags).toEqual([true]);

    await act(async () => appStateListener?.('active'));
    await flush();
    expect(foregroundFlags).toEqual([true, true]);

    await act(async () => mockState.intentListener?.());
    await flush();
    expect(foregroundFlags).toEqual([true, true, false]);
  });

  it('tracks the active session, paused notification, and activity on status changes', async () => {
    const { activity } = await renderControls();
    await flush();

    const actualStart = '2026-03-10T09:00:30.000Z';
    await act(async () => {
      useSessionStore.getState().setRecordingSession(makeSession('recording', actualStart));
    });
    await flush();

    expect(mockControls.setActiveSession).toHaveBeenLastCalledWith(SESSION_ID);
    expect(mockControls.hidePausedNotification).toHaveBeenCalled();
    expect(activity.start).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      status: 'recording',
      startedAt: actualStart,
      scheduledEnd: '2026-03-10T17:00:00.000Z',
    });

    await act(async () => {
      useSessionStore.getState().setRecordingSession(makeSession('paused', actualStart));
    });
    await flush();

    expect(mockControls.setActiveSession).toHaveBeenLastCalledWith(SESSION_ID);
    expect(mockControls.showPausedNotification).toHaveBeenCalledWith(SESSION_ID);
    expect(activity.update).toHaveBeenCalledWith({
      status: 'paused',
      updatedAt: expect.any(String),
    });
    expect(activity.start).toHaveBeenCalledTimes(1);
  });

  it('does nothing on the activity when the Live Activity is unsupported', async () => {
    const activity = makeActivity();
    activity.isSupported.mockResolvedValue(false);
    await renderControls({ activity });
    await flush();

    await act(async () => {
      useSessionStore.getState().setRecordingSession(makeSession('recording'));
    });
    await flush();
    await act(async () => {
      useSessionStore.getState().setRecordingSession(makeSession('paused'));
    });
    await flush();
    await act(async () => {
      useSessionStore.getState().setRecordingSession(makeSession('ready'));
    });
    await flush();

    expect(activity.start).not.toHaveBeenCalled();
    expect(activity.update).not.toHaveBeenCalled();
    expect(activity.end).not.toHaveBeenCalled();
  });

  it('retries start instead of updating when the first start returns false', async () => {
    const activity = makeActivity();
    activity.start.mockResolvedValue(false);
    await renderControls({ activity });
    await flush();

    await act(async () => {
      useSessionStore.getState().setRecordingSession(makeSession('recording'));
    });
    await flush();
    expect(activity.start).toHaveBeenCalledTimes(1);
    expect(activity.update).not.toHaveBeenCalled();

    await act(async () => {
      useSessionStore.getState().setRecordingSession(makeSession('paused'));
    });
    await flush();

    expect(activity.start).toHaveBeenCalledTimes(2);
    expect(activity.update).not.toHaveBeenCalled();
  });

  it('uses createdAt when actualStart is absent', async () => {
    const { activity } = await renderControls();
    await flush();

    await act(async () => {
      useSessionStore.getState().setRecordingSession(makeSession('paused'));
    });
    await flush();

    expect(activity.start).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      status: 'paused',
      startedAt: '2026-03-10T08:00:00.000Z',
      scheduledEnd: '2026-03-10T17:00:00.000Z',
    });
  });

  it('does not restart the activity when unrelated state changes', async () => {
    const { activity } = await renderControls();
    await flush();

    const session = makeSession('recording');
    await act(async () => {
      useSessionStore.getState().setRecordingSession(session);
    });
    await flush();
    expect(activity.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      useSessionStore.getState().setRecordingSession(session);
    });
    await flush();
    await act(async () => {
      useSessionStore.getState().setActiveTab('journal');
    });
    await flush();

    expect(activity.start).toHaveBeenCalledTimes(1);
    expect(activity.update).not.toHaveBeenCalled();
  });

  it.each([
    ['transcribing', 'completed'],
    ['analyzing', 'completed'],
    ['awaiting clarification', 'completed'],
    ['generating', 'completed'],
    ['ready', 'completed'],
    ['failed', 'interrupted'],
    ['expired', 'expired'],
    ['discarded', 'discarded'],
  ] as const)('ends the activity with %s for %s', async (status, endStatus) => {
    const { activity } = await renderControls();
    await flush();

    await act(async () => {
      useSessionStore.getState().setRecordingSession(makeSession('recording'));
    });
    await flush();
    expect(activity.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      useSessionStore.getState().setRecordingSession(makeSession(status));
    });
    await flush();

    expect(activity.end).toHaveBeenCalledWith({ status: endStatus });
    expect(mockControls.setActiveSession).toHaveBeenLastCalledWith(null);
    expect(mockControls.hidePausedNotification).toHaveBeenCalled();
  });

  it('ends a started activity when the session becomes scheduled', async () => {
    const { activity } = await renderControls();
    await flush();

    await act(async () => {
      useSessionStore.getState().setRecordingSession(makeSession('recording'));
    });
    await flush();
    expect(activity.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      useSessionStore.getState().setRecordingSession(makeSession('scheduled'));
    });
    await flush();

    expect(activity.end).toHaveBeenCalledWith({ status: 'completed' });
    expect(mockControls.setActiveSession).toHaveBeenLastCalledWith(null);
  });

  it('ends a started activity when the session is cleared', async () => {
    const { activity } = await renderControls();
    await flush();

    await act(async () => {
      useSessionStore.getState().setRecordingSession(makeSession('recording'));
    });
    await flush();
    expect(activity.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      useSessionStore.getState().setRecordingSession(null);
    });
    await flush();

    expect(activity.end).toHaveBeenCalledWith({ status: 'completed' });
    expect(mockControls.setActiveSession).toHaveBeenLastCalledWith(null);
  });

  it('does not end the activity on unmount', async () => {
    const { activity, unmount } = await renderControls();
    await flush();

    await act(async () => {
      useSessionStore.getState().setRecordingSession(makeSession('recording'));
    });
    await flush();
    expect(activity.start).toHaveBeenCalledTimes(1);

    await unmount();
    await flush();

    expect(activity.end).not.toHaveBeenCalled();
  });

  it('removes its listeners on unmount', async () => {
    const { unmount } = await renderControls();
    await flush();

    await unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    expect(removeAppState).toHaveBeenCalledTimes(1);
  });

  it('swallows native errors', async () => {
    mockControls.consumePendingResume.mockRejectedValueOnce(new Error('native failure'));
    mockControls.setActiveSession.mockRejectedValue(new Error('native failure'));
    mockControls.showPausedNotification.mockRejectedValue(new Error('native failure'));
    mockControls.hidePausedNotification.mockRejectedValue(new Error('native failure'));

    const { activity } = await renderControls();
    activity.start.mockRejectedValue(new Error('native failure'));
    activity.update.mockRejectedValue(new Error('native failure'));
    activity.end.mockRejectedValue(new Error('native failure'));

    await flush();
    await act(async () => {
      useSessionStore.getState().setRecordingSession(makeSession('recording'));
    });
    await flush();
    await act(async () => {
      useSessionStore.getState().setRecordingSession(makeSession('paused'));
    });
    await flush();
    await act(async () => {
      useSessionStore.getState().setRecordingSession(makeSession('ready'));
    });
    await flush();

    expect(mockDrain).toHaveBeenCalled();
  });
});
