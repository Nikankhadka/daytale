import { Platform } from 'react-native';

import type { RecordingControlsNativeModule } from '../../../modules/recording-controls';
import {
  createNativeRecordingIntentStore,
  nativeRecordingIntentStore,
} from '../../../src/features/recording/controls/intentStore';

const mockRequireNativeModule = jest.fn();

jest.mock('expo', () => ({ requireNativeModule: mockRequireNativeModule }));

type Bridge = typeof import('../../../modules/recording-controls');

declare const require: (modulePath: string) => Bridge;

function loadBridge(): Bridge {
  let bridge!: Bridge;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    bridge = require('../../../modules/recording-controls');
  });
  return bridge;
}

function createFakeModule() {
  const readPendingIntents = jest.fn(async (): Promise<unknown[]> => []);
  const removePendingIntents = jest.fn(async (_ids: string[]): Promise<void> => undefined);
  const remove = jest.fn();
  const addListener = jest.fn(() => ({ remove }));
  const module = {
    readPendingIntents,
    removePendingIntents,
    addListener,
  } as unknown as RecordingControlsNativeModule;

  return { module, readPendingIntents, removePendingIntents, addListener, remove };
}

describe('native recording intent store', () => {
  it('reads the raw records from the native module without parsing them', async () => {
    const { module, readPendingIntents } = createFakeModule();
    const records = [
      {
        version: 99,
        id: 'not-a-uuid',
        kind: 'play',
        sessionId: null,
        createdAt: 'yesterday',
        source: 'elsewhere',
        transcript: 'private words',
      },
    ];
    readPendingIntents.mockResolvedValue(records);
    const store = createNativeRecordingIntentStore(async () => module);

    await expect(store.read()).resolves.toBe(records);
    expect(readPendingIntents).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list when the native module is absent', async () => {
    const store = createNativeRecordingIntentStore(async () => null);

    await expect(store.read()).resolves.toEqual([]);
  });

  it('returns an empty list when the native read throws', async () => {
    const { module, readPendingIntents } = createFakeModule();
    readPendingIntents.mockRejectedValue(new Error('native failure'));
    const store = createNativeRecordingIntentStore(async () => module);

    await expect(store.read()).resolves.toEqual([]);
  });

  it('returns an empty list when the loader throws', async () => {
    const store = createNativeRecordingIntentStore(async () => {
      throw new Error('module missing');
    });

    await expect(store.read()).resolves.toEqual([]);
  });

  it('removes the given ids through the native module', async () => {
    const { module, removePendingIntents } = createFakeModule();
    const store = createNativeRecordingIntentStore(async () => module);

    await store.remove(['a', 'b']);

    expect(removePendingIntents).toHaveBeenCalledWith(['a', 'b']);
  });

  it('does nothing when removing while the native module is absent', async () => {
    const store = createNativeRecordingIntentStore(async () => null);

    await expect(store.remove(['a'])).resolves.toBeUndefined();
  });

  it('does nothing when the native remove throws', async () => {
    const { module, removePendingIntents } = createFakeModule();
    removePendingIntents.mockRejectedValue(new Error('native failure'));
    const store = createNativeRecordingIntentStore(async () => module);

    await expect(store.remove(['a'])).resolves.toBeUndefined();
  });

  it('does not call the native module with an empty id list', async () => {
    const { module, removePendingIntents } = createFakeModule();
    const store = createNativeRecordingIntentStore(async () => module);

    await store.remove([]);

    expect(removePendingIntents).not.toHaveBeenCalled();
  });

  it('exports the native singleton', () => {
    expect(nativeRecordingIntentStore).toEqual({
      read: expect.any(Function),
      remove: expect.any(Function),
    });
  });
});

describe('recording controls native bridge', () => {
  beforeEach(() => {
    jest.resetModules();
    mockRequireNativeModule.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null on web before requiring the native module', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const { getRecordingControls } = loadBridge();

    expect(getRecordingControls()).toBeNull();
    expect(mockRequireNativeModule).not.toHaveBeenCalled();
  });

  it('requires the named native module once and caches it', async () => {
    const fake = createFakeModule();
    mockRequireNativeModule.mockReturnValue(fake.module);
    const { getRecordingControls } = loadBridge();

    expect(getRecordingControls()).toBe(fake.module);
    expect(getRecordingControls()).toBe(fake.module);
    expect(mockRequireNativeModule).toHaveBeenCalledTimes(1);
    expect(mockRequireNativeModule).toHaveBeenCalledWith('DaytaleRecordingControls');
  });

  it('returns null when the native module throws and does not retry the failure', async () => {
    mockRequireNativeModule.mockImplementation(() => {
      throw new Error('module missing');
    });
    const { getRecordingControls } = loadBridge();

    expect(getRecordingControls()).toBeNull();
    expect(getRecordingControls()).toBeNull();
    expect(mockRequireNativeModule).toHaveBeenCalledTimes(1);
  });

  it('subscribes to native intents and removes the listener on unsubscribe', async () => {
    const fake = createFakeModule();
    mockRequireNativeModule.mockReturnValue(fake.module);
    const { subscribeRecordingIntents } = loadBridge();
    const listener = jest.fn();

    const unsubscribe = subscribeRecordingIntents(listener);

    expect(fake.addListener).toHaveBeenCalledWith('onRecordingIntent', listener);
    expect(fake.remove).not.toHaveBeenCalled();

    unsubscribe();

    expect(fake.remove).toHaveBeenCalledTimes(1);
  });

  it('returns a no-op unsubscribe when the native module is absent', async () => {
    mockRequireNativeModule.mockImplementation(() => {
      throw new Error('module missing');
    });
    const { subscribeRecordingIntents } = loadBridge();

    const unsubscribe = subscribeRecordingIntents(jest.fn());

    expect(unsubscribe).toEqual(expect.any(Function));
    expect(() => unsubscribe()).not.toThrow();
  });
});
