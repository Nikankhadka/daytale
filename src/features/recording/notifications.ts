import { Platform } from 'react-native';

import type { AppPreferences } from '../../storage/types';

export const DAILY_PROMPT_NOTIFICATION_ID = 'daytale-daily-prompt';
export const BREAK_END_NOTIFICATION_ID = 'daytale-break-end';

// Reminders carry no journal content: they are visible on the lock screen.
const DAILY_PROMPT_CONTENT = { title: 'Good morning', body: 'Ready for me to remember today?' };
const BREAK_END_CONTENT = {
  title: 'Your privacy break is over',
  body: 'Resume recording when you are ready.',
};

type ReminderPreferences = Pick<
  AppPreferences,
  'scheduleStartLocal' | 'notificationsEnabled' | 'onboardingComplete'
>;

type NotificationsModule = Pick<
  typeof import('expo-notifications'),
  | 'getPermissionsAsync'
  | 'scheduleNotificationAsync'
  | 'cancelScheduledNotificationAsync'
  | 'cancelAllScheduledNotificationsAsync'
  | 'addNotificationResponseReceivedListener'
  | 'DEFAULT_ACTION_IDENTIFIER'
  | 'SchedulableTriggerInputTypes'
>;

/** Loads the native module lazily so web and tests never touch it unless a reminder is used. */
export type NotificationsLoader = () => Promise<NotificationsModule>;

const loadExpoNotifications: NotificationsLoader = () => import('expo-notifications');

async function canNotify(Notifications: NotificationsModule): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/**
 * Keeps exactly one repeating daily reminder at the saved schedule start, or none when reminders
 * are off, onboarding is unfinished, or the OS has not granted permission. Reminders are optional,
 * so a native failure never blocks the caller (for example saving preferences).
 */
export async function syncDailyPrompt(
  preferences: ReminderPreferences,
  load: NotificationsLoader = loadExpoNotifications,
): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  try {
    const Notifications = await load();
    await Notifications.cancelScheduledNotificationAsync(DAILY_PROMPT_NOTIFICATION_ID);
    if (
      !preferences.notificationsEnabled ||
      !preferences.onboardingComplete ||
      !(await canNotify(Notifications))
    ) {
      return;
    }
    const [hour, minute] = preferences.scheduleStartLocal.split(':').map(Number);
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_PROMPT_NOTIFICATION_ID,
      content: DAILY_PROMPT_CONTENT,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
  } catch {
    // Optional reminder; the next preference save reschedules it.
  }
}

/** One-off reminder at the end of a timed privacy break; replaces any earlier one. */
export async function scheduleBreakEnd(
  endsAt: Date,
  load: NotificationsLoader = loadExpoNotifications,
): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  try {
    const Notifications = await load();
    await Notifications.cancelScheduledNotificationAsync(BREAK_END_NOTIFICATION_ID);
    if (!(await canNotify(Notifications))) {
      return;
    }
    await Notifications.scheduleNotificationAsync({
      identifier: BREAK_END_NOTIFICATION_ID,
      content: BREAK_END_CONTENT,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: endsAt },
    });
  } catch {
    // Optional reminder; the break still ends when the user resumes.
  }
}

export async function cancelBreakEnd(
  load: NotificationsLoader = loadExpoNotifications,
): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  try {
    const Notifications = await load();
    await Notifications.cancelScheduledNotificationAsync(BREAK_END_NOTIFICATION_ID);
  } catch {
    // Nothing to cancel.
  }
}

/** Delete-all: Daytale schedules only its own reminders, so every scheduled one goes. */
export async function cancelAllReminders(
  load: NotificationsLoader = loadExpoNotifications,
): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  try {
    const Notifications = await load();
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Nothing to cancel.
  }
}

/**
 * Calls `onOpenToday` when the user taps one of Daytale's reminders. A cold start from a tap
 * already lands on Today (the index route), so only taps on a running app need handling.
 */
export function subscribeNotificationTaps(
  onOpenToday: () => void,
  load: NotificationsLoader = loadExpoNotifications,
): () => void {
  if (Platform.OS === 'web') {
    return () => undefined;
  }
  let active = true;
  let remove: (() => void) | undefined;
  void load()
    .then((Notifications) => {
      if (!active) {
        return;
      }
      const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        if (
          response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER &&
          [DAILY_PROMPT_NOTIFICATION_ID, BREAK_END_NOTIFICATION_ID].includes(
            response.notification.request.identifier,
          )
        ) {
          onOpenToday();
        }
      });
      remove = () => subscription.remove();
    })
    .catch(() => undefined);
  return () => {
    active = false;
    remove?.();
  };
}
