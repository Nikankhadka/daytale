import * as React from 'react';
import { AppState } from 'react-native';

import { cancelBreakEnd, scheduleBreakEnd } from './notifications';

export type BreakChoice = '15m' | '1h' | 'manual';

export const BREAK_LABELS: Record<BreakChoice, string> = {
  '15m': '15 minutes',
  '1h': '1 hour',
  manual: 'Until I resume',
};

const TIMED_BREAK_MS = { '15m': 15 * 60_000, '1h': 60 * 60_000 } as const;

/** A timer that fires this long after its deadline means the app was suspended, not that it ended. */
const LATE_FIRE_MS = 5_000;

// The choice lives in memory only: the stored session just says `paused`, so a restart falls back
// to an open-ended break and the user resumes by hand.
let active: { choice: BreakChoice; timer?: ReturnType<typeof setTimeout> } | null = null;
const listeners = new Set<() => void>();

const publish = (next: typeof active) => {
  active = next;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/**
 * Starts the break the user picked after the session was paused. A timed break resumes by itself
 * only if the app is in the foreground when it ends and the timer fires on time; otherwise the
 * break-end notification tells the user and they resume from the paused view.
 *
 * ponytail: no background auto-resume. JS timers are suspended with the app, and starting the
 * microphone from a notification is not something the OS allows without the user. The upgrade path
 * is a native background task (or a notification action that opens the app into resume) once the
 * platform constraints are verified on device.
 */
export function startBreak(choice: BreakChoice, resume: () => void): void {
  clearTimeout(active?.timer);
  if (choice === 'manual') {
    publish({ choice });
    void cancelBreakEnd();
    return;
  }
  const endsAt = Date.now() + TIMED_BREAK_MS[choice];
  const timer = setTimeout(() => {
    if (AppState.currentState === 'active' && Date.now() - endsAt <= LATE_FIRE_MS) {
      endBreak();
      resume();
    }
  }, TIMED_BREAK_MS[choice]);
  publish({ choice, timer });
  void scheduleBreakEnd(new Date(endsAt));
}

/** The break is over (resumed, stopped, or the session moved on): no timer, no notification. */
export function endBreak(): void {
  clearTimeout(active?.timer);
  if (active !== null) {
    publish(null);
  }
  void cancelBreakEnd();
}

export function useBreakChoice(): BreakChoice | null {
  return React.useSyncExternalStore(subscribe, () => active?.choice ?? null);
}
