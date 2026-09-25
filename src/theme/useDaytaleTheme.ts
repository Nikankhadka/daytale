import { useColorScheme } from 'react-native';

import { useSessionStore } from '../state/session';
import {
  DAYTALE_COLORS,
  DAYTALE_FONT_ROLES,
  DAYTALE_RADII,
  DAYTALE_SPACING,
  DAYTALE_TYPOGRAPHY,
  type DaytaleColorScheme,
} from './tokens';

export function useDaytaleTheme() {
  const systemScheme = useColorScheme();
  const requestedTheme = useSessionStore((state) => state.appPreferences?.theme ?? 'system');
  const reducedMotion = useSessionStore((state) => state.appPreferences?.reducedMotion ?? false);
  const scheme: DaytaleColorScheme =
    requestedTheme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : requestedTheme;

  return {
    scheme,
    colors: DAYTALE_COLORS[scheme],
    spacing: DAYTALE_SPACING,
    radii: DAYTALE_RADII,
    typography: DAYTALE_TYPOGRAPHY,
    fontRoles: DAYTALE_FONT_ROLES,
    reducedMotion,
  };
}
