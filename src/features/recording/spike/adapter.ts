import type { PermissionResponse } from 'expo';
import type { RecordingStatus } from 'expo-audio';

import {
  CHUNK_ROTATION_SECONDS,
  createSerialQueue,
  expoAudioNative,
  RECORDING_AUDIO_MODE,
  RECORDING_OPTIONS,
  type RecordingNative,
  type RecordingRecorder,
} from '../recorder';

export type RecordingState = 'idle' | 'prepared' | 'recording' | 'paused' | 'stopped';

export class RecordingSpikeAdapter {
  private currentState: RecordingState = 'idle';

  private permissionResponse: PermissionResponse | undefined;

  private currentRecordingUri: string | null = null;

  private readonly enqueue = createSerialQueue();

  public constructor(
    private readonly recorder: RecordingRecorder,
    private readonly native: RecordingNative = expoAudioNative,
    private readonly targetSeconds = CHUNK_ROTATION_SECONDS,
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

      this.recorder.record({ forDuration: this.targetSeconds });
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
      const remainingSeconds = this.targetSeconds - elapsedSeconds;
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
}

export function createRecordingSpikeAdapter(
  recorder: RecordingRecorder,
  native: RecordingNative = expoAudioNative,
  targetSeconds = CHUNK_ROTATION_SECONDS,
): RecordingSpikeAdapter {
  return new RecordingSpikeAdapter(recorder, native, targetSeconds);
}
