import { Platform } from 'react-native';

import {
  BREAK_END_NOTIFICATION_ID,
  cancelAllReminders,
  cancelBreakEnd,
  DAILY_PROMPT_NOTIFICATION_ID,
  scheduleBreakEnd,
  subscribeNotificationTaps,
  syncDailyPrompt,
} from '../../src/features/recording/notifications';

const mockNotifications = {
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
};

const load = async () => mockNotifications as never;

const enabled = {
  scheduleStartLocal: '07:30',
  notificationsEnabled: true,
  onboardingComplete: true,
};

describe('daily prompt notification', () => {
  beforeEach(() => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: true });
    mockNotifications.scheduleNotificationAsync.mockResolvedValue('id');
    mockNotifications.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
    mockNotifications.cancelAllScheduledNotificationsAsync.mockResolvedValue(undefined);
  });

  it('schedules one repeating daily notification at the schedule start with no journal content', async () => {
    await syncDailyPrompt(enabled, load);

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: DAILY_PROMPT_NOTIFICATION_ID,
      content: { title: 'Good morning', body: 'Ready for me to remember today?' },
      trigger: { type: 'daily', hour: 7, minute: 30 },
    });
  });

  it('replaces the previous reminder when the schedule changes', async () => {
    await syncDailyPrompt(enabled, load);
    await syncDailyPrompt({ ...enabled, scheduleStartLocal: '06:05' }, load);

    const order = [
      ...mockNotifications.cancelScheduledNotificationAsync.mock.invocationCallOrder,
      ...mockNotifications.scheduleNotificationAsync.mock.invocationCallOrder,
    ];
    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenLastCalledWith(
      DAILY_PROMPT_NOTIFICATION_ID,
    );
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({
        identifier: DAILY_PROMPT_NOTIFICATION_ID,
        trigger: { type: 'daily', hour: 6, minute: 5 },
      }),
    );
    expect(order).toHaveLength(4);
    expect(
      mockNotifications.cancelScheduledNotificationAsync.mock.invocationCallOrder[1],
    ).toBeLessThan(mockNotifications.scheduleNotificationAsync.mock.invocationCallOrder[1]);
  });

  it('removes the reminder when notifications are off or onboarding is unfinished', async () => {
    await syncDailyPrompt({ ...enabled, notificationsEnabled: false }, load);
    await syncDailyPrompt({ ...enabled, onboardingComplete: false }, load);

    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('skips scheduling without permission', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false });

    await syncDailyPrompt(enabled, load);

    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('never throws when the notification module fails', async () => {
    mockNotifications.scheduleNotificationAsync.mockRejectedValue(new Error('native failure'));

    await expect(syncDailyPrompt(enabled, load)).resolves.toBeUndefined();
  });

  it('does nothing on web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');

    await syncDailyPrompt(enabled, load);
    await scheduleBreakEnd(new Date(), load);
    await cancelAllReminders(load);

    expect(mockNotifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mockNotifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('cancels every scheduled reminder for delete-all', async () => {
    await cancelAllReminders(load);

    expect(mockNotifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
  });
});

describe('privacy break end notification', () => {
  beforeEach(() => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: true });
    mockNotifications.scheduleNotificationAsync.mockResolvedValue('id');
    mockNotifications.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
  });

  it('schedules a one-off content-free reminder at the break end', async () => {
    const endsAt = new Date('2026-03-10T10:15:00.000Z');

    await scheduleBreakEnd(endsAt, load);

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: BREAK_END_NOTIFICATION_ID,
      content: {
        title: 'Your privacy break is over',
        body: 'Resume recording when you are ready.',
      },
      trigger: { type: 'date', date: endsAt },
    });
  });

  it('skips the reminder without permission and can cancel it', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false });

    await scheduleBreakEnd(new Date(), load);
    await cancelBreakEnd(load);

    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      BREAK_END_NOTIFICATION_ID,
    );
  });
});

describe('notification taps', () => {
  const remove = jest.fn();
  let listener: (response: unknown) => void = () => undefined;

  beforeEach(() => {
    mockNotifications.addNotificationResponseReceivedListener.mockImplementation((next) => {
      listener = next;
      return { remove };
    });
  });

  const tap = (
    identifier: string,
    actionIdentifier = mockNotifications.DEFAULT_ACTION_IDENTIFIER,
  ) => listener({ actionIdentifier, notification: { request: { identifier } } });

  it('opens Today when the user taps a Daytale reminder', async () => {
    const onOpenToday = jest.fn();
    const unsubscribe = subscribeNotificationTaps(onOpenToday, load);
    await new Promise<void>((resolve) => setImmediate(resolve));

    tap(DAILY_PROMPT_NOTIFICATION_ID);
    tap(BREAK_END_NOTIFICATION_ID);
    tap('someone-elses-notification');
    tap(DAILY_PROMPT_NOTIFICATION_ID, 'dismissed');

    expect(onOpenToday).toHaveBeenCalledTimes(2);
    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('removes the listener when unsubscribed before the module loads', async () => {
    subscribeNotificationTaps(jest.fn(), load)();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockNotifications.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
  });
});
