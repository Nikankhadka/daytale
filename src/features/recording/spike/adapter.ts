import type { PermissionResponse } from 'expo';
import type { AudioMode, AudioRecorder, RecordingOptions, RecordingStatus } from 'expo-audio';

export type RecordingState = 'idle' | 'prepared' | 'recording' | 'paused' | 'stopped';

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

export const SPIKE_CHUNK_TARGET_SECONDS = 30;

/**
 * The spike records one compressed mono voice file with a 30-second active-capture
 * target. Production chunk rotation, encryption, and persistence intentionally do
 * not belong here.
 */
export const RECORDING_OPTIONS: RecordingOptions = {
  directory: 'cache',
  extension: '.m4a',
  sampleRate: 16_000,
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
    sampleRate: 16_000,
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

export class RecordingSpikeAdapter {
  private currentState: RecordingState = 'idle';

  private permissionResponse: PermissionResponse | undefined;

  private currentRecordingUri: string | null = null;

  private commandQueue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly recorder: RecordingRecorder,
    private readonly native: RecordingNative = expoAudioNative,
  ) {}

  public get state(): RecordingState {
    return this.currentState;
  }

  public get recordingUri(): string | null {
    return this.currentRecordingUri;
  }

  public handleRecorderStatus(status: RecordingStatus): void {
    if (status.url) {
      this.currentRecordingUri = status.url;
    }

    if (status.isFinished || status.hasError) {
      this.currentState = 'stopped';
    }
  }

  public async permission(): Promise<PermissionResponse> {
    const response = await this.native.getRecordingPermissionsAsync();
    this.permissionResponse = response;
    return response;
  }

  public async requestPermission(): Promise<PermissionResponse> {
    const response = await this.native.requestRecordingPermissionsAsync();
    this.permissionResponse = response;
    return response;
  }

  public prepare(): Promise<void> {
    return this.enqueue(async () => {
      if (this.currentState !== 'idle' && this.currentState !== 'stopped') {
        return;
      }
      if (this.currentRecordingUri) {
        throw new Error('Discard the stopped recording before preparing a new capture.');
      }

      const permission = this.permissionResponse ?? (await this.permission());
      if (!permission.granted) {
        throw new Error('Microphone permission is not granted.');
      }

      await this.native.setAudioModeAsync(RECORDING_AUDIO_MODE);
      await this.recorder.prepareToRecordAsync(RECORDING_OPTIONS);
      this.currentState = 'prepared';
    });
  }

  public start(): Promise<void> {
    return this.enqueue(async () => {
      if (this.currentState !== 'prepared') {
        return;
      }

      this.recorder.record({ forDuration: SPIKE_CHUNK_TARGET_SECONDS });
      this.currentState = 'recording';
    });
  }

  public pause(): Promise<void> {
    return this.enqueue(async () => {
      if (this.currentState !== 'recording') {
        return;
      }

      this.recorder.pause();
      this.currentState = 'paused';
    });
  }

  public resume(): Promise<void> {
    return this.enqueue(async () => {
      if (this.currentState !== 'paused') {
        return;
      }

      const elapsedSeconds = this.recorder.currentTime ?? 0;
      const remainingSeconds = SPIKE_CHUNK_TARGET_SECONDS - elapsedSeconds;
      if (remainingSeconds <= 0) {
        await this.recorder.stop();
        this.currentState = 'stopped';
        return;
      }

      this.recorder.record({ forDuration: remainingSeconds });
      this.currentState = 'recording';
    });
  }

  public stop(): Promise<void> {
    return this.enqueue(async () => {
      if (this.currentState === 'idle' || this.currentState === 'stopped') {
        return;
      }

      if (this.currentState !== 'prepared') {
        await this.recorder.stop();
      }
      this.currentRecordingUri = this.recorder.uri ?? this.currentRecordingUri;
      this.currentState = 'stopped';
    });
  }

  public discard(): Promise<void> {
    return this.enqueue(async () => {
      if (this.currentState !== 'stopped' || !this.currentRecordingUri) {
        return;
      }

      const uri = this.currentRecordingUri;
      await this.native.deleteFile(uri);
      this.currentRecordingUri = null;
    });
  }

  private enqueue(command: () => Promise<void>): Promise<void> {
    const next = this.commandQueue.then(command, command);
    this.commandQueue = next.catch(() => undefined);
    return next;
  }
}

export function createRecordingSpikeAdapter(
  recorder: RecordingRecorder,
  native: RecordingNative = expoAudioNative,
): RecordingSpikeAdapter {
  return new RecordingSpikeAdapter(recorder, native);
}
