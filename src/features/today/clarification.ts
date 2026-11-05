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
