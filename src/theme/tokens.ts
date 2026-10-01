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
    sunDeep: '#e27170',
    success: '#386b54',
    warning: '#9a6a26',
    error: '#a43b46',
    inkSoft: '#5c4550',
    recording: '#c92516',
    recordingSoft: '#ffe1da',
    pause: '#cd9130',
    pauseSoft: '#ffebd2',
    onPrimary: '#ffffff',
  },
  dark: {
    background: '#130e10',
    surface: '#20161a',
    surfaceMuted: '#2e1f25',
    ink: '#f2e9e9',
    muted: '#b5a6ab',
    // Nudged from the requested oklch(63%) to oklch(63.5%) so faint-on-surfaceMuted meets 4.5:1.
    faint: '#93878b',
    line: '#554148',
    primary: '#f29fb2',
    primaryPressed: '#e1859b',
    primarySoft: '#4d2931',
    accent: '#e69399',
    sunDeep: '#f19485',
    success: '#8abd8b',
    warning: '#e4af72',
    error: '#ef9494',
    inkSoft: '#d3c2c8',
    recording: '#ee8679',
    recordingSoft: '#491f1b',
    pause: '#e4af72',
    pauseSoft: '#402c12',
    onPrimary: '#130e10',
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
