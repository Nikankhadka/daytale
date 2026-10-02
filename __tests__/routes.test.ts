import {
  JOURNAL_ROUTE_PATHS,
  PRIMARY_TABS,
  routeForOnboardingState,
  SETTINGS_ROUTE_PATHS,
  TAB_ROUTE_PATHS,
} from '../src/navigation/routes';

describe('primary routes', () => {
  it('exposes exactly the three product tabs', () => {
    expect(PRIMARY_TABS).toEqual(['today', 'journal', 'settings']);
    expect(Object.values(TAB_ROUTE_PATHS)).toEqual([
      '/(tabs)/today',
      '/(tabs)/journal',
      '/(tabs)/settings',
    ]);
  });

  it('keeps journal and settings sub-routes inside their tab', () => {
    expect(JOURNAL_ROUTE_PATHS).toEqual({
      list: '/(tabs)/journal',
      detail: '/(tabs)/journal/detail',
      edit: '/(tabs)/journal/edit',
    });
    expect(SETTINGS_ROUTE_PATHS).toEqual({
      root: '/(tabs)/settings',
      schedule: '/(tabs)/settings/schedule',
      languages: '/(tabs)/settings/languages',
      privacy: '/(tabs)/settings/privacy',
    });
  });

  it('guards direct tab links until onboarding is complete', () => {
    expect(routeForOnboardingState(false)).toBe('/onboarding');
    expect(routeForOnboardingState(true)).toBe('/(tabs)/today');
  });
});
