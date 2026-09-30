import { cleanup, render } from '@testing-library/react-native';

import TabsLayout from '../../app/(tabs)/_layout';
import { deleteAllAppData } from '../../src/features/preferences/deleteData';
import { persistAppPreferences } from '../../src/features/preferences';
import { cancelBreakEnd } from '../../src/features/recording/notifications';
import {
  cancelAllReminders,
  subscribeNotificationTaps,
  syncDailyPrompt,
} from '../../src/features/recording/notifications';
import {
  recordingHost,
  useRecordingReconciliation,
} from '../../src/features/recording/useRecordingEngine';
import { useSessionStore } from '../../src/state/session';
import { deleteAllData } from '../../src/storage/cleanup';
import type { AppPreferences } from '../../src/storage/types';

const mockRouter = { navigate: jest.fn() };
const mockRedirect = jest.fn();

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
  Tabs: Object.assign(() => null, { Screen: () => null }),
  useRouter: () => mockRouter,
}));
jest.mock('../../src/storage/bootstrap', () => ({
  bootstrapStorage: jest.fn(),
  getBootstrappedStorage: jest.fn(),
}));
jest.mock('../../src/storage/cleanup', () => ({ deleteAllData: jest.fn() }));
jest.mock('../../src/features/recording/notifications', () => ({
  syncDailyPrompt: jest.fn(),
  cancelAllReminders: jest.fn(),
  cancelBreakEnd: jest.fn(),
  scheduleBreakEnd: jest.fn(),
  subscribeNotificationTaps: jest.fn(),
}));
jest.mock('../../src/features/recording/useRecordingEngine', () => ({
  useRecordingReconciliation: jest.fn(),
  recordingHost: { engine: { abandon: jest.fn() } },
}));

describe('daily reminder follows saved preferences', () => {
  const repository = {
    getById: jest.fn(async () => null),
    save: jest.fn(async (preferences: AppPreferences) => preferences),
  };
  const dependencies = {
    repository,
    now: () => '2026-03-10T08:00:00.000Z',
    timezone: 'UTC',
  };

  afterEach(() => useSessionStore.getState().resetSession());

  it('syncs the reminder with what was saved when onboarding completes', async () => {
    let storedWhenSynced: AppPreferences | null = null;
    jest.mocked(syncDailyPrompt).mockImplementation(async () => {
      storedWhenSynced = useSessionStore.getState().appPreferences;
    });

    const saved = await persistAppPreferences(
      { onboardingComplete: true, notificationsEnabled: true },
      dependencies,
    );

    expect(syncDailyPrompt).toHaveBeenCalledWith(saved);
    expect(saved).toMatchObject({
      onboardingComplete: true,
      notificationsEnabled: true,
      scheduleStartLocal: '07:00',
    });
    expect(storedWhenSynced).toEqual(saved);
  });

  it('syncs again when the schedule changes', async () => {
    await persistAppPreferences({ scheduleStartLocal: '08:30' }, dependencies);

    expect(syncDailyPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleStartLocal: '08:30' }),
    );
  });
});

describe('delete all data', () => {
  const database = {} as never;

  it('silences the recorder and the break first, then clears reminders once the data is gone', async () => {
    const order: string[] = [];
    jest.mocked(recordingHost.engine.abandon).mockImplementation(async () => {
      order.push('abandon');
    });
    jest.mocked(deleteAllData).mockImplementation(async (_database, dependencies) => {
      await dependencies?.stopActiveCapture?.();
      order.push('delete');
    });
    jest.mocked(cancelAllReminders).mockImplementation(async () => {
      order.push('reminders');
    });

    await deleteAllAppData(database);

    expect(deleteAllData).toHaveBeenCalledWith(database, {
      stopActiveCapture: expect.any(Function),
    });
    expect(cancelBreakEnd).toHaveBeenCalled();
    expect(order).toEqual(['abandon', 'delete', 'reminders']);
  });

  it('keeps the reminders when the data could not be deleted', async () => {
    jest.mocked(deleteAllData).mockRejectedValue(new Error('locked'));

    await expect(deleteAllAppData(database)).rejects.toThrow('locked');

    expect(cancelAllReminders).not.toHaveBeenCalled();
  });
});

describe('tabs layout', () => {
  const unsubscribe = jest.fn();

  beforeEach(() => {
    jest.mocked(subscribeNotificationTaps).mockReturnValue(unsubscribe);
  });

  afterEach(async () => {
    await cleanup();
    useSessionStore.getState().resetSession();
  });

  it('keeps the recording reconciled and sends a reminder tap to the Today tab', async () => {
    useSessionStore.setState({ onboardingComplete: true });
    await render(<TabsLayout />);

    expect(useRecordingReconciliation).toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(subscribeNotificationTaps).toHaveBeenCalledTimes(1);

    jest.mocked(subscribeNotificationTaps).mock.calls[0][0]();
    expect(mockRouter.navigate).toHaveBeenCalledWith('/(tabs)/today');
  });

  it('stops listening for reminder taps when the layout unmounts', async () => {
    useSessionStore.setState({ onboardingComplete: true });
    const screen = await render(<TabsLayout />);

    await screen.unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('still redirects to onboarding before it is complete', async () => {
    await render(<TabsLayout />);

    expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
  });
});
