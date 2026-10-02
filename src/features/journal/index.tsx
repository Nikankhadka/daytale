import { StyleSheet, Text } from 'react-native';

import { ScreenScaffold } from '../../shared/ui/ScreenScaffold';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';

export function JournalScreen() {
  const { colors, typography } = useDaytaleTheme();
  return (
    <ScreenScaffold
      title="Your journals"
      description="Finished journals will gather here when the recording ritual is ready."
      mascotState="writing"
    >
      <Text style={[typography.sub, styles.empty, { color: colors.appFaint }]}>
        No journals yet.
      </Text>
    </ScreenScaffold>
  );
}

export const JournalPlaceholder = JournalScreen;

const styles = StyleSheet.create({ empty: { marginTop: 32, textAlign: 'center' } });
