import {
  classifySpeaker,
  decodeEmbeddingEnvelope,
  encodeEmbeddingEnvelope,
  VOICE_MODEL_VERSION,
  VoiceEnrollmentController,
  VoiceEnrollmentError,
  type SpeakerEmbeddingProvider,
} from '../../src/features/voice/enrollment';
import {
  createDefaultSpeakerEmbeddingProvider,
  createSherpaSpeakerEmbeddingProvider,
  SPEAKER_MODEL_ASSET,
} from '../../src/features/voice/speaker';
import { ensureModelAsset } from '../../src/shared/modelAssets';
import type { VoiceProfile } from '../../src/storage/types';

jest.mock('../../src/shared/modelAssets', () => ({ ensureModelAsset: jest.fn() }));

const profileId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const now = '2026-09-26T00:00:00.000Z';

function createRepository() {
  let profile: VoiceProfile | null = null;
  return {
    getById: jest.fn(async () => profile),
    findById: jest.fn(async () => profile),
    list: jest.fn(async () => (profile === null ? [] : [profile])),
    save: jest.fn(async (next: VoiceProfile) => {
      profile = next;
      return next;
    }),
    deleteById: jest.fn(async () => {
      profile = null;
    }),
    getProfile: () => profile,
  };
}

function createProvider(embeddings: readonly (readonly number[])[]): SpeakerEmbeddingProvider {
  let index = 0;
  return {
    modelVersion: VOICE_MODEL_VERSION,
    embeddingFromFile: jest.fn(async () => embeddings[index++] ?? embeddings.at(-1) ?? []),
  };
}

function readyProfile(blob: string, overrides: Partial<VoiceProfile> = {}): VoiceProfile {
  return {
    id: profileId,
    status: 'ready',
    sampleCount: 3,
    encryptedEmbeddingBlob: blob,
    modelVersion: VOICE_MODEL_VERSION,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('DYT-005 voice enrollment', () => {
  it('requires exactly three valid samples before persisting a profile', async () => {
    const repository = createRepository();
    const controller = new VoiceEnrollmentController(
      repository,
      createProvider([
        [1, 0],
        [1, 0],
        [1, 0],
      ]),
      { id: profileId, now: () => now },
    );

    await expect(controller.captureSample(0, 'sample-one')).resolves.toBeNull();
    await expect(controller.captureSample(1, 'sample-two')).resolves.toBeNull();
    expect(repository.save).not.toHaveBeenCalled();
    await expect(controller.captureSample(2, 'sample-three')).resolves.toMatchObject({
      id: profileId,
      status: 'ready',
      sampleCount: 3,
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.getProfile()?.encryptedEmbeddingBlob).not.toContain('[1,0]');
    expect(
      decodeEmbeddingEnvelope(repository.getProfile()!.encryptedEmbeddingBlob).embedding,
    ).toEqual([1, 0]);
  });

  it('deletes a completed profile when a sample is retried, then supports re-enrollment', async () => {
    const repository = createRepository();
    const controller = new VoiceEnrollmentController(
      repository,
      createProvider([
        [1, 0],
        [1, 0],
        [1, 0],
        [0, 1],
        [0, 1],
        [0, 1],
      ]),
      { id: profileId, now: () => now },
    );

    await controller.captureSample(0, 'one');
    await controller.captureSample(1, 'two');
    await controller.captureSample(2, 'three');
    await controller.deleteSample(1);
    expect(controller.snapshot).toMatchObject({ sampleCount: 2, completed: false });
    expect(repository.deleteById).toHaveBeenCalledWith(profileId);
    expect(repository.getProfile()).toBeNull();

    await controller.captureSample(1, 'two-again');
    await controller.deleteProfile();
    expect(controller.snapshot).toMatchObject({ sampleCount: 0, completed: false });
    expect(repository.deleteById).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed and incompatible embeddings without advancing enrollment', async () => {
    const repository = createRepository();
    const malformedProvider: SpeakerEmbeddingProvider = {
      modelVersion: VOICE_MODEL_VERSION,
      embeddingFromFile: jest.fn(async () => [Number.NaN]),
    };
    const malformed = new VoiceEnrollmentController(repository, malformedProvider, {
      id: profileId,
      now: () => now,
    });
    await expect(malformed.captureSample(0, 'silence')).rejects.toBeInstanceOf(
      VoiceEnrollmentError,
    );
    expect(malformed.snapshot.sampleCount).toBe(0);

    const controller = new VoiceEnrollmentController(
      repository,
      createProvider([
        [1, 0],
        [1, 0, 0],
        [1, 0],
      ]),
      { id: profileId, now: () => now },
    );
    await controller.captureSample(0, 'one');
    await expect(controller.captureSample(1, 'wrong-dimension')).rejects.toThrow(
      'incompatible model dimensions',
    );
    expect(controller.snapshot.sampleCount).toBe(1);
  });

  it('leaves enrollment recoverable when final persistence fails', async () => {
    const repository = createRepository();
    repository.save.mockRejectedValueOnce(new Error('database unavailable'));
    const controller = new VoiceEnrollmentController(
      repository,
      createProvider([
        [1, 0],
        [1, 0],
        [1, 0],
        [0, 1],
      ]),
      { id: profileId, now: () => now },
    );

    await controller.captureSample(0, 'one');
    await controller.captureSample(1, 'two');
    await expect(controller.captureSample(2, 'three')).rejects.toThrow('database unavailable');
    expect(controller.snapshot).toMatchObject({ sampleCount: 2, completed: false });
    await expect(controller.captureSample(2, 'three-again')).resolves.toMatchObject({
      status: 'ready',
    });
  });

  it('uses conservative thresholds and keeps uncertain speakers unknown', () => {
    const profile: VoiceProfile = {
      id: profileId,
      status: 'ready',
      sampleCount: 3,
      encryptedEmbeddingBlob: encodeEmbeddingEnvelope([1, 0], VOICE_MODEL_VERSION),
      modelVersion: VOICE_MODEL_VERSION,
      createdAt: now,
      updatedAt: now,
    };

    expect(classifySpeaker(profile, [1, 0])).toBe('user');
    expect(classifySpeaker(profile, [0, 1], { otherEmbeddings: [[0, 1]] })).toBe('other');
    expect(classifySpeaker(profile, [0, 1])).toBe('unknown');
    expect(classifySpeaker(profile, [0.7, 0.7])).toBe('unknown');
    expect(classifySpeaker({ ...profile, encryptedEmbeddingBlob: 'corrupt' }, [1, 0])).toBe(
      'unknown',
    );
  });

  it('tells apart the user, other enrolled speakers, and unknown voices', () => {
    const profile = readyProfile(encodeEmbeddingEnvelope([1, 0, 0], VOICE_MODEL_VERSION));
    const others = [
      [0, 1, 0],
      [0, 0, 1],
    ];

    expect(classifySpeaker(profile, [0.95, 0.1, 0], { otherEmbeddings: others })).toBe('user');
    expect(classifySpeaker(profile, [0.05, 0.99, 0], { otherEmbeddings: others })).toBe('other');
    expect(classifySpeaker(profile, [0, 0.05, 0.99], { otherEmbeddings: others })).toBe('other');
    expect(classifySpeaker(profile, [0.6, 0.6, 0.5], { otherEmbeddings: others })).toBe('unknown');
    expect(classifySpeaker(profile, [0, 1, 0])).toBe('unknown');
  });

  it('never matches silence or unusable audio to anyone', async () => {
    const profile = readyProfile(encodeEmbeddingEnvelope([1, 0], VOICE_MODEL_VERSION));

    expect(classifySpeaker(profile, [0, 0], { otherEmbeddings: [[0, 1]] })).toBe('unknown');
    expect(classifySpeaker(profile, [])).toBe('unknown');
    expect(classifySpeaker(profile, [Number.NaN, 1])).toBe('unknown');
    expect(() => encodeEmbeddingEnvelope([0, 0, 0], VOICE_MODEL_VERSION)).toThrow('no signal');

    const controller = new VoiceEnrollmentController(
      createRepository(),
      createProvider([[0, 0, 0]]),
      { id: profileId, now: () => now },
    );
    await expect(controller.captureSample(0, 'silence')).rejects.toThrow('no signal');
    expect(controller.snapshot.sampleCount).toBe(0);
  });

  it('only classifies against a ready profile from the current model', () => {
    const blob = encodeEmbeddingEnvelope([1, 0], VOICE_MODEL_VERSION);

    expect(classifySpeaker(readyProfile(blob), [1, 0])).toBe('user');
    expect(classifySpeaker(readyProfile(blob, { status: 'pending' }), [1, 0])).toBe('unknown');
    expect(classifySpeaker(readyProfile(blob, { sampleCount: 2 }), [1, 0])).toBe('unknown');
    expect(classifySpeaker(readyProfile(blob, { modelVersion: 'older-model:1' }), [1, 0])).toBe(
      'unknown',
    );
  });

  it('deletes a saved profile even when this session never recorded it', async () => {
    const repository = createRepository();
    await repository.save(readyProfile(encodeEmbeddingEnvelope([1, 0], VOICE_MODEL_VERSION)));
    const controller = new VoiceEnrollmentController(repository, createProvider([[1, 0]]), {
      id: profileId,
      now: () => now,
    });

    await controller.deleteProfile();

    expect(repository.deleteById).toHaveBeenCalledWith(profileId);
    expect(repository.getProfile()).toBeNull();
    expect(controller.snapshot).toMatchObject({ sampleCount: 0, completed: false });
  });

  it('stores only an opaque versioned envelope, never raw embedding values', async () => {
    const repository = createRepository();
    const controller = new VoiceEnrollmentController(
      repository,
      createProvider([[0.123456, 0.654321, 0.111111]]),
      { id: profileId, now: () => now },
    );
    for (const slot of [0, 1, 2]) {
      await controller.captureSample(slot, `sample-${slot}`);
    }

    const stored = repository.getProfile()!;
    expect(stored.encryptedEmbeddingBlob).toMatch(/^daytale-voice-v1\.[A-Za-z0-9+/=]+$/);
    expect(stored.encryptedEmbeddingBlob).not.toContain('0.123456');
    expect(stored.encryptedEmbeddingBlob).not.toContain('embedding');
    expect(() => JSON.parse(stored.encryptedEmbeddingBlob)).toThrow();
    expect(decodeEmbeddingEnvelope(stored.encryptedEmbeddingBlob)).toEqual({
      embedding: [0.123456, 0.654321, 0.111111],
      modelVersion: VOICE_MODEL_VERSION,
    });
    expect(() => decodeEmbeddingEnvelope('daytale-voice-v2.abc')).toThrow(VoiceEnrollmentError);
    expect(() => decodeEmbeddingEnvelope('daytale-voice-v1.%%%')).toThrow('malformed');
  });
});

describe('DYT-005 speaker embedding provider', () => {
  const config = { modelDir: '/models', modelFile: 'm.onnx', sampleRate: 16_000 };

  function createClient() {
    return {
      init: jest.fn(async () => ({ success: true, embeddingDim: 2 })),
      processFileWindow: jest.fn(async () => ({ success: true, embedding: [0.5, 0.5] })),
    };
  }

  it('initializes once, then embeds the whole recording through the windowed call', async () => {
    const client = createClient();
    const provider = createSherpaSpeakerEmbeddingProvider(config, undefined, async () => client);

    await provider.prepare?.();
    await expect(provider.embeddingFromFile('/audio/sample.m4a')).resolves.toEqual([0.5, 0.5]);
    await provider.embeddingFromFile('/audio/sample.m4a');

    expect(client.init).toHaveBeenCalledTimes(1);
    expect(client.init).toHaveBeenCalledWith(config);
    expect(client.processFileWindow).toHaveBeenCalledWith('/audio/sample.m4a', 0, 30_000);
  });

  it('forgets a failed initialization so a retry can succeed', async () => {
    const client = createClient();
    client.init.mockResolvedValueOnce({
      success: false,
      embeddingDim: 0,
      error: 'bad model',
    } as never);
    const provider = createSherpaSpeakerEmbeddingProvider(config, undefined, async () => client);

    await expect(provider.prepare?.()).rejects.toThrow('bad model');
    await expect(provider.prepare?.()).resolves.toBeUndefined();

    expect(client.init).toHaveBeenCalledTimes(2);
  });

  it('rejects silent or failed analysis results', async () => {
    const client = createClient();
    const provider = createSherpaSpeakerEmbeddingProvider(config, undefined, async () => client);

    client.processFileWindow.mockResolvedValueOnce({ success: true, embedding: [0, 0] });
    await expect(provider.embeddingFromFile('/silent.m4a')).rejects.toThrow('no signal');
    client.processFileWindow.mockResolvedValueOnce({
      success: false,
      embedding: [],
      error: 'decode failed',
    } as never);
    await expect(provider.embeddingFromFile('/broken.m4a')).rejects.toThrow('decode failed');
  });

  it('downloads the English CAM++ model and points sherpa at its plain directory', async () => {
    jest.mocked(ensureModelAsset).mockResolvedValue({
      directory: '/documents/models',
      path: `/documents/models/${SPEAKER_MODEL_ASSET.name}`,
    });
    const client = createClient();
    const provider = createDefaultSpeakerEmbeddingProvider(async () => client);

    await provider.prepare?.();

    expect(ensureModelAsset).toHaveBeenCalledWith(SPEAKER_MODEL_ASSET);
    expect(client.init).toHaveBeenCalledWith(
      expect.objectContaining({
        modelDir: '/documents/models',
        modelFile: '3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx',
        sampleRate: 16_000,
      }),
    );
    expect(SPEAKER_MODEL_ASSET).toMatchObject({
      bytes: 29_596_978,
      md5: 'b3934a80bda2e80abdb134fcbc1cdc80',
    });
    expect(VOICE_MODEL_VERSION).toContain('3dspeaker_speech_campplus_sv_en_voxceleb_16k');
  });

  it('surfaces a failed model download and retries it on the next prepare', async () => {
    jest
      .mocked(ensureModelAsset)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ directory: '/d', path: '/d/m.onnx' });
    const client = createClient();
    const provider = createDefaultSpeakerEmbeddingProvider(async () => client);

    await expect(provider.prepare?.()).rejects.toThrow('offline');
    await expect(provider.prepare?.()).resolves.toBeUndefined();
    expect(ensureModelAsset).toHaveBeenCalledTimes(2);
  });
});
