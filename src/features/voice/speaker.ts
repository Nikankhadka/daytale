import type { SpeakerIdModelConfig } from '@siteed/sherpa-onnx.rn';

import { ensureModelAsset, type ModelAsset } from '../../shared/modelAssets';
import {
  VOICE_MODEL_VERSION,
  type SpeakerEmbeddingProvider,
  validateSpeakerEmbedding,
  VoiceEnrollmentError,
} from './enrollment';

// Upstream release tag really is spelled "speaker-recongition-models".
// sha256 357a834f702b80161e5b981182c038e18553c1f2ca752ed6cec2052365d4129b (see modelAssets.ts).
export const SPEAKER_MODEL_ASSET: ModelAsset = {
  name: '3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx',
  bytes: 29_596_978,
  md5: 'b3934a80bda2e80abdb134fcbc1cdc80',
};

// Samples are ~8s; the window only needs to cover the whole recording.
const MAX_WINDOW_MS = 30_000;

type SherpaSpeakerIdClient = {
  init: (config: SpeakerIdModelConfig) => Promise<{
    success: boolean;
    embeddingDim: number;
    error?: string;
  }>;
  processFileWindow: (
    filePath: string,
    startTimeMs: number,
    durationMs: number,
  ) => Promise<{
    success: boolean;
    embedding: number[];
    error?: string;
  }>;
};

// Loaded lazily so web and unit tests never touch the native module.
async function loadSherpaSpeakerId(): Promise<SherpaSpeakerIdClient> {
  return (await import('@siteed/sherpa-onnx.rn')).SpeakerId;
}

export function createSherpaSpeakerEmbeddingProvider(
  config: SpeakerIdModelConfig | (() => Promise<SpeakerIdModelConfig>),
  modelVersion = VOICE_MODEL_VERSION,
  loadClient: () => Promise<SherpaSpeakerIdClient> = loadSherpaSpeakerId,
): SpeakerEmbeddingProvider {
  let client: SherpaSpeakerIdClient | undefined;
  let initialization: Promise<void> | undefined;

  const prepare = async () => {
    if (initialization === undefined) {
      initialization = (async () => {
        const resolved = typeof config === 'function' ? await config() : config;
        const speakerId = await loadClient();
        const result = await speakerId.init(resolved);
        if (!result.success) {
          throw new VoiceEnrollmentError(
            result.error ?? 'The speaker model could not be initialized.',
          );
        }
        client = speakerId;
      })().catch((error: unknown) => {
        // Forget failures so a retry re-downloads / re-initializes instead of replaying the error.
        initialization = undefined;
        throw error;
      });
    }
    await initialization;
  };

  const embed = async (filePath: string, startMs: number, durationMs: number) => {
    await prepare();
    if (client === undefined) {
      throw new VoiceEnrollmentError('The speaker model is unavailable.');
    }

    // processFile is WAV-only on iOS; the windowed call decodes the recorded M4A on both platforms.
    const result = await client.processFileWindow(filePath, startMs, durationMs);
    if (!result.success) {
      throw new VoiceEnrollmentError(result.error ?? 'The voice sample could not be analyzed.');
    }
    return validateSpeakerEmbedding(result.embedding);
  };

  return {
    modelVersion,
    prepare,
    embeddingFromFile: (filePath) => embed(filePath, 0, MAX_WINDOW_MS),
    embeddingFromWindow: embed,
  };
}

export function createDefaultSpeakerEmbeddingProvider(
  loadClient?: () => Promise<SherpaSpeakerIdClient>,
): SpeakerEmbeddingProvider {
  return createSherpaSpeakerEmbeddingProvider(
    async () => {
      const { directory } = await ensureModelAsset(SPEAKER_MODEL_ASSET);
      return {
        modelDir: directory,
        modelFile: SPEAKER_MODEL_ASSET.name,
        sampleRate: 16_000,
        numThreads: 2,
        provider: 'cpu',
      };
    },
    VOICE_MODEL_VERSION,
    loadClient,
  );
}

export function unavailableSpeakerEmbeddingProvider(reason: string): SpeakerEmbeddingProvider {
  return {
    modelVersion: VOICE_MODEL_VERSION,
    embeddingFromFile: async () => {
      throw new VoiceEnrollmentError(reason);
    },
  };
}
