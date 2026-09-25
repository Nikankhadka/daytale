import { cleanup, render } from '@testing-library/react-native';

import {
  DaytaleMascot,
  getMascotMotionPlan,
  type MascotState,
} from '../../src/shared/ui/DaytaleMascot';
import { useSessionStore } from '../../src/state/session';
import { createDefaultAppPreferences } from '../../src/features/preferences';
import { DAYTALE_FONT_FILES } from '../../src/theme/fonts';
import { DAYTALE_FONT_ROLES, DAYTALE_TYPOGRAPHY } from '../../src/theme/tokens';

const mascotStates: MascotState[] = [
  'sleeping',
  'waking',
  'ready',
  'listening',
  'paused',
  'thinking',
  'writing',
  'celebrating',
  'error',
];

describe('prototype visual system', () => {
  afterEach(() => {
    cleanup();
    useSessionStore.getState().resetSession();
  });

  it('renders distinct artwork parts for every mascot state', async () => {
    const screen = await render(<DaytaleMascot state="sleeping" />);

    for (const state of mascotStates) {
      await screen.rerender(<DaytaleMascot state={state} />);
      expect(screen.getByTestId(`daytale-mascot-${state}-art`)).toBeTruthy();
    }
  });

  it('disables the looping mascot effect when reduced motion is enabled', async () => {
    expect(getMascotMotionPlan('ready', false)).toMatchObject({ looping: true });
    expect(getMascotMotionPlan('ready', true)).toEqual({ looping: false, peakScale: 1 });

    const preferences = createDefaultAppPreferences('2026-09-26T00:00:00.000Z', 'UTC');
    useSessionStore.getState().setAppPreferences({ ...preferences, reducedMotion: true });
    const screen = await render(<DaytaleMascot state="listening" />);

    expect(screen.getByTestId('daytale-mascot').props.accessibilityValue).toEqual({
      text: 'Reduced motion',
    });
  });

  it('applies concrete bundled font files to every prototype role', () => {
    expect(Object.keys(DAYTALE_FONT_FILES)).toEqual(
      expect.arrayContaining([
        'Fredoka_600SemiBold',
        'Figtree_400Regular',
        'Figtree_600SemiBold',
        'Newsreader_400Regular',
        'IBMPlexMono_400Regular',
      ]),
    );
    expect(DAYTALE_TYPOGRAPHY.title.fontFamily).toBe(DAYTALE_FONT_ROLES.display);
    expect(DAYTALE_TYPOGRAPHY.body.fontFamily).toBe(DAYTALE_FONT_ROLES.reading);
    expect(DAYTALE_TYPOGRAPHY.label.fontFamily).toBe(DAYTALE_FONT_ROLES.uiStrong);
    expect(DAYTALE_FONT_ROLES.mono).toBe('IBMPlexMono_400Regular');
  });
});
