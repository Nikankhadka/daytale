import {
  StorageOperationRejectedError,
  StorageRepositoryError,
} from '../../src/storage/repositories';
import { SESSION_ID } from './kit';
import { analyzedQuestion, analyzedResponse, createProcessingFixture } from './kit';

async function fixtureWithTwoQuestions() {
  const fixture = await createProcessingFixture({
    analysis: analyzedResponse({
      questions: [
        analyzedQuestion(),
        analyzedQuestion({ question: 'What happened next?', reason: 'missing_context' }),
      ],
    }),
  });
  await fixture.run();
  const questions = await fixture.repositories.listClarificationQuestionsBySession(SESSION_ID);
  return { fixture, questions };
}

describe('submitClarification', () => {
  it('answers and skips questions, then advances to generating', async () => {
    const { fixture, questions } = await fixtureWithTwoQuestions();
    const [answered, skipped] = questions;

    const result = await fixture.submit([
      { questionId: answered.id, answerText: 'It was the farmers market.' },
      { questionId: skipped.id },
    ]);

    expect(result.status).toBe('submitted');
    if (result.status !== 'submitted') {
      throw new Error('expected a submitted result');
    }
    expect(result.answered).toBe(1);
    expect(result.skipped).toBe(1);
    expect((await fixture.session()).status).toBe('generating');
    const settled = await fixture.repositories.listClarificationQuestionsBySession(SESSION_ID);
    expect(settled.find((question) => question.id === answered.id)?.status).toBe('answered');
    expect(settled.find((question) => question.id === skipped.id)?.status).toBe('skipped');
    const answers = await fixture.repositories.clarificationAnswers.list();
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({
      questionId: answered.id,
      answerText: 'It was the farmers market.',
    });
  });

  it('rejects a question id that does not belong to the session', async () => {
    const { fixture } = await fixtureWithTwoQuestions();

    const result = await fixture.submit([
      { questionId: '99999999-9999-4999-8999-999999999999', answerText: 'nope' },
    ]);

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') {
      throw new Error('expected a rejected result');
    }
    expect(result.code).toBe('unknown-question');
    expect((await fixture.session()).status).toBe('awaiting clarification');
    expect(await fixture.repositories.clarificationAnswers.list()).toHaveLength(0);
  });

  it('rejects a submission that leaves an open question unanswered', async () => {
    const { fixture, questions } = await fixtureWithTwoQuestions();
    const [answered, missed] = questions;

    const result = await fixture.submit([{ questionId: answered.id, answerText: 'partial' }]);

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') {
      throw new Error('expected a rejected result');
    }
    expect(result.code).toBe('missing-question');
    expect((await fixture.session()).status).toBe('awaiting clarification');
    const stored = await fixture.repositories.listClarificationQuestionsBySession(SESSION_ID);
    expect(stored.find((question) => question.id === missed.id)?.status).toBe('open');
    expect(stored.every((question) => question.status === 'open')).toBe(true);
    expect(await fixture.repositories.clarificationAnswers.list()).toHaveLength(0);
  });

  it('maps a rejected session advance to a rejected result instead of settling the questions', async () => {
    const { fixture, questions } = await fixtureWithTwoQuestions();
    fixture.repositories.saveClarificationSubmission = async () => {
      throw new StorageOperationRejectedError('forced rejection');
    };

    const result = await fixture.submit(
      questions.map((question) => ({ questionId: question.id, answerText: 'answer' })),
    );

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') {
      throw new Error('expected a rejected result');
    }
    expect(result.code).toBe('rejected');
    expect((await fixture.session()).status).toBe('awaiting clarification');
  });

  it('does not mask an unexpected storage failure as a rejected result', async () => {
    const { fixture, questions } = await fixtureWithTwoQuestions();
    fixture.repositories.saveClarificationSubmission = async () => {
      throw new StorageRepositoryError('unexpected storage failure');
    };

    await expect(
      fixture.submit(
        questions.map((question) => ({ questionId: question.id, answerText: 'answer' })),
      ),
    ).rejects.toBeInstanceOf(StorageRepositoryError);
    expect((await fixture.session()).status).toBe('awaiting clarification');
  });

  it('rejects a duplicate question id in one submission', async () => {
    const { fixture, questions } = await fixtureWithTwoQuestions();
    const [question] = questions;

    const result = await fixture.submit([
      { questionId: question.id, answerText: 'first' },
      { questionId: question.id, answerText: 'second' },
    ]);

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') {
      throw new Error('expected a rejected result');
    }
    expect(result.code).toBe('duplicate-question');
    expect((await fixture.session()).status).toBe('awaiting clarification');
  });

  it('rejects a second submission once the questions are settled', async () => {
    const { fixture, questions } = await fixtureWithTwoQuestions();
    const [question, other] = questions;
    // A submission must cover every open question, so the first pass settles both.
    const first = await fixture.submit([
      { questionId: question.id, answerText: 'First answer' },
      { questionId: other.id },
    ]);
    const second = await fixture.submit([{ questionId: question.id, answerText: 'Second answer' }]);

    expect(first.status).toBe('submitted');
    expect(second.status).toBe('rejected');
    if (second.status !== 'rejected') {
      throw new Error('expected a rejected result');
    }
    expect(second.code).toBe('not-awaiting-clarification');
    const answers = await fixture.repositories.clarificationAnswers.list();
    expect(answers).toHaveLength(1);
    expect(answers[0]?.answerText).toBe('First answer');
  });

  it('rejects a session that is not awaiting clarification', async () => {
    const fixture = await createProcessingFixture();

    const result = await fixture.submit([]);

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') {
      throw new Error('expected a rejected result');
    }
    expect(result.code).toBe('not-awaiting-clarification');
  });
});
