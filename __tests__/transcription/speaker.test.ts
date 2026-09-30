import {
  classifySpeaker,
  encodeEmbeddingEnvelope,
  scoreSpeaker,
  VOICE_MODEL_VERSION,
} from '../../src/features/voice/enrollment';
import { createSherpaSpeakerEmbeddingProvider } from '../../src/features/voice/speaker';
import type { VoiceProfile } from '../../src/storage/types';

jest.mock('../../src/shared/modelAssets', () => ({ ensureModelAsset: jest.fn() }));

function readyProfile(embedding: readonly number[], overrides: Partial<VoiceProfile> = {}) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'ready',
    sampleCount: 3,
    encryptedEmbeddingBlob: encodeEmbeddingEnvelope(embedding, VOICE_MODEL_VERSION),
    modelVersion: VOICE_MODEL_VERSION,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  } as VoiceProfile;
}

describe('scoreSpeaker', () => {
  it('returns the matching cosine score as the confidence of a user match', () => {
    const profile = readyProfile([1, 0]);

    const score = scoreSpeaker(profile, [0.9, 0.3]);

    expect(score.speaker).toBe('user');
    expect(score.confidence).toBeCloseTo(0.9 / Math.hypot(0.9, 0.3), 10);
  });

  it('scores another enrolled speaker by that speaker match', () => {
    const profile = readyProfile([1, 0]);

    expect(scoreSpeaker(profile, [0, 1], { otherEmbeddings: [[0, 1]] })).toEqual({
      speaker: 'other',
      confidence: 1,
    });
  });

  it('reports how close an unmatched voice came without calling it a match', () => {
    const profile = readyProfile([1, 0]);

    const score = scoreSpeaker(profile, [0.7, 0.7]);

    expect(score.speaker).toBe('unknown');
    expect(score.confidence).toBeCloseTo(Math.SQRT1_2, 10);
  });

  it('clamps a negative cosine score to zero', () => {
    expect(scoreSpeaker(readyProfile([1, 0]), [-1, 0])).toEqual({
      speaker: 'unknown',
      confidence: 0,
    });
  });

  it('gives confidence 0 when the profile or the embedding is unusable', () => {
    const unknown = { speaker: 'unknown', confidence: 0 };

    expect(scoreSpeaker(readyProfile([1, 0], { status: 'pending' }), [1, 0])).toEqual(unknown);
    expect(scoreSpeaker(readyProfile([1, 0], { sampleCount: 2 }), [1, 0])).toEqual(unknown);
    expect(scoreSpeaker(readyProfile([1, 0], { modelVersion: 'older:1' }), [1, 0])).toEqual(
      unknown,
    );
    expect(
      scoreSpeaker(readyProfile([1, 0], { encryptedEmbeddingBlob: 'corrupt' }), [1, 0]),
    ).toEqual(unknown);
    expect(scoreSpeaker(readyProfile([1, 0]), [])).toEqual(unknown);
    expect(scoreSpeaker(readyProfile([1, 0]), [0, 0])).toEqual(unknown);
    expect(scoreSpeaker(readyProfile([1, 0]), [Number.NaN, 1])).toEqual(unknown);
    expect(scoreSpeaker(readyProfile([1, 0]), [1, 0, 0])).toEqual(unknown);
  });

  it('keeps classifySpeaker returning the same label', () => {
    const profile = readyProfile([1, 0, 0]);
    const others = [[0, 1, 0]];
    const queries = [[1, 0, 0], [0, 1, 0], [0.6, 0.6, 0.5], [0, 0, 0], []];

    for (const query of queries) {
      expect(classifySpeaker(profile, query, { otherEmbeddings: others })).toBe(
        scoreSpeaker(profile, query, { otherEmbeddings: others }).speaker,
      );
    }
  });
});

describe('speaker provider embeddingFromWindow', () => {
  function createClient() {
    return {
      init: jest.fn(async () => ({ success: true, embeddingDim: 2 })),
      processFileWindow: jest.fn(async () => ({ success: true, embedding: [0.5, 0.25] })),
    };
  }
  const config = {
    modelDir: '/models',
    modelFile: 'speaker.onnx',
    sampleRate: 16_000,
    numThreads: 2,
    provider: 'cpu' as const,
  };

  it('embeds exactly the requested window and validates the result', async () => {
    const client = createClient();
    const provider = createSherpaSpeakerEmbeddingProvider(config, undefined, async () => client);

    await expect(provider.embeddingFromWindow?.('/audio/a.m4a', 4_000, 2_500)).resolves.toEqual([
      0.5, 0.25,
    ]);

    expect(client.processFileWindow).toHaveBeenCalledWith('/audio/a.m4a', 4_000, 2_500);
    expect(client.init).toHaveBeenCalledTimes(1);
  });

  it('rejects a failed or signal-less window', async () => {
    const client = createClient();
    const provider = createSherpaSpeakerEmbeddingProvider(config, undefined, async () => client);
    client.processFileWindow.mockResolvedValueOnce({
      success: false,
      embedding: [],
      error: 'bad',
    } as never);

    await expect(provider.embeddingFromWindow?.('/audio/a.m4a', 0, 1_000)).rejects.toThrow('bad');

    client.processFileWindow.mockResolvedValueOnce({ success: true, embedding: [0, 0] });
    await expect(provider.embeddingFromWindow?.('/audio/a.m4a', 0, 1_000)).rejects.toThrow(
      'no signal',
    );
  });
});
