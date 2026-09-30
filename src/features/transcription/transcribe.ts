import { ModelAssetError } from '../../shared/modelAssets';
import { writeSuccessReceipt } from '../../storage/cleanup';
import type { StorageBootstrapResult } from '../../storage/bootstrap';
import {
  validateStorageId,
  type AudioChunk,
  type Language,
  type TranscriptSegment,
  type VoiceProfile,
} from '../../storage/types';
import type { RecordingFiles } from '../recording/files';
import { createSerialQueue } from '../recording/recorder';
import {
  scoreSpeaker,
  type SpeakerEmbeddingProvider,
  type SpeakerScore,
} from '../voice/enrollment';
import { transcriptConfidence } from './confidence';
import { hasSpeechContent, tagLanguage, whisperLanguageOption } from './language';
import type { SpeechEngine, SpeechRegion, WhisperTranscription } from './whisper';

/** Code the audio decoder reports for audio that can never be decoded. */
export const INVALID_AUDIO_CODE = 'ERR_INVALID_AUDIO';

// Shorter windows give speaker embeddings too little voice to tell anyone apart.
export const MIN_SPEAKER_WINDOW_MS = 1_000;

const UNKNOWN_SPEAKER: SpeakerScore = { speaker: 'unknown', confidence: 0 };

/** Plaintext scratch space for one run. Names are opaque; paths are plain filesystem paths. */
export type TranscriptionFiles = {
  /** Empties the scratch directory, creating it when missing. */
  reset: () => Promise<void>;
  pathFor: (name: string) => string;
  write: (name: string, bytes: Uint8Array) => Promise<void>;
  /** Removes a file; a file that is already gone is not an error. */
  remove: (name: string) => Promise<void>;
};

export type TranscriptionDependencies = {
  storage: StorageBootstrapResult;
  engine: SpeechEngine;
  /** Decodes compressed audio to a 16 kHz mono PCM16 WAV. */
  decode: (inputPath: string, outputPath: string) => Promise<{ durationMs: number }>;
  files: TranscriptionFiles;
  sha256: RecordingFiles['sha256'];
  /** Without it (or without a ready voice profile) every segment is attributed to 'unknown'. */
  speaker?: SpeakerEmbeddingProvider;
  uuid: () => string;
  now: () => string;
};

export type TranscriptionFailureCode = 'aborted' | 'model-unavailable' | 'transcription-failed';

/** Only counts and codes: transcripts, audio and file paths never leave the pipeline. */
export type TranscriptionResult =
  | { status: 'complete'; transcribed: number; discarded: number; receiptWritten: boolean }
  | {
      status: 'failed';
      code: TranscriptionFailureCode;
      transcribed: number;
      discarded: number;
    };

type Progress = { transcribed: number; discarded: number };

type RunContext = {
  deps: TranscriptionDependencies;
  language: ReturnType<typeof whisperLanguageOption>;
  /** The ready voice profile, or null when speakers cannot be attributed this run. */
  profile: VoiceProfile | null;
  signal?: AbortSignal;
};

// One run at a time: runs share the scratch directory and the native models.
const enqueue = createSerialQueue();

/**
 * Transcribes every closed audio chunk of a session, in sequence order. Each chunk commits its
 * transcript and deletes its audio in one transaction, so a run interrupted at any point is safe
 * to repeat: settled chunks are skipped and nothing is written twice. A chunk that can never be
 * decoded is discarded and the run continues; any other failure stops the run and leaves that
 * chunk (and the rest) closed for a retry. Once no closed chunk is left one content-free success
 * receipt is written. The session status is not touched.
 */
export async function transcribeSession(
  deps: TranscriptionDependencies,
  sessionId: string,
  options: { signal?: AbortSignal } = {},
): Promise<TranscriptionResult> {
  const validSessionId = validateStorageId(sessionId);
  return enqueue(() => runSession(deps, validSessionId, options.signal));
}

async function runSession(
  deps: TranscriptionDependencies,
  sessionId: string,
  signal?: AbortSignal,
): Promise<TranscriptionResult> {
  const progress: Progress = { transcribed: 0, discarded: 0 };
  try {
    throwIfAborted(signal);
    // Plaintext left behind by a crashed run must not outlive it.
    await deps.files.reset();

    const { repositories, database } = deps.storage;
    const chunks = (await repositories.audioChunks.list())
      .filter((chunk) => chunk.sessionId === sessionId && chunk.state === 'closed')
      .sort((a, b) => a.sequence - b.sequence);

    if (chunks.length > 0) {
      const context = await prepareRun(deps, signal);
      for (const chunk of chunks) {
        throwIfAborted(signal);
        const outcome = await processChunk(context, chunk);
        if (outcome !== 'skipped') {
          progress[outcome] += 1;
        }
      }
    }

    const receipt = await writeSuccessReceipt(database, sessionId, {
      uuid: deps.uuid,
      now: deps.now,
      hash: (value) => deps.sha256(new TextEncoder().encode(value)),
    });
    return { status: 'complete', ...progress, receiptWritten: receipt !== null };
  } catch (error) {
    return { status: 'failed', code: failureCode(error, signal), ...progress };
  } finally {
    await deps.engine.release().catch(() => undefined);
  }
}

async function prepareRun(
  deps: TranscriptionDependencies,
  signal?: AbortSignal,
): Promise<RunContext> {
  const { repositories } = deps.storage;
  const preferences = (await repositories.appPreferences.list()).reduce<
    { spokenLanguages: Language[]; updatedAt: string } | undefined
  >(
    (latest, next) => (latest === undefined || next.updatedAt > latest.updatedAt ? next : latest),
    undefined,
  );
  const language = whisperLanguageOption(preferences?.spokenLanguages ?? []);

  let profile: VoiceProfile | null =
    (await repositories.voiceProfiles.list()).find((candidate) => candidate.status === 'ready') ??
    null;
  if (profile !== null && deps.speaker?.embeddingFromWindow !== undefined) {
    try {
      await deps.speaker.prepare?.();
    } catch {
      // The speaker model is optional for a transcript: attribute nobody this run rather than
      // retry a failing model load for every segment.
      profile = null;
    }
  } else {
    profile = null;
  }
  return { deps, language, profile, signal };
}

async function processChunk(
  context: RunContext,
  chunk: AudioChunk,
): Promise<'transcribed' | 'discarded' | 'skipped'> {
  const { deps } = context;
  const { repositories } = deps.storage;

  const bytes = await repositories.readAudioChunkBytes(chunk.id);
  if (bytes === null || (await deps.sha256(bytes)) !== chunk.sha256) {
    return discard(context, chunk);
  }

  const sourceName = `${deps.uuid()}.m4a`;
  const wavName = `${deps.uuid()}.wav`;
  const sourcePath = deps.files.pathFor(sourceName);
  const wavPath = deps.files.pathFor(wavName);
  try {
    await deps.files.write(sourceName, bytes);
    let durationMs: number;
    try {
      ({ durationMs } = await deps.decode(sourcePath, wavPath));
    } catch (error) {
      if (hasCode(error, INVALID_AUDIO_CODE)) {
        return discard(context, chunk);
      }
      throw error;
    }
    throwIfAborted(context.signal);

    const regions = await deps.engine.detectSpeech(wavPath);
    throwIfAborted(context.signal);

    let segments: TranscriptSegment[] = [];
    if (regions.length > 0) {
      const transcription = await deps.engine.transcribe(wavPath, {
        language: context.language,
        signal: context.signal,
      });
      segments = await buildSegments(context, chunk, {
        sourcePath,
        durationMs,
        regions,
        transcription,
      });
    }
    const saved = await repositories.saveChunkTranscript({ chunkId: chunk.id, segments });
    return saved ? 'transcribed' : 'skipped';
  } finally {
    await Promise.all([deps.files.remove(sourceName), deps.files.remove(wavName)]).catch(
      () => undefined,
    );
  }
}

async function discard(context: RunContext, chunk: AudioChunk): Promise<'discarded' | 'skipped'> {
  return (await context.deps.storage.repositories.discardClosedChunk(chunk.id))
    ? 'discarded'
    : 'skipped';
}

async function buildSegments(
  context: RunContext,
  chunk: AudioChunk,
  audio: {
    sourcePath: string;
    durationMs: number;
    regions: readonly SpeechRegion[];
    transcription: WhisperTranscription;
  },
): Promise<TranscriptSegment[]> {
  const { deps, signal } = context;
  const createdAt = deps.now();
  const segments: TranscriptSegment[] = [];

  for (const heard of audio.transcription.segments) {
    const text = heard.text.trim();
    if (!hasSpeechContent(text)) {
      continue;
    }
    // Timestamps are relative to the start of the chunk and stay inside the decoded audio.
    const startMs = clamp(heard.startMs, 0, audio.durationMs);
    const endMs = clamp(heard.endMs, startMs, audio.durationMs);
    const speaker = await attributeSpeaker(context, audio.sourcePath, startMs, endMs);
    throwIfAborted(signal);

    segments.push({
      id: deps.uuid(),
      sessionId: chunk.sessionId,
      chunkId: chunk.id,
      startMs,
      endMs,
      text,
      language: tagLanguage(text),
      speaker: speaker.speaker,
      speakerConfidence: speaker.confidence,
      transcriptConfidence: transcriptConfidence({
        text,
        startMs,
        endMs,
        speechRegions: audio.regions,
        detectedLanguage: audio.transcription.language,
        previousText: segments[segments.length - 1]?.text,
      }),
      createdAt,
    });
  }
  return segments;
}

async function attributeSpeaker(
  { deps, profile }: RunContext,
  sourcePath: string,
  startMs: number,
  endMs: number,
): Promise<SpeakerScore> {
  const embed = deps.speaker?.embeddingFromWindow;
  if (profile === null || embed === undefined || endMs - startMs < MIN_SPEAKER_WINDOW_MS) {
    return UNKNOWN_SPEAKER;
  }
  try {
    return scoreSpeaker(profile, await embed(sourcePath, startMs, endMs - startMs));
  } catch {
    // Never guess 'user': a window that cannot be embedded stays unknown.
    return UNKNOWN_SPEAKER;
  }
}

function failureCode(error: unknown, signal?: AbortSignal): TranscriptionFailureCode {
  if (signal?.aborted === true) {
    return 'aborted';
  }
  return error instanceof ModelAssetError ? 'model-unavailable' : 'transcription-failed';
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw new Error('Transcription was aborted.');
  }
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
