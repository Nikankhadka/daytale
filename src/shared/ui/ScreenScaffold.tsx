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
}: ScreenScaffoldProps) {
  const { colors, spacing, typography } = useDaytaleTheme();

  return (
    <SafeAreaView
      testID="screen-scaffold-safe-area"
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { padding: spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        {mascotState ? <DaytaleMascot state={mascotState} /> : null}
        <Text style={[styles.eyebrow, typography.eyebrow, { color: colors.primary }]}>
          {eyebrow}
        </Text>
        <Text
          accessibilityRole="header"
          style={[styles.title, typography.title, { color: colors.ink }]}
        >
          {title}
        </Text>
        {description ? (
          <Text style={[styles.description, typography.body, { color: colors.muted }]}>
            {description}
          </Text>
        ) : null}
        {loading ? (
          <View accessibilityLabel="Loading" style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {error ? (
              <Text accessibilityRole="alert" style={[styles.error, { color: colors.error }]}>
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
  secondary?: boolean;
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: PrimaryButtonProps) {
  const { colors, radii, typography } = useDaytaleTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { borderRadius: radii.control },
        secondary
          ? { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1 }
          : { backgroundColor: colors.primary },
        pressed && !disabled ? { opacity: 0.82 } : null,
        disabled ? { opacity: 0.45 } : null,
      ]}
    >
      <Text style={[typography.label, { color: secondary ? colors.ink : '#ffffff' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 40 },
  eyebrow: { marginBottom: 8 },
  title: { marginBottom: 12 },
  description: { marginBottom: 24 },
  loading: { alignItems: 'center', paddingVertical: 32 },
  error: { marginVertical: 16 },
  footer: { marginTop: 24 },
  button: {
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginTop: 10,
    paddingHorizontal: 20,
  },
});
