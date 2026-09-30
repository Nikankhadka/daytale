import { LOW_CONFIDENCE_THRESHOLD } from '../../src/features/transcription/confidence';
import {
  INVALID_AUDIO_CODE,
  MIN_SPEAKER_WINDOW_MS,
  transcribeSession,
} from '../../src/features/transcription/transcribe';
import { ModelAssetError } from '../../src/shared/modelAssets';
import type { TranscriptSegment } from '../../src/storage/types';
import { chunkAudio, chunkId, chunkState, countRows, SESSION_ID } from './kit';
import {
  createPipeline,
  ENGLISH_SEGMENT,
  fakeSpeaker,
  NOW,
  readyProfile,
  SCRATCH_DIRECTORY,
  type Pipeline,
} from './pipelineKit';

async function segmentsOf(pipeline: Pipeline): Promise<TranscriptSegment[]> {
  return (await pipeline.repositories.transcriptSegments.list()).sort((a, b) =>
    a.chunkId === b.chunkId ? a.startMs - b.startMs : a.chunkId.localeCompare(b.chunkId),
  );
}

function invalidAudio(): Error {
  return Object.assign(new Error('not audio'), { code: INVALID_AUDIO_CODE });
}

describe('transcribeSession', () => {
  describe('an English chunk', () => {
    it('persists a tagged, timed segment, deletes the audio and writes one receipt', async () => {
      const pipeline = await createPipeline();

      const result = await pipeline.run();

      expect(result).toEqual({
        status: 'complete',
        transcribed: 1,
        discarded: 0,
        receiptWritten: true,
      });
      const [segment] = await segmentsOf(pipeline);
      expect(await segmentsOf(pipeline)).toHaveLength(1);
      expect(segment).toMatchObject({
        sessionId: SESSION_ID,
        chunkId: chunkId(0),
        text: 'I went to the market.',
        language: 'en',
        startMs: 500,
        endMs: 4_000,
        speaker: 'unknown',
        speakerConfidence: 0,
        createdAt: NOW,
      });
      expect(segment.transcriptConfidence).toBeGreaterThan(LOW_CONFIDENCE_THRESHOLD);
      expect(chunkState(pipeline.database, 0)).toBe('transcribed');
      expect(await chunkAudio(pipeline.database, 0)).toBeNull();

      const receipts = await pipeline.repositories.cleanupReceipts.list();
      expect(receipts).toHaveLength(1);
      expect(receipts[0]).toMatchObject({
        sessionId: SESSION_ID,
        reason: 'success',
        deletedKinds: ['audio_chunks'],
      });
    });

    it('hands the decoder the stored bytes and whisper the decoded file', async () => {
      const pipeline = await createPipeline();

      await pipeline.run();

      const [inputPath, outputPath] = pipeline.decode.mock.calls[0];
      expect(inputPath).toMatch(new RegExp(`^${SCRATCH_DIRECTORY}/.+\\.m4a$`));
      expect(outputPath).toMatch(new RegExp(`^${SCRATCH_DIRECTORY}/.+\\.wav$`));
      expect(pipeline.engine.detectSpeech).toHaveBeenCalledWith(outputPath);
      expect(pipeline.engine.transcribe).toHaveBeenCalledWith(
        outputPath,
        expect.objectContaining({ language: 'auto' }),
      );
    });

    it('keeps timestamps relative to the chunk and inside the decoded audio', async () => {
      const pipeline = await createPipeline({
        scripts: {
          0: {
            durationMs: 10_000,
            segments: [
              { text: 'Near the end of the chunk.', startMs: 9_000, endMs: 14_000 },
              { text: 'Past the end of the chunk entirely.', startMs: 12_000, endMs: 13_000 },
            ],
            regions: [{ startMs: 0, endMs: 10_000 }],
          },
        },
      });

      await pipeline.run();

      const segments = await segmentsOf(pipeline);
      expect(segments.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([
        [9_000, 10_000],
        [10_000, 10_000],
      ]);
    });
  });

  describe('language', () => {
    it('tags Nepali text as Nepali', async () => {
      const pipeline = await createPipeline({
        scripts: {
          0: {
            language: 'ne',
            segments: [{ text: 'म आज बजार गएँ र तरकारी किनें', startMs: 0, endMs: 4_000 }],
          },
        },
      });

      await pipeline.run();

      expect(await segmentsOf(pipeline)).toMatchObject([{ language: 'ne' }]);
    });

    it('tags each segment of a mixed chunk by its own script', async () => {
      const pipeline = await createPipeline({
        scripts: {
          0: {
            segments: [
              { text: 'I met Sita at the shop.', startMs: 0, endMs: 3_000 },
              { text: 'उनले भनिन् धेरै दिन भयो', startMs: 3_000, endMs: 6_000 },
              { text: 'Then we had tea.', startMs: 6_000, endMs: 9_000 },
            ],
          },
        },
      });

      await pipeline.run();

      expect((await segmentsOf(pipeline)).map((segment) => segment.language)).toEqual([
        'en',
        'ne',
        'en',
      ]);
    });

    it.each([
      [['en'], 'en'],
      [['ne'], 'ne'],
      [['en', 'ne'], 'auto'],
    ] as const)('asks whisper for %j as %s', async (spokenLanguages, expected) => {
      const pipeline = await createPipeline({ spokenLanguages: [...spokenLanguages] });

      await pipeline.run();

      expect(pipeline.engine.transcribe).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ language: expected }),
      );
    });

    it('keeps text whisper heard in another language, but rates it low', async () => {
      const pipeline = await createPipeline({
        scripts: { 0: { language: 'hi', segments: [ENGLISH_SEGMENT] } },
      });

      await pipeline.run();

      const [segment] = await segmentsOf(pipeline);
      expect(segment.text).toBe('I went to the market.');
      expect(segment.transcriptConfidence).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
    });
  });

  describe('segment quality', () => {
    it('drops empty and unreadable segments and keeps the rest', async () => {
      const pipeline = await createPipeline({
        scripts: {
          0: {
            segments: [
              { text: '   ', startMs: 0, endMs: 1_000 },
              { text: '...', startMs: 1_000, endMs: 2_000 },
              { text: '字幕', startMs: 2_000, endMs: 3_000 },
              { text: 'Good morning.', startMs: 3_000, endMs: 5_000 },
            ],
          },
        },
      });

      await pipeline.run();

      expect((await segmentsOf(pipeline)).map((segment) => segment.text)).toEqual([
        'Good morning.',
      ]);
    });

    it('persists low-confidence segments instead of dropping them', async () => {
      const pipeline = await createPipeline({
        scripts: {
          0: {
            regions: [{ startMs: 0, endMs: 500 }],
            segments: [
              { text: 'thank you thank you thank you thank you', startMs: 2_000, endMs: 6_000 },
            ],
          },
        },
      });

      await pipeline.run();

      const [segment] = await segmentsOf(pipeline);
      expect(segment.text).toBe('thank you thank you thank you thank you');
      expect(segment.transcriptConfidence).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
      expect(chunkState(pipeline.database, 0)).toBe('transcribed');
    });
  });

  describe('silence', () => {
    it('settles a chunk with no speech without asking whisper to transcribe it', async () => {
      const pipeline = await createPipeline({ scripts: { 0: { regions: [] } } });

      const result = await pipeline.run();

      expect(result).toMatchObject({ status: 'complete', transcribed: 1, receiptWritten: true });
      expect(pipeline.engine.transcribe).not.toHaveBeenCalled();
      expect(countRows(pipeline.database, 'transcript_segments')).toBe(0);
      expect(chunkState(pipeline.database, 0)).toBe('transcribed');
      expect(await chunkAudio(pipeline.database, 0)).toBeNull();
    });

    it('settles a chunk whisper transcribed to nothing', async () => {
      const pipeline = await createPipeline({ scripts: { 0: { segments: [] } } });

      await pipeline.run();

      expect(countRows(pipeline.database, 'transcript_segments')).toBe(0);
      expect(chunkState(pipeline.database, 0)).toBe('transcribed');
    });
  });

  describe('chunks that can never be transcribed', () => {
    it('discards a chunk the decoder rejects and carries on with the next one', async () => {
      const pipeline = await createPipeline({
        chunks: 2,
        scripts: { 0: { decodeError: invalidAudio() } },
      });

      const result = await pipeline.run();

      expect(result).toEqual({
        status: 'complete',
        transcribed: 1,
        discarded: 1,
        receiptWritten: true,
      });
      expect(chunkState(pipeline.database, 0)).toBe('deleted');
      expect(await chunkAudio(pipeline.database, 0)).toBeNull();
      expect(chunkState(pipeline.database, 1)).toBe('transcribed');
      expect((await segmentsOf(pipeline)).map((segment) => segment.chunkId)).toEqual([chunkId(1)]);
      expect(pipeline.engine.detectSpeech).toHaveBeenCalledTimes(1);
    });

    it('discards a chunk whose bytes no longer match the recorded hash', async () => {
      const pipeline = await createPipeline({ chunks: 2 });
      pipeline.database.native
        .prepare('UPDATE audio_chunks SET audio = ? WHERE id = ?')
        .run(new Uint8Array([9, 9, 9]), chunkId(0));

      const result = await pipeline.run();

      expect(result).toMatchObject({ status: 'complete', transcribed: 1, discarded: 1 });
      expect(chunkState(pipeline.database, 0)).toBe('deleted');
      expect(pipeline.decode).toHaveBeenCalledTimes(1);
    });

    it('discards a closed chunk that has no bytes', async () => {
      const pipeline = await createPipeline({ chunks: 2 });
      pipeline.database.native
        .prepare('UPDATE audio_chunks SET audio = NULL WHERE id = ?')
        .run(chunkId(0));

      const result = await pipeline.run();

      expect(result).toMatchObject({ status: 'complete', transcribed: 1, discarded: 1 });
      expect(chunkState(pipeline.database, 0)).toBe('deleted');
    });

    it('writes the success receipt when every chunk was discarded', async () => {
      const pipeline = await createPipeline({ scripts: { 0: { decodeError: invalidAudio() } } });

      const result = await pipeline.run();

      expect(result).toEqual({
        status: 'complete',
        transcribed: 0,
        discarded: 1,
        receiptWritten: true,
      });
    });

    it('does not treat other decoder failures as a malformed chunk', async () => {
      const pipeline = await createPipeline({
        scripts: {
          0: { decodeError: Object.assign(new Error('codec busy'), { code: 'ERR_DECODE_FAILED' }) },
        },
      });

      const result = await pipeline.run();

      expect(result).toMatchObject({ status: 'failed', code: 'transcription-failed' });
      expect(chunkState(pipeline.database, 0)).toBe('closed');
      expect(await chunkAudio(pipeline.database, 0)).not.toBeNull();
    });
  });

  describe('transient failures', () => {
    it('keeps the failing chunk closed and intact, then finishes on a second run', async () => {
      const pipeline = await createPipeline({
        chunks: 3,
        scripts: { 1: { transcribeError: new Error('out of memory') } },
      });

      const first = await pipeline.run();

      expect(first).toEqual({
        status: 'failed',
        code: 'transcription-failed',
        transcribed: 1,
        discarded: 0,
      });
      expect(chunkState(pipeline.database, 0)).toBe('transcribed');
      expect(chunkState(pipeline.database, 1)).toBe('closed');
      expect(chunkState(pipeline.database, 2)).toBe('closed');
      expect(await chunkAudio(pipeline.database, 1)).not.toBeNull();
      expect(await chunkAudio(pipeline.database, 2)).not.toBeNull();
      expect((await segmentsOf(pipeline)).map((segment) => segment.chunkId)).toEqual([chunkId(0)]);
      expect(countRows(pipeline.database, 'cleanup_receipts')).toBe(0);

      delete pipeline.scripts[1];
      const second = await pipeline.run();

      expect(second).toEqual({
        status: 'complete',
        transcribed: 2,
        discarded: 0,
        receiptWritten: true,
      });
      expect((await segmentsOf(pipeline)).map((segment) => segment.chunkId)).toEqual([
        chunkId(0),
        chunkId(1),
        chunkId(2),
      ]);
      expect(countRows(pipeline.database, 'cleanup_receipts')).toBe(1);
      expect(pipeline.engine.transcribe).toHaveBeenCalledTimes(4);
    });

    it('rolls back every segment of a chunk whose transcript cannot be saved', async () => {
      const pipeline = await createPipeline({
        scripts: {
          0: {
            segments: [
              { text: 'A perfectly good sentence.', startMs: 0, endMs: 2_000 },
              { text: 'Another good sentence.', startMs: 2_000, endMs: 4_000 },
            ],
          },
        },
      });
      pipeline.database.native.exec(`
        CREATE TRIGGER fail_second_segment BEFORE INSERT ON transcript_segments
        WHEN NEW.text = 'Another good sentence.'
        BEGIN SELECT RAISE(ABORT, 'induced write failure'); END
      `);

      const result = await pipeline.run();

      expect(result).toMatchObject({ status: 'failed', code: 'transcription-failed' });
      expect(countRows(pipeline.database, 'transcript_segments')).toBe(0);
      expect(chunkState(pipeline.database, 0)).toBe('closed');
      expect(await chunkAudio(pipeline.database, 0)).not.toBeNull();
    });

    it('reports a model that cannot be downloaded separately', async () => {
      const pipeline = await createPipeline();
      pipeline.engine.detectSpeech.mockRejectedValueOnce(new ModelAssetError('no network'));

      const result = await pipeline.run();

      expect(result).toEqual({
        status: 'failed',
        code: 'model-unavailable',
        transcribed: 0,
        discarded: 0,
      });
      expect(chunkState(pipeline.database, 0)).toBe('closed');
      expect(countRows(pipeline.database, 'cleanup_receipts')).toBe(0);
    });
  });

  describe('repeat runs', () => {
    it('does nothing the second time', async () => {
      const pipeline = await createPipeline({ chunks: 2 });
      await pipeline.run();
      const transcribeCalls = pipeline.engine.transcribe.mock.calls.length;

      const again = await pipeline.run();

      expect(again).toEqual({
        status: 'complete',
        transcribed: 0,
        discarded: 0,
        receiptWritten: false,
      });
      expect(pipeline.engine.transcribe).toHaveBeenCalledTimes(transcribeCalls);
      expect(countRows(pipeline.database, 'transcript_segments')).toBe(2);
      expect(countRows(pipeline.database, 'cleanup_receipts')).toBe(1);
    });

    it('does nothing for a session with no closed chunks', async () => {
      const pipeline = await createPipeline({ chunks: 0 });

      const result = await pipeline.run();

      expect(result).toEqual({
        status: 'complete',
        transcribed: 0,
        discarded: 0,
        receiptWritten: false,
      });
      expect(pipeline.engine.detectSpeech).not.toHaveBeenCalled();
      expect(countRows(pipeline.database, 'cleanup_receipts')).toBe(0);
    });

    it('leaves chunks that belong to other sessions alone', async () => {
      const pipeline = await createPipeline();
      const other = '33333333-3333-4333-8333-333333333333';

      const result = await transcribeSession(pipeline.deps, other);

      expect(result).toMatchObject({ status: 'complete', transcribed: 0, receiptWritten: false });
      expect(chunkState(pipeline.database, 0)).toBe('closed');
    });

    it('rejects a session id that is not valid', async () => {
      const pipeline = await createPipeline();

      await expect(transcribeSession(pipeline.deps, 'not-a-uuid')).rejects.toThrow();
    });

    it('runs one transcription at a time', async () => {
      const pipeline = await createPipeline({ chunks: 3 });

      const [first, second] = await Promise.all([pipeline.run(), pipeline.run()]);

      expect(pipeline.maxConcurrentEngineCalls()).toBe(1);
      expect(first.status).toBe('complete');
      expect(second).toMatchObject({ status: 'complete', transcribed: 0, receiptWritten: false });
      expect(countRows(pipeline.database, 'transcript_segments')).toBe(3);
    });
  });

  describe('temporary files', () => {
    it('removes the plaintext copies after a successful run', async () => {
      const pipeline = await createPipeline({ chunks: 2 });

      await pipeline.run();

      expect(pipeline.files.store.size).toBe(0);
      expect(pipeline.decode).toHaveBeenCalledTimes(2);
    });

    it('removes them for a malformed chunk and for a failed one', async () => {
      const malformed = await createPipeline({ scripts: { 0: { decodeError: invalidAudio() } } });
      await malformed.run();
      expect(malformed.files.store.size).toBe(0);

      const failed = await createPipeline({
        scripts: { 0: { transcribeError: new Error('boom') } },
      });
      await failed.run();
      expect(failed.files.store.size).toBe(0);
    });

    it('empties the scratch directory before it starts', async () => {
      const pipeline = await createPipeline();
      pipeline.files.store.set('left-behind-by-a-crash.wav', new Uint8Array([1]));

      await pipeline.run();

      expect(pipeline.files.reset).toHaveBeenCalledTimes(1);
      expect(pipeline.files.store.size).toBe(0);
    });

    it('does not leave the decoded file behind when the decoder fails half way', async () => {
      const pipeline = await createPipeline();
      pipeline.decode.mockImplementationOnce(async (_input: string, output: string) => {
        pipeline.files.store.set(pipeline.files.nameOf(output), new Uint8Array([1]));
        throw invalidAudio();
      });

      await pipeline.run();

      expect(pipeline.files.store.size).toBe(0);
    });
  });

  describe('speakers', () => {
    it('attributes a segment that matches the enrolled voice to the user with its score', async () => {
      const speaker = fakeSpeaker([0.9, 0.3]);
      const pipeline = await createPipeline({ speaker, voiceProfile: readyProfile([1, 0]) });

      await pipeline.run();

      const [segment] = await segmentsOf(pipeline);
      expect(segment.speaker).toBe('user');
      expect(segment.speakerConfidence).toBeCloseTo(0.9 / Math.hypot(0.9, 0.3), 10);
      expect(speaker.prepare).toHaveBeenCalledTimes(1);
      expect(speaker.embeddingFromWindow).toHaveBeenCalledWith(
        expect.stringMatching(/\.m4a$/),
        500,
        3_500,
      );
    });

    it('marks a voice that does not match as unknown with how close it came', async () => {
      const pipeline = await createPipeline({
        speaker: fakeSpeaker([0.7, 0.7]),
        voiceProfile: readyProfile([1, 0]),
      });

      await pipeline.run();

      const [segment] = await segmentsOf(pipeline);
      expect(segment.speaker).toBe('unknown');
      expect(segment.speakerConfidence).toBeCloseTo(Math.SQRT1_2, 10);
    });

    it('does not embed windows too short to hold a voice', async () => {
      const speaker = fakeSpeaker();
      const pipeline = await createPipeline({
        speaker,
        voiceProfile: readyProfile(),
        scripts: {
          0: {
            segments: [{ text: 'Yes.', startMs: 1_000, endMs: 1_000 + MIN_SPEAKER_WINDOW_MS - 1 }],
          },
        },
      });

      await pipeline.run();

      const [segment] = await segmentsOf(pipeline);
      expect(segment).toMatchObject({ speaker: 'unknown', speakerConfidence: 0 });
      expect(speaker.embeddingFromWindow).not.toHaveBeenCalled();
    });

    it('marks a segment unknown when its window cannot be embedded, and keeps going', async () => {
      const speaker = fakeSpeaker();
      speaker.embeddingFromWindow.mockRejectedValueOnce(new Error('embedding failed'));
      const pipeline = await createPipeline({
        speaker,
        voiceProfile: readyProfile(),
        scripts: {
          0: {
            segments: [
              { text: 'The first sentence here.', startMs: 0, endMs: 3_000 },
              { text: 'The second sentence here.', startMs: 3_000, endMs: 6_000 },
            ],
          },
        },
      });

      const result = await pipeline.run();

      expect(result.status).toBe('complete');
      expect(await segmentsOf(pipeline)).toMatchObject([
        { speaker: 'unknown', speakerConfidence: 0 },
        { speaker: 'user', speakerConfidence: 1 },
      ]);
    });

    it('attributes nobody when no voice profile is ready', async () => {
      const speaker = fakeSpeaker();
      const pipeline = await createPipeline({
        speaker,
        voiceProfile: { ...readyProfile(), status: 'pending', sampleCount: 1 },
      });

      await pipeline.run();

      expect(await segmentsOf(pipeline)).toMatchObject([
        { speaker: 'unknown', speakerConfidence: 0 },
      ]);
      expect(speaker.prepare).not.toHaveBeenCalled();
      expect(speaker.embeddingFromWindow).not.toHaveBeenCalled();
    });

    it('attributes nobody when the speaker model cannot load, without failing the transcript', async () => {
      const speaker = fakeSpeaker();
      speaker.prepare.mockRejectedValue(new Error('model missing'));
      const pipeline = await createPipeline({ speaker, voiceProfile: readyProfile() });

      const result = await pipeline.run();

      expect(result.status).toBe('complete');
      expect(speaker.prepare).toHaveBeenCalledTimes(1);
      expect(speaker.embeddingFromWindow).not.toHaveBeenCalled();
      expect(await segmentsOf(pipeline)).toMatchObject([{ speaker: 'unknown' }]);
    });

    it('attributes nobody without a speaker provider', async () => {
      const pipeline = await createPipeline({ voiceProfile: readyProfile() });

      await pipeline.run();

      expect(await segmentsOf(pipeline)).toMatchObject([{ speaker: 'unknown' }]);
    });
  });

  describe('stopping', () => {
    it('does nothing when already aborted', async () => {
      const pipeline = await createPipeline();
      const controller = new AbortController();
      controller.abort();

      const result = await pipeline.run(controller.signal);

      expect(result).toEqual({ status: 'failed', code: 'aborted', transcribed: 0, discarded: 0 });
      expect(pipeline.engine.detectSpeech).not.toHaveBeenCalled();
      expect(chunkState(pipeline.database, 0)).toBe('closed');
    });

    it('stops between chunks and leaves the rest closed for the next run', async () => {
      const pipeline = await createPipeline({ chunks: 3 });
      const controller = new AbortController();
      pipeline.engine.transcribe.mockImplementationOnce(async () => {
        controller.abort();
        return { language: 'en', segments: [ENGLISH_SEGMENT] };
      });

      const result = await pipeline.run(controller.signal);

      expect(result).toMatchObject({ status: 'failed', code: 'aborted' });
      expect(chunkState(pipeline.database, 0)).toBe('closed');
      expect(chunkState(pipeline.database, 1)).toBe('closed');
      expect(pipeline.files.store.size).toBe(0);
      expect(countRows(pipeline.database, 'cleanup_receipts')).toBe(0);

      const resumed = await pipeline.run();
      expect(resumed).toMatchObject({ status: 'complete', transcribed: 3, receiptWritten: true });
    });

    it('reports an engine that stopped because of the abort as aborted', async () => {
      const pipeline = await createPipeline();
      const controller = new AbortController();
      pipeline.engine.transcribe.mockImplementationOnce(async () => {
        controller.abort();
        throw new Error('Transcription was stopped before it finished.');
      });

      const result = await pipeline.run(controller.signal);

      expect(result).toMatchObject({ status: 'failed', code: 'aborted' });
      expect(chunkState(pipeline.database, 0)).toBe('closed');
    });
  });

  describe('privacy', () => {
    it('keeps audio bytes, file paths and transcript text out of results and receipts', async () => {
      const pipeline = await createPipeline({
        chunks: 2,
        speaker: fakeSpeaker(),
        voiceProfile: readyProfile(),
        scripts: {
          1: {
            decodeError: Object.assign(new Error(`${SCRATCH_DIRECTORY}/secret.m4a`), {
              code: INVALID_AUDIO_CODE,
            }),
          },
        },
      });
      const failed = await createPipeline({
        scripts: { 0: { transcribeError: new Error(`${SCRATCH_DIRECTORY}/secret.m4a`) } },
      });

      const results = [await pipeline.run(), await failed.run()];

      expect(JSON.stringify(results)).not.toMatch(/scratch|secret|market/);
      const receipts = JSON.stringify(await pipeline.repositories.cleanupReceipts.list());
      expect(receipts).not.toMatch(/scratch|secret|market|m4a/);
      const rows = JSON.stringify(await segmentsOf(pipeline));
      expect(rows).not.toMatch(/scratch|\.m4a|\.wav|m4a-bytes/);
    });

    it('never stores segment audio: only the chunk table ever held bytes, and it is now empty', async () => {
      const pipeline = await createPipeline({ chunks: 2 });

      await pipeline.run();

      const left = pipeline.database.native
        .prepare('SELECT COUNT(*) AS n FROM audio_chunks WHERE audio IS NOT NULL')
        .get() as { n: number };
      expect(left.n).toBe(0);
    });
  });

  it('releases the speech engine after every run, whether it worked or not', async () => {
    const pipeline = await createPipeline({ scripts: { 0: { transcribeError: new Error('x') } } });

    await pipeline.run();
    delete pipeline.scripts[0];
    await pipeline.run();

    expect(pipeline.engine.release).toHaveBeenCalledTimes(2);
  });
});
