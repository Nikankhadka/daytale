import { randomUUID } from 'expo-crypto';

import type { RecordingSessionAdvanceTarget } from '../../state/recordingSessionReducer';
import { useSessionStore } from '../../state/session';
import type { StorageBootstrapResult } from '../../storage/bootstrap';
import type { ClarificationQuestion } from '../../storage/types';

/** Open clarification questions for a session, oldest moment first. */
export async function listOpenClarifications(
  storage: StorageBootstrapResult,
  sessionId: string,
): Promise<ClarificationQuestion[]> {
  const questions = await storage.repositories.clarificationQuestions.list();
  return questions
    .filter((question) => question.sessionId === sessionId && question.status === 'open')
    .sort((a, b) => a.startMs - b.startMs);
}

/**
 * One-tap answer. A null answer is a skip: the question is marked skipped and no answer row is
 * written. Never a text field, matching the prototype.
 */
export async function answerClarification(
  storage: StorageBootstrapResult,
  question: ClarificationQuestion,
  answerText: string | null,
): Promise<void> {
  await storage.repositories.clarificationQuestions.save({
    ...question,
    status: answerText === null ? 'skipped' : 'answered',
  });
  if (answerText !== null) {
    await storage.repositories.clarificationAnswers.save({
      id: randomUUID(),
      questionId: question.id,
      answerText,
      createdAt: new Date().toISOString(),
    });
  }
}

/** Moves the session to its next processing status through the durable operation log. */
export async function advanceSession(
  storage: StorageBootstrapResult,
  sessionId: string,
  to: RecordingSessionAdvanceTarget,
  operationKind = 'advance_session',
): Promise<void> {
  const session = await storage.repositories.recordingSessions.getById(sessionId);
  if (session === null) {
    return;
  }
  const at = new Date(Math.max(Date.now(), Date.parse(session.updatedAt))).toISOString();
  const result = await storage.repositories.applyRecordingSessionOperation(
    { id: randomUUID(), sessionId, operationKind, status: 'pending', createdAt: at },
    { type: 'advance', to, at },
  );
  useSessionStore.getState().setRecordingSession(result.session);
}
