import {
  ensureModelAsset,
  type ModelAsset,
  type ModelAssetLocation,
} from '../../shared/modelAssets';
import type { WhisperLanguageOption } from './language';

export const TRANSCRIPTION_MODEL_VERSION = 'whisper-small-q5_1';

// Pinned like SPEAKER_MODEL_ASSET: the device verifies size + md5 before the model is ever loaded.
export const WHISPER_MODEL_ASSET: ModelAsset = {
  name: 'ggml-small-q5_1.bin',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
  bytes: 190_085_487,
  md5: '059a696cdb92d3b1c6103f420fa3352e',
};

export const VAD_MODEL_ASSET: ModelAsset = {
  name: 'ggml-silero-v5.1.2.bin',
  url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin',
  bytes: 885_098,
  md5: 'c8f289194a1366986c40550364f9ac70',
};

/** A voiced stretch of the chunk, in milliseconds from the start of the chunk. */
export type SpeechRegion = { startMs: number; endMs: number };

export type WhisperSegment = { text: string; startMs: number; endMs: number };

export type WhisperTranscription = {
  /** Language whisper settled on for the chunk (ISO 639-1), when it reports one. */
  language?: string;
  segments: WhisperSegment[];
};

/** The on-device speech models, behind a small interface so tests run without native code. */
export type SpeechEngine = {
  /** Voiced regions of a 16 kHz mono PCM16 WAV. */
  detectSpeech: (wavPath: string) => Promise<SpeechRegion[]>;
  transcribe: (
    wavPath: string,
    options: { language: WhisperLanguageOption; signal?: AbortSignal },
  ) => Promise<WhisperTranscription>;
  /** Frees the native model memory; the next call loads the models again. */
  release: () => Promise<void>;
};

type WhisperModule = Pick<typeof import('whisper.rn/index'), 'initWhisper' | 'initWhisperVad'>;

export type WhisperEngineOptions = {
  loadModule?: () => Promise<WhisperModule>;
  ensureAsset?: (asset: ModelAsset) => Promise<ModelAssetLocation>;
};

// whisper.cpp reports every timestamp, from both the VAD and the decoder, in 10 ms units.
// Confirmed from the whisper.cpp source; to be re-confirmed against a real recording at the
// device gate.
const MS_PER_CENTISECOND = 10;

export function centisecondsToMs(centiseconds: number): number {
  return Math.round(centiseconds * MS_PER_CENTISECOND);
}

// Loaded lazily so web and unit tests never touch the native module.
async function loadWhisperModule(): Promise<WhisperModule> {
  return import('whisper.rn/index');
}

export function createWhisperEngine({
  loadModule = loadWhisperModule,
  ensureAsset = ensureModelAsset,
}: WhisperEngineOptions = {}): SpeechEngine {
  type Whisper = Awaited<ReturnType<WhisperModule['initWhisper']>>;
  type Vad = Awaited<ReturnType<WhisperModule['initWhisperVad']>>;
  let whisper: Promise<Whisper> | undefined;
  let vad: Promise<Vad> | undefined;

  // Forgets a failed load so a retry re-downloads or re-initializes instead of replaying it.
  const once = <T>(load: () => Promise<T>, reset: () => void): Promise<T> =>
    load().catch((error: unknown) => {
      reset();
      throw error;
    });

  const whisperContext = () => {
    whisper ??= once(
      async () => {
        const [module, model] = await Promise.all([loadModule(), ensureAsset(WHISPER_MODEL_ASSET)]);
        return module.initWhisper({ filePath: model.path });
      },
      () => (whisper = undefined),
    );
    return whisper;
  };
  const vadContext = () => {
    vad ??= once(
      async () => {
        const [module, model] = await Promise.all([loadModule(), ensureAsset(VAD_MODEL_ASSET)]);
        return module.initWhisperVad({ filePath: model.path });
      },
      () => (vad = undefined),
    );
    return vad;
  };

  return {
    detectSpeech: async (wavPath) => {
      const segments = await (await vadContext()).detectSpeech(wavPath);
      return segments.map((segment) => ({
        startMs: centisecondsToMs(segment.t0),
        endMs: centisecondsToMs(segment.t1),
      }));
    },

    transcribe: async (wavPath, { language, signal }) => {
      if (signal?.aborted) {
        throw new Error('Transcription was stopped before it started.');
      }
      const { stop, promise } = (await whisperContext()).transcribe(wavPath, { language });
      const abort = () => void stop().catch(() => undefined);
      signal?.addEventListener('abort', abort);
      try {
        // Re-checked after the model loaded, so an abort during a long model load still stops.
        if (signal?.aborted) {
          abort();
        }
        const result = await promise;
        if (result.isAborted) {
          throw new Error('Transcription was stopped before it finished.');
        }
        return {
          language: result.language || undefined,
          segments: result.segments.map((segment) => ({
            text: segment.text.trim(),
            startMs: centisecondsToMs(segment.t0),
            endMs: centisecondsToMs(segment.t1),
          })),
        };
      } finally {
        signal?.removeEventListener('abort', abort);
      }
    },

    release: async () => {
      const [loadedWhisper, loadedVad] = [whisper, vad];
      whisper = undefined;
      vad = undefined;
      await Promise.allSettled([
        loadedWhisper?.then((context) => context.release()),
        loadedVad?.then((context) => context.release()),
      ]);
    },
  };
}
