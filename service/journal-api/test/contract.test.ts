import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIMITS,
  analyzeResponseJsonSchema,
  generateResponseJsonSchema,
  isGrounded,
  parseAnalyzeRequest,
  parseGenerateRequest,
  parseJson,
  validateAnalyzeOutput,
  validateGenerateOutput,
} from '../src/contract.ts';
import type { AnalyzeRequest, GenerateRequest } from '../src/contract.ts';
import { analyzeBody, event, generateBody, question } from './harness.ts';

const SOURCE = 'I had lunch with Maya at the office and felt happy about it.';

// ---- Grounding check ---------------------------------------------------------------------------

test('grounding: names, places and feelings present in the source pass', () => {
  assert.ok(isGrounded('You had lunch with Maya at the office.', SOURCE));
  assert.ok(isGrounded('You were happy to see Maya.', SOURCE));
  assert.ok(isGrounded('You happily had lunch with Maya.', SOURCE));
  assert.ok(isGrounded("Maya's office was quiet.", SOURCE));
});

test('grounding: a capitalized name missing from the source fails, matched case-insensitively', () => {
  assert.equal(isGrounded('You had lunch with Priya.', SOURCE), false);
  assert.equal(isGrounded('You had lunch with MAYA.', SOURCE), true);
  assert.equal(isGrounded('You had lunch in Paris.', SOURCE), false);
});

test('grounding: sentence-initial words, I, days and months are not treated as names', () => {
  assert.ok(isGrounded('Lunch was short. Later you walked. "Quiet" came next. I agree.', SOURCE));
  assert.ok(isGrounded('On Monday in March I had lunch.', SOURCE));
  assert.ok(isGrounded('I’m glad. I’ll go.', SOURCE));
});

test('grounding ceiling: a name that opens a sentence is not detected', () => {
  assert.equal(isGrounded('Priya called about dinner.', SOURCE), true);
});

test('grounding: a name in mid-sentence after a sentence-initial word is still checked', () => {
  assert.equal(isGrounded('Lunch came with Priya.', SOURCE), false);
  assert.equal(isGrounded('Lunch. Then Priya left.', SOURCE), false);
});

test('grounding: feelings need a source feeling, including -ly and -ness forms', () => {
  assert.equal(isGrounded('You felt anxious.', SOURCE), false);
  assert.equal(isGrounded('You felt anxiously tense.', SOURCE), false);
  assert.equal(isGrounded('There was some sadness.', SOURCE), false);
  assert.equal(isGrounded('There was some happiness.', SOURCE), true);
  assert.equal(isGrounded('You were tired.', 'I was so tired today.'), true);
  assert.equal(isGrounded('You felt Tired.', 'I felt nothing.'), false);
});

test('grounding: all eighteen lexicon feelings are detected', () => {
  const lexicon = [
    'happy', 'sad', 'angry', 'anxious', 'excited', 'frustrated', 'grateful', 'worried',
    'stressed', 'proud', 'lonely', 'upset', 'nervous', 'relieved', 'disappointed', 'overwhelmed',
    'calm', 'tired',
  ]; // prettier-ignore
  assert.equal(lexicon.length, 18);
  for (const word of lexicon) {
    assert.equal(isGrounded(`You were ${word}.`, 'We walked home.'), false, word);
    assert.equal(isGrounded(`You were ${word}.`, `I was ${word}.`), true, word);
  }
});

test('grounding: Nepali text passes through untouched', () => {
  const nepali = 'तपाईंले प्रियासँग कार्यालयमा खाजा खानुभयो र खुसी हुनुभयो।';
  assert.ok(isGrounded(nepali, 'म काममा थिएँ।'));
  assert.ok(isGrounded(nepali, SOURCE));
  assert.ok(isGrounded('', SOURCE));
});

test('grounding: Latin names inside Nepali text are still checked', () => {
  assert.equal(isGrounded('तपाईंले Priya सँग कुरा गर्नुभयो।', 'म काममा थिएँ।'), false);
  assert.equal(isGrounded('तपाईंले Maya सँग कुरा गर्नुभयो।', SOURCE), true);
});

// ---- Request parsers -----------------------------------------------------------------------

function segment(overrides: Record<string, unknown> = {}) {
  return { ...analyzeBody().segments[0], ...overrides };
}

function analyzeWith(segments: unknown[]) {
  return parseAnalyzeRequest(analyzeBody({ segments }));
}

test('parseAnalyzeRequest accepts the fixture and returns it unchanged', () => {
  const parsed = parseAnalyzeRequest(analyzeBody());
  assert.deepEqual(parsed, analyzeBody());
});

test('parseAnalyzeRequest rejects non-objects, missing keys and unknown keys', () => {
  for (const input of [null, undefined, 'x', 7, [], {}])
    assert.equal(parseAnalyzeRequest(input), null);
  const { date: _date, ...missing } = analyzeBody();
  assert.equal(parseAnalyzeRequest(missing), null);
  assert.equal(parseAnalyzeRequest({ ...analyzeBody(), extra: 1 }), null);
  assert.equal(parseAnalyzeRequest(analyzeBody({ segments: [segment({ extra: true })] })), null);
});

test('parseAnalyzeRequest validates dates as real calendar dates', () => {
  for (const date of [
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-9-1',
    '26-09-25',
    '',
    20260925,
    null,
  ]) {
    assert.equal(parseAnalyzeRequest(analyzeBody({ date })), null, String(date));
  }
  assert.ok(parseAnalyzeRequest(analyzeBody({ date: '2028-02-29' })));
  assert.equal(parseAnalyzeRequest(analyzeBody({ date: '2027-02-29' })), null);
});

test('parseAnalyzeRequest validates the timezone with Intl', () => {
  for (const timezone of ['Mars/Olympus', '', 7, null, 'x'.repeat(65)]) {
    assert.equal(parseAnalyzeRequest(analyzeBody({ timezone })), null, String(timezone));
  }
  for (const timezone of ['UTC', 'Asia/Kathmandu', 'America/New_York']) {
    assert.ok(parseAnalyzeRequest(analyzeBody({ timezone })), timezone);
  }
});

test('parseAnalyzeRequest validates the journal language', () => {
  for (const journalLanguage of ['fr', 'EN', '', null, 1]) {
    assert.equal(parseAnalyzeRequest(analyzeBody({ journalLanguage })), null);
  }
  assert.ok(parseAnalyzeRequest(analyzeBody({ journalLanguage: 'ne' })));
});

test('parseAnalyzeRequest enforces segment count and id rules', () => {
  assert.equal(analyzeWith([]), null);
  assert.equal(analyzeWith([segment(), segment()]), null, 'duplicate ids');
  assert.equal(analyzeWith([segment({ id: '' })]), null);
  assert.equal(analyzeWith([segment({ id: 'x'.repeat(65) })]), null);
  assert.ok(analyzeWith([segment({ id: 'x'.repeat(64) })]));
  assert.equal(analyzeWith([segment({ id: 5 })]), null);
  const many = (n: number) => Array.from({ length: n }, (_, i) => segment({ id: `s${i}` }));
  assert.ok(analyzeWith(many(LIMITS.segments)));
  assert.equal(analyzeWith(many(LIMITS.segments + 1)), null);
});

test('parseAnalyzeRequest enforces millisecond, text, enum and confidence rules', () => {
  const bad: Record<string, unknown>[] = [
    { startMs: -1 },
    { startMs: 1.5 },
    { startMs: '1000' },
    { startMs: Number.MAX_SAFE_INTEGER + 2 },
    { startMs: 9000, endMs: 8000 },
    { endMs: null },
    { text: '' },
    { text: 'x'.repeat(LIMITS.segmentTextChars + 1) },
    { language: 'fr' },
    { speaker: 'robot' },
    { confidence: 1.01 },
    { confidence: -0.01 },
    { confidence: '0.5' },
    { confidence: Number.NaN },
  ];
  for (const overrides of bad) {
    assert.equal(analyzeWith([segment(overrides)]), null, JSON.stringify(overrides));
  }
  assert.ok(analyzeWith([segment({ startMs: 5000, endMs: 5000, confidence: 0 })]));
  assert.ok(analyzeWith([segment({ confidence: 1, text: 'x'.repeat(LIMITS.segmentTextChars) })]));
});

test('parseGenerateRequest accepts the fixture and empty events and answers', () => {
  assert.deepEqual(parseGenerateRequest(generateBody()), generateBody());
  assert.ok(parseGenerateRequest(generateBody({ events: [], answers: [] })));
});

test('parseGenerateRequest enforces answer and event limits and strict keys', () => {
  const answer = { questionId: 'question-1', answerText: 'Fine.' };
  assert.ok(parseGenerateRequest(generateBody({ answers: [answer, answer] })));
  assert.equal(parseGenerateRequest(generateBody({ answers: [answer, answer, answer] })), null);
  assert.equal(parseGenerateRequest(generateBody({ answers: [{ ...answer, extra: 1 }] })), null);
  assert.equal(
    parseGenerateRequest(generateBody({ answers: [{ ...answer, answerText: '' }] })),
    null,
  );
  assert.equal(
    parseGenerateRequest(
      generateBody({
        answers: [{ ...answer, answerText: 'x'.repeat(LIMITS.answerTextChars + 1) }],
      }),
    ),
    null,
  );
  assert.equal(
    parseGenerateRequest(generateBody({ answers: [{ ...answer, questionId: 'q'.repeat(65) }] })),
    null,
  );
  const goodEvent = generateBody().events[0]!;
  assert.equal(parseGenerateRequest(generateBody({ events: [{ ...goodEvent, extra: 1 }] })), null);
  assert.equal(
    parseGenerateRequest(generateBody({ events: [{ ...goodEvent, evidenceSegmentIds: [] }] })),
    null,
  );
  assert.equal(
    parseGenerateRequest(generateBody({ events: [{ ...goodEvent, kind: 'nap' }] })),
    null,
  );
  assert.equal(
    parseGenerateRequest(generateBody({ events: [{ ...goodEvent, summary: '' }] })),
    null,
  );
  assert.equal(parseGenerateRequest({ ...generateBody(), extra: 1 }), null);
  const many = Array.from({ length: LIMITS.events + 1 }, () => goodEvent);
  assert.equal(parseGenerateRequest(generateBody({ events: many })), null);
  assert.ok(parseGenerateRequest(generateBody({ events: many.slice(1) })));
});

test('parseJson returns undefined for invalid JSON', () => {
  assert.equal(parseJson('{oops'), undefined);
  assert.equal(parseJson(''), undefined);
  assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
});

// ---- Output validation ---------------------------------------------------------------------

const analyzeRequest = analyzeBody() as unknown as AnalyzeRequest;
const generateRequest = generateBody() as unknown as GenerateRequest;

test('validateAnalyzeOutput keeps supported items and counts dropped events', () => {
  const outcome = validateAnalyzeOutput(
    { events: [event(), event({ evidenceSegmentIds: ['nope'] })], questions: [question()] },
    analyzeRequest,
  );
  assert.ok(outcome);
  assert.equal(outcome.response.events.length, 1);
  assert.equal(outcome.response.questions.length, 1);
  assert.equal(outcome.droppedEvents, 1);
});

test('validateAnalyzeOutput returns null for shape failures', () => {
  for (const output of [
    null,
    'text',
    [],
    {},
    { events: [] },
    { events: [], questions: [], extra: 1 },
    { events: {}, questions: [] },
    { events: [event({ kind: 'nap' })], questions: [] },
    { events: [event({ speaker: 'robot' })], questions: [] },
    { events: [{ ...event(), extra: 1 }], questions: [] },
    { events: [event({ evidenceSegmentIds: [1] })], questions: [] },
    { events: [], questions: [question({ reason: 'curious' })] },
    { events: [], questions: [{ ...question(), extra: 1 }] },
    { events: Array(LIMITS.events + 1).fill(event()), questions: [] },
  ]) {
    assert.equal(validateAnalyzeOutput(output, analyzeRequest), null, JSON.stringify(output));
  }
});

test('validateAnalyzeOutput drops events with value problems instead of failing', () => {
  const dropped = [
    event({ confidence: 1.5 }),
    event({ startMs: -1 }),
    event({ startMs: 1.5 }),
    event({ summary: '' }),
    event({ summary: 'x'.repeat(LIMITS.summaryChars + 1) }),
    event({ evidenceSegmentIds: [] }),
  ];
  const outcome = validateAnalyzeOutput({ events: dropped, questions: [] }, analyzeRequest);
  assert.ok(outcome);
  assert.deepEqual(outcome.response.events, []);
  assert.equal(outcome.droppedEvents, dropped.length);
});

test('validateAnalyzeOutput keeps the first two questions in order', () => {
  const questions = [1, 2, 3].map((n) => question({ question: `Question ${n}?` }));
  const outcome = validateAnalyzeOutput({ events: [], questions }, analyzeRequest);
  assert.deepEqual(outcome?.response.questions, questions.slice(0, 2));
});

test('validateAnalyzeOutput accepts a question that touches a segment edge', () => {
  const outcome = validateAnalyzeOutput(
    {
      events: [],
      questions: [
        question({ startMs: 14000, endMs: 20000 }),
        question({ startMs: 14001, endMs: 20000 }),
      ],
    },
    analyzeRequest,
  );
  assert.equal(outcome?.response.questions.length, 1);
});

test('validateGenerateOutput accepts grounded output and rejects every bad shape', () => {
  const good = {
    title: 'Lunch with Maya',
    paragraphs: ['You had lunch with Maya.'],
    contextTags: ['work'],
  };
  assert.deepEqual(validateGenerateOutput(good, generateRequest), good);
  assert.deepEqual(validateGenerateOutput({ ...good, contextTags: [] }, generateRequest), {
    ...good,
    contextTags: [],
  });
  for (const output of [
    null,
    [],
    { ...good, extra: 1 },
    { ...good, title: '' },
    { ...good, title: 'x'.repeat(LIMITS.titleChars + 1) },
    { ...good, paragraphs: [] },
    { ...good, paragraphs: [''] },
    { ...good, paragraphs: ['x'.repeat(LIMITS.paragraphChars + 1)] },
    { ...good, paragraphs: Array(LIMITS.paragraphs + 1).fill('Text.') },
    { ...good, contextTags: ['Work'] },
    { ...good, contextTags: ['a_b'] },
    { ...good, contextTags: ['x'.repeat(25)] },
    { ...good, contextTags: Array(LIMITS.contextTags + 1).fill('tag') },
    { ...good, contextTags: [1] },
    { ...good, title: 'Lunch with Priya' },
  ]) {
    assert.equal(validateGenerateOutput(output, generateRequest), null, JSON.stringify(output));
  }
});

// ---- Schemas -------------------------------------------------------------------------------

test('response schemas are strict objects with every property required', () => {
  for (const schema of [analyzeResponseJsonSchema, generateResponseJsonSchema]) {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
  }
  assert.equal(analyzeResponseJsonSchema.properties.questions.maxItems, 2);
  assert.equal(analyzeResponseJsonSchema.properties.events.maxItems, 200);
});

test('contract.ts has no imports so the mobile app can reuse it', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/contract.ts', import.meta.url), 'utf8');
  assert.ok(!/^\s*import\s/m.test(source));
  assert.ok(!/\brequire\(/.test(source));
  assert.ok(!/\bprocess\./.test(source));
});
