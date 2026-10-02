import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UiIcon } from '../../shared/ui/uiIcons';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';

/** A settings sub-screen: back chevron, inline title, scrollable body. */
export function SettingsFrame({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const router = useRouter();
  const { colors, typography } = useDaytaleTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.appPaper }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.back}
        >
          <UiIcon color={colors.appInk} name="back" size={22} strokeWidth={2} />
        </Pressable>
        <Text accessibilityRole="header" style={[typography.titleSmall, { color: colors.appInk }]}>
          {title}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  back: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  content: { flexGrow: 1, gap: 16, paddingBottom: 24, paddingHorizontal: 24, paddingTop: 12 },
  footer: { marginTop: 'auto' },
});
