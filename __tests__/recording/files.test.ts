import { expoRecordingFiles } from '../../src/features/recording/files';
import { bytesOf, sha256Hex } from './testKit';

const mockArrayBuffer = jest.fn();
const mockDigest = jest.fn();

jest.mock('expo-file-system', () => ({
  File: class {
    private readonly location: string;
    public constructor(location: string) {
      this.location = location;
    }
    public arrayBuffer(): Promise<ArrayBuffer> {
      return mockArrayBuffer(this.location);
    }
  },
  Paths: { availableDiskSpace: 42_000 },
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: (algorithm: string, data: Uint8Array) => mockDigest(algorithm, data),
  randomUUID: () => '00000000-0000-4000-8000-000000000000',
}));

describe('expoRecordingFiles', () => {
  it('reads a capture file into bytes', async () => {
    mockArrayBuffer.mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer);

    expect(await expoRecordingFiles.readBytes('file:///cache/a.m4a')).toEqual(
      Uint8Array.from([1, 2, 3]),
    );
    expect(mockArrayBuffer).toHaveBeenCalledWith('file:///cache/a.m4a');
  });

  it('reports the free disk space', async () => {
    expect(await expoRecordingFiles.availableBytes()).toBe(42_000);
  });

  it('hex-encodes the SHA-256 digest of the bytes', async () => {
    mockDigest.mockImplementation(async (_algorithm: string, data: Uint8Array) => {
      const hex = sha256Hex(data);
      return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16)).buffer;
    });

    expect(await expoRecordingFiles.sha256(bytesOf('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(mockDigest).toHaveBeenCalledWith('SHA-256', bytesOf('abc'));
  });
});
