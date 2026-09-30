import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';

/** Device file, disk, and hashing access for recording. Tests inject fakes of this. */
export type RecordingFiles = {
  readBytes: (uri: string) => Promise<Uint8Array>;
  availableBytes: () => Promise<number>;
  sha256: (bytes: Uint8Array) => Promise<string>;
};

export const expoRecordingFiles: RecordingFiles = {
  readBytes: async (uri) => new Uint8Array(await new File(uri).arrayBuffer()),
  availableBytes: async () => Paths.availableDiskSpace,
  sha256: async (bytes) => {
    const hash = await digest(CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>);
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  },
};
