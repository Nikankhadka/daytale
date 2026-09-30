import { randomUUID } from 'expo-crypto';

import { useSessionStore } from '../../state/session';
import type { StorageRepositories } from '../../storage/repositories';
import type {
  AppPreferences,
  RecordingSession,
  RecordingSessionStatus,
  UtcTimestamp,
} from '../../storage/types';
import { createSerialQueue } from './recorder';

export type ScheduleWindow = { scheduledStart: UtcTimestamp; scheduledEnd: UtcTimestamp };

type SchedulePreferences = Pick<
  AppPreferences,
  'timezone' | 'scheduleStartLocal' | 'scheduleEndLocal'
>;

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedParts(timezone: string, utcMs: number): Parts {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const value = (type: string): number =>
    Number(formatted.find((part) => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour') % 24,
    minute: value('minute'),
    second: value('second'),
  };
}

function offsetMs(timezone: string, utcMs: number): number {
  const p = zonedParts(timezone, utcMs);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    Math.floor(utcMs / 1000) * 1000
  );
}

/** Local calendar date (YYYY-MM-DD) of an instant in an IANA timezone. */
export function localDateOf(at: Date, timezone: string): string {
  const p = zonedParts(timezone, at.getTime());
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function addDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * Converts a wall-clock time in a timezone to an instant. A time skipped by spring-forward moves
 * forward by the gap; a time repeated by fall-back resolves to its first occurrence.
 */
function zonedInstant(timezone: string, localDate: string, localTime: string): number {
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = localTime.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const candidates = [
    wall - offsetMs(timezone, wall - 86_400_000),
    wall - offsetMs(timezone, wall + 86_400_000),
  ];
  const valid = candidates.filter((instant) => instant + offsetMs(timezone, instant) === wall);
  return valid.length === 0 ? candidates[0] : Math.min(...valid);
}

/** The session window that starts on `localDate`; an end at or before the start ends the next day. */
export function windowForLocalDate(
  preferences: SchedulePreferences,
  localDate: string,
): ScheduleWindow {
  const { timezone, scheduleStartLocal, scheduleEndLocal } = preferences;
  const endDate = scheduleEndLocal > scheduleStartLocal ? localDate : addDays(localDate, 1);
  return {
    scheduledStart: new Date(zonedInstant(timezone, localDate, scheduleStartLocal)).toISOString(),
    scheduledEnd: new Date(zonedInstant(timezone, endDate, scheduleEndLocal)).toISOString(),
  };
}

/** Today's window, or yesterday's while a window that crossed midnight is still open. */
export function currentWindow(preferences: SchedulePreferences, now: Date): ScheduleWindow {
  const today = localDateOf(now, preferences.timezone);
  const yesterday = windowForLocalDate(preferences, addDays(today, -1));
  return now.getTime() < Date.parse(yesterday.scheduledEnd)
    ? yesterday
    : windowForLocalDate(preferences, today);
}

/** Sessions the user still has to settle; a new window never takes their place on screen. */
const NEEDS_USER: readonly RecordingSessionStatus[] = ['recording', 'paused', 'failed'];

/**
 * Whether `today` should replace the session on screen: an unused or earlier-window session gives
 * way, one the user still has to settle (recording, paused, failed) stays until they do.
 */
export function supersedes(today: RecordingSession, shown: RecordingSession | null): boolean {
  if (shown === null) {
    return true;
  }
  if (shown.id === today.id || NEEDS_USER.includes(shown.status)) {
    return false;
  }
  return (
    shown.status === 'scheduled' ||
    Date.parse(shown.scheduledStart) < Date.parse(today.scheduledStart)
  );
}

// ponytail: the queue only serializes callers inside this process; the app is single-process, so a
// unique index on scheduled_start is the upgrade path if another writer ever creates sessions.
const enqueue = createSerialQueue();

/** Creates the current window's `scheduled` session unless one already exists. */
export function ensureTodaySession(
  repositories: Pick<StorageRepositories, 'recordingSessions'>,
  preferences: SchedulePreferences,
  now: Date,
  createId: () => string = randomUUID,
): Promise<RecordingSession> {
  return enqueue(async () => {
    const window = currentWindow(preferences, now);
    const sessions = await repositories.recordingSessions.list();
    const existing = sessions.find((session) => session.scheduledStart === window.scheduledStart);
    if (existing !== undefined) {
      return existing;
    }
    const timestamp = now.toISOString();
    const created = await repositories.recordingSessions.save({
      id: createId(),
      ...window,
      timezone: preferences.timezone,
      status: 'scheduled',
      pauseIntervals: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    if (supersedes(created, useSessionStore.getState().recordingSession)) {
      useSessionStore.getState().setRecordingSession(created);
    }
    return created;
  });
}
