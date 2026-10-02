import {
  canPreview,
  describeDeadline,
  elapsedMs,
  formatClock,
  formatElapsed,
  formatEyebrowDate,
  interruptionReason,
  todayKind,
  type TodayInputs,
} from '../../src/features/today/todayView';
import type { RecordingSession } from '../../src/storage/types';
import { makeScheduledSession } from '../recording/testKit';

const START = Date.parse('2026-03-10T09:00:00.000Z');
const END = Date.parse('2026-03-10T17:00:00.000Z');

function inputs(
  overrides: Partial<TodayInputs> & { session: RecordingSession | null },
): TodayInputs {
  return { now: START + 60_000, previewing: false, capturing: false, busy: false, ...overrides };
}

const recording = makeScheduledSession({
  status: 'recording',
  actualStart: '2026-03-10T09:00:00.000Z',
  updatedAt: '2026-03-10T09:30:00.000Z',
});

describe('today view', () => {
  describe('todayKind', () => {
    it('rests when there is no session or it is finished with', () => {
      expect(todayKind(inputs({ session: null }))).toBe('idle');
      expect(todayKind(inputs({ session: makeScheduledSession({ status: 'discarded' }) }))).toBe(
        'idle',
      );
      expect(todayKind(inputs({ session: makeScheduledSession({ status: 'expired' }) }))).toBe(
        'idle',
      );
    });

    it('rests before the window and after it has closed', () => {
      const session = makeScheduledSession();
      expect(todayKind(inputs({ session, now: START - 1 }))).toBe('idle');
      expect(todayKind(inputs({ session, now: END }))).toBe('idle');
    });

    it('asks the morning question inside the window', () => {
      const session = makeScheduledSession();
      expect(todayKind(inputs({ session, now: START }))).toBe('prompt');
      expect(todayKind(inputs({ session, now: END - 1 }))).toBe('prompt');
    });

    it('opens the morning prompt early only when the user previews a waiting session', () => {
      const session = makeScheduledSession();
      expect(todayKind(inputs({ session, now: START - 1, previewing: true }))).toBe('prompt');
      expect(todayKind(inputs({ session, now: END, previewing: true }))).toBe('idle');
      expect(
        todayKind(
          inputs({ session: makeScheduledSession({ status: 'discarded' }), previewing: true }),
        ),
      ).toBe('idle');
    });

    it('offers the preview only for a session still waiting for its window', () => {
      expect(canPreview(makeScheduledSession(), START - 1)).toBe(true);
      expect(canPreview(makeScheduledSession(), START)).toBe(false);
      expect(canPreview(recording, START - 1)).toBe(false);
      expect(canPreview(null, START - 1)).toBe(false);
    });

    it('shows a running recording only while a capture is really open', () => {
      expect(todayKind(inputs({ session: recording, capturing: true }))).toBe('recording');
      expect(todayKind(inputs({ session: recording, busy: true }))).toBe('recording');
      expect(todayKind(inputs({ session: recording }))).toBe('paused');
    });

    it('maps paused, failed, and every processing status', () => {
      expect(todayKind(inputs({ session: makeScheduledSession({ status: 'paused' }) }))).toBe(
        'paused',
      );
      expect(todayKind(inputs({ session: makeScheduledSession({ status: 'failed' }) }))).toBe(
        'failed',
      );
      for (const status of ['transcribing', 'analyzing', 'generating'] as const) {
        expect(todayKind(inputs({ session: makeScheduledSession({ status }) }))).toBe('processing');
      }
      expect(
        todayKind(inputs({ session: makeScheduledSession({ status: 'awaiting clarification' }) })),
      ).toBe('clarification');
      expect(todayKind(inputs({ session: makeScheduledSession({ status: 'ready' }) }))).toBe(
        'journal-ready',
      );
    });
  });

  describe('elapsed time', () => {
    it('counts from the actual start minus finished pauses', () => {
      const session = makeScheduledSession({
        status: 'recording',
        actualStart: '2026-03-10T09:00:00.000Z',
        pauseIntervals: [
          { startedAt: '2026-03-10T09:10:00.000Z', endedAt: '2026-03-10T09:25:00.000Z' },
        ],
      });

      expect(elapsedMs(session, START + 60 * 60_000)).toBe(45 * 60_000);
      expect(formatElapsed(session, START + 3_725_000, true)).toBe('00:47:05');
    });

    it('holds still while paused because the open pause counts up to now', () => {
      const paused = makeScheduledSession({
        status: 'paused',
        actualStart: '2026-03-10T09:00:00.000Z',
        pauseIntervals: [{ startedAt: '2026-03-10T09:10:00.000Z' }],
      });

      expect(formatElapsed(paused, START + 20 * 60_000, false)).toBe('00:10:00');
      expect(formatElapsed(paused, START + 5 * 60 * 60_000, false)).toBe('00:10:00');
    });

    it('freezes a session stored as recording at its last saved moment', () => {
      expect(formatElapsed(recording, START + 5 * 60 * 60_000, false)).toBe('00:30:00');
      expect(formatElapsed(recording, START + 45 * 60_000, true)).toBe('00:45:00');
    });

    it('is zero before recording starts and never negative', () => {
      expect(elapsedMs(makeScheduledSession(), START)).toBe(0);
      expect(elapsedMs({ ...recording, actualStart: '2026-03-10T10:00:00.000Z' }, START)).toBe(0);
    });
  });

  describe('words', () => {
    it('formats schedule times for a person', () => {
      expect(formatClock('07:00')).toBe('7:00 AM');
      expect(formatClock('12:05')).toBe('12:05 PM');
      expect(formatClock('00:30')).toBe('12:30 AM');
      expect(formatClock('21:00')).toBe('9:00 PM');
    });

    it('writes the date in the timezone the user lives in', () => {
      expect(formatEyebrowDate(Date.parse('2026-04-14T23:30:00.000Z'), 'UTC')).toBe('Tue, 14 Apr');
      expect(formatEyebrowDate(Date.parse('2026-04-14T23:30:00.000Z'), 'Asia/Kathmandu')).toBe(
        'Wed, 15 Apr',
      );
    });

    it('describes a retry deadline as today or tomorrow', () => {
      const now = Date.parse('2026-03-10T11:00:00.000Z');
      expect(describeDeadline('2026-03-10T15:10:00.000Z', now, 'UTC')).toBe('today at 3:10 PM');
      expect(describeDeadline('2026-03-11T09:05:00.000Z', now, 'UTC')).toBe('tomorrow at 9:05 AM');
      expect(describeDeadline('2026-03-10T23:30:00.000Z', now, 'Asia/Kathmandu')).toBe(
        'tomorrow at 5:15 AM',
      );
    });

    it('gives a content-free reason only for interruptions Daytale caused or saw', () => {
      const reason = (failureCode?: string) =>
        interruptionReason(makeScheduledSession({ status: 'paused', failureCode }));

      expect(reason('call')).toBe('Paused after a call.');
      expect(reason('route-loss')).toBe('Paused because the audio source was lost.');
      expect(reason('low-storage')).toBe('Paused because this device is low on storage.');
      expect(reason('crash-recovered')).toBe('Daytale closed unexpectedly, so I paused for you.');
      expect(reason(undefined)).toBeUndefined();
      expect(reason('something-else')).toBeUndefined();
    });

    it('treats a session stored as recording without a capture as interrupted', () => {
      expect(interruptionReason(makeScheduledSession({ status: 'recording' }))).toBe(
        'Paused because something interrupted the microphone.',
      );
    });
  });
});
