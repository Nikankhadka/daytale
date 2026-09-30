import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { decodeToWav } from '../../../modules/audio-decoder';
import { toPlainPath } from '../../shared/modelAssets';
import type { StorageBootstrapResult } from '../../storage/bootstrap';
import { expoRecordingFiles } from '../recording/files';
import { createDefaultSpeakerEmbeddingProvider } from '../voice/speaker';
import type { TranscriptionDependencies, TranscriptionFiles } from './transcribe';
import { createWhisperEngine } from './whisper';

const SCRATCH_DIRECTORY = 'transcription';

/**
 * Scratch space for decoded audio, in the cache directory so the OS may reclaim it and backups
 * skip it. Paths are plain filesystem paths because that is what the native decoders expect.
 */
export function createScratchFiles(): TranscriptionFiles {
  const directory = () => new Directory(Paths.cache, SCRATCH_DIRECTORY);
  const fileFor = (name: string) => new File(directory(), name);

  return {
    reset: async () => {
      const scratch = directory();
      if (scratch.exists) {
        scratch.delete();
      }
      scratch.create({ intermediates: true, idempotent: true });
    },
    pathFor: (name) => toPlainPath(fileFor(name).uri),
    write: async (name, bytes) => {
      const file = fileFor(name);
      file.create({ overwrite: true });
      file.write(bytes);
    },
    remove: async (name) => {
      const file = fileFor(name);
      if (file.exists) {
        file.delete();
      }
    },
  };
}

/** The real device wiring: whisper.cpp models, the native decoder, sherpa speaker embeddings. */
export function createDefaultTranscriptionDeps(
  storage: StorageBootstrapResult,
): TranscriptionDependencies {
  return {
    storage,
    engine: createWhisperEngine(),
    decode: decodeToWav,
    files: createScratchFiles(),
    sha256: expoRecordingFiles.sha256,
    speaker: createDefaultSpeakerEmbeddingProvider(),
    uuid: randomUUID,
    now: () => new Date().toISOString(),
  };
}
