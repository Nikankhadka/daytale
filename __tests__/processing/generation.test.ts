import { StorageOperationRejectedError } from '../../src/storage/repositories';
import { countRows } from '../transcription/kit';
import { SESSION_ID } from './kit';
import {
  analyzedEvent,
  analyzedQuestion,
  analyzedResponse,
  createProcessingFixture,
  generatedResponse,
  type ProcessingFixture,
} from './kit';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A fixture parked at `generating` with one persisted event and one answered, one skipped answer. */
async function generatingFixture(): Promise<{
  fixture: ProcessingFixture;
  answeredQuestionId: string;
}> {
  const fixture = await createProcessingFixture({
    analysis: analyzedResponse({
      events: [analyzedEvent()],
      questions: [analyzedQuestion(), analyzedQuestion({ question: 'What happened next?' })],
    }),
  });
  await fixture.run();
  const questions = await fixture.repositories.listClarificationQuestionsBySession(SESSION_ID);
  await fixture.submit([
    { questionId: questions[0]!.id, answerText: 'The farmers market.' },
    { questionId: questions[1]!.id },
  ]);
  return { fixture, answeredQuestionId: questions[0]!.id };
}

describe('processGeneration', () => {
  it('builds the request from persisted state, saves the journal and clears the source records', async () => {
    const { fixture, answeredQuestionId } = await generatingFixture();
    const events = await fixture.repositories.listExtractedEventsBySession(SESSION_ID);
    expect(events).toHaveLength(1);

    const result = await fixture.generate();

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      throw new Error('expected a ready result');
    }
    expect(result.journal).toMatchObject({
      sessionId: SESSION_ID,
      date: '2026-03-10',
      timezone: 'UTC',
      title: 'A day worth remembering',
      paragraphs: ['I went to the market and came home.'],
      contextTags: ['errands'],
      sourceEventIds: events.map((event) => event.id),
      language: 'en',
    });
    expect(result.journal.editedAt).toBeUndefined();
    expect((await fixture.session()).status).toBe('ready');

    expect(fixture.generateCalls).toHaveLength(1);
    const request = fixture.generateCalls[0]!;
    expect(Object.keys(request).sort()).toEqual([
      'answers',
      'date',
      'events',
      'journalLanguage',
      'timezone',
    ]);
    expect(request.events).toEqual(
      events.map((event) => ({
        kind: event.kind,
        summary: event.summary,
        evidenceSegmentIds: event.evidenceSegmentIds,
        speaker: event.speaker,
      })),
    );
    // Skipped questions have no answer row, so only the answered one crosses the boundary.
    expect(request.answers).toEqual([
      { questionId: answeredQuestionId, answerText: 'The farmers market.' },
    ]);

    expect(await fixture.repositories.findJournalEntryBySession(SESSION_ID)).not.toBeNull();
    expect(await fixture.repositories.transcriptSegments.list()).toHaveLength(0);
    expect(await fixture.repositories.extractedEvents.list()).toHaveLength(0);
    expect(await fixture.repositories.clarificationQuestions.list()).toHaveLength(0);
    expect(await fixture.repositories.clarificationAnswers.list()).toHaveLength(0);

    const receipts = await fixture.repositories.cleanupReceipts.list();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      sessionId: SESSION_ID,
      reason: 'success',
    });
    expect([...receipts[0]!.deletedKinds].sort()).toEqual([
      'clarification_answers',
      'clarification_questions',
      'extracted_events',
      'transcript_segments',
    ]);
    // The receipt records what left, never the content that left.
    const serialized = JSON.stringify(receipts[0]);
    expect(serialized).not.toContain('farmers market');
    expect(serialized).not.toContain('A grounded summary');
  });

  it('never leaks audio bytes, chunk paths, or embeddings into the generate payload', async () => {
    const { fixture } = await generatingFixture();

    await fixture.generate();

    const payload = JSON.stringify(fixture.generateCalls[0]);
    expect(payload).not.toContain('m4a-bytes');
    expect(payload).not.toContain('file://');
    expect(payload).not.toContain('/cache/');
    expect(payload).not.toContain('encrypted');
    expect(payload).not.toContain('embedding');
    expect(payload).not.toContain('sha256');
    expect(payload).not.toContain('audio');
  });

  it('fails at generating, then a retry succeeds once and still creates exactly one journal', async () => {
    const { fixture } = await generatingFixture();
    fixture.setGeneration({ status: 'failed', code: 'rate-limited' });

    const failed = await fixture.generate();

    expect(failed.status).toBe('failed');
    if (failed.status !== 'failed') {
      throw new Error('expected a failed result');
    }
    expect(failed.failedStage).toBe('generating');
    expect(failed.code).toBe('rate-limited');
    const failedSession = await fixture.session();
    expect(failedSession.status).toBe('failed');
    expect(failedSession.failureCode).toBe('rate-limited');
    expect(failedSession.retryTarget).toBe('generating');
    const retryUntil = Date.parse(failedSession.retryUntil ?? '');
    expect(retryUntil).toBeGreaterThan(Date.parse(failedSession.updatedAt));
    expect(retryUntil).toBeLessThanOrEqual(Date.parse(failedSession.updatedAt) + DAY_MS);
    // The source records survive the failure so the retry has something to generate from.
    expect(countRows(fixture.database, 'extracted_events')).toBe(1);
    expect(countRows(fixture.database, 'journal_entries')).toBe(0);

    fixture.setGeneration(generatedResponse());
    expect((await fixture.retry()).status).toBe('generating');

    const resumed = await fixture.generate();

    expect(resumed.status).toBe('ready');
    expect(fixture.generateCalls).toHaveLength(2);
    expect(countRows(fixture.database, 'journal_entries')).toBe(1);
  });

  it('does nothing for a session that is already ready', async () => {
    const { fixture } = await generatingFixture();
    await fixture.generate();

    const result = await fixture.generate();

    expect(result.status).toBe('noop');
    expect(fixture.generateCalls).toHaveLength(1);
    expect(countRows(fixture.database, 'journal_entries')).toBe(1);
  });

  it('does nothing when a journal already exists for the session', async () => {
    const { fixture } = await generatingFixture();
    await fixture.generate();
    // Rewind to generating to isolate the existing-journal guard from the status guard.
    const session = await fixture.session();
    await fixture.repositories.recordingSessions.save({
      ...session,
      status: 'generating',
      updatedAt: new Date(Date.parse(session.updatedAt) + 1_000).toISOString(),
    });

    const result = await fixture.generate();

    expect(result.status).toBe('noop');
    expect(fixture.generateCalls).toHaveLength(1);
    expect(countRows(fixture.database, 'journal_entries')).toBe(1);
  });

  it('fails the session when the storage completion is rejected', async () => {
    const { fixture } = await generatingFixture();
    fixture.repositories.completeSessionWithJournal = async () => {
      throw new StorageOperationRejectedError('forced rejection');
    };

    const result = await fixture.generate();

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') {
      throw new Error('expected a failed result');
    }
    expect(result.code).toBe('generation-rejected');
    const session = await fixture.session();
    expect(session.status).toBe('failed');
    expect(session.retryTarget).toBe('generating');
    expect(countRows(fixture.database, 'journal_entries')).toBe(0);
    expect(countRows(fixture.database, 'cleanup_receipts')).toBe(0);
    expect(countRows(fixture.database, 'extracted_events')).toBe(1);
  });

  it('generates normally when the session has no extracted events', async () => {
    // The generate contract bounds `events` only above, so an empty session is a normal
    // generation. Open product decision: keep this behavior or drop silent sessions.
    const fixture = await createProcessingFixture({ segments: [] });
    expect((await fixture.run()).status).toBe('generating');

    const result = await fixture.generate();

    expect(result.status).toBe('ready');
    expect(fixture.generateCalls[0]!.events).toEqual([]);
    expect(fixture.generateCalls[0]!.answers).toEqual([]);
    const journal = await fixture.repositories.findJournalEntryBySession(SESSION_ID);
    expect(journal?.sourceEventIds).toEqual([]);
    expect(countRows(fixture.database, 'journal_entries')).toBe(1);
    expect(countRows(fixture.database, 'cleanup_receipts')).toBe(1);
  });
});
