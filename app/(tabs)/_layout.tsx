import { Redirect, Tabs, useRouter } from 'expo-router';
import * as React from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { subscribeNotificationTaps } from '../../src/features/recording/notifications';
import { useRecordingReconciliation } from '../../src/features/recording/useRecordingEngine';
import { routeForOnboardingState, TAB_ROUTE_PATHS } from '../../src/navigation/routes';
import { useSessionStore } from '../../src/state/session';
import { useDaytaleTheme } from '../../src/theme/useDaytaleTheme';

type TabIconName = 'today' | 'journal' | 'settings';

const TAB_ICONS: Record<TabIconName, { path: string; circle?: { r: number } }> = {
  today: {
    circle: { r: 4 },
    path: 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  },
  journal: {
    path: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 0 4 5.5v14zM4 19.5A2.5 2.5 0 0 0 6.5 22H20',
  },
  settings: {
    circle: { r: 3 },
    path: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  },
};

/** Prototype tab glyphs: 22px, 2px stroke, inheriting the active/inactive tint. */
function TabIcon({ name, color }: { name: TabIconName; color: ColorValue }) {
  const icon = TAB_ICONS[name];
  return (
    <Svg
      fill="none"
      height={22}
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={22}
    >
      {icon.circle ? <Circle cx={12} cy={12} r={icon.circle.r} /> : null}
      <Path d={icon.path} />
    </Svg>
  );
}

export default function TabsLayout() {
  const onboardingComplete = useSessionStore((state) => state.onboardingComplete);
  const { colors, fontRoles, spacing, typography } = useDaytaleTheme();
  const router = useRouter();
  useRecordingReconciliation();
  React.useEffect(
    () => subscribeNotificationTaps(() => router.navigate(TAB_ROUTE_PATHS.today)),
    [router],
  );
  if (!onboardingComplete) {
    return <Redirect href={routeForOnboardingState(false)} />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.appCherry,
        tabBarInactiveTintColor: colors.appMuted,
        tabBarStyle: {
          backgroundColor: colors.appSurface,
          borderTopColor: colors.appLine,
          borderTopWidth: 1,
          paddingTop: spacing.sm,
        },
        tabBarLabelStyle: { fontFamily: fontRoles.uiStrong, fontSize: typography.caption.fontSize },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => <TabIcon color={color} name="today" />,
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Journal',
          tabBarIcon: ({ color }) => <TabIcon color={color} name="journal" />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon color={color} name="settings" />,
        }}
      />
    </Tabs>
  );
}
