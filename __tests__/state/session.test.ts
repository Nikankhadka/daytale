import { INITIAL_SESSION_STATE, useSessionStore } from '../../src/state/session';
import type { RecordingSession } from '../../src/storage/types';

const scheduledSession: RecordingSession = {
  id: '11111111-1111-4111-8111-111111111111',
  scheduledStart: '2026-01-01T00:00:00.000Z',
  scheduledEnd: '2026-01-01T01:00:00.000Z',
  timezone: 'UTC',
  status: 'scheduled',
  pauseIntervals: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('recording session Zustand integration', () => {
  beforeEach(() => {
    useSessionStore.getState().resetSession();
  });

  it('preserves the existing initial session behavior', () => {
    expect(useSessionStore.getState()).toMatchObject(INITIAL_SESSION_STATE);
  });

  it('hydrates only validated recording-session state', () => {
    useSessionStore.getState().setRecordingSession(scheduledSession);

    expect(useSessionStore.getState().recordingSession).toEqual(scheduledSession);
    expect(() =>
      useSessionStore.getState().setRecordingSession({
        ...scheduledSession,
        id: 'not-a-uuid',
      }),
    ).toThrow('Invalid storage record field: id');
    expect(useSessionStore.getState().recordingSession).toEqual(scheduledSession);
  });

  it('clears the recording session on reset', () => {
    useSessionStore.getState().setRecordingSession(scheduledSession);
    useSessionStore.getState().resetSession();

    expect(useSessionStore.getState().recordingSession).toBeNull();
  });
});
