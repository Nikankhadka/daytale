import type {
  AnalyzeRequest,
  AnalyzedEvent,
  AnalyzedQuestion,
  AnalyzeResponse,
  GenerateRequest,
  GenerateResponse,
} from '../../service/journal-api/src/contract';
import { createDefaultAppPreferences } from '../../src/features/preferences';
import {
  processGeneration,
  processSession,
  submitClarification,
  type AnalyzeResult,
  type ClarificationAnswerInput,
  type GenerateResult,
  type GenerationDependencies,
  type ProcessGenerationResult,
  type ProcessSessionResult,
  type SubmitClarificationResult,
} from '../../src/features/processing';
import type { TranscriptionResult } from '../../src/features/transcription';
import type {
  Language,
  RecordingSession,
  RecordingSessionStatus,
  TranscriptSegment,
} from '../../src/storage/types';
import { SESSION_ID, uuidSequence } from '../recording/testKit';
import {
  createStorageFixture,
  makeSegment,
  segmentUuid,
  type StorageFixture,
} from '../transcription/kit';

/** After the seeded session's 08:00 update, so the reducer accepts every pipeline stamp. */
export const NOW = new Date('2026-03-10T10:00:00.000Z');

export type ProcessingFixture = StorageFixture & {
  deps: GenerationDependencies;
  analyzeCalls: AnalyzeRequest[];
  generateCalls: GenerateRequest[];
  transcribeCalls: string[];
  setTranscription: (result: TranscriptionResult) => void;
  setAnalysis: (result: AnalyzeResult) => void;
  setGeneration: (result: GenerateResult) => void;
  setNow: (value: Date) => void;
  run: (options?: { signal?: AbortSignal }) => Promise<ProcessSessionResult>;
  generate: () => Promise<ProcessGenerationResult>;
  submit: (answers: ClarificationAnswerInput[]) => Promise<SubmitClarificationResult>;
  /** Applies the existing retry operation, moving a failed session back to its retry target. */
  retry: () => Promise<RecordingSession>;
  session: () => Promise<RecordingSession>;
};

export function analyzedEvent(overrides: Partial<AnalyzedEvent> = {}): AnalyzedEvent {
  return {
    startMs: 0,
    endMs: 1_000,
    kind: 'moment',
    summary: 'A grounded summary',
    evidenceSegmentIds: [segmentUuid(0)],
    speaker: 'user',
    confidence: 0.9,
    ...overrides,
  };
}

export function analyzedQuestion(overrides: Partial<AnalyzedQuestion> = {}): AnalyzedQuestion {
  return {
    startMs: 0,
    endMs: 1_000,
    question: 'What would you like to remember about this moment?',
    reason: 'missing_context',
    ...overrides,
  };
}

export function analyzedResponse(overrides: Partial<AnalyzeResponse> = {}): AnalyzeResult {
  return {
    status: 'ok',
    response: {
      events: [analyzedEvent()],
      questions: [analyzedQuestion()],
      ...overrides,
    },
  };
}

/** A valid generate response; tests override fields to match what they assert. */
export function generatedResponse(overrides: Partial<GenerateResponse> = {}): GenerateResult {
  return {
    status: 'ok',
    response: {
      title: 'A day worth remembering',
      paragraphs: ['I went to the market and came home.'],
      contextTags: ['errands'],
      ...overrides,
    },
  };
}

export async function createProcessingFixture(
  options: {
    chunks?: number;
    chunkStartOffsetsMs?: readonly number[];
    segments?: TranscriptSegment[];
    status?: RecordingSessionStatus;
    journalLanguage?: Language;
    transcription?: TranscriptionResult;
    analysis?: AnalyzeResult;
    generation?: GenerateResult;
  } = {},
): Promise<ProcessingFixture> {
  const storage = await createStorageFixture(options.chunks ?? 1, options.chunkStartOffsetsMs);
  const { repositories } = storage;

  await repositories.appPreferences.save({
    ...createDefaultAppPreferences(NOW.toISOString(), 'UTC'),
    journalLanguage: options.journalLanguage ?? 'en',
  });

  const segments = options.segments ?? [
    makeSegment(0, 0, { text: 'I went to the market', speaker: 'user' }),
  ];
  for (const segment of segments) {
    await repositories.transcriptSegments.save(segment);
  }

  if (options.status !== undefined && options.status !== 'transcribing') {
    const session = await repositories.recordingSessions.getById(SESSION_ID);
    if (session === null) {
      throw new Error('The seeded session is missing.');
    }
    await repositories.recordingSessions.save({ ...session, status: options.status });
  }

  let transcription: TranscriptionResult = options.transcription ?? {
    status: 'complete',
    transcribed: segments.length,
    discarded: 0,
    receiptWritten: true,
  };
  let analysis: AnalyzeResult = options.analysis ?? analyzedResponse();
  let generation: GenerateResult = options.generation ?? generatedResponse();
  let now = NOW;

  const analyzeCalls: AnalyzeRequest[] = [];
  const generateCalls: GenerateRequest[] = [];
  const transcribeCalls: string[] = [];
  const transcribe = jest.fn(async (sessionId: string) => {
    transcribeCalls.push(sessionId);
    return transcription;
  });
  const analyze = jest.fn(async (request: AnalyzeRequest) => {
    analyzeCalls.push(request);
    return analysis;
  });
  const generate = jest.fn(async (request: GenerateRequest) => {
    generateCalls.push(request);
    return generation;
  });

  const deps: GenerationDependencies = {
    storage,
    transcribe,
    analyze,
    generate,
    now: () => now,
    uuid: uuidSequence(),
    // Deterministic, valid SHA-256 so receipt tests never depend on the native crypto module.
    hash: async () => 'a'.repeat(64),
  };

  const clock = { now: () => now, uuid: deps.uuid as () => string };

  return {
    ...storage,
    deps,
    analyzeCalls,
    generateCalls,
    transcribeCalls,
    setTranscription: (result) => {
      transcription = result;
    },
    setAnalysis: (result) => {
      analysis = result;
    },
    setGeneration: (result) => {
      generation = result;
    },
    setNow: (value) => {
      now = value;
    },
    run: (runOptions) => processSession(deps, SESSION_ID, runOptions),
    generate: () => processGeneration(deps, SESSION_ID),
    submit: (answers) => submitClarification({ storage, ...clock }, SESSION_ID, answers),
    retry: async () => {
      const session = await repositories.recordingSessions.getById(SESSION_ID);
      if (session === null) {
        throw new Error('The seeded session is missing.');
      }
      const at = new Date(
        Math.max(now.getTime(), Date.parse(session.updatedAt)) + 1_000,
      ).toISOString();
      const result = await repositories.applyRecordingSessionOperation(
        {
          id: (deps.uuid as () => string)(),
          sessionId: SESSION_ID,
          operationKind: 'retry_processing',
          status: 'pending',
          createdAt: at,
        },
        { type: 'retry', at },
      );
      return result.session;
    },
    session: async () => {
      const session = await repositories.recordingSessions.getById(SESSION_ID);
      if (session === null) {
        throw new Error('The seeded session is missing.');
      }
      return session;
    },
  };
}

export { SESSION_ID };
