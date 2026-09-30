import type { SpeakerEmbeddingProvider } from '../../src/features/voice/enrollment';
import { encodeEmbeddingEnvelope, VOICE_MODEL_VERSION } from '../../src/features/voice/enrollment';
import {
  transcribeSession,
  type TranscriptionDependencies,
  type TranscriptionFiles,
  type TranscriptionResult,
} from '../../src/features/transcription/transcribe';
import type {
  SpeechEngine,
  SpeechRegion,
  WhisperSegment,
} from '../../src/features/transcription/whisper';
import { createDefaultAppPreferences } from '../../src/features/preferences/index';
import type { Language, VoiceProfile } from '../../src/storage/types';
import { sha256Hex } from '../recording/testKit';
import { createStorageFixture, SESSION_ID, type StorageFixture } from './kit';

export const SCRATCH_DIRECTORY = '/scratch';
export const NOW = '2026-03-10T09:10:00.000Z';
export const DECODED_DURATION_MS = 30_000;

/** What the fakes do for the chunk with a given sequence. Everything is optional. */
export type ChunkScript = {
  durationMs?: number;
  decodeError?: unknown;
  /** Defaults to speech across the whole chunk. */
  regions?: SpeechRegion[];
  /** Defaults to one English sentence. */
  segments?: WhisperSegment[];
  language?: string;
  transcribeError?: unknown;
};

export const ENGLISH_SEGMENT: WhisperSegment = {
  text: ' I went to the market. ',
  startMs: 500,
  endMs: 4_000,
};

export function fakeFiles() {
  const store = new Map<string, Uint8Array>();
  const files: TranscriptionFiles & {
    store: Map<string, Uint8Array>;
    reset: jest.Mock;
    nameOf: (path: string) => string;
  } = {
    store,
    reset: jest.fn(async () => {
      store.clear();
    }),
    pathFor: (name) => `${SCRATCH_DIRECTORY}/${name}`,
    write: async (name, bytes) => {
      store.set(name, bytes);
    },
    remove: async (name) => {
      store.delete(name);
    },
    nameOf: (path) => path.slice(SCRATCH_DIRECTORY.length + 1),
  };
  return files;
}

export function readyProfile(embedding: readonly number[] = [1, 0]): VoiceProfile {
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    status: 'ready',
    sampleCount: 3,
    encryptedEmbeddingBlob: encodeEmbeddingEnvelope(embedding, VOICE_MODEL_VERSION),
    modelVersion: VOICE_MODEL_VERSION,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  };
}

export function fakeSpeaker(embedding: readonly number[] = [1, 0]) {
  return {
    modelVersion: VOICE_MODEL_VERSION,
    prepare: jest.fn(async () => undefined),
    embeddingFromFile: jest.fn(async () => embedding),
    embeddingFromWindow: jest.fn(async () => embedding),
  } satisfies SpeakerEmbeddingProvider;
}

export type Pipeline = StorageFixture & {
  deps: TranscriptionDependencies;
  files: ReturnType<typeof fakeFiles>;
  engine: { [Key in keyof SpeechEngine]: jest.Mock };
  decode: jest.Mock;
  scripts: Record<number, ChunkScript>;
  /** The largest number of engine calls that were in flight at once. */
  maxConcurrentEngineCalls: () => number;
  run: (signal?: AbortSignal) => Promise<TranscriptionResult>;
};

export async function createPipeline(
  options: {
    chunks?: number;
    scripts?: Record<number, ChunkScript>;
    speaker?: SpeakerEmbeddingProvider;
    voiceProfile?: VoiceProfile;
    spokenLanguages?: Language[];
  } = {},
): Promise<Pipeline> {
  const storage = await createStorageFixture(options.chunks ?? 1);
  const { repositories } = storage;
  if (options.spokenLanguages !== undefined) {
    await repositories.appPreferences.save({
      ...createDefaultAppPreferences(NOW, 'UTC'),
      spokenLanguages: options.spokenLanguages,
      journalLanguage: options.spokenLanguages[0],
    });
  }
  if (options.voiceProfile !== undefined) {
    await repositories.voiceProfiles.save(options.voiceProfile);
  }

  const scripts: Record<number, ChunkScript> = { ...options.scripts };
  const files = fakeFiles();
  const sequenceOfWav = new Map<string, number>();
  const scriptFor = (wavPath: string): ChunkScript =>
    scripts[sequenceOfWav.get(wavPath) ?? -1] ?? {};
  let active = 0;
  let peak = 0;
  const tracked = async <T>(work: () => Promise<T> | T): Promise<T> => {
    active += 1;
    peak = Math.max(peak, active);
    try {
      await Promise.resolve();
      return await work();
    } finally {
      active -= 1;
    }
  };

  const decode = jest.fn(async (inputPath: string, outputPath: string) => {
    const source = files.store.get(files.nameOf(inputPath));
    if (source === undefined) {
      throw new Error('decoder was given a file that is not on disk');
    }
    const sequence = Number(new TextDecoder().decode(source).replace('m4a-bytes-', ''));
    const script = scripts[sequence] ?? {};
    sequenceOfWav.set(outputPath, sequence);
    if (script.decodeError !== undefined) {
      throw script.decodeError;
    }
    files.store.set(files.nameOf(outputPath), new Uint8Array([1, 2, 3]));
    return { durationMs: script.durationMs ?? DECODED_DURATION_MS };
  });

  const engine = {
    detectSpeech: jest.fn((wavPath: string) =>
      tracked(() => scriptFor(wavPath).regions ?? [{ startMs: 0, endMs: DECODED_DURATION_MS }]),
    ),
    transcribe: jest.fn((wavPath: string) =>
      tracked(() => {
        const script = scriptFor(wavPath);
        if (script.transcribeError !== undefined) {
          throw script.transcribeError;
        }
        return {
          language: script.language ?? 'en',
          segments: script.segments ?? [ENGLISH_SEGMENT],
        };
      }),
    ),
    release: jest.fn(async () => undefined),
  };

  let uuidCounter = 0;
  const deps: TranscriptionDependencies = {
    storage,
    engine,
    decode,
    files,
    sha256: async (bytes) => sha256Hex(bytes),
    speaker: options.speaker,
    uuid: () => {
      uuidCounter += 1;
      return `ffffffff-ffff-4fff-8fff-${String(uuidCounter).padStart(12, '0')}`;
    },
    now: () => NOW,
  };

  return {
    ...storage,
    deps,
    files,
    engine,
    decode,
    scripts,
    maxConcurrentEngineCalls: () => peak,
    run: (signal) => transcribeSession(deps, SESSION_ID, { signal }),
  };
}
