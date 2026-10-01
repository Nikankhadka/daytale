import { act, renderHook } from '@testing-library/react-native';

import { createDefaultAppPreferences } from '../../src/features/preferences';
import { useSessionStore } from '../../src/state/session';
import { useDaytaleTheme } from '../../src/theme/useDaytaleTheme';

const now = '2026-10-01T00:00:00.000Z';

describe('theme mode', () => {
  beforeEach(() => {
    useSessionStore.getState().resetSession();
  });

  it('defaults new preferences to the light theme', () => {
    expect(createDefaultAppPreferences(now, 'UTC').theme).toBe('light');
  });

  it('resolves light with no stored preference and dark after a stored dark preference', async () => {
    const { result } = await renderHook(() => useDaytaleTheme());
    expect(result.current.scheme).toBe('light');

    await act(async () => {
      useSessionStore
        .getState()
        .setAppPreferences({ ...createDefaultAppPreferences(now, 'UTC'), theme: 'dark' });
    });

    expect(result.current.scheme).toBe('dark');
  });
});
