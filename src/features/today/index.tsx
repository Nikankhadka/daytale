import { StyleSheet, Text } from 'react-native';

import { useSessionStore } from '../../state/session';
import { ScreenScaffold } from '../../shared/ui/ScreenScaffold';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';

export function TodayScreen() {
  const preferences = useSessionStore((state) => state.appPreferences);
  const { colors, typography } = useDaytaleTheme();
  const schedule = preferences
    ? `${preferences.scheduleStartLocal} to ${preferences.scheduleEndLocal}`
    : 'your daily window';

  return (
    <ScreenScaffold
      title="Your day, held gently"
      description="A quiet place to begin, record, and return to what mattered."
      mascotState="sleeping"
    >
      <Text style={[typography.heading, styles.heading, { color: colors.ink }]}>Today</Text>
      <Text style={[typography.body, { color: colors.muted }]}>
        Your recording window: {schedule}
      </Text>
      <Text style={[typography.body, styles.empty, { color: colors.faint }]}>
        Nothing recorded yet.
      </Text>
    </ScreenScaffold>
  );
}

export const TodayPlaceholder = TodayScreen;

const styles = StyleSheet.create({
  heading: { marginTop: 8 },
  empty: { marginTop: 32, textAlign: 'center' },
});
