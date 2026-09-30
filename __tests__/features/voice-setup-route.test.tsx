import { fireEvent, render } from '@testing-library/react-native';

import VoiceSetupRoute from '../../app/voice-setup';
import { useSessionStore } from '../../src/state/session';

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;

jest.mock('expo-router', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  return {
    Redirect: ({ href }: { href: string }) =>
      React.createElement(MockText, null, `redirect ${href}`),
    useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }),
  };
});
jest.mock('../../src/features/voice', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  return {
    VoiceSetupScreen: ({ onComplete }: { onComplete: () => void }) =>
      React.createElement(MockText, { onPress: onComplete }, 'finish voice setup'),
  };
});

describe('voice setup route', () => {
  beforeEach(() => {
    useSessionStore.getState().resetSession();
    mockCanGoBack = true;
  });

  it('sends users who have not finished onboarding back to onboarding', async () => {
    const screen = await render(<VoiceSetupRoute />);

    expect(screen.getByText('redirect /onboarding')).toBeTruthy();
    expect(screen.queryByText('finish voice setup')).toBeNull();
  });

  it('goes back to settings when re-recording completes', async () => {
    useSessionStore.setState({ onboardingComplete: true });
    const screen = await render(<VoiceSetupRoute />);

    await fireEvent.press(screen.getByText('finish voice setup'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('falls back to the settings tab when there is nothing to go back to', async () => {
    useSessionStore.setState({ onboardingComplete: true });
    mockCanGoBack = false;
    const screen = await render(<VoiceSetupRoute />);

    await fireEvent.press(screen.getByText('finish voice setup'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/settings');
    expect(mockBack).not.toHaveBeenCalled();
  });
});
