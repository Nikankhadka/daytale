import { Redirect, useRouter } from 'expo-router';

import { VoiceSetupScreen } from '../src/features/voice';
import { routeForOnboardingState, TAB_ROUTE_PATHS } from '../src/navigation/routes';
import { useSessionStore } from '../src/state/session';

export default function VoiceSetupRoute() {
  const router = useRouter();
  const onboardingComplete = useSessionStore((state) => state.onboardingComplete);
  if (!onboardingComplete) {
    return <Redirect href={routeForOnboardingState(false)} />;
  }

  return (
    <VoiceSetupScreen
      onComplete={() =>
        router.canGoBack() ? router.back() : router.replace(TAB_ROUTE_PATHS.settings)
      }
    />
  );
}
