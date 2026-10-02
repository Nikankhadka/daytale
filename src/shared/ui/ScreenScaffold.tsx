import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDaytaleTheme } from '../../theme/useDaytaleTheme';
import { DaytaleMascot, type MascotState } from './DaytaleMascot';

type ScreenScaffoldProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  mascotState?: MascotState;
  loading?: boolean;
  error?: string;
  /** The welcome screen uses the prototype's larger 27px heading. */
  largeTitle?: boolean;
};

export function ScreenScaffold({
  eyebrow = 'DAYTALE',
  title,
  description,
  children,
  footer,
  mascotState,
  loading = false,
  error,
  largeTitle = false,
}: ScreenScaffoldProps) {
  const { colors, typography } = useDaytaleTheme();
  const titleRole = largeTitle ? typography.titleLarge : typography.title;

  return (
    <SafeAreaView
      testID="screen-scaffold-safe-area"
      style={[styles.safe, { backgroundColor: colors.appPaper }]}
      edges={['top', 'bottom']}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {mascotState ? <DaytaleMascot state={mascotState} /> : null}
        <Text style={[styles.eyebrow, typography.eyebrow, { color: colors.appMuted }]}>
          {eyebrow}
        </Text>
        <Text
          accessibilityRole="header"
          style={[styles.title, titleRole, { color: colors.appInk }]}
        >
          {title}
        </Text>
        {description ? (
          <Text style={[styles.description, typography.sub, { color: colors.appMuted }]}>
            {description}
          </Text>
        ) : null}
        {loading ? (
          <View accessibilityLabel="Loading" style={styles.loading}>
            <ActivityIndicator color={colors.appCherry} />
          </View>
        ) : (
          <>
            {error ? (
              <Text
                accessibilityRole="alert"
                style={[styles.error, typography.label, { color: colors.appRecording }]}
              >
                {error}
              </Text>
            ) : null}
            {children}
          </>
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Prototype `.a-btn-ghost`: transparent with a hairline border. */
  secondary?: boolean;
  /** Prototype `.a-btn-danger`: recording-soft fill with recording text. */
  danger?: boolean;
  /** Decorative glyph drawn before the label. */
  icon?: ReactNode;
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  secondary = false,
  danger = false,
  icon,
}: PrimaryButtonProps) {
  const { colors, radii, typography } = useDaytaleTheme();

  const base = danger
    ? { backgroundColor: colors.appRecordingSoft, borderWidth: 0 }
    : secondary
      ? { backgroundColor: 'transparent', borderColor: colors.appLine, borderWidth: 1.5 }
      : { backgroundColor: colors.appCherry, borderWidth: 0 };

  const pressedStyle = disabled
    ? { opacity: 0.45 }
    : danger
      ? { opacity: 0.82 }
      : secondary
        ? { backgroundColor: colors.appSakuraMist, borderColor: colors.appBlossom }
        : { backgroundColor: colors.appCherryHover };

  const textColor = danger ? colors.appRecording : secondary ? colors.appInk : colors.appOnPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { borderRadius: radii.control },
        base,
        pressed ? pressedStyle : null,
      ]}
    >
      {icon}
      <Text style={[typography.button, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 24, paddingHorizontal: 24, paddingTop: 8 },
  eyebrow: { marginBottom: 8, textTransform: 'uppercase' },
  title: { marginBottom: 12 },
  description: { marginBottom: 24 },
  loading: { alignItems: 'center', paddingVertical: 32 },
  error: { marginVertical: 16 },
  footer: { marginTop: 24 },
  button: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
});
