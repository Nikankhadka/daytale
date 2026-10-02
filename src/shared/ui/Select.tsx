import * as React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { withAlpha } from '../../theme/color';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';
import { UiIcon } from './uiIcons';

export type SelectOption = { value: string; label: string };

type SelectProps = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  accessibilityLabel?: string;
  placeholder?: string;
};

/**
 * The prototype's `.a-select`. React Native has no native `<select>`, so this is
 * a pressable field that opens a modal option list (closest faithful match).
 */
export function Select({
  value,
  options,
  onChange,
  accessibilityLabel,
  placeholder = 'Choose',
}: SelectProps) {
  const { colors, radii, typography } = useDaytaleTheme();
  const [open, setOpen] = React.useState(false);
  const current = options.find((option) => option.value === value);

  return (
    <>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityValue={{ text: current?.label ?? placeholder }}
        onPress={() => setOpen(true)}
        style={[
          styles.select,
          {
            backgroundColor: colors.appSurface,
            borderColor: colors.appLine,
            borderRadius: 14,
          },
        ]}
      >
        <Text style={[typography.body, { color: colors.appInk }]}>
          {current?.label ?? placeholder}
        </Text>
        <UiIcon color={colors.appMuted} name="chevron" size={16} />
      </Pressable>
      <Modal animationType="slide" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.appPaper,
                borderTopLeftRadius: radii.sheet,
                borderTopRightRadius: radii.sheet,
              },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.appLine }]} />
            <ScrollView>
              {options.map((option) => {
                const selected = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    style={[styles.option, { borderBottomColor: colors.appLine }]}
                  >
                    <Text
                      style={[
                        typography.body,
                        { color: selected ? colors.appCherry : colors.appInk },
                      ]}
                    >
                      {option.label}
                    </Text>
                    {selected ? (
                      <UiIcon color={colors.appCherry} name="check" size={17} strokeWidth={2.4} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function toLabel(local: string): string {
  const [hour, minute] = local.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** Half-hour options across the day, always including the stored value. */
export function buildTimeOptions(current?: string, stepMinutes = 30): SelectOption[] {
  const options: SelectOption[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += stepMinutes) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    options.push({ value, label: toLabel(value) });
  }
  if (current && !options.some((option) => option.value === current)) {
    options.push({ value: current, label: toLabel(current) });
    options.sort((a, b) => a.value.localeCompare(b.value));
  }
  return options;
}

type TimeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  accessibilityLabel: string;
};

export function TimeField({ value, onChange, accessibilityLabel }: TimeFieldProps) {
  const options = React.useMemo(() => buildTimeOptions(value), [value]);
  return (
    <Select
      accessibilityLabel={accessibilityLabel}
      onChange={onChange}
      options={options}
      value={value}
    />
  );
}

const styles = StyleSheet.create({
  select: {
    alignItems: 'center',
    borderWidth: 1.5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 13,
    width: '100%',
  },
  scrim: {
    backgroundColor: withAlpha('#0B0B0B', 0.42),
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '70%',
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
  option: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 4,
  },
});
