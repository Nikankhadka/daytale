import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getBootstrappedStorage } from '../../storage/bootstrap';
import type { VoiceProfileRepository } from '../../storage/repositories';
import { PrimaryButton, ScreenScaffold } from '../../shared/ui/ScreenScaffold';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';
import { RECORDING_AUDIO_MODE, RECORDING_OPTIONS } from '../recording/recorder';
import {
  VOICE_SAMPLE_COUNT,
  VoiceEnrollmentController,
  type SpeakerEmbeddingProvider,
} from './enrollment';
import { createDefaultSpeakerEmbeddingProvider } from './speaker';

export const VOICE_SAMPLE_TARGET_SECONDS = 8;

export type VoiceSampleRecorder = {
  recordSample: () => Promise<string>;
  discard: (filePath: string) => Promise<void>;
};

export type VoiceSetupScreenProps = {
  profileRepository?: VoiceProfileRepository;
  speakerProvider?: SpeakerEmbeddingProvider;
  sampleRecorder?: VoiceSampleRecorder;
  onComplete?: () => Promise<void> | void;
  now?: () => string;
};

export function VoiceSetupScreen({
  profileRepository,
  speakerProvider,
  sampleRecorder,
  onComplete,
  now,
}: VoiceSetupScreenProps = {}) {
  const { colors, radii, typography } = useDaytaleTheme();
  const repository = profileRepository ?? getBootstrappedStorage()?.repositories?.voiceProfiles;
  const provider = React.useMemo(
    () => speakerProvider ?? createDefaultSpeakerEmbeddingProvider(),
    [speakerProvider],
  );
  const controller = React.useMemo(
    () => (repository ? new VoiceEnrollmentController(repository, provider, { now }) : null),
    [now, provider, repository],
  );
  const [, setRevision] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [preparing, setPreparing] = React.useState(false);
  const [modelFailed, setModelFailed] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const recorder = React.useMemo(
    () => sampleRecorder ?? createDefaultVoiceSampleRecorder(),
    [sampleRecorder],
  );

  const snapshot = controller?.snapshot ?? {
    sampleCount: 0,
    completed: false,
    slots: Array.from({ length: VOICE_SAMPLE_COUNT }, () => false),
  };
  const nextSlot = snapshot.slots.findIndex((completed) => !completed);

  const recordSample = async () => {
    if (nextSlot < 0 || saving) {
      return;
    }
    if (controller === null) {
      setError('Secure storage is unavailable. Please retry after storage finishes loading.');
      return;
    }
    setSaving(true);
    setError(undefined);
    let uri: string | undefined;
    try {
      if (provider.prepare !== undefined) {
        setPreparing(true);
        try {
          await provider.prepare();
          setModelFailed(false);
        } catch (reason) {
          setModelFailed(true);
          throw reason;
        } finally {
          setPreparing(false);
        }
      }
      uri = await recorder.recordSample();
      const profile = await controller.captureSample(nextSlot, uri);
      setRevision((value) => value + 1);
      if (profile !== null) {
        await onComplete?.();
      }
    } catch (reason) {
      setError(toErrorMessage(reason));
    } finally {
      if (uri !== undefined) {
        await recorder.discard(uri).catch(() => undefined);
      }
      setSaving(false);
    }
  };

  const deleteSample = async (slot: number) => {
    if (controller === null || saving) {
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await controller.deleteSample(slot);
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(toErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const description = preparing
    ? 'Preparing the on-device voice model. This one-time download can take a minute.'
    : snapshot.completed
      ? 'Your voice profile is saved on this device. You can replace any sample to enroll again.'
      : 'Record three short samples so Daytale can recognize your voice without sending audio to the cloud.';

  return (
    <ScreenScaffold
      title="Voice setup"
      description={description}
      mascotState="ready"
      loading={saving}
      error={error}
    >
      <Text style={[typography.heading, styles.progress, { color: colors.appInk }]}>
        {snapshot.completed
          ? 'Voice profile ready'
          : `Sample ${Math.min(snapshot.sampleCount + 1, VOICE_SAMPLE_COUNT)} of ${VOICE_SAMPLE_COUNT}`}
      </Text>
      <Text style={[typography.body, { color: colors.appMuted }]}>
        No skip is available. Every sample can be deleted and recorded again.
      </Text>
      <View accessibilityLabel="Voice sample progress" style={styles.samples}>
        {snapshot.slots.map((completed, index) => (
          <View
            key={index}
            style={[styles.sampleRow, { borderColor: colors.appLine, borderRadius: radii.card }]}
          >
            <Text style={[typography.label, { color: colors.appInk }]}>Sample {index + 1}</Text>
            <Text
              style={[typography.caption, { color: completed ? colors.appLeaf : colors.appMuted }]}
            >
              {completed ? 'Recorded' : 'Waiting'}
            </Text>
            {completed ? (
              <PrimaryButton
                label="Delete and retry"
                onPress={() => void deleteSample(index)}
                disabled={saving}
                secondary
              />
            ) : null}
          </View>
        ))}
      </View>
      {nextSlot >= 0 ? (
        <PrimaryButton
          label={modelFailed ? 'Retry voice model' : `Record sample ${nextSlot + 1}`}
          onPress={() => void recordSample()}
          disabled={saving}
        />
      ) : null}
      <Text style={[typography.caption, styles.note, { color: colors.appMuted }]}>
        The encrypted local profile is only created after all three samples succeed. Speaker matches
        below the confidence threshold stay unknown.
      </Text>
    </ScreenScaffold>
  );
}

function createDefaultVoiceSampleRecorder(): VoiceSampleRecorder {
  return {
    recordSample: async () => {
      const { AudioModule, setAudioModeAsync } = await import('expo-audio');
      await setAudioModeAsync(RECORDING_AUDIO_MODE);
      const recorder = new AudioModule.AudioRecorder(RECORDING_OPTIONS);
      await recorder.prepareToRecordAsync(RECORDING_OPTIONS);
      recorder.record({ forDuration: VOICE_SAMPLE_TARGET_SECONDS });
      await new Promise((resolve) => setTimeout(resolve, VOICE_SAMPLE_TARGET_SECONDS * 1000 + 250));
      await recorder.stop();
      if (recorder.uri === null) {
        throw new Error('The microphone did not produce a sample.');
      }
      return recorder.uri;
    },
    discard: async (filePath) => {
      const { deleteAsync } = await import('expo-file-system/legacy');
      await deleteAsync(filePath, { idempotent: true });
    },
  };
}

function toErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Voice enrollment failed. Please try again.';
}

const styles = StyleSheet.create({
  progress: { marginTop: 8, marginBottom: 12 },
  samples: { gap: 12, marginTop: 24 },
  sampleRow: { borderWidth: 1, padding: 16 },
  note: { marginTop: 24 },
});
