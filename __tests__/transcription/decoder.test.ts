import { requireNativeModule } from 'expo';

import { decodeToWav } from '../../modules/audio-decoder';

const mockNative = { decodeToWav: jest.fn() };

jest.mock('expo', () => ({ requireNativeModule: jest.fn(() => mockNative) }));

const mockedRequire = requireNativeModule as jest.Mock;

describe('decodeToWav', () => {
  it('does not touch the native module until it is used', () => {
    expect(mockedRequire).not.toHaveBeenCalled();
  });

  it('passes both paths to the native decoder and resolves with the duration', async () => {
    mockNative.decodeToWav.mockResolvedValueOnce({ durationMs: 4_200 });

    await expect(decodeToWav('/scratch/a.m4a', '/scratch/a.wav')).resolves.toEqual({
      durationMs: 4_200,
    });

    expect(mockedRequire).toHaveBeenCalledWith('AudioDecoder');
    expect(mockNative.decodeToWav).toHaveBeenCalledWith('/scratch/a.m4a', '/scratch/a.wav');
  });

  it('loads the native module only once', async () => {
    mockNative.decodeToWav.mockResolvedValue({ durationMs: 1 });

    await decodeToWav('/scratch/b.m4a', '/scratch/b.wav');
    await decodeToWav('/scratch/c.m4a', '/scratch/c.wav');

    expect(mockedRequire).not.toHaveBeenCalled();
    expect(mockNative.decodeToWav).toHaveBeenCalledTimes(2);
  });

  it('rejects with the native error code untouched', async () => {
    const native = Object.assign(new Error('no audio'), { code: 'ERR_INVALID_AUDIO' });
    mockNative.decodeToWav.mockRejectedValueOnce(native);

    await expect(decodeToWav('/scratch/d.m4a', '/scratch/d.wav')).rejects.toBe(native);
  });
});
