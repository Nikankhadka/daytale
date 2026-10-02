import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

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
 * The prototype's `.a-select`. React Native has no native `<select>`, so this is an
 * inline dropdown: the option list expands under the field inside the screen tree.
 * Native `Modal` is deliberately not used - an open (or recently dismissed) modal
 * window on iOS can swallow later native dialogs such as the permission prompts.
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
        accessibilityState={{ expanded: open }}
        accessibilityValue={{ text: current?.label ?? placeholder }}
        onPress={() => setOpen((value) => !value)}
        style={[
          styles.select,
          {
            backgroundColor: colors.appSurface,
            borderColor: colors.appLine,
            borderRadius: radii.control,
          },
        ]}
      >
        <Text style={[typography.body, { color: colors.appInk }]}>
          {current?.label ?? placeholder}
        </Text>
        <UiIcon color={colors.appMuted} name="chevron" size={16} />
      </Pressable>
      {open ? (
        <ScrollView
          nestedScrollEnabled
          style={[
            styles.menu,
            {
              backgroundColor: colors.appSurface,
              borderColor: colors.appLine,
              borderRadius: radii.control,
            },
          ]}
          testID="select-menu"
        >
          {options.map((option, index) => {
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
                style={[
                  styles.option,
                  index > 0 ? { borderTopColor: colors.appLine, borderTopWidth: 1 } : null,
                ]}
              >
                <Text
                  style={[typography.body, { color: selected ? colors.appCherry : colors.appInk }]}
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
      ) : null}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: '100%',
  },
  menu: {
    borderWidth: 1.5,
    maxHeight: 288,
    overflow: 'hidden',
  },
  option: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 16,
  },
});
