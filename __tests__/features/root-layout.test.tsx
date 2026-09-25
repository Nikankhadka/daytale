import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { bootstrapStorage } from '../../src/storage/bootstrap';
import RootLayout from '../../app/_layout';

jest.mock('expo-router', () => ({ Stack: () => null }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});
jest.mock('../../src/theme/fonts', () => ({
  useDaytaleFonts: () => [true, null],
}));
jest.mock('../../src/storage/bootstrap', () => ({
  bootstrapStorage: jest.fn(),
}));

describe('root bootstrap surface', () => {
  it('offers an accessible retry that invokes bootstrap again after failure', async () => {
    const mockedBootstrap = jest.mocked(bootstrapStorage);
    mockedBootstrap.mockRejectedValueOnce(new Error('temporary failure'));
    mockedBootstrap.mockResolvedValueOnce({} as never);

    const screen = await render(<RootLayout />);
    await waitFor(() => expect(screen.getByText('We could not open Daytale')).toBeTruthy());

    const retry = screen.getByRole('button', { name: 'Retry opening Daytale' });
    expect(retry).toBeTruthy();
    await fireEvent.press(retry);

    await waitFor(() => expect(mockedBootstrap).toHaveBeenCalledTimes(2));
  });
});
