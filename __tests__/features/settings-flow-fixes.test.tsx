import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { LanguagesSettingsScreen } from '../../src/features/settings/LanguagesSettingsScreen';
import { PrivacySettingsScreen } from '../../src/features/settings/PrivacySettingsScreen';
import { SettingsHubScreen } from '../../src/features/settings/SettingsHubScreen';
import { createDefaultAppPreferences } from '../../src/features/preferences';
import { useSessionStore } from '../../src/state/session';
import type { AppPreferences } from '../../src/storage/types';

const mockGetBootstrappedStorage = jest.fn();

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});
jest.mock('../../src/storage/bootstrap', () => ({
  getBootstrappedStorage: () => mockGetBootstrappedStorage(),
}));

function storageWithPreferences(save: jest.Mock) {
  return {
    database: {},
    repositories: {
      appPreferences: {
        getById: jest.fn(async () => null),
        save,
      },
      voiceProfiles: {
        getById: jest.fn(async () => null),
        findById: jest.fn(async () => null),
        list: jest.fn(async () => []),
        save: jest.fn(),
        deleteById: jest.fn(),
      },
    },
  };
}

function setPreferences(patch: Partial<AppPreferences> = {}) {
  const preferences = createDefaultAppPreferences('2026-03-01T00:00:00.000Z', 'UTC');
  useSessionStore.getState().setAppPreferences({ ...preferences, ...patch });
}

describe('settings flow feedback', () => {
  beforeEach(() => {
    useSessionStore.getState().resetSession();
    mockGetBootstrappedStorage.mockReset();
  });

  it('reports a failed preference save on the settings hub', async () => {
    setPreferences();
    mockGetBootstrappedStorage.mockReturnValue(
      storageWithPreferences(
        jest.fn(async () => {
          throw new Error('disk full');
        }),
      ) as never,
    );

    const screen = await render(<SettingsHubScreen />);
    await fireEvent.changeText(screen.getByLabelText('First name'), 'Luna');

    await waitFor(() =>
      expect(
        screen.getByText('That preference could not be saved. Please try again.'),
      ).toBeTruthy(),
    );
  });

  it('refuses to deselect the last spoken language and explains why', async () => {
    setPreferences({ spokenLanguages: ['en'], journalLanguage: 'en' });
    mockGetBootstrappedStorage.mockReturnValue(storageWithPreferences(jest.fn()) as never);

    const screen = await render(<LanguagesSettingsScreen />);
    await fireEvent.press(screen.getByRole('checkbox', { name: /English/ }));

    await waitFor(() =>
      expect(screen.getByText('Choose at least one spoken language.')).toBeTruthy(),
    );
    expect(useSessionStore.getState().appPreferences?.spokenLanguages).toEqual(['en']);
  });

  it('reports when system settings cannot be opened', async () => {
    setPreferences();
    mockGetBootstrappedStorage.mockReturnValue(storageWithPreferences(jest.fn()) as never);
    const openSettings = jest.spyOn(Linking, 'openSettings').mockRejectedValue(new Error('nope'));

    const screen = await render(<PrivacySettingsScreen />);
    await fireEvent.press(screen.getByText('Permissions'));

    await waitFor(() =>
      expect(screen.getByText('System settings could not be opened.')).toBeTruthy(),
    );
    openSettings.mockRestore();
  });
});
