import type { PermissionResponse } from 'expo';
import type { RecordingStatus } from 'expo-audio';

import {
  createRecordingSpikeAdapter,
  RECORDING_AUDIO_MODE,
  RECORDING_OPTIONS,
  SPIKE_CHUNK_TARGET_SECONDS,
} from '../../src/features/recording/spike/adapter';

const permissionResponse = (granted: boolean): PermissionResponse => ({
  status: (granted ? 'granted' : 'denied') as PermissionResponse['status'],
  granted,
  canAskAgain: !granted,
  expires: 'never',
});

function createFakes(permission = permissionResponse(true)) {
  const recorder = {
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    record: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    currentTime: 0,
  };
  const native = {
    getRecordingPermissionsAsync: jest.fn().mockResolvedValue(permission),
    requestRecordingPermissionsAsync: jest.fn().mockResolvedValue(permission),
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };

  return { native, recorder };
}

describe('RecordingSpikeAdapter', () => {
  it('reports permission state and requests permission through injected calls', async () => {
    const fakes = createFakes(permissionResponse(false));
    const adapter = createRecordingSpikeAdapter(fakes.recorder, fakes.native);

    await expect(adapter.permission()).resolves.toMatchObject({
      granted: false,
      status: 'denied',
    });

    fakes.native.requestRecordingPermissionsAsync.mockResolvedValue(permissionResponse(true));

    await expect(adapter.requestPermission()).resolves.toMatchObject({
      granted: true,
      status: 'granted',
    });
    expect(fakes.native.getRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(fakes.native.requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('makes prepare, start, pause, resume, and stop idempotent', async () => {
    const fakes = createFakes();
    const adapter = createRecordingSpikeAdapter(fakes.recorder, fakes.native);

    await adapter.permission();
    await adapter.prepare();
    await adapter.prepare();
    await Promise.all([adapter.start(), adapter.start()]);
    await adapter.pause();
    await adapter.pause();
    await adapter.resume();
    await adapter.resume();
    await adapter.stop();
    await adapter.stop();

    expect(fakes.native.setAudioModeAsync).toHaveBeenCalledTimes(1);
    expect(fakes.native.setAudioModeAsync).toHaveBeenCalledWith(RECORDING_AUDIO_MODE);
    expect(fakes.recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(fakes.recorder.prepareToRecordAsync).toHaveBeenCalledWith(RECORDING_OPTIONS);
    expect(fakes.recorder.record).toHaveBeenCalledTimes(2);
    expect(fakes.recorder.record).toHaveBeenNthCalledWith(1, {
      forDuration: SPIKE_CHUNK_TARGET_SECONDS,
    });
    expect(fakes.recorder.record).toHaveBeenNthCalledWith(2, {
      forDuration: SPIKE_CHUNK_TARGET_SECONDS,
    });
    expect(fakes.recorder.pause).toHaveBeenCalledTimes(1);
    expect(fakes.recorder.stop).toHaveBeenCalledTimes(1);
    expect(adapter.state).toBe('stopped');
  });

  it('does not prepare without microphone permission', async () => {
    const fakes = createFakes(permissionResponse(false));
    const adapter = createRecordingSpikeAdapter(fakes.recorder, fakes.native);

    await expect(adapter.prepare()).rejects.toThrow('Microphone permission is not granted.');
    expect(fakes.native.setAudioModeAsync).not.toHaveBeenCalled();
    expect(fakes.recorder.prepareToRecordAsync).not.toHaveBeenCalled();
  });

  it('moves to stopped on a finished status and discards the output idempotently', async () => {
    const fakes = createFakes();
    const adapter = createRecordingSpikeAdapter(fakes.recorder, fakes.native);
    const recordingUri = 'file:///cache/daytale-spike.m4a';
    const finishedStatus: RecordingStatus = {
      id: 'spike-recording',
      isFinished: true,
      hasError: false,
      error: null,
      url: recordingUri,
    };

    await adapter.permission();
    await adapter.prepare();
    await adapter.start();
    adapter.handleRecorderStatus(finishedStatus);

    expect(adapter.state).toBe('stopped');
    expect(adapter.recordingUri).toBe(recordingUri);

    await expect(adapter.prepare()).rejects.toThrow(
      'Discard the stopped recording before preparing a new capture.',
    );
    expect(fakes.recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(adapter.recordingUri).toBe(recordingUri);

    await adapter.discard();
    await adapter.discard();

    expect(fakes.native.deleteFile).toHaveBeenCalledTimes(1);
    expect(fakes.native.deleteFile).toHaveBeenCalledWith(recordingUri);
    expect(adapter.recordingUri).toBeNull();

    await adapter.prepare();
    expect(fakes.recorder.prepareToRecordAsync).toHaveBeenCalledTimes(2);
  });
});
