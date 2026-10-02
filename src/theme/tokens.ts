/**
 * Daytale design tokens.
 *
 * Values are derived from the authoritative prototype `prototype/tokens.css` and
 * `prototype/index.html`. The prototype expresses colours in OKLCH; React Native
 * has no `oklch()`, so each token is the exact sRGB conversion.
 *
 * Token names mirror the prototype `--color-app-*` names. Do not introduce
 * ad-hoc colours or a second palette; add to these tokens instead.
 */
export const DAYTALE_COLORS = {
  light: {
    appPaper: '#FFFFFF',
    appSurface: '#FFFFFF',
    appInk: '#0B0B0B',
    appMuted: '#555555',
    appFaint: '#9E9E9E',
    appLine: '#E4E4E4',
    appSakuraMist: '#FBF2F6',
    appBlossom: '#FCE3EE',
    appCherry: '#F75D59',
    appCherryHover: '#D74745',
    appOnPrimary: '#FFFFFF',
    appSun: '#FFB09B',
    appSunDeep: '#F47B74',
    appLeaf: '#569459',
    appLeafSoft: '#DAEFDA',
    appCheek: '#F19E97',
    appRecording: '#D73337',
    appRecordingSoft: '#FFEDEB',
    appPause: '#BD821A',
    appPauseSoft: '#FEEFDC',
    appInkSoft: '#2E2E2E',
    focus: '#F75D59',
  },
  dark: {
    appPaper: '#040303',
    appSurface: '#110D0E',
    appInk: '#F8F4F4',
    appMuted: '#A0999B',
    appFaint: '#595355',
    appLine: '#2F2629',
    appSakuraMist: '#1F181B',
    appBlossom: '#2B1A1D',
    appCherry: '#F75D59',
    appCherryHover: '#FD736D',
    appOnPrimary: '#040303',
    appSun: '#FFBC9D',
    appSunDeep: '#F19485',
    appLeaf: '#8ABD8B',
    appLeafSoft: '#1E311F',
    appCheek: '#E69399',
    appRecording: '#ED756E',
    appRecordingSoft: '#2C1A18',
    appPause: '#E4AF72',
    appPauseSoft: '#292014',
    appInkSoft: '#DDD5D8',
    focus: '#F75D59',
  },
} as const;

export const DAYTALE_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const DAYTALE_RADII = {
  control: 12,
  card: 16,
  pill: 999,
  sheet: 26,
} as const;

export const DAYTALE_FONT_ROLES = {
  display: 'Fredoka_600SemiBold',
  ui: 'Figtree_400Regular',
  uiStrong: 'Figtree_600SemiBold',
  uiBold: 'Figtree_700Bold',
  reading: 'Newsreader_400Regular',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

/**
 * Type roles from `prototype/index.html`. The family file already encodes the
 * weight, so no `fontWeight` is set; this avoids Android dropping a custom
 * family when a synthetic weight is requested.
 */
export const DAYTALE_TYPOGRAPHY = {
  eyebrow: {
    fontFamily: DAYTALE_FONT_ROLES.mono,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 1.05,
  },
  title: {
    fontFamily: DAYTALE_FONT_ROLES.display,
    fontSize: 23,
    lineHeight: 29,
    letterSpacing: -0.23,
  },
  titleLarge: {
    fontFamily: DAYTALE_FONT_ROLES.display,
    fontSize: 27,
    lineHeight: 34,
    letterSpacing: -0.27,
  },
  titleSmall: {
    fontFamily: DAYTALE_FONT_ROLES.display,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.19,
  },
  heading: {
    fontFamily: DAYTALE_FONT_ROLES.display,
    fontSize: 20,
    lineHeight: 25,
  },
  body: {
    fontFamily: DAYTALE_FONT_ROLES.ui,
    fontSize: 15,
    lineHeight: 22,
  },
  sub: {
    fontFamily: DAYTALE_FONT_ROLES.ui,
    fontSize: 13.5,
    lineHeight: 20,
  },
  reading: {
    fontFamily: DAYTALE_FONT_ROLES.reading,
    fontSize: 16,
    lineHeight: 28,
  },
  label: {
    fontFamily: DAYTALE_FONT_ROLES.uiStrong,
    fontSize: 13.5,
    lineHeight: 18,
  },
  button: {
    fontFamily: DAYTALE_FONT_ROLES.uiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  chip: {
    fontFamily: DAYTALE_FONT_ROLES.uiStrong,
    fontSize: 13,
    lineHeight: 17,
  },
  caption: {
    fontFamily: DAYTALE_FONT_ROLES.ui,
    fontSize: 12,
    lineHeight: 16,
  },
  fieldLabel: {
    fontFamily: DAYTALE_FONT_ROLES.uiBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.24,
  },
  timer: {
    fontFamily: DAYTALE_FONT_ROLES.monoMedium,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: 0.9,
  },
  monoLabel: {
    fontFamily: DAYTALE_FONT_ROLES.mono,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
  },
} as const;

/**
 * Motion from `prototype/tokens.css`. Easing values are cubic-bezier control
 * points for `Easing.bezier` in Reanimated.
 */
export const DAYTALE_MOTION = {
  easeOut: [0.22, 1, 0.36, 1],
  easeInOut: [0.65, 0, 0.35, 1],
  fast: 120,
  normal: 200,
  mascotBreath: 1400,
  pulse: 700,
  waveBase: 600,
} as const;

/**
 * React Native approximates the prototype's two-layer `--shadow-soft` with a
 * single shadow plus Android elevation; the inline 1px layer is not portable.
 */
export const DAYTALE_SHADOWS = {
  light: {
    shadowColor: DAYTALE_COLORS.light.appCherry,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 2,
  },
  dark: {
    shadowColor: '#080506',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 2,
  },
} as const;

export type DaytaleColorScheme = keyof typeof DAYTALE_COLORS;
