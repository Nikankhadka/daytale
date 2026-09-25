import { useAudioRecorder } from 'expo-audio';
import type { PermissionResponse } from 'expo';
import type { RecordingStatus } from 'expo-audio';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  createRecordingSpikeAdapter,
  RECORDING_OPTIONS,
  type RecordingSpikeAdapter,
  type RecordingState,
} from './adapter';

export function RecordingSpikeScreen() {
  const [permission, setPermission] = useState<PermissionResponse | null>(null);
  const [state, setState] = useState<RecordingState>('idle');
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const adapterRef = useRef<RecordingSpikeAdapter | null>(null);

  const handleRecorderStatus = useCallback((status: RecordingStatus) => {
    const adapter = adapterRef.current;
    if (!adapter) {
      return;
    }

    adapter.handleRecorderStatus(status);
    setState(adapter.state);
    setRecordingUri(adapter.recordingUri);
    if (status.hasError) {
      setError(status.error ?? 'Native recorder reported an error.');
    }
  }, []);

  const recorder = useAudioRecorder(RECORDING_OPTIONS, handleRecorderStatus);
  const adapter = useMemo(() => createRecordingSpikeAdapter(recorder), [recorder]);

  useLayoutEffect(() => {
    adapterRef.current = adapter;
  }, [adapter]);

  useEffect(() => {
    let isMounted = true;

    void adapter
      .permission()
      .then((response) => {
        if (isMounted) {
          setPermission(response);
        }
      })
      .catch((reason: unknown) => {
        if (isMounted) {
          setError(toErrorMessage(reason));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [adapter]);

  const requestPermission = () => {
    setError(null);
    void adapter
      .requestPermission()
      .then((response) => {
        setPermission(response);
      })
      .catch((reason: unknown) => {
        setError(toErrorMessage(reason));
      });
  };

  const runCommand = (command: () => Promise<void>) => {
    setError(null);
    void command()
      .then(() => {
        setState(adapter.state);
        setRecordingUri(adapter.recordingUri);
      })
      .catch((reason: unknown) => setError(toErrorMessage(reason)));
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>Daytale diagnostic</Text>
        <Text style={styles.title}>Background recording spike</Text>
        <Text style={styles.description}>
          This surface exercises expo-audio commands for physical-device testing. It does not claim
          that background capture works until a device run verifies it.
        </Text>

        <View style={styles.statusCard} accessibilityLabel="Recording spike status">
          <Text style={styles.statusLabel}>Microphone permission</Text>
          <Text style={styles.statusValue}>{permissionLabel(permission)}</Text>
          <Text style={styles.statusLabel}>Adapter state</Text>
          <Text style={styles.statusValue}>{state}</Text>
          <Text style={styles.statusLabel}>Recording output</Text>
          <Text style={styles.outputValue} selectable>
            {recordingUri ?? 'none available'}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.controls}>
          <Button
            title={
              permission?.granted
                ? 'Microphone permission granted'
                : 'Request microphone permission'
            }
            onPress={requestPermission}
          />
          <Button
            title="Prepare recorder"
            onPress={() => runCommand(() => adapter.prepare())}
            disabled={
              !permission?.granted ||
              recordingUri !== null ||
              (state !== 'idle' && state !== 'stopped')
            }
          />
          <Button
            title="Start"
            onPress={() => runCommand(() => adapter.start())}
            disabled={state !== 'prepared'}
          />
          <Button
            title="Pause"
            onPress={() => runCommand(() => adapter.pause())}
            disabled={state !== 'recording'}
          />
          <Button
            title="Resume"
            onPress={() => runCommand(() => adapter.resume())}
            disabled={state !== 'paused'}
          />
          <Button
            title="Stop"
            onPress={() => runCommand(() => adapter.stop())}
            disabled={state !== 'recording' && state !== 'paused' && state !== 'prepared'}
          />
          <Button
            title="Discard stopped recording"
            onPress={() => runCommand(() => adapter.discard())}
            disabled={state !== 'stopped' || !recordingUri}
          />
        </View>

        <Text style={styles.note}>
          Verification still requires an iOS 17+ or Android 12+ development build, including
          lock-screen and background checks.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function permissionLabel(permission: PermissionResponse | null): string {
  if (!permission) {
    return 'checking';
  }
  return permission.granted ? 'granted' : permission.status;
}

function toErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Recording command failed.';
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fffaf8',
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  eyebrow: {
    color: '#8f3148',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: '#3d2730',
    fontSize: 28,
    fontWeight: '700',
  },
  description: {
    color: '#654e56',
    fontSize: 16,
    lineHeight: 24,
  },
  statusCard: {
    borderColor: '#e6a9a8',
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 16,
  },
  statusLabel: {
    color: '#654e56',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  statusValue: {
    color: '#3d2730',
    fontSize: 17,
  },
  outputValue: {
    color: '#3d2730',
    fontFamily: 'monospace',
    fontSize: 13,
  },
  error: {
    color: '#a12626',
    fontSize: 14,
    marginTop: 8,
  },
  controls: {
    gap: 12,
  },
  note: {
    color: '#654e56',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 'auto',
  },
});
