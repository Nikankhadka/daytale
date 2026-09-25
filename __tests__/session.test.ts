import { INITIAL_SESSION_STATE, useSessionStore } from '../src/state/session';
import { createDefaultAppPreferences } from '../src/features/preferences';

describe('session store', () => {
  beforeEach(() => {
    useSessionStore.getState().resetSession();
  });

  it('starts at Today before onboarding is complete', () => {
    expect(useSessionStore.getState()).toMatchObject(INITIAL_SESSION_STATE);
  });

  it('tracks tab selection and onboarding completion', () => {
    useSessionStore.getState().setActiveTab('journal');
    useSessionStore.getState().completeOnboarding();

    expect(useSessionStore.getState()).toMatchObject({
      activeTab: 'journal',
      onboardingComplete: true,
    });
  });

  it('hydrates and resets persisted app preferences with onboarding state', () => {
    const preferences = createDefaultAppPreferences('2026-09-26T00:00:00.000Z', 'UTC');
    useSessionStore.getState().setAppPreferences(preferences);

    expect(useSessionStore.getState().appPreferences).toEqual(preferences);
    expect(useSessionStore.getState().onboardingComplete).toBe(false);

    useSessionStore.getState().resetSession();
    expect(useSessionStore.getState().appPreferences).toBeNull();
  });
});
