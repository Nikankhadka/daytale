import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { bootstrapStorage } from '../src/storage/bootstrap';

type BootstrapState = 'loading' | 'ready' | 'error';

export default function RootLayout() {
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>('loading');

  useEffect(() => {
    let mounted = true;
    void bootstrapStorage().then(
      () => {
        if (mounted) {
          setBootstrapState('ready');
        }
      },
      () => {
        if (mounted) {
          setBootstrapState('error');
        }
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {bootstrapState === 'loading' ? (
        <View>
          <ActivityIndicator accessibilityLabel="Loading secure storage" />
        </View>
      ) : bootstrapState === 'error' ? (
        <View>
          <Text>Storage unavailable.</Text>
        </View>
      ) : (
        <Stack screenOptions={{ headerShown: false }} />
      )}
    </SafeAreaProvider>
  );
}
