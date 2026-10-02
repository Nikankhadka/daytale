export const PRIMARY_TABS = ['today', 'journal', 'settings'] as const;

export type PrimaryTab = (typeof PRIMARY_TABS)[number];

export const TAB_ROUTE_PATHS: Record<PrimaryTab, `/(tabs)/${PrimaryTab}`> = {
  today: '/(tabs)/today',
  journal: '/(tabs)/journal',
  settings: '/(tabs)/settings',
};

export const VOICE_SETUP_ROUTE_PATH = '/voice-setup';

export const ONBOARDING_ROUTE_PATH = '/onboarding';

/** Journal sub-routes live inside the journal tab so the tab bar stays visible. */
export const JOURNAL_ROUTE_PATHS = {
  list: '/(tabs)/journal',
  detail: '/(tabs)/journal/detail',
  edit: '/(tabs)/journal/edit',
} as const;

/** Settings sub-routes live inside the settings tab so the tab bar stays visible. */
export const SETTINGS_ROUTE_PATHS = {
  root: '/(tabs)/settings',
  schedule: '/(tabs)/settings/schedule',
  languages: '/(tabs)/settings/languages',
  privacy: '/(tabs)/settings/privacy',
} as const;

export function routeForOnboardingState(
  onboardingComplete: boolean,
): typeof ONBOARDING_ROUTE_PATH | '/(tabs)/today' {
  return onboardingComplete ? '/(tabs)/today' : ONBOARDING_ROUTE_PATH;
}
