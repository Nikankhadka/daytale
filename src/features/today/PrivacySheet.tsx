import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { BREAK_LABELS, type BreakChoice } from '../recording/breaks';
import { withAlpha } from '../../theme/color';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';
import { LineIcon } from './views';

type PrivacySheetProps = {
  visible: boolean;
  onChoose: (choice: BreakChoice) => void;
  onStopForToday: () => void;
  onCancel: () => void;
};

const BREAK_CHOICES: BreakChoice[] = ['15m', '1h', 'manual'];

/** One-tap privacy break as a sheet over the running session, so the recording stays in view. */
export function PrivacySheet({ visible, onChoose, onStopForToday, onCancel }: PrivacySheetProps) {
  const { colors, radii, reducedMotion, typography } = useDaytaleTheme();
  return (
    <Modal
      animationType={reducedMotion ? 'none' : 'slide'}
      onRequestClose={onCancel}
      transparent
      visible={visible}
    >
      <View style={[styles.scrim, { backgroundColor: withAlpha(colors.appInk, 0.42) }]}>
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.appPaper,
              borderTopLeftRadius: radii.sheet,
              borderTopRightRadius: radii.sheet,
            },
          ]}
          testID="privacy-sheet"
        >
          <View style={[styles.handle, { backgroundColor: colors.appLine }]} />
          <Text
            accessibilityRole="header"
            style={[styles.title, typography.titleSmall, { color: colors.appInk }]}
          >
            Take a little privacy break?
          </Text>
          {BREAK_CHOICES.map((choice) => (
            <Pressable
              key={choice}
              accessibilityRole="button"
              onPress={() => onChoose(choice)}
              style={[styles.option, { borderColor: colors.appLine }]}
            >
              <View style={styles.optionLabel}>
                <LineIcon name="clock" color={colors.appInk} />
                <Text style={[typography.label, { color: colors.appInk }]}>
                  {BREAK_LABELS[choice]}
                </Text>
              </View>
              <Text
                importantForAccessibility="no"
                style={[typography.label, { color: colors.appMuted }]}
              >
                {'›'}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={onStopForToday}
            style={[styles.option, styles.lastOption, { borderColor: colors.appLine }]}
          >
            <View style={styles.optionLabel}>
              <LineIcon name="clock" color={colors.appInk} />
              <Text style={[typography.label, { color: colors.appInk }]}>Stop for today</Text>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}>
            <Text style={[typography.label, { color: colors.appMuted }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    paddingBottom: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  handle: {
    alignSelf: 'center',
    borderRadius: 2,
    height: 4,
    marginBottom: 16,
    marginTop: 8,
    width: 38,
  },
  title: { marginBottom: 8, textAlign: 'center' },
  option: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 4,
  },
  optionLabel: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  lastOption: { borderBottomWidth: 0 },
  cancel: { alignItems: 'center', justifyContent: 'center', marginTop: 12, minHeight: 48 },
});
