import { PRIMARY_TABS, TAB_ROUTE_PATHS } from '../src/navigation/routes';

describe('primary routes', () => {
  it('exposes exactly the three product tabs', () => {
    expect(PRIMARY_TABS).toEqual(['today', 'journal', 'settings']);
    expect(Object.values(TAB_ROUTE_PATHS)).toEqual([
      '/(tabs)/today',
      '/(tabs)/journal',
      '/(tabs)/settings',
    ]);
  });
});
