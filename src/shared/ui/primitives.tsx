import type { ReactNode } from 'react';
import * as React from 'react';
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { withAlpha } from '../../theme/color';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';
import { UiIcon, type UiIconName } from './uiIcons';

/** The prototype's mono 10.5px uppercase `.a-eyebrow`. */
export function Eyebrow({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const { colors, typography } = useDaytaleTheme();
  return (
    <Text style={[styles.eyebrow, typography.eyebrow, { color: colors.appMuted }, style]}>
      {children}
    </Text>
  );
}

/** The prototype's 13.5px muted `.a-sub`. */
export function SubText({
  children,
  center = false,
  style,
}: {
  children: ReactNode;
  center?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const { colors, typography } = useDaytaleTheme();
  return (
    <Text
      style={[typography.sub, { color: colors.appMuted }, center ? styles.center : null, style]}
    >
      {children}
    </Text>
  );
}

type HeadingVariant = 'titleLarge' | 'title' | 'titleSmall' | 'heading';

/** The prototype's `.a-h1` display heading. */
export function ScreenHeading({
  children,
  variant = 'title',
  center = false,
  style,
}: {
  children: ReactNode;
  variant?: HeadingVariant;
  center?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const { colors, typography } = useDaytaleTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[typography[variant], { color: colors.appInk }, center ? styles.center : null, style]}
    >
      {children}
    </Text>
  );
}

/** A smaller display heading for section breaks (prototype `.a-card` titles). */
export function SectionHeading({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const { colors, typography } = useDaytaleTheme();
  return <Text style={[typography.heading, { color: colors.appInk }, style]}>{children}</Text>;
}

/** The prototype's `.a-field-label`, with an optional leading glyph. */
export function FieldLabel({
  children,
  icon,
  style,
}: {
  children: ReactNode;
  icon?: UiIconName;
  style?: StyleProp<TextStyle>;
}) {
  const { colors, typography } = useDaytaleTheme();
  return (
    <View style={styles.fieldLabelRow}>
      {icon ? <UiIcon color={colors.appMuted} name={icon} size={15} /> : null}
      <Text style={[typography.fieldLabel, { color: colors.appMuted }, style]}>{children}</Text>
    </View>
  );
}

/** The prototype's `.a-card`: surface, hairline, 16 radius, 16 padding, soft shadow. */
export function Card({
  children,
  padded = true,
  style,
}: {
  children: ReactNode;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radii, shadows } = useDaytaleTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.appSurface,
          borderColor: colors.appLine,
          borderRadius: radii.card,
          borderWidth: 1,
          padding: padded ? 20 : 0,
        },
        shadows,
        style,
      ]}
    >
      {children}
    </View>
  );
}

type ChoiceRowProps = {
  label: string;
  /** Secondary line, such as the native language name. */
  detail?: string;
  /** Leading flag or emoji. */
  leading?: string;
  selected: boolean;
  role?: 'checkbox' | 'radio';
  onPress: () => void;
};

/** The prototype's `.a-check-row` with a `.a-check` box or radio dot. */
export function ChoiceRow({
  label,
  detail,
  leading,
  selected,
  role = 'checkbox',
  onPress,
}: ChoiceRowProps) {
  const { colors, radii, typography } = useDaytaleTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor: selected ? colors.appSakuraMist : colors.appSurface,
        borderColor: selected ? colors.appCherry : colors.appLine,
        borderRadius: radii.control,
        borderWidth: 1.5,
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
    >
      <View style={styles.choiceMain}>
        {leading ? (
          <Text
            style={{
              fontSize: typography.titleSmall.fontSize,
              lineHeight: typography.titleSmall.lineHeight,
            }}
          >
            {leading}
          </Text>
        ) : null}
        <View style={styles.choiceText}>
          <Text style={[typography.label, { color: colors.appInk }]}>{label}</Text>
          {detail ? (
            <Text style={[typography.caption, { color: colors.appMuted }]}>{detail}</Text>
          ) : null}
        </View>
      </View>
      {role === 'radio' ? (
        <View
          style={[
            styles.radio,
            {
              borderColor: selected ? colors.appCherry : colors.appLine,
              borderWidth: selected ? 6 : 2,
            },
          ]}
        />
      ) : (
        <View
          style={[
            styles.check,
            {
              backgroundColor: selected ? colors.appCherry : 'transparent',
              borderColor: selected ? colors.appCherry : colors.appLine,
            },
          ]}
        >
          {selected ? (
            <UiIcon color={colors.appOnPrimary} name="check" size={14} strokeWidth={2.4} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

type ChipProps = {
  label: string;
  emoji?: string;
  selected?: boolean;
  small?: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

/** The prototype's `.a-chip` / `.j-mini-chip`. */
export function Chip({
  label,
  emoji,
  selected = false,
  small = false,
  disabled = false,
  onPress,
}: ChipProps) {
  const { colors, radii, typography } = useDaytaleTheme();
  const content = (
    <View
      style={[
        styles.chip,
        small ? styles.chipSmall : null,
        {
          backgroundColor: selected ? colors.appSakuraMist : colors.appSurface,
          borderColor: selected ? colors.appCherry : colors.appLine,
          borderRadius: radii.pill,
        },
      ]}
    >
      {emoji ? (
        <Text
          style={{
            fontSize: small ? typography.caption.fontSize : typography.body.fontSize,
            lineHeight: small ? typography.caption.lineHeight : typography.body.lineHeight,
          }}
        >
          {emoji}
        </Text>
      ) : null}
      <Text style={[typography.chip, { color: selected ? colors.appCherry : colors.appInk }]}>
        {label}
      </Text>
    </View>
  );
  if (!onPress && !disabled) {
    return content;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={disabled ? styles.chipDisabled : undefined}
    >
      {content}
    </Pressable>
  );
}

type ListRowProps = {
  icon?: UiIconName;
  title: string;
  subtitle?: string;
  value?: string;
  chevron?: boolean;
  danger?: boolean;
  onPress?: () => void;
};

/** The prototype's `.set-row`: a label stack with a trailing value or chevron. */
export function ListRow({ icon, title, subtitle, value, chevron, danger, onPress }: ListRowProps) {
  const { colors, typography } = useDaytaleTheme();
  const body = (
    <View style={styles.listRow}>
      {icon ? (
        <View style={[styles.listIcon, { backgroundColor: colors.appSakuraMist }]}>
          <UiIcon color={danger ? colors.appRecording : colors.appCherry} name={icon} size={17} />
        </View>
      ) : null}
      <View style={styles.listText}>
        <Text style={[typography.label, { color: danger ? colors.appRecording : colors.appInk }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[typography.caption, { color: colors.appMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[typography.sub, { color: colors.appMuted }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {chevron ? <UiIcon color={colors.appFaint} name="chevron" size={17} /> : null}
    </View>
  );
  if (!onPress) {
    return body;
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => (pressed ? { backgroundColor: colors.appSakuraMist } : null)}
    >
      {body}
    </Pressable>
  );
}

/** Dividers for stacked `ListRow`s inside a padded card. */
export function RowDivider() {
  const { colors } = useDaytaleTheme();
  return <View style={{ backgroundColor: colors.appLine, height: StyleSheet.hairlineWidth }} />;
}

type InlineConfirmProps = {
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** The prototype's `.inline-confirm`: a soft destructive panel, never a dialog. */
export function InlineConfirm({
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}: InlineConfirmProps) {
  const { colors, radii, typography } = useDaytaleTheme();
  return (
    <View
      style={{
        backgroundColor: colors.appRecordingSoft,
        borderColor: withAlpha(colors.appRecording, 0.25),
        borderRadius: radii.card,
        borderWidth: 1,
        gap: 12,
        padding: 16,
      }}
    >
      <Text style={[typography.sub, { color: colors.appInk }]}>{message}</Text>
      <View style={styles.confirmRow}>
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          style={[
            styles.confirmButton,
            { borderColor: colors.appLine, borderRadius: radii.control },
          ]}
        >
          <Text style={[typography.button, { color: colors.appInk }]}>{cancelLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onConfirm}
          style={[
            styles.confirmButton,
            {
              backgroundColor: colors.appRecording,
              borderRadius: radii.control,
              opacity: busy ? 0.5 : 1,
            },
          ]}
        >
          <Text style={[typography.button, { color: colors.appPaper }]}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The prototype's onboarding progress `.dots`. */
export function ProgressDots({ count, active }: { count: number; active: number }) {
  const { colors } = useDaytaleTheme();
  return (
    <View accessibilityElementsHidden style={styles.dots}>
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={{
            backgroundColor: index === active ? colors.appSunDeep : colors.appLine,
            borderRadius: 3,
            height: 6,
            width: index === active ? 16 : 6,
          }}
        />
      ))}
    </View>
  );
}

function usePulse(reducedMotion: boolean, low: number, duration: number) {
  const value = useSharedValue(1);
  React.useEffect(() => {
    cancelAnimation(value);
    value.value = 1;
    if (reducedMotion) {
      return undefined;
    }
    value.value = withRepeat(
      withSequence(withTiming(low, { duration }), withTiming(1, { duration })),
      -1,
      false,
    );
    return () => cancelAnimation(value);
  }, [reducedMotion, low, duration, value]);
  return value;
}

type StatusPillProps = { label: string; tone: 'recording' | 'paused' };

/** The prototype's `.rec-pill` / `.pause-pill`. */
export function StatusPill({ label, tone }: StatusPillProps) {
  const { colors, typography, reducedMotion, motion, radii } = useDaytaleTheme();
  const recording = tone === 'recording';
  const opacity = usePulse(reducedMotion || !recording, 0.35, motion.pulse);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <View
      accessible
      accessibilityLabel={recording ? 'Recording' : label}
      style={[
        styles.pill,
        {
          backgroundColor: recording ? colors.appRecordingSoft : colors.appPauseSoft,
          borderRadius: radii.pill,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: recording ? colors.appRecording : colors.appPause },
          style,
        ]}
      />
      <Text
        importantForAccessibility="no"
        style={[typography.chip, { color: recording ? colors.appRecording : colors.appInkSoft }]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  eyebrow: { textTransform: 'uppercase' },
  fieldLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  choiceMain: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: 12 },
  choiceText: { flex: 1, gap: 4 },
  radio: { borderRadius: 11, height: 22, width: 22 },
  check: {
    alignItems: 'center',
    borderRadius: 7,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  chip: {
    alignItems: 'center',
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipSmall: { minHeight: 24, paddingHorizontal: 8, paddingVertical: 4 },
  chipDisabled: { opacity: 0.55 },
  listRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  listIcon: {
    alignItems: 'center',
    borderRadius: 10,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  listText: { flex: 1, gap: 4 },
  confirmRow: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  confirmButton: {
    alignItems: 'center',
    borderWidth: 1.5,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 20,
  },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  pill: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  dot: { borderRadius: 4, height: 7, width: 7 },
});
