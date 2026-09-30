import { Redirect, Tabs, useRouter } from 'expo-router';
import * as React from 'react';

import { subscribeNotificationTaps } from '../../src/features/recording/notifications';
import { useRecordingReconciliation } from '../../src/features/recording/useRecordingEngine';
import { TAB_ROUTE_PATHS } from '../../src/navigation/routes';
import { useSessionStore } from '../../src/state/session';
import { useDaytaleTheme } from '../../src/theme/useDaytaleTheme';

export default function TabsLayout() {
  const onboardingComplete = useSessionStore((state) => state.onboardingComplete);
  const { colors } = useDaytaleTheme();
  const router = useRouter();
  useRecordingReconciliation();
  React.useEffect(
    () => subscribeNotificationTaps(() => router.navigate(TAB_ROUTE_PATHS.today)),
    [router],
  );
  if (!onboardingComplete) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
      }}
    >
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="journal" options={{ title: 'Journal' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
