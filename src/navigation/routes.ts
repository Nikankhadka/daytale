export const PRIMARY_TABS = ['today', 'journal', 'settings'] as const;

export type PrimaryTab = (typeof PRIMARY_TABS)[number];

export const TAB_ROUTE_PATHS: Record<PrimaryTab, `/(tabs)/${PrimaryTab}`> = {
  today: '/(tabs)/today',
  journal: '/(tabs)/journal',
  settings: '/(tabs)/settings',
};

export function routeForOnboardingState(
  onboardingComplete: boolean,
): '/onboarding' | '/(tabs)/today' {
  return onboardingComplete ? '/(tabs)/today' : '/onboarding';
}
