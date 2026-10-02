import { StyleSheet, Switch, Text, View } from 'react-native';

import { useDaytaleTheme } from '../../theme/useDaytaleTheme';

type SwitchRowProps = {
  label: string;
  detail?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
};

/** The prototype's `.a-check-row` carrying a `.switch` instead of a check box. */
export function SwitchRow({ label, detail, value, onValueChange, disabled }: SwitchRowProps) {
  const { colors, radii, typography } = useDaytaleTheme();
  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.appSurface,
          borderColor: colors.appLine,
          borderRadius: radii.control,
        },
      ]}
    >
      <View style={styles.text}>
        <Text style={[typography.label, { color: colors.appInk }]}>{label}</Text>
        {detail ? (
          <Text style={[typography.caption, { color: colors.appMuted }]}>{detail}</Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        ios_backgroundColor={colors.appLine}
        onValueChange={onValueChange}
        thumbColor={colors.appSurface}
        trackColor={{ false: colors.appLine, true: colors.appCherry }}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  text: { flex: 1, gap: 4 },
});
