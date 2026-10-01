import { randomUUID } from 'expo-crypto';

import type { AnalyzeRequest, AnalyzeResponse } from '../../../service/journal-api/src/contract';
import { LIMITS } from '../../../service/journal-api/src/contract';
import type { StorageBootstrapResult } from '../../storage/bootstrap';
import {
  StorageRepositoryError,
  type RecordingSessionOperationResult,
  type StorageRepositories,
} from '../../storage/repositories';
import {
  validateStorageId,
  type AppPreferences,
  type ClarificationAnswer,
  type ClarificationQuestion,
  type ExtractedEvent,
  type Language,
  type RecordingSession,
  type TranscriptSegment,
} from '../../storage/types';
import type { TranscriptionResult } from '../transcription';
import { retryDeadline } from '../recording/engine';
import { createSerialQueue } from '../recording/recorder';
import { localDateOf } from '../recording/schedule';
import { createDefaultTranscribe } from './defaults';

/** What the analysis call reports back. A failure is a code, never an HTTP status read here. */
export type AnalyzeResult =
  { status: 'ok'; response: AnalyzeResponse } | { status: 'failed'; code: string };

export type AnalyzeDependency = (request: AnalyzeRequest) => Promise<AnalyzeResult>;

export type TranscribeDependency = (
  sessionId: string,
  options: { signal?: AbortSignal },
) => Promise<TranscriptionResult>;

export type ProcessingDependencies = {
  storage: StorageBootstrapResult;
  analyze: AnalyzeDependency;
  /** Defaults to the real local whisper pipeline; tests inject a fake. */
  transcribe?: TranscribeDependency;
  now?: () => Date;
  uuid?: () => string;
};

export type ProcessSessionResult =
  | { status: 'noop'; session: RecordingSession | null }
  | { status: 'awaiting clarification'; session: RecordingSession; openQuestions: number }
  | { status: 'generating'; session: RecordingSession; openQuestions: number }
  | {
      status: 'failed';
      session: RecordingSession;
      failedStage: 'transcribing' | 'analyzing';
      code: string;
    };

export type ClarificationAnswerInput = {
  questionId: string;
  /** Omitted or blank marks the question skipped instead of answered. */
  answerText?: string;
};

export type ClarificationDependencies = {
  storage: StorageBootstrapResult;
  now?: () => Date;
  uuid?: () => string;
};

export type SubmitClarificationResult =
  | { status: 'submitted'; session: RecordingSession; answered: number; skipped: number }
  | {
      status: 'rejected';
      code:
        | 'not-found'
        | 'not-awaiting-clarification'
        | 'unknown-question'
        | 'duplicate-question'
        | 'missing-question'
        | 'rejected';
      session: RecordingSession | null;
    };

type PipelineClock = { now: () => Date; uuid: () => string };

type AdvanceTarget = 'analyzing' | 'awaiting clarification' | 'generating';

// The persisted session status is the restart-safe source of truth; this queue keeps two
// in-process callers from running the same pipeline step at once.
const enqueue = createSerialQueue();

/**
 * Drives the analysis half of the processing pipeline for one session: local transcription, then
 * analysis, ending in either `awaiting clarification` or `generating`. Anything not currently
 * `transcribing` or `analyzing` is a no-op, so a repeat call and a post-restart recovery are safe.
 * Generation is deliberately left to a later slice.
 */
export function processSession(
  dependencies: ProcessingDependencies,
  sessionId: string,
  options: { signal?: AbortSignal } = {},
): Promise<ProcessSessionResult> {
  return enqueue(() => runProcessing(dependencies, sessionId, options.signal));
}

/**
 * Records the user's clarification answers (or skips) and advances to `generating`. Every open
 * question must be covered, and each id must belong to the session and still be open; a submission
 * that leaves a question open, or one that a previous submission already settled, is refused, so a
 * session never advances to `generating` with questions still open.
 */
export function submitClarification(
  dependencies: ClarificationDependencies,
  sessionId: string,
  answers: ClarificationAnswerInput[],
): Promise<SubmitClarificationResult> {
  return enqueue(() => runSubmitClarification(dependencies, sessionId, answers));
}

async function runProcessing(
  dependencies: ProcessingDependencies,
  sessionId: string,
  signal?: AbortSignal,
): Promise<ProcessSessionResult> {
  const { repositories } = dependencies.storage;
  const id = validateStorageId(sessionId);
  const session = await repositories.recordingSessions.getById(id);
  if (session === null) {
    return { status: 'noop', session: null };
  }
  if (session.status !== 'transcribing' && session.status !== 'analyzing') {
    return { status: 'noop', session };
  }

  const clock = pipelineClock(dependencies);
  let current = session;
  if (current.status === 'transcribing') {
    const transcribe = dependencies.transcribe ?? createDefaultTranscribe(dependencies.storage);
    let transcription: TranscriptionResult;
    try {
      transcription = await transcribe(id, { signal });
    } catch {
      transcription = {
        status: 'failed',
        code: 'transcription-failed',
        transcribed: 0,
        discarded: 0,
      };
    }
    if (transcription.status === 'failed') {
      const failed = await fail(repositories, current, 'transcribing', transcription.code, clock);
      return {
        status: 'failed',
        session: failed,
        failedStage: 'transcribing',
        code: transcription.code,
      };
    }
    current = await advance(repositories, current, 'analyzing', clock);
  }

  const segments = await repositories.listTranscriptSegmentsBySession(id);
  if (segments.length === 0) {
    // Nothing was heard, so there is nothing to analyze; hand the empty session to generation.
    const advanced = await advance(repositories, current, 'generating', clock);
    return { status: 'generating', session: advanced, openQuestions: 0 };
  }

  const request = await buildAnalyzeRequest(repositories, current, segments);
  let analysis: AnalyzeResult;
  try {
    analysis = await dependencies.analyze(request);
  } catch {
    analysis = { status: 'failed', code: 'analysis-failed' };
  }
  if (analysis.status === 'failed') {
    const failed = await fail(repositories, current, 'analyzing', analysis.code, clock);
    return { status: 'failed', session: failed, failedStage: 'analyzing', code: analysis.code };
  }

  const records = buildAnalysisRecords(
    id,
    analysis.response,
    clock.now().toISOString(),
    clock.uuid,
  );
  const stored = await repositories.replaceSessionAnalysis({ sessionId: id, ...records });
  const openQuestions = stored.questions.filter((question) => question.status === 'open').length;
  const target: AdvanceTarget = openQuestions > 0 ? 'awaiting clarification' : 'generating';
  const advanced = await advance(repositories, current, target, clock);
  return {
    status: openQuestions > 0 ? 'awaiting clarification' : 'generating',
    session: advanced,
    openQuestions,
  };
}

async function runSubmitClarification(
  dependencies: ClarificationDependencies,
  sessionId: string,
  answers: ClarificationAnswerInput[],
): Promise<SubmitClarificationResult> {
  const { repositories } = dependencies.storage;
  const id = validateStorageId(sessionId);
  const session = await repositories.recordingSessions.getById(id);
  if (session === null) {
    return { status: 'rejected', code: 'not-found', session: null };
  }
  if (session.status !== 'awaiting clarification') {
    return { status: 'rejected', code: 'not-awaiting-clarification', session };
  }

  const open = (await repositories.listClarificationQuestionsBySession(id)).filter(
    (question) => question.status === 'open',
  );
  const openById = new Map(open.map((question) => [question.id, question]));
  const seen = new Set<string>();
  const questions: ClarificationQuestion[] = [];
  const records: ClarificationAnswer[] = [];
  const now = dependencies.now ?? (() => new Date());
  const uuid = dependencies.uuid ?? randomUUID;
  const at = stamp(session, now());

  for (const answer of answers) {
    if (seen.has(answer.questionId)) {
      return { status: 'rejected', code: 'duplicate-question', session };
    }
    seen.add(answer.questionId);
    const question = openById.get(answer.questionId);
    if (question === undefined) {
      return { status: 'rejected', code: 'unknown-question', session };
    }
    const answerText = answer.answerText?.trim();
    questions.push(
      answerText ? { ...question, status: 'answered' } : { ...question, status: 'skipped' },
    );
    if (answerText) {
      records.push({ id: uuid(), questionId: question.id, answerText, createdAt: at });
    }
  }

  if (seen.size < open.length) {
    return { status: 'rejected', code: 'missing-question', session };
  }

  let result: RecordingSessionOperationResult;
  try {
    result = await repositories.saveClarificationSubmission({
      questions,
      answers: records,
      sessionOperation: {
        operation: {
          id: uuid(),
          sessionId: id,
          operationKind: 'processing_generating',
          status: 'pending',
          createdAt: at,
        },
        action: { type: 'advance', to: 'generating', at },
      },
    });
  } catch (error) {
    if (!(error instanceof StorageRepositoryError)) {
      throw error;
    }
    // The transaction rolled back, so re-read the untouched session for the result.
    return {
      status: 'rejected',
      code: 'rejected',
      session: await repositories.recordingSessions.getById(id),
    };
  }
  if (result.operation.status !== 'applied') {
    return { status: 'rejected', code: 'rejected', session: result.session };
  }
  const answered = questions.filter((question) => question.status === 'answered').length;
  return {
    status: 'submitted',
    session: result.session,
    answered,
    skipped: questions.length - answered,
  };
}

function pipelineClock(dependencies: Pick<ProcessingDependencies, 'now' | 'uuid'>): PipelineClock {
  return {
    now: dependencies.now ?? (() => new Date()),
    uuid: dependencies.uuid ?? randomUUID,
  };
}

// The reducer refuses timestamps that move backwards, so never act earlier than the last update.
function stamp(session: RecordingSession, now: Date): string {
  return new Date(Math.max(now.getTime(), Date.parse(session.updatedAt))).toISOString();
}

async function advance(
  repositories: StorageRepositories,
  session: RecordingSession,
  to: AdvanceTarget,
  clock: PipelineClock,
): Promise<RecordingSession> {
  const at = stamp(session, clock.now());
  const result = await repositories.applyRecordingSessionOperation(
    {
      id: clock.uuid(),
      sessionId: session.id,
      operationKind: `processing_${to.replace(/ /g, '_')}`,
      status: 'pending',
      createdAt: at,
    },
    { type: 'advance', to, at },
  );
  return result.session;
}

async function fail(
  repositories: StorageRepositories,
  session: RecordingSession,
  stage: 'transcribing' | 'analyzing',
  code: string,
  clock: PipelineClock,
): Promise<RecordingSession> {
  const at = stamp(session, clock.now());
  const result = await repositories.applyRecordingSessionOperation(
    {
      id: clock.uuid(),
      sessionId: session.id,
      operationKind: `processing_failed_${stage}`,
      status: 'pending',
      createdAt: at,
    },
    {
      type: 'fail',
      at,
      failureCode: code,
      retryTarget: stage,
      retryUntil: retryDeadline(session.retryUntil, at),
    },
  );
  return result.session;
}

async function buildAnalyzeRequest(
  repositories: StorageRepositories,
  session: RecordingSession,
  segments: TranscriptSegment[],
): Promise<AnalyzeRequest> {
  const startedAt = session.actualStart ?? session.scheduledStart;
  return {
    date: localDateOf(new Date(startedAt), session.timezone),
    timezone: session.timezone,
    journalLanguage: await journalLanguageOf(repositories),
    // Only transcript-derived fields cross the boundary: no ids beyond the segment id, no chunk
    // paths, no audio bytes, and no voice embeddings.
    segments: segments.map((segment) => ({
      id: segment.id,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
      language: segment.language,
      speaker: segment.speaker,
      confidence: segment.transcriptConfidence,
    })),
  };
}

async function journalLanguageOf(repositories: StorageRepositories): Promise<Language> {
  const preferences = await repositories.appPreferences.list();
  const latest = preferences.reduce<AppPreferences | undefined>(
    (found, next) => (found === undefined || next.updatedAt > found.updatedAt ? next : found),
    undefined,
  );
  return latest?.journalLanguage ?? 'en';
}

function buildAnalysisRecords(
  sessionId: string,
  response: AnalyzeResponse,
  createdAt: string,
  uuid: () => string,
): { events: ExtractedEvent[]; questions: ClarificationQuestion[] } {
  const events = response.events.map((event) => ({
    id: uuid(),
    sessionId,
    startMs: event.startMs,
    endMs: event.endMs,
    kind: event.kind,
    summary: event.summary,
    evidenceSegmentIds: [...event.evidenceSegmentIds],
    speaker: event.speaker,
    confidence: event.confidence,
    // The service only returns events it could ground in an evidence segment.
    supported: true,
    createdAt,
  }));
  // The service caps questions, but local callers could hand back more; trim to the guard's limit.
  const questions = response.questions.slice(0, LIMITS.questions).map((question) => ({
    id: uuid(),
    sessionId,
    startMs: question.startMs,
    endMs: question.endMs,
    question: question.question,
    reason: question.reason,
    status: 'open' as const,
    createdAt,
  }));
  return { events, questions };
}
