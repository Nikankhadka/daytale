import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { VOICE_PROFILE_ID, VOICE_MODEL_VERSION } from '../../src/features/voice/enrollment';
import { PreferencesSettingsScreen } from '../../src/features/preferences';
import { VOICE_SETUP_ROUTE_PATH } from '../../src/navigation/routes';
import type { AppPreferences, VoiceProfile } from '../../src/storage/types';

const mockPush = jest.fn();
const mockGetBootstrappedStorage = jest.fn();

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});
jest.mock('../../src/storage/bootstrap', () => ({
  bootstrapStorage: jest.fn(),
  getBootstrappedStorage: () => mockGetBootstrappedStorage(),
}));

const now = '2026-09-26T00:00:00.000Z';
const readyProfile: VoiceProfile = {
  id: VOICE_PROFILE_ID,
  status: 'ready',
  sampleCount: 3,
  encryptedEmbeddingBlob: 'daytale-voice-v1.e30=',
  modelVersion: VOICE_MODEL_VERSION,
  createdAt: now,
  updatedAt: now,
};

let appPreferencesRepository: {
  getById: jest.Mock;
  save: jest.Mock;
};

function bootstrapWithProfile(initial: VoiceProfile | null) {
  let profile = initial;
  let preferences: AppPreferences | null = null;
  const voiceProfiles = {
    getById: jest.fn(async () => profile),
    findById: jest.fn(async () => profile),
    list: jest.fn(async () => (profile === null ? [] : [profile])),
    save: jest.fn(async (next: VoiceProfile) => next),
    deleteById: jest.fn(async () => {
      profile = null;
    }),
  };
  appPreferencesRepository = {
    getById: jest.fn(async () => preferences),
    save: jest.fn(async (next: AppPreferences) => {
      preferences = next;
      return next;
    }),
  };
  mockGetBootstrappedStorage.mockReturnValue({
    database: {},
    repositories: { voiceProfiles, appPreferences: appPreferencesRepository },
  });
  return voiceProfiles;
}

describe('settings voice profile card', () => {
  it('shows a ready profile with its sample count above the delete-all section', async () => {
    bootstrapWithProfile(readyProfile);
    const screen = await render(<PreferencesSettingsScreen />);

    await waitFor(() => expect(screen.getByText('Voice profile ready - 3 samples')).toBeTruthy());
    expect(screen.getByText('Voice profile')).toBeTruthy();
    expect(screen.getByText('Re-record voice')).toBeTruthy();
    expect(screen.getByText('Delete voice profile')).toBeTruthy();
    expect(screen.getByText('Delete all data')).toBeTruthy();
  });

  it('shows a not-set-up state without offering deletion', async () => {
    bootstrapWithProfile(null);
    const screen = await render(<PreferencesSettingsScreen />);

    await waitFor(() => expect(screen.getByText('Voice profile not set up')).toBeTruthy());
    expect(screen.getByText('Re-record voice')).toBeTruthy();
    expect(screen.queryByText('Delete voice profile')).toBeNull();
  });

  it('asks for confirmation, supports cancelling, and then deletes the profile', async () => {
    const repository = bootstrapWithProfile(readyProfile);
    const screen = await render(<PreferencesSettingsScreen />);
    await waitFor(() => expect(screen.getByText('Voice profile ready - 3 samples')).toBeTruthy());

    await fireEvent.press(screen.getByText('Delete voice profile'));
    expect(screen.getByLabelText('Delete voice profile confirmation')).toBeTruthy();
    expect(repository.deleteById).not.toHaveBeenCalled();

    await fireEvent.press(screen.getAllByText('Cancel')[0]);
    expect(screen.queryByLabelText('Delete voice profile confirmation')).toBeNull();
    expect(repository.deleteById).not.toHaveBeenCalled();
    expect(screen.getByText('Voice profile ready - 3 samples')).toBeTruthy();

    await fireEvent.press(screen.getByText('Delete voice profile'));
    await fireEvent.press(screen.getByText('Confirm delete voice profile'));

    await waitFor(() => expect(screen.getByText('Voice profile not set up')).toBeTruthy());
    expect(repository.deleteById).toHaveBeenCalledTimes(1);
    expect(repository.deleteById).toHaveBeenCalledWith(VOICE_PROFILE_ID);
    expect(screen.queryByLabelText('Delete voice profile confirmation')).toBeNull();
  });

  it('keeps the profile and reports the problem when deletion fails', async () => {
    const repository = bootstrapWithProfile(readyProfile);
    repository.deleteById.mockRejectedValueOnce(new Error('database locked'));
    const screen = await render(<PreferencesSettingsScreen />);
    await waitFor(() => expect(screen.getByText('Voice profile ready - 3 samples')).toBeTruthy());

    await fireEvent.press(screen.getByText('Delete voice profile'));
    await fireEvent.press(screen.getByText('Confirm delete voice profile'));

    await waitFor(() =>
      expect(
        screen.getByText('Your voice profile could not be deleted. Nothing was changed.'),
      ).toBeTruthy(),
    );
    expect(screen.getByText('Voice profile ready - 3 samples')).toBeTruthy();
  });

  it('opens the dedicated voice setup route to re-record', async () => {
    bootstrapWithProfile(readyProfile);
    const screen = await render(<PreferencesSettingsScreen />);
    await waitFor(() => expect(screen.getByText('Voice profile ready - 3 samples')).toBeTruthy());

    await fireEvent.press(screen.getByText('Re-record voice'));

    expect(mockPush).toHaveBeenCalledWith(VOICE_SETUP_ROUTE_PATH);
    expect(VOICE_SETUP_ROUTE_PATH).toBe('/voice-setup');
  });

  it('toggles dark mode and persists dark then light through the preferences path', async () => {
    bootstrapWithProfile(readyProfile);
    const screen = await render(<PreferencesSettingsScreen />);
    await waitFor(() => expect(screen.getByText('Voice profile ready - 3 samples')).toBeTruthy());

    expect(screen.getByLabelText('Dark mode').props.value).toBe(false);

    await fireEvent(screen.getByLabelText('Dark mode'), 'valueChange', true);
    await waitFor(() =>
      expect(appPreferencesRepository.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ theme: 'dark' }),
      ),
    );

    await fireEvent(screen.getByLabelText('Dark mode'), 'valueChange', false);
    await waitFor(() =>
      expect(appPreferencesRepository.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ theme: 'light' }),
      ),
    );
  });

  it.each([
    ['the web fork has no repositories', { database: null, repositories: null }],
    ['storage has not bootstrapped', null],
  ])('shows an unavailable state when %s', async (_, storage) => {
    mockGetBootstrappedStorage.mockReturnValue(storage);
    const screen = await render(<PreferencesSettingsScreen />);

    expect(screen.getByText('Voice profiles are not available on this platform.')).toBeTruthy();
    expect(screen.queryByText('Re-record voice')).toBeNull();
    expect(screen.queryByText('Delete voice profile')).toBeNull();
  });
});
