import {
  currentWindow,
  ensureTodaySession,
  localDateOf,
  supersedes,
  windowForLocalDate,
} from '../../src/features/recording/schedule';
import { useSessionStore } from '../../src/state/session';
import { createHarness, makeScheduledSession, uuidSequence } from './testKit';

const utc = { timezone: 'UTC', scheduleStartLocal: '08:00', scheduleEndLocal: '20:00' };
const newYork = {
  timezone: 'America/New_York',
  scheduleStartLocal: '08:00',
  scheduleEndLocal: '20:00',
};

describe('session schedule', () => {
  beforeEach(() => {
    useSessionStore.getState().resetSession();
  });

  describe('windowForLocalDate', () => {
    it('builds a same-day window', () => {
      expect(windowForLocalDate(utc, '2026-03-10')).toEqual({
        scheduledStart: '2026-03-10T08:00:00.000Z',
        scheduledEnd: '2026-03-10T20:00:00.000Z',
      });
      expect(windowForLocalDate(newYork, '2026-01-15')).toEqual({
        scheduledStart: '2026-01-15T13:00:00.000Z',
        scheduledEnd: '2026-01-16T01:00:00.000Z',
      });
    });

    it('ends the next local day when the window crosses midnight', () => {
      expect(
        windowForLocalDate(
          { ...utc, scheduleStartLocal: '22:00', scheduleEndLocal: '06:00' },
          '2026-03-10',
        ),
      ).toEqual({
        scheduledStart: '2026-03-10T22:00:00.000Z',
        scheduledEnd: '2026-03-11T06:00:00.000Z',
      });
      expect(
        windowForLocalDate(
          { ...newYork, scheduleStartLocal: '22:00', scheduleEndLocal: '06:00' },
          '2026-12-31',
        ),
      ).toEqual({
        scheduledStart: '2027-01-01T03:00:00.000Z',
        scheduledEnd: '2027-01-01T11:00:00.000Z',
      });
    });

    it('keeps wall-clock times on the spring-forward day (2026-03-08, New York)', () => {
      expect(windowForLocalDate(newYork, '2026-03-08')).toEqual({
        scheduledStart: '2026-03-08T12:00:00.000Z',
        scheduledEnd: '2026-03-09T00:00:00.000Z',
      });
      // 01:00 EST to 04:00 EDT is two elapsed hours because 02:00-03:00 does not exist.
      expect(
        windowForLocalDate(
          { ...newYork, scheduleStartLocal: '01:00', scheduleEndLocal: '04:00' },
          '2026-03-08',
        ),
      ).toEqual({
        scheduledStart: '2026-03-08T06:00:00.000Z',
        scheduledEnd: '2026-03-08T08:00:00.000Z',
      });
    });

    it('moves a skipped wall-clock time forward past the spring-forward gap', () => {
      expect(
        windowForLocalDate(
          { ...newYork, scheduleStartLocal: '02:30', scheduleEndLocal: '09:00' },
          '2026-03-08',
        ),
      ).toEqual({
        scheduledStart: '2026-03-08T07:30:00.000Z',
        scheduledEnd: '2026-03-08T13:00:00.000Z',
      });
    });

    it('keeps wall-clock times on the fall-back day (2026-11-01, New York)', () => {
      expect(windowForLocalDate(newYork, '2026-11-01')).toEqual({
        scheduledStart: '2026-11-01T13:00:00.000Z',
        scheduledEnd: '2026-11-02T01:00:00.000Z',
      });
      // 00:00 EDT to 03:00 EST is four elapsed hours because 01:00-02:00 happens twice.
      expect(
        windowForLocalDate(
          { ...newYork, scheduleStartLocal: '00:00', scheduleEndLocal: '03:00' },
          '2026-11-01',
        ),
      ).toEqual({
        scheduledStart: '2026-11-01T04:00:00.000Z',
        scheduledEnd: '2026-11-01T08:00:00.000Z',
      });
    });

    it('resolves a repeated wall-clock time to its first occurrence', () => {
      expect(
        windowForLocalDate(
          { ...newYork, scheduleStartLocal: '01:30', scheduleEndLocal: '09:00' },
          '2026-11-01',
        ),
      ).toEqual({
        scheduledStart: '2026-11-01T05:30:00.000Z',
        scheduledEnd: '2026-11-01T14:00:00.000Z',
      });
    });
  });

  describe('localDateOf and currentWindow', () => {
    it('reads the local calendar date in the given timezone', () => {
      const instant = new Date('2026-03-10T03:00:00.000Z');
      expect(localDateOf(instant, 'UTC')).toBe('2026-03-10');
      expect(localDateOf(instant, 'America/New_York')).toBe('2026-03-09');
      expect(localDateOf(instant, 'Pacific/Auckland')).toBe('2026-03-10');
    });

    it('uses today for a normal day', () => {
      expect(currentWindow(utc, new Date('2026-03-10T05:00:00.000Z'))).toEqual({
        scheduledStart: '2026-03-10T08:00:00.000Z',
        scheduledEnd: '2026-03-10T20:00:00.000Z',
      });
    });

    it('keeps yesterday window while a midnight-crossing window is still open', () => {
      const overnight = { ...utc, scheduleStartLocal: '22:00', scheduleEndLocal: '06:00' };

      expect(currentWindow(overnight, new Date('2026-03-11T03:00:00.000Z')).scheduledStart).toBe(
        '2026-03-10T22:00:00.000Z',
      );
      expect(currentWindow(overnight, new Date('2026-03-11T06:00:00.000Z')).scheduledStart).toBe(
        '2026-03-11T22:00:00.000Z',
      );
      expect(currentWindow(overnight, new Date('2026-03-11T15:00:00.000Z')).scheduledStart).toBe(
        '2026-03-11T22:00:00.000Z',
      );
    });

    it('follows the local date across a DST change', () => {
      // 2026-03-08T06:30Z is 01:30 EST, still before the 08:00 start.
      expect(currentWindow(newYork, new Date('2026-03-08T06:30:00.000Z')).scheduledStart).toBe(
        '2026-03-08T12:00:00.000Z',
      );
      // 2026-11-01T05:30Z is 01:30 EDT on the fall-back day.
      expect(currentWindow(newYork, new Date('2026-11-01T05:30:00.000Z')).scheduledStart).toBe(
        '2026-11-01T13:00:00.000Z',
      );
    });
  });

  describe('ensureTodaySession', () => {
    it('creates one scheduled session per window and returns it again', async () => {
      const { repositories } = await createHarness();
      const createId = uuidSequence();
      const now = new Date('2026-04-02T05:00:00.000Z');

      const first = await ensureTodaySession(repositories, utc, now, createId);
      const again = await ensureTodaySession(
        repositories,
        utc,
        new Date('2026-04-02T19:00:00.000Z'),
        createId,
      );

      expect(first).toMatchObject({
        status: 'scheduled',
        timezone: 'UTC',
        scheduledStart: '2026-04-02T08:00:00.000Z',
        scheduledEnd: '2026-04-02T20:00:00.000Z',
        createdAt: now.toISOString(),
      });
      expect(again).toEqual(first);
      // The harness seeds one unrelated scheduled session for another day.
      expect(await repositories.recordingSessions.list()).toHaveLength(2);
      expect(useSessionStore.getState().recordingSession).toEqual(first);
    });

    it('creates exactly one session for concurrent callers', async () => {
      const { repositories } = await createHarness();
      const createId = uuidSequence();
      const now = new Date('2026-04-02T05:00:00.000Z');

      const sessions = await Promise.all([
        ensureTodaySession(repositories, utc, now, createId),
        ensureTodaySession(repositories, utc, now, createId),
        ensureTodaySession(repositories, utc, now, createId),
      ]);

      expect(new Set(sessions.map((session) => session.id)).size).toBe(1);
      expect(await repositories.recordingSessions.list()).toHaveLength(2);
    });

    it('creates the next day session once the previous window has ended', async () => {
      const { repositories } = await createHarness();
      const createId = uuidSequence();

      const today = await ensureTodaySession(
        repositories,
        utc,
        new Date('2026-04-02T05:00:00.000Z'),
        createId,
      );
      const tomorrow = await ensureTodaySession(
        repositories,
        utc,
        new Date('2026-04-03T05:00:00.000Z'),
        createId,
      );

      expect(tomorrow.id).not.toBe(today.id);
      expect(tomorrow.scheduledStart).toBe('2026-04-03T08:00:00.000Z');
    });

    it('does not create a second session for a window that already has one, whatever its status', async () => {
      const { repositories } = await createHarness();
      const createId = uuidSequence();
      const now = new Date('2026-04-02T05:00:00.000Z');
      const created = await ensureTodaySession(repositories, utc, now, createId);
      await repositories.recordingSessions.save({
        ...created,
        status: 'discarded',
        updatedAt: '2026-04-02T09:00:00.000Z',
      });

      const again = await ensureTodaySession(repositories, utc, now, createId);

      expect(again.id).toBe(created.id);
      expect(again.status).toBe('discarded');
    });

    it('leaves a session the user still has to settle on screen when it creates the next one', async () => {
      const { repositories } = await createHarness();
      const failed = makeScheduledSession({
        status: 'failed',
        actualStart: '2026-04-01T08:00:00.000Z',
        actualEnd: '2026-04-01T10:00:00.000Z',
        failureCode: 'transcription-failed',
        retryTarget: 'transcribing',
        retryUntil: '2026-04-02T10:00:00.000Z',
        updatedAt: '2026-04-01T10:00:00.000Z',
      });
      useSessionStore.getState().setRecordingSession(failed);

      const created = await ensureTodaySession(
        repositories,
        utc,
        new Date('2026-04-02T05:00:00.000Z'),
        uuidSequence(),
      );

      expect(created.status).toBe('scheduled');
      expect(useSessionStore.getState().recordingSession).toEqual(failed);
    });

    it('reuses the still-open overnight session after midnight', async () => {
      const { repositories } = await createHarness();
      const createId = uuidSequence();
      const overnight = { ...utc, scheduleStartLocal: '22:00', scheduleEndLocal: '06:00' };

      const evening = await ensureTodaySession(
        repositories,
        overnight,
        new Date('2026-04-02T23:00:00.000Z'),
        createId,
      );
      const afterMidnight = await ensureTodaySession(
        repositories,
        overnight,
        new Date('2026-04-03T02:00:00.000Z'),
        createId,
      );

      expect(afterMidnight.id).toBe(evening.id);
    });
  });

  describe('supersedes', () => {
    const today = makeScheduledSession({
      id: '33333333-3333-4333-8333-333333333333',
      scheduledStart: '2026-03-11T09:00:00.000Z',
      scheduledEnd: '2026-03-11T17:00:00.000Z',
    });

    it.each([
      ['nothing is shown', null],
      ['an unused session is shown', makeScheduledSession()],
      ['an earlier finished session is shown', makeScheduledSession({ status: 'ready' })],
      ['an earlier session is still processing', makeScheduledSession({ status: 'transcribing' })],
    ])('replaces the screen when %s', (_name, shown) => {
      expect(supersedes(today, shown)).toBe(true);
    });

    it.each(['recording', 'paused', 'failed'] as const)('never replaces a %s session', (status) => {
      expect(supersedes(today, makeScheduledSession({ status }))).toBe(false);
    });

    it('keeps the session already on screen for the same window', () => {
      expect(supersedes(today, { ...today, status: 'ready' })).toBe(false);
    });
  });
});
