import { INITIAL_SESSION_STATE, useSessionStore } from '../src/state/session';

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
});
