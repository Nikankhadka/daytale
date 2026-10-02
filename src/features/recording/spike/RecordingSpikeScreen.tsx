import { useAudioRecorder } from 'expo-audio';
import type { PermissionResponse } from 'expo';
import type { RecordingStatus } from 'expo-audio';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDaytaleTheme } from '../../../theme/useDaytaleTheme';
import { RECORDING_OPTIONS } from '../recorder';
import {
  createRecordingSpikeAdapter,
  type RecordingSpikeAdapter,
  type RecordingState,
} from './adapter';

export function RecordingSpikeScreen() {
  const { colors, radii, typography } = useDaytaleTheme();
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
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.appPaper }]}
      edges={['top', 'left', 'right']}
    >
      <View style={styles.container}>
        <Text style={[typography.eyebrow, styles.eyebrow, { color: colors.appMuted }]}>
          Daytale diagnostic
        </Text>
        <Text style={[typography.titleLarge, { color: colors.appInk }]}>
          Background recording spike
        </Text>
        <Text style={[typography.sub, { color: colors.appMuted }]}>
          This surface exercises expo-audio commands for physical-device testing. It does not claim
          that background capture works until a device run verifies it.
        </Text>

        <View
          style={[
            styles.statusCard,
            {
              backgroundColor: colors.appSurface,
              borderColor: colors.appLine,
              borderRadius: radii.card,
            },
          ]}
          accessibilityLabel="Recording spike status"
        >
          <Text style={[typography.fieldLabel, styles.statusLabel, { color: colors.appMuted }]}>
            Microphone permission
          </Text>
          <Text style={[typography.body, { color: colors.appInk }]}>
            {permissionLabel(permission)}
          </Text>
          <Text style={[typography.fieldLabel, styles.statusLabel, { color: colors.appMuted }]}>
            Adapter state
          </Text>
          <Text style={[typography.body, { color: colors.appInk }]}>{state}</Text>
          <Text style={[typography.fieldLabel, styles.statusLabel, { color: colors.appMuted }]}>
            Recording output
          </Text>
          <Text style={[typography.monoLabel, { color: colors.appInk }]} selectable>
            {recordingUri ?? 'none available'}
          </Text>
          {error ? (
            <Text
              accessibilityRole="alert"
              style={[typography.caption, styles.error, { color: colors.appRecording }]}
            >
              {error}
            </Text>
          ) : null}
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

        <Text style={[typography.caption, styles.note, { color: colors.appMuted }]}>
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
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  eyebrow: {
    textTransform: 'uppercase',
  },
  statusCard: {
    borderWidth: 1,
    gap: 4,
    padding: 16,
  },
  statusLabel: {
    marginTop: 4,
  },
  error: {
    marginTop: 8,
  },
  controls: {
    gap: 12,
  },
  note: {
    marginTop: 'auto',
  },
});
