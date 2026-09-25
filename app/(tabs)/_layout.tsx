import { Redirect, Tabs } from 'expo-router';

import { useSessionStore } from '../../src/state/session';
import { useDaytaleTheme } from '../../src/theme/useDaytaleTheme';

export default function TabsLayout() {
  const onboardingComplete = useSessionStore((state) => state.onboardingComplete);
  const { colors } = useDaytaleTheme();
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
