import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { bootstrapStorage } from '../src/storage/bootstrap';
import { useDaytaleFonts } from '../src/theme/fonts';
import { useDaytaleTheme } from '../src/theme/useDaytaleTheme';

type BootstrapState = 'loading' | 'ready' | 'error';

export default function RootLayout() {
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>('loading');
  const [fontsLoaded, fontError] = useDaytaleFonts();
  const { scheme, colors, radii, typography } = useDaytaleTheme();
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
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {showLoading ? (
        <SafeAreaView
          edges={['top', 'bottom']}
          style={[styles.safe, { backgroundColor: colors.appPaper }]}
        >
          <View accessibilityLabel="Loading Daytale" style={styles.state}>
            <ActivityIndicator color={colors.appCherry} />
            <Text style={[typography.body, { color: colors.appMuted }]}>Preparing Daytale</Text>
          </View>
        </SafeAreaView>
      ) : bootstrapState === 'error' ? (
        <SafeAreaView
          edges={['top', 'bottom']}
          style={[styles.safe, { backgroundColor: colors.appPaper }]}
        >
          <View style={styles.state}>
            <Text accessibilityRole="header" style={[typography.title, { color: colors.appInk }]}>
              We could not open Daytale
            </Text>
            <Text accessibilityRole="alert" style={[typography.body, { color: colors.appMuted }]}>
              Your local data is still protected. Try again when you have a moment.
            </Text>
            <Pressable
              accessibilityLabel="Retry opening Daytale"
              accessibilityRole="button"
              onPress={() => attemptBootstrap(true)}
              style={({ pressed }) => [
                styles.retry,
                { backgroundColor: colors.appCherry, borderRadius: radii.card },
                pressed ? styles.retryPressed : null,
              ]}
            >
              <Text style={[typography.button, { color: colors.appOnPrimary }]}>Retry</Text>
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
  safe: { flex: 1 },
  state: {
    alignItems: 'center',
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    padding: 32,
  },
  retry: {
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
    minWidth: 140,
    paddingHorizontal: 24,
  },
  retryPressed: { opacity: 0.82 },
});
