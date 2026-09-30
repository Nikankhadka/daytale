import type { PermissionResponse } from 'expo';
import type { AudioMode, AudioRecorder, RecordingOptions } from 'expo-audio';

export type RecordingRecorder = Pick<
  AudioRecorder,
  'prepareToRecordAsync' | 'record' | 'pause' | 'stop'
> & {
  currentTime?: number;
  uri?: string | null;
};

export type RecordingNative = {
  getRecordingPermissionsAsync: () => Promise<PermissionResponse>;
  requestRecordingPermissionsAsync: () => Promise<PermissionResponse>;
  setAudioModeAsync: (mode: Partial<AudioMode>) => Promise<void>;
  deleteFile: (uri: string) => Promise<void>;
};

/** Single source for how long one capture chunk stays open before it is rotated. */
export const CHUNK_ROTATION_SECONDS = 30;
export const RECORDING_SAMPLE_RATE = 16_000;
export const RECORDING_CODEC = 'aac';

/** Compressed mono voice capture shared by the recording spike, voice setup, and the engine. */
export const RECORDING_OPTIONS: RecordingOptions = {
  directory: 'cache',
  extension: '.m4a',
  sampleRate: RECORDING_SAMPLE_RATE,
  numberOfChannels: 1,
  bitRate: 32_000,
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    audioSource: 'voice_recognition',
  },
  ios: {
    extension: '.m4a',
    sampleRate: RECORDING_SAMPLE_RATE,
    outputFormat: 'aac ',
    audioQuality: 32,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 32_000,
  },
};

export const RECORDING_AUDIO_MODE: Partial<AudioMode> = {
  allowsRecording: true,
  allowsBackgroundRecording: true,
  shouldPlayInBackground: false,
  playsInSilentMode: true,
  interruptionMode: 'doNotMix',
  shouldRouteThroughEarpiece: false,
};

export const expoAudioNative: RecordingNative = {
  getRecordingPermissionsAsync: async () => {
    const { getRecordingPermissionsAsync } = await import('expo-audio');
    return getRecordingPermissionsAsync();
  },
  requestRecordingPermissionsAsync: async () => {
    const { requestRecordingPermissionsAsync } = await import('expo-audio');
    return requestRecordingPermissionsAsync();
  },
  setAudioModeAsync: async (mode) => {
    const { setAudioModeAsync } = await import('expo-audio');
    return setAudioModeAsync(mode);
  },
  deleteFile: async (uri) => {
    const { deleteAsync } = await import('expo-file-system/legacy');
    return deleteAsync(uri, { idempotent: true });
  },
};

/** Runs tasks one at a time in call order; a failed task never blocks the ones after it. */
export function createSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return (task) => {
    const next = tail.then(task, task);
    tail = next.catch(() => undefined);
    return next;
  };
}
