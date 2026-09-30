import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { endBreak, startBreak, useBreakChoice } from '../../src/features/recording/breaks';
import { cancelBreakEnd, scheduleBreakEnd } from '../../src/features/recording/notifications';

jest.mock('../../src/features/recording/notifications', () => ({
  scheduleBreakEnd: jest.fn(),
  cancelBreakEnd: jest.fn(),
}));

const MINUTE = 60_000;

// The React Native jest setup mocks `currentState` as a function, so pin a real value per test.
const originalState = AppState.currentState;
function setAppState(state: AppStateStatus) {
  Object.defineProperty(AppState, 'currentState', {
    value: state,
    configurable: true,
    writable: true,
  });
}

describe('privacy breaks', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-10T10:00:00.000Z'));
    setAppState('active');
  });

  afterEach(() => {
    endBreak();
    setAppState(originalState);
    jest.useRealTimers();
  });

  it('resumes when a timed break ends while the app is in the foreground', () => {
    const resume = jest.fn();
    startBreak('15m', resume);

    jest.advanceTimersByTime(15 * MINUTE - 1);
    expect(resume).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('schedules a notification for the moment the break ends', () => {
    startBreak('1h', jest.fn());

    expect(scheduleBreakEnd).toHaveBeenCalledWith(new Date('2026-03-10T11:00:00.000Z'));
  });

  it('leaves the resume to the user when the app is not in the foreground at the end', () => {
    const resume = jest.fn();
    startBreak('15m', resume);
    setAppState('background');

    jest.advanceTimersByTime(15 * MINUTE);

    expect(resume).not.toHaveBeenCalled();
  });

  it('does not resume when the timer only fires long after the break ended', () => {
    const resume = jest.fn();
    startBreak('15m', resume);
    // The app was suspended past the end of the break and the timer fires on return.
    jest.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));

    jest.advanceTimersByTime(MINUTE);

    expect(resume).not.toHaveBeenCalled();
  });

  it('never times an open-ended break and drops an earlier break notification', () => {
    const resume = jest.fn();
    startBreak('manual', resume);

    jest.advanceTimersByTime(24 * 60 * MINUTE);

    expect(resume).not.toHaveBeenCalled();
    expect(scheduleBreakEnd).not.toHaveBeenCalled();
    expect(cancelBreakEnd).toHaveBeenCalled();
  });

  it('cancels the timer and the notification when the break is ended', () => {
    const resume = jest.fn();
    startBreak('15m', resume);

    endBreak();
    jest.advanceTimersByTime(15 * MINUTE);

    expect(resume).not.toHaveBeenCalled();
    expect(cancelBreakEnd).toHaveBeenCalled();
  });

  it('lets a new break replace the one before it', () => {
    const first = jest.fn();
    const second = jest.fn();
    startBreak('15m', first);
    startBreak('1h', second);

    jest.advanceTimersByTime(15 * MINUTE);
    expect(first).not.toHaveBeenCalled();
    jest.advanceTimersByTime(45 * MINUTE);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('exposes the remembered choice until the break ends', async () => {
    const { result } = await renderHook(() => useBreakChoice());
    expect(result.current).toBeNull();

    await act(async () => startBreak('1h', jest.fn()));
    expect(result.current).toBe('1h');

    await act(async () => endBreak());
    expect(result.current).toBeNull();
  });
});
