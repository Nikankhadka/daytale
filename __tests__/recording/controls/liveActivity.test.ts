import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { RecordingControlsNativeModule } from '../../../modules/recording-controls';
import {
  createLiveActivityPort,
  type LiveActivityEndStatus,
  type LiveActivityStatus,
} from '../../../src/features/recording/controls/liveActivity';

jest.mock('expo', () => ({ requireNativeModule: jest.fn() }));

const mockRequireNativeModule = requireNativeModule as unknown as jest.Mock;

const SESSION_ID = '22222222-2222-4222-8222-222222222222';

const START_INPUT = {
  sessionId: SESSION_ID,
  status: 'recording' as LiveActivityStatus,
  startedAt: '2026-03-10T09:00:00.000Z',
  scheduledEnd: '2026-03-10T17:00:00.000Z',
};

const UPDATE_INPUT = {
  status: 'paused' as LiveActivityStatus,
  updatedAt: '2026-03-10T10:00:00.000Z',
};

const END_INPUT = { status: 'completed' as LiveActivityEndStatus };

function makeFake() {
  return {
    isLiveActivitySupported: jest.fn(() => true),
    startLiveActivity: jest.fn(async (_input: unknown) => true),
    updateLiveActivity: jest.fn(async (_input: unknown) => true),
    endLiveActivity: jest.fn(async (_input: unknown) => undefined),
  };
}

function asModule(fake: ReturnType<typeof makeFake>): RecordingControlsNativeModule {
  return fake as unknown as RecordingControlsNativeModule;
}

describe('live activity port', () => {
  beforeEach(() => {
    mockRequireNativeModule.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(['web', 'android'] as const)(
    'is unsupported on %s without loading the native module',
    async (platform) => {
      jest.replaceProperty(Platform, 'OS', platform);
      const fake = makeFake();
      const load = jest.fn(async () => asModule(fake));
      const port = createLiveActivityPort(load);

      await expect(port.isSupported()).resolves.toBe(false);
      await expect(port.start(START_INPUT)).resolves.toBe(false);
      await expect(port.update(UPDATE_INPUT)).resolves.toBe(false);
      await expect(port.end(END_INPUT)).resolves.toBeUndefined();

      expect(load).not.toHaveBeenCalled();
      expect(fake.startLiveActivity).not.toHaveBeenCalled();
      expect(fake.updateLiveActivity).not.toHaveBeenCalled();
      expect(fake.endLiveActivity).not.toHaveBeenCalled();
    },
  );

  it('reports support from the native module on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const fake = makeFake();
    const port = createLiveActivityPort(async () => asModule(fake));

    await expect(port.isSupported()).resolves.toBe(true);

    fake.isLiveActivitySupported.mockReturnValue(false);
    await expect(port.isSupported()).resolves.toBe(false);
  });

  it('forwards start, update, and end to the native module on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const fake = makeFake();
    const port = createLiveActivityPort(async () => asModule(fake));

    await expect(port.start(START_INPUT)).resolves.toBe(true);
    await expect(port.update(UPDATE_INPUT)).resolves.toBe(true);
    await expect(port.end(END_INPUT)).resolves.toBeUndefined();

    expect(fake.startLiveActivity).toHaveBeenCalledWith(START_INPUT);
    expect(fake.updateLiveActivity).toHaveBeenCalledWith(UPDATE_INPUT);
    expect(fake.endLiveActivity).toHaveBeenCalledWith(END_INPUT);
  });

  it('turns native errors into false or a no-op', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const fake = makeFake();
    fake.isLiveActivitySupported.mockImplementation(() => {
      throw new Error('native failure');
    });
    fake.startLiveActivity.mockRejectedValue(new Error('native failure'));
    fake.updateLiveActivity.mockRejectedValue(new Error('native failure'));
    fake.endLiveActivity.mockRejectedValue(new Error('native failure'));
    const port = createLiveActivityPort(async () => asModule(fake));

    await expect(port.isSupported()).resolves.toBe(false);
    await expect(port.start(START_INPUT)).resolves.toBe(false);
    await expect(port.update(UPDATE_INPUT)).resolves.toBe(false);
    await expect(port.end(END_INPUT)).resolves.toBeUndefined();
  });

  it('turns a throwing loader into false or a no-op', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const port = createLiveActivityPort(async () => {
      throw new Error('module missing');
    });

    await expect(port.isSupported()).resolves.toBe(false);
    await expect(port.start(START_INPUT)).resolves.toBe(false);
    await expect(port.update(UPDATE_INPUT)).resolves.toBe(false);
    await expect(port.end(END_INPUT)).resolves.toBeUndefined();
  });

  it('handles a missing native module', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const port = createLiveActivityPort(async () => null);

    await expect(port.isSupported()).resolves.toBe(false);
    await expect(port.start(START_INPUT)).resolves.toBe(false);
    await expect(port.update(UPDATE_INPUT)).resolves.toBe(false);
    await expect(port.end(END_INPUT)).resolves.toBeUndefined();
  });

  it('loads the native module through the default loader on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const fake = makeFake();
    mockRequireNativeModule.mockReturnValue(asModule(fake));

    const port = createLiveActivityPort();

    await expect(port.isSupported()).resolves.toBe(true);
    expect(mockRequireNativeModule).toHaveBeenCalledWith('DaytaleRecordingControls');
  });
});
