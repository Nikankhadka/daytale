import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PermissionResponse } from 'expo';
import { Linking } from 'react-native';

import {
  createDefaultAppPreferences,
  mergeAppPreferences,
  persistAppPreferences,
  type PreferencesRepository,
} from '../../src/features/preferences';
import {
  getInitialOnboardingStep,
  OnboardingScreen,
  READY_AUTO_ADVANCE_MS,
} from '../../src/features/onboarding';
import { VOICE_MODEL_VERSION } from '../../src/features/voice/enrollment';
import { microphonePermissionState } from '../../src/features/permissions';
import { useSessionStore } from '../../src/state/session';
import type { AppPreferences, VoiceProfile } from '../../src/storage/types';

const now = '2026-09-26T00:00:00.000Z';

function createFakePreferencesRepository() {
  let current: AppPreferences | null = null;
  const repository: PreferencesRepository = {
    getById: jest.fn(async () => current),
    save: jest.fn(async (value) => {
      current = value;
      return value;
    }),
  };
  return { repository, getCurrent: () => current };
}

async function renderReadyScreen() {
  const fake = createFakePreferencesRepository();
  const preferences = mergeAppPreferences(
    createDefaultAppPreferences(now, 'UTC'),
    {
      onboardingStage: 'ready',
      spokenLanguages: ['en', 'ne'],
      journalLanguage: 'ne',
      scheduleStartLocal: '08:30',
      microphonePermissionState: 'granted',
    },
    now,
  );
  await fake.repository.save(preferences);
  useSessionStore.getState().setAppPreferences(preferences);
  const screen = await render(<OnboardingScreen now={() => now} repository={fake.repository} />);
  return { fake, screen };
}

describe('DYT-004A onboarding and preferences', () => {
  beforeEach(() => {
    useSessionStore.getState().resetSession();
  });

  it('persists valid choices through the standard path and stops at voice setup', async () => {
    const fake = createFakePreferencesRepository();
    const screen = await render(
      <OnboardingScreen
        now={() => now}
        repository={fake.repository}
        permissionGateway={{
          getRecordingPermissionsAsync: async () => ({
            granted: false,
            canAskAgain: true,
            expires: 'never',
            status: 'undetermined' as PermissionResponse['status'],
          }),
          requestRecordingPermissionsAsync: async () => ({
            granted: true,
            canAskAgain: true,
            expires: 'never',
            status: 'granted' as PermissionResponse['status'],
          }),
          getNotificationPermissionsAsync: async () => ({
            granted: false,
            canAskAgain: true,
            expires: 'never',
            status: 'undetermined' as PermissionResponse['status'],
          }),
          requestNotificationPermissionsAsync: async () => ({
            granted: true,
            canAskAgain: true,
            expires: 'never',
            status: 'granted' as PermissionResponse['status'],
          }),
        }}
        timezone="UTC"
      />,
    );

    await fireEvent.changeText(screen.getByLabelText('First name (optional)'), 'Luna');
    await fireEvent.press(screen.getByText('Get Started →'));
    await waitFor(() =>
      expect(screen.getByText('What languages are part of your life?')).toBeTruthy(),
    );
    await waitFor(() => expect(fake.getCurrent()?.firstName).toBe('Luna'));
    expect(fake.getCurrent()?.onboardingStage).toBe('languages');
    await fireEvent.press(screen.getByText('Continue →'));
    await waitFor(() => expect(screen.getByText('When should I remember your day?')).toBeTruthy());
    expect(fake.getCurrent()?.spokenLanguages).toEqual(['en']);
    expect(fake.getCurrent()?.onboardingStage).toBe('schedule');

    await fireEvent.press(screen.getByText('Continue →'));
    await waitFor(() =>
      expect(screen.getByText('Take a little privacy break, always on your terms.')).toBeTruthy(),
    );
    expect(fake.getCurrent()?.scheduleStartLocal).toBe('07:00');
    expect(fake.getCurrent()?.onboardingStage).toBe('privacy');

    await fireEvent.press(screen.getByText('Allow & Continue →'));
    await waitFor(() => expect(screen.getByText('Voice setup')).toBeTruthy());
    expect(fake.getCurrent()?.microphonePermissionState).toBe('granted');
    expect(fake.getCurrent()?.onboardingComplete).toBe(false);
    expect(fake.getCurrent()?.onboardingStage).toBe('voice');
    expect(useSessionStore.getState().onboardingComplete).toBe(false);
  });

  it('restores unfinished work safely and never treats permission as onboarding completion', () => {
    const defaults = createDefaultAppPreferences(now, 'UTC');
    const languages = mergeAppPreferences(
      defaults,
      { onboardingStage: 'schedule', journalLanguage: 'ne', spokenLanguages: ['en', 'ne'] },
      now,
    );
    const schedule = mergeAppPreferences(
      languages,
      { onboardingStage: 'privacy', scheduleStartLocal: '08:00' },
      now,
    );
    const denied = mergeAppPreferences(schedule, { microphonePermissionState: 'denied' }, now);
    const granted = mergeAppPreferences(
      denied,
      { onboardingStage: 'voice', microphonePermissionState: 'granted' },
      now,
    );

    expect(getInitialOnboardingStep(null)).toBe('welcome');
    expect(getInitialOnboardingStep(defaults)).toBe('welcome');
    expect(getInitialOnboardingStep(languages)).toBe('schedule');
    expect(getInitialOnboardingStep(schedule)).toBe('privacy');
    expect(getInitialOnboardingStep(denied)).toBe('privacy');
    expect(getInitialOnboardingStep(granted)).toBe('voice');
  });

  it('keeps settings persistence validated and maps native permission states safely', async () => {
    const fake = createFakePreferencesRepository();
    const saved = await persistAppPreferences(
      { theme: 'dark', reducedMotion: true },
      { now: () => now, repository: fake.repository, timezone: 'UTC' },
    );

    expect(saved.theme).toBe('dark');
    expect(saved.reducedMotion).toBe(true);
    expect(
      microphonePermissionState({
        granted: true,
        canAskAgain: true,
        expires: 'never',
        status: 'granted' as PermissionResponse['status'],
      }),
    ).toBe('granted');
    expect(
      microphonePermissionState({
        granted: false,
        canAskAgain: false,
        expires: 'never',
        status: 'denied' as PermissionResponse['status'],
      }),
    ).toBe('blocked');
  });

  it('shows denial recovery and keeps notification denial recoverable', async () => {
    const preferences = mergeAppPreferences(createDefaultAppPreferences(now, 'UTC'), {
      onboardingStage: 'privacy',
    });
    useSessionStore.getState().setAppPreferences(preferences);
    const fake = createFakePreferencesRepository();
    const openSettings = jest.spyOn(Linking, 'openSettings');
    openSettings.mockResolvedValue(undefined);
    const screen = await render(
      <OnboardingScreen
        now={() => now}
        repository={fake.repository}
        permissionGateway={{
          getRecordingPermissionsAsync: async () => permissionResponse(false, false),
          requestRecordingPermissionsAsync: async () => permissionResponse(false, false),
          getNotificationPermissionsAsync: async () => permissionResponse(false, true),
          requestNotificationPermissionsAsync: async () => permissionResponse(false, true),
        }}
        timezone="UTC"
      />,
    );

    await fireEvent.press(screen.getByText('Allow & Continue →'));
    await waitFor(() => expect(screen.getByText('Open system settings')).toBeTruthy());
    await fireEvent.press(screen.getByText('Open system settings'));
    await waitFor(() => expect(openSettings).toHaveBeenCalled());
    expect(fake.getCurrent()?.notificationsEnabled).toBe(false);
    expect(fake.getCurrent()?.microphonePermissionState).toBe('blocked');
    openSettings.mockRestore();
  });

  it('shows the ready confirmation after voice setup without completing onboarding yet', async () => {
    const fake = createFakePreferencesRepository();
    const preferences = mergeAppPreferences(
      createDefaultAppPreferences(now, 'UTC'),
      { onboardingStage: 'voice', microphonePermissionState: 'granted' },
      now,
    );
    await fake.repository.save(preferences);
    useSessionStore.getState().setAppPreferences(preferences);
    let voiceProfile: VoiceProfile | null = null;
    const voiceProfileRepository = {
      getById: jest.fn(async () => voiceProfile),
      findById: jest.fn(async () => voiceProfile),
      list: jest.fn(async () => []),
      save: jest.fn(async (next: VoiceProfile) => {
        voiceProfile = next;
        return next;
      }),
      deleteById: jest.fn(async () => undefined),
    };
    const screen = await render(
      <OnboardingScreen
        now={() => now}
        repository={fake.repository}
        voiceProfileRepository={voiceProfileRepository}
        speakerProvider={{
          modelVersion: VOICE_MODEL_VERSION,
          embeddingFromFile: async () => [1, 0],
        }}
        voiceSampleRecorder={{
          recordSample: async () => 'cache://sample.m4a',
          discard: async () => undefined,
        }}
      />,
    );

    for (const sample of [1, 2, 3]) {
      await fireEvent.press(screen.getByText(`Record sample ${sample}`));
      await waitFor(() =>
        expect(
          screen.queryByText(sample === 3 ? "You're all set." : `Sample ${sample + 1} of 3`),
        ).toBeTruthy(),
      );
    }

    expect(voiceProfileRepository.save).toHaveBeenCalledTimes(1);
    expect(fake.getCurrent()?.onboardingStage).toBe('ready');
    expect(fake.getCurrent()?.onboardingComplete).toBe(false);
    expect(useSessionStore.getState().onboardingComplete).toBe(false);
  });

  it('greets the user with their schedule and languages on the ready screen', async () => {
    const { screen } = await renderReadyScreen();

    expect(screen.getByText("You're all set.")).toBeTruthy();
    expect(screen.getByText('Daytale will greet you at 8:30 AM every day.')).toBeTruthy();
    expect(screen.getByText('🇬🇧 English')).toBeTruthy();
    expect(screen.getByText('🇳🇵 Nepali')).toBeTruthy();
    expect(screen.getByText('Journal in Nepali')).toBeTruthy();
    expect(screen.getByText('Skip the wait - Go to Today →')).toBeTruthy();
  });

  it('completes onboarding only when the user skips the wait', async () => {
    const { fake, screen } = await renderReadyScreen();

    expect(fake.getCurrent()?.onboardingComplete).toBe(false);
    await fireEvent.press(screen.getByText('Skip the wait - Go to Today →'));

    await waitFor(() => expect(fake.getCurrent()?.onboardingComplete).toBe(true));
    expect(useSessionStore.getState().onboardingComplete).toBe(true);
  });

  describe('ready auto-advance', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('completes onboarding by itself after the celebration delay', async () => {
      const { fake } = await renderReadyScreen();

      await act(async () => {
        jest.advanceTimersByTime(READY_AUTO_ADVANCE_MS - 1);
      });
      expect(fake.getCurrent()?.onboardingComplete).toBe(false);

      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(fake.getCurrent()?.onboardingComplete).toBe(true);
      expect(useSessionStore.getState().onboardingComplete).toBe(true);
      expect(READY_AUTO_ADVANCE_MS).toBe(1700);
    });

    it('clears the timer when the screen unmounts first', async () => {
      const { fake, screen } = await renderReadyScreen();

      await screen.unmount();
      await act(async () => {
        jest.advanceTimersByTime(READY_AUTO_ADVANCE_MS * 2);
      });

      expect(fake.getCurrent()?.onboardingComplete).toBe(false);
    });
  });

  it('resumes on the ready screen after an interrupted launch', () => {
    const ready = mergeAppPreferences(
      createDefaultAppPreferences(now, 'UTC'),
      { onboardingStage: 'ready' },
      now,
    );

    expect(getInitialOnboardingStep(ready)).toBe('ready');
    expect(getInitialOnboardingStep({ ...ready, onboardingComplete: true })).toBe('ready');
    expect(
      getInitialOnboardingStep({ ...ready, onboardingComplete: true, onboardingStage: 'welcome' }),
    ).toBe('voice');
  });
});

function permissionResponse(granted: boolean, canAskAgain: boolean): PermissionResponse {
  return {
    granted,
    canAskAgain,
    expires: 'never',
    status: granted
      ? ('granted' as PermissionResponse['status'])
      : ('denied' as PermissionResponse['status']),
  };
}
