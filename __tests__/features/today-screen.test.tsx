import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import { Linking } from 'react-native';
import { withRepeat } from 'react-native-reanimated';

import { createDefaultAppPreferences } from '../../src/features/preferences';
import { expoPermissionGateway } from '../../src/features/permissions';
import { startBreak, useBreakChoice } from '../../src/features/recording/breaks';
import {
  discardFailedSession,
  retrySession,
  skipSession,
} from '../../src/features/recording/sessionCommands';
import { recordingHost, useIsCapturing } from '../../src/features/recording/useRecordingEngine';
import { TodayScreen } from '../../src/features/today';
import { useSessionStore } from '../../src/state/session';
import { getBootstrappedStorage } from '../../src/storage/bootstrap';
import type { RecordingSession } from '../../src/storage/types';
import { SESSION_ID, makeScheduledSession } from '../recording/testKit';

const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() };

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('../reanimatedMock');
  return { ...actual, __esModule: true, withRepeat: jest.fn(actual.withRepeat) };
});
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('../../src/storage/bootstrap', () => ({ getBootstrappedStorage: jest.fn() }));
jest.mock('../../src/features/permissions', () => ({
  expoPermissionGateway: { requestRecordingPermissionsAsync: jest.fn() },
}));
jest.mock('../../src/features/recording/sessionCommands', () => ({
  skipSession: jest.fn(),
  retrySession: jest.fn(),
  discardFailedSession: jest.fn(),
}));
jest.mock('../../src/features/recording/breaks', () => ({
  ...jest.requireActual('../../src/features/recording/breaks'),
  startBreak: jest.fn(),
  endBreak: jest.fn(),
  useBreakChoice: jest.fn(() => null),
}));
jest.mock('../../src/features/recording/useRecordingEngine', () => ({
  useIsCapturing: jest.fn(),
  recordingHost: {
    reconcile: jest.fn(),
    engine: { start: jest.fn(), pause: jest.fn(), resume: jest.fn(), stop: jest.fn() },
  },
}));

const engine = recordingHost.engine as unknown as Record<
  'start' | 'pause' | 'resume' | 'stop',
  jest.Mock
>;
const storage = { database: {}, repositories: {} };
const OK = { ok: true, session: makeScheduledSession() } as const;
const blocked = (code: string) => ({ ok: false, code, session: null }) as never;

const IN_WINDOW = new Date('2026-03-10T09:30:00.000Z');
const BEFORE_WINDOW = new Date('2026-03-10T08:00:00.000Z');
const AFTER_WINDOW = new Date('2026-03-10T18:00:00.000Z');

const recordingSession = (overrides: Partial<RecordingSession> = {}) =>
  makeScheduledSession({
    status: 'recording',
    actualStart: '2026-03-10T09:00:00.000Z',
    updatedAt: '2026-03-10T09:00:00.000Z',
    ...overrides,
  });

async function show(session: RecordingSession | null, reducedMotion = false) {
  const preferences = createDefaultAppPreferences('2026-03-01T00:00:00.000Z', 'UTC');
  useSessionStore.getState().setAppPreferences({
    ...preferences,
    firstName: 'Nikan',
    scheduleStartLocal: '09:00',
    scheduleEndLocal: '17:00',
    reducedMotion,
  });
  useSessionStore.getState().setRecordingSession(session);
  return render(<TodayScreen />);
}

const press = (screen: Awaited<ReturnType<typeof show>>, name: string) =>
  fireEvent.press(screen.getByRole('button', { name }));

describe('Today screen', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    jest.setSystemTime(IN_WINDOW);
    jest.mocked(useIsCapturing).mockReturnValue(false);
    jest.mocked(getBootstrappedStorage).mockReturnValue(storage as never);
    jest.mocked(randomUUID).mockReturnValue('33333333-3333-4333-8333-333333333333');
    jest.mocked(expoPermissionGateway.requestRecordingPermissionsAsync).mockResolvedValue({
      state: 'granted',
    } as never);
    jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    engine.start.mockResolvedValue(OK);
    engine.pause.mockResolvedValue(OK);
    engine.resume.mockResolvedValue(OK);
    engine.stop.mockResolvedValue(OK);
    jest.mocked(skipSession).mockResolvedValue(true);
    jest.mocked(retrySession).mockResolvedValue('retried');
    jest.mocked(discardFailedSession).mockResolvedValue(true);
  });

  afterEach(async () => {
    await cleanup();
    useSessionStore.getState().resetSession();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('today-idle', () => {
    it('rests until the window starts and shows the next window with a sleeping mascot', async () => {
      const screen = await show(null);

      expect(screen.getByText('Resting until 9:00 AM.')).toBeTruthy();
      expect(screen.getByLabelText('Next window: 9:00 AM – 5:00 PM')).toBeTruthy();
      expect(screen.getByTestId('daytale-mascot-sleeping-art')).toBeTruthy();
      expect(screen.queryByText('Preview morning prompt →')).toBeNull();
    });

    it('opens the morning prompt early from a session waiting for its window', async () => {
      jest.setSystemTime(BEFORE_WINDOW);
      const screen = await show(makeScheduledSession());

      expect(screen.getByText('Resting until 9:00 AM.')).toBeTruthy();
      await press(screen, 'Preview morning prompt →');

      expect(screen.getByText('Good morning, Nikan!')).toBeTruthy();
      await press(screen, 'Start my day');
      expect(engine.start).toHaveBeenCalledWith(SESSION_ID);
    });

    it('does not offer the preview once the window is over or the session is settled', async () => {
      jest.setSystemTime(AFTER_WINDOW);
      const late = await show(makeScheduledSession());
      expect(late.getByText('Resting until 9:00 AM.')).toBeTruthy();
      expect(late.queryByText('Preview morning prompt →')).toBeNull();
      await cleanup();

      jest.setSystemTime(BEFORE_WINDOW);
      const skipped = await show(makeScheduledSession({ status: 'discarded' }));
      expect(skipped.getByText('Resting until 9:00 AM.')).toBeTruthy();
      expect(skipped.queryByText('Preview morning prompt →')).toBeNull();
    });
  });

  describe('morning-prompt', () => {
    it('greets by name and offers the three choices with a waking mascot', async () => {
      const screen = await show(makeScheduledSession());

      expect(screen.getByText('Good morning, Nikan!')).toBeTruthy();
      expect(screen.getByText('Ready for me to remember today?')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Start my day' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Change time' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Skip today' })).toBeTruthy();
      expect(screen.getByTestId('daytale-mascot-waking-art')).toBeTruthy();
    });

    it('drops the name gracefully when there is none', async () => {
      const screen = await show(makeScheduledSession());
      await act(async () => {
        useSessionStore.getState().setAppPreferences({
          ...useSessionStore.getState().appPreferences!,
          firstName: undefined,
        });
      });

      expect(screen.getByText('Good morning!')).toBeTruthy();
    });

    it('starts the day through the engine', async () => {
      const screen = await show(makeScheduledSession());
      await press(screen, 'Start my day');

      expect(engine.start).toHaveBeenCalledWith(SESSION_ID);
    });

    it('keeps the start button disabled while the engine is starting', async () => {
      let finish: (value: unknown) => void = () => undefined;
      engine.start.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      const screen = await show(makeScheduledSession());
      await press(screen, 'Start my day');

      expect(screen.getByRole('button', { name: 'Start my day' })).toBeDisabled();
      await act(async () => finish(OK));
      expect(screen.getByRole('button', { name: 'Start my day' })).toBeEnabled();
    });

    it('opens the schedule in settings through the tab route', async () => {
      const screen = await show(makeScheduledSession());
      await press(screen, 'Change time');

      expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/settings/schedule');
    });

    it('skips today by discarding the session', async () => {
      const screen = await show(makeScheduledSession());
      await press(screen, 'Skip today');

      expect(skipSession).toHaveBeenCalledWith(storage, SESSION_ID);
      expect(recordingHost.reconcile).toHaveBeenCalled();
    });

    it('says so when skipping did not apply or storage is not ready', async () => {
      jest.mocked(skipSession).mockResolvedValue(false);
      const screen = await show(makeScheduledSession());
      await press(screen, 'Skip today');
      expect(screen.getByText('That did not work. Please try again.')).toBeTruthy();

      jest.mocked(getBootstrappedStorage).mockReturnValue(undefined as never);
      await press(screen, 'Skip today');
      expect(screen.getByText('Secure storage is unavailable.')).toBeTruthy();
    });

    it('shows a plain message when the engine cannot start', async () => {
      engine.start.mockResolvedValue(blocked('capture-failed'));
      const screen = await show(makeScheduledSession());
      await press(screen, 'Start my day');

      expect(screen.getByText('That did not work. Please try again.')).toBeTruthy();
    });

    it('shows a plain message when the engine throws', async () => {
      engine.start.mockRejectedValue(new Error('boom'));
      const screen = await show(makeScheduledSession());
      await press(screen, 'Start my day');

      expect(screen.getByText('That did not work. Please try again.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Start my day' })).toBeEnabled();
    });
  });

  describe('start blockers', () => {
    it('asks again for a denied microphone, then starts once it is allowed', async () => {
      engine.start.mockResolvedValueOnce(blocked('permission-denied'));
      const screen = await show(makeScheduledSession());
      await press(screen, 'Start my day');

      expect(screen.getByText(/Microphone access is off/)).toBeTruthy();
      await press(screen, 'Open settings');
      expect(Linking.openSettings).toHaveBeenCalled();

      await press(screen, 'Try again');
      expect(expoPermissionGateway.requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(engine.start).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/Microphone access is off/)).toBeNull();
    });

    it('sends a blocked microphone to device settings without asking again', async () => {
      engine.start.mockResolvedValueOnce(blocked('permission-blocked'));
      const screen = await show(makeScheduledSession());
      await press(screen, 'Start my day');

      expect(screen.getByText(/Microphone access is blocked/)).toBeTruthy();
      await press(screen, 'Open settings');
      expect(Linking.openSettings).toHaveBeenCalled();
      await press(screen, 'Try again');

      expect(expoPermissionGateway.requestRecordingPermissionsAsync).not.toHaveBeenCalled();
      expect(engine.start).toHaveBeenCalledTimes(2);
    });

    it('routes a missing voice profile to voice setup', async () => {
      engine.start.mockResolvedValueOnce(blocked('voice-profile-missing'));
      const screen = await show(makeScheduledSession());
      await press(screen, 'Start my day');

      expect(
        screen.getByText('Daytale needs to learn your voice before it can record.'),
      ).toBeTruthy();
      await press(screen, 'Set up my voice');
      expect(mockRouter.push).toHaveBeenCalledWith('/voice-setup');
    });

    it('points low storage at freeing space and lets the user try again', async () => {
      engine.start.mockResolvedValueOnce(blocked('low-storage'));
      const screen = await show(makeScheduledSession());
      await press(screen, 'Start my day');

      expect(
        screen.getByText('This device is low on storage. Free up some space, then try again.'),
      ).toBeTruthy();
      await press(screen, 'Try again');
      expect(engine.start).toHaveBeenCalledTimes(2);
    });

    it('applies the same recovery to a blocked resume', async () => {
      engine.resume.mockResolvedValueOnce(blocked('permission-blocked'));
      const screen = await show(
        recordingSession({
          status: 'paused',
          pauseIntervals: [{ startedAt: IN_WINDOW.toISOString() }],
        }),
      );
      await press(screen, 'Resume recording');

      expect(screen.getByText(/Microphone access is blocked/)).toBeTruthy();
      await press(screen, 'Try again');
      expect(engine.resume).toHaveBeenCalledTimes(2);
      expect(engine.start).not.toHaveBeenCalled();
    });
  });

  describe('recording', () => {
    beforeEach(() => {
      jest.mocked(useIsCapturing).mockReturnValue(true);
    });

    it('shows the listening state with the pill, waveform, reassurance, and labelled controls', async () => {
      const screen = await show(recordingSession());

      expect(screen.getByText("I'm remembering your day")).toBeTruthy();
      expect(screen.getByText('RECORDING')).toBeTruthy();
      expect(screen.getByLabelText('Recording')).toBeTruthy();
      expect(screen.getByText("Live normally - I'll only ask if I need to.")).toBeTruthy();
      expect(screen.getByTestId('daytale-mascot-listening-art')).toBeTruthy();
      expect(screen.getByLabelText('Pause Daytale recording')).toBeTruthy();
      expect(screen.getByLabelText('Stop Daytale recording')).toBeTruthy();
    });

    it('hides the decorative waveform from screen readers', async () => {
      const screen = await show(recordingSession());
      const waveform = screen.getByTestId('recording-waveform', { includeHiddenElements: true });

      expect(waveform.props.accessibilityElementsHidden).toBe(true);
      expect(waveform.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(screen.queryByTestId('recording-waveform')).toBeNull();
    });

    it('animates the waveform and the dot, and holds both still with reduced motion', async () => {
      await show(recordingSession());
      expect(withRepeat).toHaveBeenCalled();
      await cleanup();
      jest.mocked(withRepeat).mockClear();

      await show(recordingSession(), true);
      expect(withRepeat).not.toHaveBeenCalled();
    });

    it('counts up from the actual start and leaves completed pauses out', async () => {
      const screen = await show(
        recordingSession({
          pauseIntervals: [
            { startedAt: '2026-03-10T09:10:00.000Z', endedAt: '2026-03-10T09:20:00.000Z' },
          ],
        }),
      );

      expect(screen.getByRole('timer')).toHaveTextContent('00:20:00');
      await act(async () => jest.advanceTimersByTime(1_000));
      expect(screen.getByRole('timer')).toHaveTextContent('00:20:01');
    });

    it('stops the session from the stop button', async () => {
      const screen = await show(recordingSession());
      fireEvent.press(screen.getByLabelText('Stop Daytale recording'));

      expect(engine.stop).toHaveBeenCalledTimes(1);
    });

    it('shows a plain message when stopping fails', async () => {
      engine.stop.mockResolvedValue(blocked('rejected'));
      const screen = await show(recordingSession());
      await fireEvent.press(screen.getByLabelText('Stop Daytale recording'));

      expect(screen.getByText('That did not work. Please try again.')).toBeTruthy();
    });

    it('keeps the running timer while a start is still in flight', async () => {
      jest.mocked(useIsCapturing).mockReturnValue(false);
      let finish: (value: unknown) => void = () => undefined;
      engine.start.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      const screen = await show(makeScheduledSession());
      await press(screen, 'Start my day');
      await act(async () => {
        useSessionStore.getState().setRecordingSession(recordingSession());
      });

      expect(screen.getByText("I'm remembering your day")).toBeTruthy();
      await act(async () => finish(OK));
    });
  });

  describe('privacy-sheet', () => {
    beforeEach(() => {
      jest.mocked(useIsCapturing).mockReturnValue(true);
    });

    async function openSheet(reducedMotion = false) {
      const screen = await show(recordingSession(), reducedMotion);
      expect(screen.queryByText('Take a little privacy break?')).toBeNull();
      await fireEvent.press(screen.getByLabelText('Pause Daytale recording'));
      return screen;
    }

    it('lists the break choices, stop for today, and cancel', async () => {
      const screen = await openSheet();

      expect(screen.getByText('Take a little privacy break?')).toBeTruthy();
      for (const name of ['15 minutes', '1 hour', 'Until I resume', 'Stop for today', 'Cancel']) {
        expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy();
      }
    });

    it.each([
      ['15 minutes', '15m'],
      ['1 hour', '1h'],
      ['Until I resume', 'manual'],
    ])('pauses and remembers the "%s" choice', async (label, choice) => {
      const screen = await openSheet();
      await fireEvent.press(screen.getByRole('button', { name: new RegExp(label) }));

      expect(engine.pause).toHaveBeenCalledWith();
      expect(startBreak).toHaveBeenCalledWith(choice, expect.any(Function));
      expect(screen.queryByText('Take a little privacy break?')).toBeNull();
    });

    it('resumes through the engine when the timed break ends', async () => {
      const screen = await openSheet();
      await fireEvent.press(screen.getByRole('button', { name: /15 minutes/ }));

      jest.mocked(startBreak).mock.calls[0][1]();

      expect(engine.resume).toHaveBeenCalledTimes(1);
    });

    it('does not start a break when the pause did not go through', async () => {
      engine.pause.mockResolvedValue(blocked('rejected'));
      const screen = await openSheet();
      await fireEvent.press(screen.getByRole('button', { name: /1 hour/ }));

      expect(startBreak).not.toHaveBeenCalled();
      expect(screen.getByText('That did not work. Please try again.')).toBeTruthy();
    });

    it('stops the session for today without pausing first', async () => {
      const screen = await openSheet();
      await fireEvent.press(screen.getByRole('button', { name: 'Stop for today' }));

      expect(engine.stop).toHaveBeenCalledTimes(1);
      expect(engine.pause).not.toHaveBeenCalled();
      expect(screen.queryByText('Take a little privacy break?')).toBeNull();
    });

    it('cancels without touching the recording', async () => {
      const screen = await openSheet();
      await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

      expect(engine.pause).not.toHaveBeenCalled();
      expect(engine.stop).not.toHaveBeenCalled();
      expect(screen.queryByText('Take a little privacy break?')).toBeNull();
    });

    it('slides in normally and appears at once with reduced motion', async () => {
      const animation = (screen: Awaited<ReturnType<typeof openSheet>>) =>
        /"animationType":"(\w+)"/.exec(JSON.stringify(screen.toJSON()))?.[1];

      const normal = await openSheet();
      expect(animation(normal)).toBe('slide');
      await cleanup();

      const reduced = await openSheet(true);
      expect(animation(reduced)).toBe('none');
    });
  });

  describe('paused', () => {
    const paused = (overrides: Partial<RecordingSession> = {}) =>
      recordingSession({
        status: 'paused',
        pauseIntervals: [{ startedAt: '2026-03-10T09:20:00.000Z' }],
        ...overrides,
      });

    it('names a privacy break by the choice the user made', async () => {
      jest.mocked(useBreakChoice).mockReturnValue('1h');
      const screen = await show(paused());

      expect(screen.getByText('Taking a privacy break.')).toBeTruthy();
      expect(screen.getByText('PAUSED · 1 hour')).toBeTruthy();
      expect(screen.getByTestId('daytale-mascot-paused-art')).toBeTruthy();
      expect(screen.getByRole('timer')).toHaveTextContent('00:20:00');
      jest.mocked(useBreakChoice).mockReturnValue(null);
    });

    it('falls back to an open-ended break when the choice is not remembered', async () => {
      const screen = await show(paused());

      expect(screen.getByText('PAUSED · Until I resume')).toBeTruthy();
    });

    it.each([
      ['call', 'Paused after a call.'],
      ['route-loss', 'Paused because the audio source was lost.'],
      ['low-storage', 'Paused because this device is low on storage.'],
      ['crash-recovered', 'Daytale closed unexpectedly, so I paused for you.'],
    ])('explains a %s interruption in one content-free line', async (failureCode, line) => {
      const screen = await show(paused({ failureCode }));

      expect(screen.getByText('Recording is paused.')).toBeTruthy();
      expect(screen.getByText(`${line} Nothing is being recorded right now.`)).toBeTruthy();
    });

    it('resumes through the engine', async () => {
      const screen = await show(paused());
      await press(screen, 'Resume recording');

      expect(engine.resume).toHaveBeenCalledTimes(1);
    });

    it('offers a way to stop for today', async () => {
      const screen = await show(paused());
      await press(screen, 'Stop for today');

      expect(engine.stop).toHaveBeenCalledTimes(1);
    });

    it('shows the interrupted view for a stored recording with no open capture', async () => {
      jest.mocked(useIsCapturing).mockReturnValue(false);
      const screen = await show(recordingSession());

      expect(screen.getByText('Recording is paused.')).toBeTruthy();
      expect(screen.queryByText("I'm remembering your day")).toBeNull();
      expect(screen.queryByLabelText('Pause Daytale recording')).toBeNull();
      expect(screen.getByRole('button', { name: 'Resume recording' })).toBeTruthy();
    });
  });

  describe('error', () => {
    const failed = (overrides: Partial<RecordingSession> = {}) =>
      makeScheduledSession({
        status: 'failed',
        actualStart: '2026-03-10T09:00:00.000Z',
        failureCode: 'capture-failed',
        retryTarget: 'recording',
        retryUntil: '2026-03-10T15:10:00.000Z',
        ...overrides,
      });

    it('reassures, explains, and states the retry deadline in plain words', async () => {
      const screen = await show(failed());

      expect(screen.getByText('Something interrupted your journal.')).toBeTruthy();
      expect(
        screen.getByText('Nothing is lost - I can pick up right where I left off.'),
      ).toBeTruthy();
      expect(
        screen.getByText(
          'Try again until today at 3:10 PM. After that, the saved audio is deleted.',
        ),
      ).toBeTruthy();
      expect(screen.getByTestId('daytale-mascot-error-art')).toBeTruthy();
    });

    it('retries with one operation id that survives a thrown attempt', async () => {
      jest.mocked(retrySession).mockRejectedValueOnce(new Error('disk'));
      const screen = await show(failed());

      await press(screen, 'Try again');
      expect(screen.getByText('That did not work. Please try again.')).toBeTruthy();
      await press(screen, 'Try again');

      expect(retrySession).toHaveBeenCalledTimes(2);
      const ids = jest.mocked(retrySession).mock.calls.map((call) => call[2]);
      expect(ids).toEqual([ids[0], ids[0]]);
      expect(ids[0]).toBe('33333333-3333-4333-8333-333333333333');
      expect(recordingHost.reconcile).toHaveBeenCalled();
    });

    it('uses a fresh operation id after a definitive outcome', async () => {
      jest
        .mocked(randomUUID)
        .mockReturnValueOnce('33333333-3333-4333-8333-333333333333')
        .mockReturnValueOnce('44444444-4444-4444-8444-444444444444');
      jest.mocked(retrySession).mockResolvedValue('rejected');
      const screen = await show(failed());

      await press(screen, 'Try again');
      expect(screen.getByText('That could not be retried right now.')).toBeTruthy();
      await press(screen, 'Try again');

      expect(jest.mocked(retrySession).mock.calls.map((call) => call[2])).toEqual([
        '33333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444',
      ]);
    });

    it('discards the failed session', async () => {
      const screen = await show(failed());
      await press(screen, 'Discard this session');

      expect(discardFailedSession).toHaveBeenCalledWith(storage, SESSION_ID);
      expect(recordingHost.reconcile).toHaveBeenCalled();
    });

    it('says so when the discard did not apply', async () => {
      jest.mocked(discardFailedSession).mockResolvedValue(false);
      const screen = await show(failed());
      await press(screen, 'Discard this session');

      expect(screen.getByText('That did not work. Please try again.')).toBeTruthy();
    });
  });

  describe('processing handoff', () => {
    it.each(['transcribing', 'analyzing', 'awaiting clarification', 'generating'] as const)(
      'shows only the handoff while a session is %s',
      async (status) => {
        const screen = await show(
          makeScheduledSession({ status, actualStart: '2026-03-10T09:00:00.000Z' }),
        );

        expect(screen.getByText('Writing your Daytale…')).toBeTruthy();
        expect(screen.getByText('Source audio is deleted the moment this finishes.')).toBeTruthy();
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.getByTestId('daytale-mascot-writing-art')).toBeTruthy();
      },
    );
  });

  it('starts over when a different session takes the screen', async () => {
    engine.start.mockResolvedValueOnce(blocked('low-storage'));
    const screen = await show(makeScheduledSession());
    await press(screen, 'Start my day');
    expect(screen.getByText(/low on storage/)).toBeTruthy();

    await act(async () => {
      useSessionStore
        .getState()
        .setRecordingSession(makeScheduledSession({ id: '55555555-5555-4555-8555-555555555555' }));
    });

    expect(screen.queryByText(/low on storage/)).toBeNull();
  });
});
