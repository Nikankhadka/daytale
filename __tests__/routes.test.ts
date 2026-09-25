import { PRIMARY_TABS, routeForOnboardingState, TAB_ROUTE_PATHS } from '../src/navigation/routes';

describe('primary routes', () => {
  it('exposes exactly the three product tabs', () => {
    expect(PRIMARY_TABS).toEqual(['today', 'journal', 'settings']);
    expect(Object.values(TAB_ROUTE_PATHS)).toEqual([
      '/(tabs)/today',
      '/(tabs)/journal',
      '/(tabs)/settings',
    ]);
  });

  it('guards direct tab links until onboarding is complete', () => {
    expect(routeForOnboardingState(false)).toBe('/onboarding');
    expect(routeForOnboardingState(true)).toBe('/(tabs)/today');
  });
});
