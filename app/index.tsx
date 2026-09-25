import { Redirect } from 'expo-router';

import { routeForOnboardingState } from '../src/navigation/routes';
import { useSessionStore } from '../src/state/session';

export default function IndexRoute() {
  const onboardingComplete = useSessionStore((state) => state.onboardingComplete);
  return <Redirect href={routeForOnboardingState(onboardingComplete)} />;
}
