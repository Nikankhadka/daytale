import { chunkId, countRows, makeSegment } from '../transcription/kit';
import { SESSION_ID, NOW } from './kit';
import { analyzedEvent, analyzedQuestion, analyzedResponse, createProcessingFixture } from './kit';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('processSession', () => {
  it('transcribes, analyzes, and parks a session at awaiting clarification', async () => {
    const fixture = await createProcessingFixture({
      analysis: analyzedResponse({
        events: [analyzedEvent()],
        questions: [
          analyzedQuestion(),
          analyzedQuestion({ startMs: 1_000, endMs: 2_000, question: 'And then?' }),
        ],
      }),
    });

    const result = await fixture.run();

    expect(result.status).toBe('awaiting clarification');
    if (result.status !== 'awaiting clarification') {
      throw new Error('expected awaiting clarification');
    }
    expect(result.openQuestions).toBe(2);
    expect((await fixture.session()).status).toBe('awaiting clarification');
    expect(fixture.transcribeCalls).toEqual([SESSION_ID]);
    expect(fixture.analyzeCalls).toHaveLength(1);
    expect(await fixture.repositories.listExtractedEventsBySession(SESSION_ID)).toHaveLength(1);
    expect(await fixture.repositories.listClarificationQuestionsBySession(SESSION_ID)).toHaveLength(
      2,
    );
  });

  it('advances straight to generating when analysis asks nothing', async () => {
    const fixture = await createProcessingFixture({
      analysis: analyzedResponse({ questions: [] }),
    });

    const result = await fixture.run();

    expect(result.status).toBe('generating');
    expect((await fixture.session()).status).toBe('generating');
    expect(countRows(fixture.database, 'extracted_events')).toBe(1);
    expect(countRows(fixture.database, 'clarification_questions')).toBe(0);
  });

  it('trims analysis questions to the shared limit before storing them', async () => {
    const fixture = await createProcessingFixture({
      analysis: analyzedResponse({
        questions: [
          analyzedQuestion(),
          analyzedQuestion({ question: 'second' }),
          analyzedQuestion({ question: 'third' }),
        ],
      }),
    });

    const result = await fixture.run();

    expect(result.status).toBe('awaiting clarification');
    if (result.status !== 'awaiting clarification') {
      throw new Error('expected awaiting clarification');
    }
    expect(result.openQuestions).toBe(2);
    const questions = await fixture.repositories.listClarificationQuestionsBySession(SESSION_ID);
    expect(questions).toHaveLength(2);
    expect(questions.map((question) => question.question)).not.toContain('third');
  });

  it('skips analysis and advances to generating when nothing was transcribed', async () => {
    const fixture = await createProcessingFixture({ segments: [] });

    const result = await fixture.run();

    expect(result.status).toBe('generating');
    expect(fixture.analyzeCalls).toHaveLength(0);
    expect((await fixture.session()).status).toBe('generating');
  });

  it('does nothing for a session that is already past analyzing', async () => {
    const fixture = await createProcessingFixture({ status: 'generating' });

    const result = await fixture.run();

    expect(result.status).toBe('noop');
    expect(fixture.transcribeCalls).toHaveLength(0);
    expect(fixture.analyzeCalls).toHaveLength(0);
  });

  it('builds the analyze request from persisted transcript segments only', async () => {
    const fixture = await createProcessingFixture({
      segments: [
        makeSegment(0, 0, { text: 'first thought', speaker: 'user', transcriptConfidence: 0.95 }),
        makeSegment(0, 1, {
          text: 'second thought',
          language: 'ne',
          speaker: 'other',
          transcriptConfidence: 0.4,
        }),
      ],
    });

    await fixture.run();

    const request = fixture.analyzeCalls[0];
    expect(request).toBeDefined();
    expect(Object.keys(request).sort()).toEqual([
      'date',
      'journalLanguage',
      'segments',
      'timezone',
    ]);
    expect(request.date).toBe('2026-03-10');
    expect(request.timezone).toBe('UTC');
    expect(request.journalLanguage).toBe('en');
    expect(request.segments).toHaveLength(2);
    for (const segment of request.segments) {
      expect(Object.keys(segment).sort()).toEqual([
        'confidence',
        'endMs',
        'id',
        'language',
        'speaker',
        'startMs',
        'text',
      ]);
    }
    expect(request.segments.map((segment) => segment.text)).toEqual([
      'first thought',
      'second thought',
    ]);
    expect(request.segments.map((segment) => segment.confidence)).toEqual([0.95, 0.4]);
  });

  it('offsets transcript times by each chunk start relative to the session', async () => {
    const fixture = await createProcessingFixture({
      chunks: 2,
      // The second chunk begins 60s after the session start, not the usual 30s spacing.
      chunkStartOffsetsMs: [0, 60_000],
      segments: [
        makeSegment(0, 0, { text: 'first chunk' }),
        makeSegment(1, 1, { text: 'second chunk' }),
      ],
    });

    await fixture.run();

    const request = fixture.analyzeCalls[0];
    expect(
      request.segments.map((segment) => [segment.text, segment.startMs, segment.endMs]),
    ).toEqual([
      ['first chunk', 0, 900],
      ['second chunk', 61_000, 61_900],
    ]);
  });

  it('never leaks audio bytes, chunk paths, or embeddings into the analyze payload', async () => {
    const fixture = await createProcessingFixture();

    await fixture.run();

    const payload = JSON.stringify(fixture.analyzeCalls[0]);
    expect(payload).not.toContain('m4a-bytes');
    expect(payload).not.toContain('file://');
    expect(payload).not.toContain('/cache/');
    expect(payload).not.toContain('encrypted_path');
    expect(payload).not.toContain('encryptedPath');
    expect(payload).not.toContain('embedding');
    expect(payload).not.toContain('sha256');
    expect(payload).not.toContain('audio');
    // The seeded chunk still holds its encrypted audio, so the assertion above is meaningful.
    expect(await fixture.repositories.readAudioChunkBytes(chunkId(0))).not.toBeNull();
  });

  it('fails the session at transcribing when local transcription fails', async () => {
    const fixture = await createProcessingFixture({
      segments: [],
      transcription: { status: 'failed', code: 'model-unavailable', transcribed: 0, discarded: 0 },
    });

    const result = await fixture.run();

    expect(result).toMatchObject({
      status: 'failed',
      failedStage: 'transcribing',
      code: 'model-unavailable',
    });
    const session = await fixture.session();
    expect(session.status).toBe('failed');
    expect(session.failureCode).toBe('model-unavailable');
    expect(session.retryTarget).toBe('transcribing');
    expect(session.retryUntil).toBeDefined();
    const retryUntil = Date.parse(session.retryUntil ?? '');
    expect(retryUntil).toBeGreaterThanOrEqual(NOW.getTime());
    expect(retryUntil).toBeLessThanOrEqual(NOW.getTime() + DAY_MS);
    expect(fixture.analyzeCalls).toHaveLength(0);
  });

  it('fails the session at analyzing when analysis fails and keeps the transcript for a retry', async () => {
    const fixture = await createProcessingFixture({
      analysis: { status: 'failed', code: 'rate-limited' },
    });

    const result = await fixture.run();

    expect(result).toMatchObject({
      status: 'failed',
      failedStage: 'analyzing',
      code: 'rate-limited',
    });
    const session = await fixture.session();
    expect(session.status).toBe('failed');
    expect(session.failureCode).toBe('rate-limited');
    expect(session.retryTarget).toBe('analyzing');
    expect(session.retryUntil).toBeDefined();
    expect(countRows(fixture.database, 'transcript_segments')).toBe(1);
    expect(countRows(fixture.database, 'extracted_events')).toBe(0);
    expect(countRows(fixture.database, 'clarification_questions')).toBe(0);
  });

  it('treats a duplicate processSession call as a no-op', async () => {
    const fixture = await createProcessingFixture({
      analysis: analyzedResponse({
        events: [analyzedEvent()],
        questions: [analyzedQuestion(), analyzedQuestion()],
      }),
    });

    const first = await fixture.run();
    const second = await fixture.run();

    expect(first.status).toBe('awaiting clarification');
    expect(second.status).toBe('noop');
    expect(fixture.analyzeCalls).toHaveLength(1);
    expect(countRows(fixture.database, 'extracted_events')).toBe(1);
    expect(countRows(fixture.database, 'clarification_questions')).toBe(2);
  });

  it('resumes after an analyzing failure without duplicating events or questions', async () => {
    const fixture = await createProcessingFixture({
      analysis: { status: 'failed', code: 'upstream-unavailable' },
    });
    const failed = await fixture.run();
    expect(failed.status).toBe('failed');

    fixture.setAnalysis(
      analyzedResponse({
        events: [analyzedEvent()],
        questions: [analyzedQuestion(), analyzedQuestion()],
      }),
    );
    const resumedSession = await fixture.retry();
    expect(resumedSession.status).toBe('analyzing');

    const resumed = await fixture.run();

    expect(resumed.status).toBe('awaiting clarification');
    expect(countRows(fixture.database, 'extracted_events')).toBe(1);
    expect(countRows(fixture.database, 'clarification_questions')).toBe(2);
  });

  it('replaces prior analysis when a persisted analyzing session is reprocessed', async () => {
    const fixture = await createProcessingFixture({
      analysis: analyzedResponse({
        events: [analyzedEvent()],
        questions: [analyzedQuestion(), analyzedQuestion()],
      }),
    });
    await fixture.run();

    // Simulate a crash after analysis was persisted but before the status advance.
    const session = await fixture.session();
    await fixture.repositories.recordingSessions.save({
      ...session,
      status: 'analyzing',
      updatedAt: new Date(NOW.getTime() + 1_000).toISOString(),
    });

    const again = await fixture.run();

    expect(again.status).toBe('awaiting clarification');
    expect(countRows(fixture.database, 'extracted_events')).toBe(1);
    expect(countRows(fixture.database, 'clarification_questions')).toBe(2);
  });
});
