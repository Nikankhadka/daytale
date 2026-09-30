import {
  centisecondsToMs,
  createWhisperEngine,
  TRANSCRIPTION_MODEL_VERSION,
  VAD_MODEL_ASSET,
  WHISPER_MODEL_ASSET,
} from '../../src/features/transcription/whisper';

type FakeTranscribe = { stop: jest.Mock; promise: Promise<unknown> };

function createFakes() {
  const transcribeCalls: { path: string; options: unknown }[] = [];
  let pending: FakeTranscribe | undefined;
  const whisperContext = {
    transcribe: jest.fn((path: string, options: unknown) => {
      transcribeCalls.push({ path, options });
      return (
        pending ?? {
          stop: jest.fn(async () => undefined),
          promise: Promise.resolve({
            result: ' Hello there.',
            language: 'en',
            isAborted: false,
            segments: [
              { text: ' Hello there.', t0: 0, t1: 150 },
              { text: ' नमस्ते ', t0: 150, t1: 250.4 },
            ],
          }),
        }
      );
    }),
    release: jest.fn(async () => undefined),
  };
  const vadContext = {
    detectSpeech: jest.fn(async () => [
      { t0: 10, t1: 120 },
      { t0: 150, t1: 260 },
    ]),
    release: jest.fn(async () => undefined),
  };
  const module = {
    initWhisper: jest.fn(async () => whisperContext),
    initWhisperVad: jest.fn(async () => vadContext),
  };
  const ensureAsset = jest.fn(async (asset: { name: string }) => ({
    directory: '/models',
    path: `/models/${asset.name}`,
  }));
  const engine = createWhisperEngine({
    loadModule: async () => module as never,
    ensureAsset: ensureAsset as never,
  });
  return {
    engine,
    module,
    whisperContext,
    vadContext,
    ensureAsset,
    transcribeCalls,
    setPending: (next: FakeTranscribe) => {
      pending = next;
    },
  };
}

describe('model assets', () => {
  it('pins both models by size and md5 and exposes the model version', () => {
    expect(TRANSCRIPTION_MODEL_VERSION).toBe('whisper-small-q5_1');
    expect(WHISPER_MODEL_ASSET).toMatchObject({
      name: 'ggml-small-q5_1.bin',
      bytes: 190_085_487,
      md5: '059a696cdb92d3b1c6103f420fa3352e',
    });
    expect(VAD_MODEL_ASSET).toMatchObject({
      name: 'ggml-silero-v5.1.2.bin',
      bytes: 885_098,
      md5: 'c8f289194a1366986c40550364f9ac70',
    });
  });
});

describe('centisecondsToMs', () => {
  it('converts whisper 10 ms units to whole milliseconds', () => {
    expect(centisecondsToMs(0)).toBe(0);
    expect(centisecondsToMs(150)).toBe(1_500);
    expect(centisecondsToMs(250.4)).toBe(2_504);
    expect(centisecondsToMs(0.04)).toBe(0);
  });
});

describe('createWhisperEngine', () => {
  it('detects speech regions in milliseconds using the pinned VAD model', async () => {
    const { engine, module, vadContext, ensureAsset } = createFakes();

    await expect(engine.detectSpeech('/tmp/a.wav')).resolves.toEqual([
      { startMs: 100, endMs: 1_200 },
      { startMs: 1_500, endMs: 2_600 },
    ]);

    expect(ensureAsset).toHaveBeenCalledWith(VAD_MODEL_ASSET);
    expect(module.initWhisperVad).toHaveBeenCalledWith({
      filePath: `/models/${VAD_MODEL_ASSET.name}`,
    });
    expect(vadContext.detectSpeech).toHaveBeenCalledWith('/tmp/a.wav');
  });

  it('transcribes with the requested language and converts segment times', async () => {
    const { engine, module, ensureAsset, transcribeCalls } = createFakes();

    const result = await engine.transcribe('/tmp/a.wav', { language: 'auto' });

    expect(result).toEqual({
      language: 'en',
      segments: [
        { text: 'Hello there.', startMs: 0, endMs: 1_500 },
        { text: 'नमस्ते', startMs: 1_500, endMs: 2_504 },
      ],
    });
    expect(ensureAsset).toHaveBeenCalledWith(WHISPER_MODEL_ASSET);
    expect(module.initWhisper).toHaveBeenCalledWith({
      filePath: `/models/${WHISPER_MODEL_ASSET.name}`,
    });
    expect(transcribeCalls).toEqual([{ path: '/tmp/a.wav', options: { language: 'auto' } }]);
  });

  it('passes a pinned language through', async () => {
    const { engine, transcribeCalls } = createFakes();

    await engine.transcribe('/tmp/a.wav', { language: 'ne' });

    expect(transcribeCalls[0].options).toEqual({ language: 'ne' });
  });

  it('loads each model once and reuses it', async () => {
    const { engine, module } = createFakes();

    await engine.transcribe('/tmp/a.wav', { language: 'en' });
    await engine.transcribe('/tmp/b.wav', { language: 'en' });
    await engine.detectSpeech('/tmp/a.wav');
    await engine.detectSpeech('/tmp/b.wav');

    expect(module.initWhisper).toHaveBeenCalledTimes(1);
    expect(module.initWhisperVad).toHaveBeenCalledTimes(1);
  });

  it('retries loading after a failed load instead of replaying the failure', async () => {
    const { engine, module } = createFakes();
    module.initWhisper.mockRejectedValueOnce(new Error('model file is corrupt'));

    await expect(engine.transcribe('/tmp/a.wav', { language: 'en' })).rejects.toThrow('corrupt');
    await expect(engine.transcribe('/tmp/a.wav', { language: 'en' })).resolves.toBeDefined();

    expect(module.initWhisper).toHaveBeenCalledTimes(2);
  });

  it('propagates a transcribe failure', async () => {
    const { engine, setPending } = createFakes();
    setPending({ stop: jest.fn(), promise: Promise.reject(new Error('whisper exploded')) });

    await expect(engine.transcribe('/tmp/a.wav', { language: 'en' })).rejects.toThrow(
      'whisper exploded',
    );
  });

  it('treats an aborted native result as a failure', async () => {
    const { engine, setPending } = createFakes();
    setPending({
      stop: jest.fn(),
      promise: Promise.resolve({ result: '', language: 'en', segments: [], isAborted: true }),
    });

    await expect(engine.transcribe('/tmp/a.wav', { language: 'en' })).rejects.toThrow('stopped');
  });

  it('stops the native transcription when the signal aborts', async () => {
    const { engine, setPending } = createFakes();
    const stop = jest.fn(async () => undefined);
    let finish: (value: unknown) => void = () => undefined;
    setPending({ stop, promise: new Promise((resolve) => (finish = resolve)) });
    const controller = new AbortController();

    const running = engine.transcribe('/tmp/a.wav', {
      language: 'en',
      signal: controller.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    finish({ result: '', language: 'en', segments: [], isAborted: true });

    await expect(running).rejects.toThrow();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('does not start when the signal is already aborted', async () => {
    const { engine, module } = createFakes();
    const controller = new AbortController();
    controller.abort();

    await expect(
      engine.transcribe('/tmp/a.wav', { language: 'en', signal: controller.signal }),
    ).rejects.toThrow();
    expect(module.initWhisper).not.toHaveBeenCalled();
  });

  it('releases both loaded models and loads them again afterwards', async () => {
    const { engine, module, whisperContext, vadContext } = createFakes();
    await engine.transcribe('/tmp/a.wav', { language: 'en' });
    await engine.detectSpeech('/tmp/a.wav');

    await engine.release();
    await engine.transcribe('/tmp/a.wav', { language: 'en' });

    expect(whisperContext.release).toHaveBeenCalledTimes(1);
    expect(vadContext.release).toHaveBeenCalledTimes(1);
    expect(module.initWhisper).toHaveBeenCalledTimes(2);
  });

  it('releases without error when nothing was loaded', async () => {
    const { engine, module } = createFakes();

    await expect(engine.release()).resolves.toBeUndefined();
    expect(module.initWhisper).not.toHaveBeenCalled();
  });
});
