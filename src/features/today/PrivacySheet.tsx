import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { BREAK_LABELS, type BreakChoice } from '../recording/breaks';
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
  const { colors, fontRoles, reducedMotion, typography } = useDaytaleTheme();
  return (
    <Modal
      animationType={reducedMotion ? 'none' : 'slide'}
      onRequestClose={onCancel}
      transparent
      visible={visible}
    >
      <View style={[styles.scrim, { backgroundColor: 'rgba(61, 39, 48, 0.42)' }]}>
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: colors.background }]}
          testID="privacy-sheet"
        >
          <View style={[styles.handle, { backgroundColor: colors.line }]} />
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: colors.ink, fontFamily: fontRoles.display }]}
          >
            Take a little privacy break?
          </Text>
          {BREAK_CHOICES.map((choice) => (
            <Pressable
              key={choice}
              accessibilityRole="button"
              onPress={() => onChoose(choice)}
              style={[styles.option, { borderColor: colors.line }]}
            >
              <View style={styles.optionLabel}>
                <LineIcon name="clock" color={colors.ink} />
                <Text style={[typography.label, { color: colors.ink }]}>
                  {BREAK_LABELS[choice]}
                </Text>
              </View>
              <Text importantForAccessibility="no" style={{ color: colors.muted }}>
                {'›'}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={onStopForToday}
            style={[styles.option, styles.lastOption]}
          >
            <View style={styles.optionLabel}>
              <LineIcon name="clock" color={colors.ink} />
              <Text style={[typography.label, { color: colors.ink }]}>Stop for today</Text>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}>
            <Text style={[typography.label, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingBottom: 30,
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    borderRadius: 2,
    height: 4,
    marginBottom: 14,
    marginTop: 6,
    width: 38,
  },
  title: { fontSize: 19, lineHeight: 24, marginBottom: 6, textAlign: 'center' },
  option: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 4,
  },
  optionLabel: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  lastOption: { borderBottomWidth: 0 },
  cancel: { alignItems: 'center', justifyContent: 'center', marginTop: 8, minHeight: 48 },
});
