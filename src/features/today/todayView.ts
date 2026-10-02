import type { AppPreferences, RecordingSession } from '../../storage/types';
import { localDateOf } from '../recording/schedule';

/** Which Today screen the stored session, the clock, and the real capture state add up to. */
export type TodayKind =
  | 'idle'
  | 'prompt'
  | 'recording'
  | 'paused'
  | 'failed'
  | 'processing'
  | 'clarification'
  | 'journal-ready';

export type TodayInputs = {
  session: RecordingSession | null;
  now: number;
  /** The user opened the morning prompt ahead of the window. */
  previewing: boolean;
  /** This process really holds an open capture. */
  capturing: boolean;
  /** A start or resume command is running, so the stored status may lead the capture flag. */
  busy: boolean;
};

/** Only a session that is still waiting for its window can be opened early. */
export function canPreview(session: RecordingSession | null, now: number): boolean {
  return session?.status === 'scheduled' && now < Date.parse(session.scheduledStart);
}

export function todayKind({ session, now, previewing, capturing, busy }: TodayInputs): TodayKind {
  switch (session?.status) {
    case 'scheduled': {
      const inWindow =
        now >= Date.parse(session.scheduledStart) && now < Date.parse(session.scheduledEnd);
      return inWindow || (previewing && canPreview(session, now)) ? 'prompt' : 'idle';
    }
    case 'recording':
      // Stored as recording with nothing capturing is an interruption, never a running timer.
      return capturing || busy ? 'recording' : 'paused';
    case 'paused':
      return 'paused';
    case 'failed':
      return 'failed';
    case 'transcribing':
    case 'analyzing':
    case 'generating':
      return 'processing';
    case 'awaiting clarification':
      return 'clarification';
    case 'ready':
      return 'journal-ready';
    default:
      return 'idle';
  }
}

/** Time spent recording: pauses are taken out, and an open pause counts up to `nowMs`. */
export function elapsedMs(session: RecordingSession, nowMs: number): number {
  if (session.actualStart === undefined) {
    return 0;
  }
  const end = session.actualEnd === undefined ? nowMs : Date.parse(session.actualEnd);
  const paused = session.pauseIntervals.reduce((total, interval) => {
    const from = Date.parse(interval.startedAt);
    const to = interval.endedAt === undefined ? nowMs : Date.parse(interval.endedAt);
    return total + Math.max(0, Math.min(to, end) - from);
  }, 0);
  return Math.max(0, end - Date.parse(session.actualStart) - paused);
}

/** HH:MM:SS. A session stored as recording without a capture stays at its last saved moment. */
export function formatElapsed(session: RecordingSession, now: number, running: boolean): string {
  const reference = running || session.status !== 'recording' ? now : Date.parse(session.updatedAt);
  const seconds = Math.floor(elapsedMs(session, reference) / 1000);
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(Math.floor(seconds / 3600))}:${two(Math.floor((seconds % 3600) / 60))}:${two(seconds % 60)}`;
}

/** "07:00" -> "7:00 AM". */
export function formatClock(local: string): string {
  const [hour, minute] = local.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** A UTC/epoch instant as "7:00 AM" in the user's timezone. */
export function formatClockAt(at: number, timezone: string): string {
  return formatClock(clockIn(timezone, at));
}

/** "Mon, 14 Apr" for the day the user is living in. */
export function formatEyebrowDate(now: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(new Date(now));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('weekday')}, ${part('day')} ${part('month')}`;
}

function clockIn(timezone: string, at: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(at));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '00';
  return `${part('hour')}:${part('minute')}`;
}

/** "today at 3:10 PM" or "tomorrow at 3:10 PM" (a retry window is never longer than a day). */
export function describeDeadline(retryUntil: string, now: number, timezone: string): string {
  const deadline = Date.parse(retryUntil);
  const today = localDateOf(new Date(now), timezone);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  const day = localDateOf(new Date(deadline), timezone);
  const at = formatClock(clockIn(timezone, deadline));
  if (day === today) {
    return `today at ${at}`;
  }
  return day === tomorrow
    ? `tomorrow at ${at}`
    : `${formatEyebrowDate(deadline, timezone)} at ${at}`;
}

const INTERRUPTION_REASONS: Record<string, string> = {
  call: 'Paused after a call.',
  'route-loss': 'Paused because the audio source was lost.',
  'low-storage': 'Paused because this device is low on storage.',
  'os-interruption': 'Paused because something interrupted the microphone.',
  'crash-recovered': 'Daytale closed unexpectedly, so I paused for you.',
  'capture-failed': 'Paused because the recording could not be saved.',
};

/**
 * One content-free line for why a session paused by itself, or nothing for a user's own break.
 * A session still stored as `recording` that reaches this view lost its capture before it could
 * be marked paused, so it reads as an interruption too.
 */
export function interruptionReason(session: RecordingSession): string | undefined {
  const code = session.failureCode ?? (session.status === 'recording' ? 'os-interruption' : '');
  return INTERRUPTION_REASONS[code];
}

export function scheduleWindowLabel(preferences: AppPreferences | null): string {
  return preferences === null
    ? 'your daily window'
    : `${formatClock(preferences.scheduleStartLocal)} – ${formatClock(preferences.scheduleEndLocal)}`;
}
