import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { bootstrapStorage } from '../src/storage/bootstrap';
import { useDaytaleFonts } from '../src/theme/fonts';
import { DAYTALE_COLORS, DAYTALE_FONT_ROLES, DAYTALE_TYPOGRAPHY } from '../src/theme/tokens';

type BootstrapState = 'loading' | 'ready' | 'error';

export default function RootLayout() {
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>('loading');
  const [fontsLoaded, fontError] = useDaytaleFonts();
  const mounted = useRef(true);

  const attemptBootstrap = useCallback((showLoading: boolean) => {
    if (showLoading) {
      setBootstrapState('loading');
    }
    void bootstrapStorage().then(
      () => {
        if (mounted.current) {
          setBootstrapState('ready');
        }
      },
      () => {
        if (mounted.current) {
          setBootstrapState('error');
        }
      },
    );
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => attemptBootstrap(false));
    return () => {
      mounted.current = false;
    };
  }, [attemptBootstrap]);

  const fontsReady = fontsLoaded || fontError !== null;
  const showLoading = bootstrapState === 'loading' || !fontsReady;

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {showLoading ? (
        <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
          <View accessibilityLabel="Loading Daytale" style={styles.state}>
            <ActivityIndicator color={DAYTALE_COLORS.light.primary} />
            <Text style={[DAYTALE_TYPOGRAPHY.body, styles.loadingText]}>Preparing Daytale</Text>
          </View>
        </SafeAreaView>
      ) : bootstrapState === 'error' ? (
        <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
          <View style={styles.state}>
            <Text accessibilityRole="header" style={DAYTALE_TYPOGRAPHY.title}>
              We could not open Daytale
            </Text>
            <Text accessibilityRole="alert" style={DAYTALE_TYPOGRAPHY.body}>
              Your local data is still protected. Try again when you have a moment.
            </Text>
            <Pressable
              accessibilityLabel="Retry opening Daytale"
              accessibilityRole="button"
              onPress={() => attemptBootstrap(true)}
              style={({ pressed }) => [styles.retry, pressed ? styles.retryPressed : null]}
            >
              <Text style={[DAYTALE_TYPOGRAPHY.label, styles.retryText]}>Retry</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      ) : (
        <Stack screenOptions={{ headerShown: false }} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: DAYTALE_COLORS.light.background, flex: 1 },
  state: {
    alignItems: 'center',
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: { color: DAYTALE_COLORS.light.muted },
  retry: {
    alignItems: 'center',
    backgroundColor: DAYTALE_COLORS.light.primary,
    borderRadius: 16,
    minHeight: 52,
    justifyContent: 'center',
    minWidth: 140,
    paddingHorizontal: 24,
  },
  retryPressed: { opacity: 0.82 },
  retryText: { color: '#ffffff', fontFamily: DAYTALE_FONT_ROLES.uiStrong },
});
