import { requireNativeModule } from 'expo';

type AudioDecoderNativeModule = {
  decodeToWav: (inputPath: string, outputPath: string) => Promise<{ durationMs: number }>;
};

// Resolved on first use so web and unit tests never need the native module.
let native: AudioDecoderNativeModule | undefined;

/**
 * Decodes an audio file (the recorder writes AAC in M4A) into a 16 kHz mono PCM16 WAV and
 * resolves with the decoded duration. Both paths are plain filesystem paths. A file that holds no
 * decodable audio rejects with code ERR_INVALID_AUDIO, which retrying can never fix; any other
 * failure rejects with ERR_DECODE_FAILED, and no partial output is left behind either way.
 */
export async function decodeToWav(
  inputPath: string,
  outputPath: string,
): Promise<{ durationMs: number }> {
  native ??= requireNativeModule<AudioDecoderNativeModule>('AudioDecoder');
  return native.decodeToWav(inputPath, outputPath);
}
