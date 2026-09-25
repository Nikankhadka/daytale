export const DAYTALE_COLORS = {
  light: {
    background: '#fffaf8',
    surface: '#ffffff',
    surfaceMuted: '#fff0ed',
    ink: '#3d2730',
    muted: '#725d64',
    faint: '#a88e96',
    line: '#ead9d6',
    primary: '#8f3148',
    primaryPressed: '#72263a',
    primarySoft: '#f6dfe0',
    accent: '#e6a9a8',
    success: '#386b54',
    warning: '#9a6a26',
    error: '#a43b46',
  },
  dark: {
    background: '#24191d',
    surface: '#332328',
    surfaceMuted: '#472d35',
    ink: '#fff4f1',
    muted: '#d4b9bd',
    faint: '#a88f95',
    line: '#5b4149',
    primary: '#f0a4ae',
    primaryPressed: '#ffc1c8',
    primarySoft: '#58343e',
    accent: '#d47e86',
    success: '#9ad2ad',
    warning: '#e4b86d',
    error: '#ff9fa9',
  },
} as const;

export const DAYTALE_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
} as const;

export const DAYTALE_RADII = {
  control: 16,
  card: 20,
  pill: 999,
} as const;

export const DAYTALE_FONT_ROLES = {
  display: 'Fredoka_600SemiBold',
  ui: 'Figtree_400Regular',
  uiStrong: 'Figtree_600SemiBold',
  reading: 'Newsreader_400Regular',
  mono: 'IBMPlexMono_400Regular',
} as const;

export const DAYTALE_TYPOGRAPHY = {
  eyebrow: {
    fontFamily: DAYTALE_FONT_ROLES.uiStrong,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: DAYTALE_FONT_ROLES.display,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700' as const,
  },
  heading: {
    fontFamily: DAYTALE_FONT_ROLES.display,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
  },
  body: {
    fontFamily: DAYTALE_FONT_ROLES.reading,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
  },
  label: {
    fontFamily: DAYTALE_FONT_ROLES.uiStrong,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  caption: {
    fontFamily: DAYTALE_FONT_ROLES.ui,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as const,
  },
} as const;

export type DaytaleColorScheme = keyof typeof DAYTALE_COLORS;
