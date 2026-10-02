import { Redirect } from 'expo-router';

import { OnboardingScreen } from '../src/features/onboarding';
import { routeForOnboardingState } from '../src/navigation/routes';
import { useSessionStore } from '../src/state/session';

export default function OnboardingRoute() {
  const onboardingComplete = useSessionStore((state) => state.onboardingComplete);
  return onboardingComplete ? (
    <Redirect href={routeForOnboardingState(true)} />
  ) : (
    <OnboardingScreen />
  );
}
