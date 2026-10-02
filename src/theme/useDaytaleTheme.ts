import { useSessionStore } from '../state/session';
import {
  DAYTALE_COLORS,
  DAYTALE_FONT_ROLES,
  DAYTALE_MOTION,
  DAYTALE_RADII,
  DAYTALE_SHADOWS,
  DAYTALE_SPACING,
  DAYTALE_TYPOGRAPHY,
} from './tokens';

export function useDaytaleTheme() {
  const mode = useSessionStore((state) => state.appPreferences?.theme ?? 'light');
  const reducedMotion = useSessionStore((state) => state.appPreferences?.reducedMotion ?? false);

  return {
    scheme: mode,
    colors: DAYTALE_COLORS[mode],
    spacing: DAYTALE_SPACING,
    radii: DAYTALE_RADII,
    typography: DAYTALE_TYPOGRAPHY,
    fontRoles: DAYTALE_FONT_ROLES,
    shadows: DAYTALE_SHADOWS[mode],
    motion: DAYTALE_MOTION,
    reducedMotion,
  };
}
