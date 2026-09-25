import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PermissionResponse } from 'expo';
import { Linking } from 'react-native';

import {
  createDefaultAppPreferences,
  mergeAppPreferences,
  persistAppPreferences,
  type PreferencesRepository,
} from '../../src/features/preferences';
import { getInitialOnboardingStep, OnboardingScreen } from '../../src/features/onboarding';
import { microphonePermissionState } from '../../src/features/permissions';
import { useSessionStore } from '../../src/state/session';
import type { AppPreferences } from '../../src/storage/types';

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
    await fireEvent.press(screen.getByText('Get started'));
    await waitFor(() => expect(screen.getByText('Which languages feel like home?')).toBeTruthy());
    await waitFor(() => expect(fake.getCurrent()?.firstName).toBe('Luna'));
    expect(fake.getCurrent()?.onboardingStage).toBe('languages');
    await fireEvent.press(screen.getByText('Continue'));
    await waitFor(() =>
      expect(screen.getByText('When should Daytale make space for you?')).toBeTruthy(),
    );
    expect(fake.getCurrent()?.spokenLanguages).toEqual(['en']);
    expect(fake.getCurrent()?.onboardingStage).toBe('schedule');

    await fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(screen.getByText('Privacy and permissions')).toBeTruthy());
    expect(fake.getCurrent()?.scheduleStartLocal).toBe('07:00');
    expect(fake.getCurrent()?.onboardingStage).toBe('privacy');

    await fireEvent.press(screen.getByText('Allow microphone and continue'));
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

    await fireEvent.press(screen.getByText('Allow notifications'));
    await waitFor(() => expect(screen.getByText(/Notifications are off/)).toBeTruthy());
    await fireEvent.press(screen.getByText('Allow microphone and continue'));
    await waitFor(() => expect(screen.getByText('Open system settings')).toBeTruthy());
    await fireEvent.press(screen.getByText('Open system settings'));
    await waitFor(() => expect(openSettings).toHaveBeenCalled());
    expect(fake.getCurrent()?.notificationsEnabled).toBe(false);
    expect(fake.getCurrent()?.microphonePermissionState).toBe('blocked');
    openSettings.mockRestore();
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
