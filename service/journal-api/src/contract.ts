// Journal API contract: types, strict request parsers, model-output validation and policy checks,
// and the JSON Schemas handed to Gemini. Owner of the rules in Docs/03-SPEC.md section 7.
//
// This file is dependency-free on purpose: it has no imports, so the mobile app (DYT-009) can
// import it to validate responses again before saving. Do not add node or npm imports here.

export const ANALYZE_PATH = '/v1/journal/analyze';
export const GENERATE_PATH = '/v1/journal/generate';
export const MAX_BODY_BYTES = 1_048_576;

export const LANGUAGES = ['en', 'ne'] as const;
export const SPEAKERS = ['user', 'other', 'unknown'] as const;
export const EVENT_KINDS = ['moment', 'activity', 'conversation', 'plan', 'reflection'] as const;
export const QUESTION_REASONS = ['missing_context', 'ambiguous_speaker', 'unclear_speech'] as const;

export const LIMITS = {
  segments: 10_000,
  idChars: 64,
  segmentTextChars: 4_000,
  events: 200,
  summaryChars: 500,
  evidenceIds: 50,
  questions: 2,
  questionChars: 300,
  answers: 2,
  answerTextChars: 2_000,
  titleChars: 120,
  paragraphs: 12,
  paragraphChars: 2_000,
  contextTags: 6,
} as const;

export type Language = (typeof LANGUAGES)[number];
export type Speaker = (typeof SPEAKERS)[number];
export type EventKind = (typeof EVENT_KINDS)[number];
export type QuestionReason = (typeof QUESTION_REASONS)[number];

export interface Segment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  language: Language;
  speaker: Speaker;
  confidence: number;
}

export interface AnalyzeRequest {
  date: string;
  timezone: string;
  segments: Segment[];
  journalLanguage: Language;
}

export interface AnalyzedEvent {
  startMs: number;
  endMs: number;
  kind: EventKind;
  summary: string;
  evidenceSegmentIds: string[];
  speaker: Speaker;
  confidence: number;
}

export interface AnalyzedQuestion {
  startMs: number;
  endMs: number;
  question: string;
  reason: QuestionReason;
}

export interface AnalyzeResponse {
  events: AnalyzedEvent[];
  questions: AnalyzedQuestion[];
}

export interface GenerateEvent {
  kind: EventKind;
  summary: string;
  evidenceSegmentIds: string[];
  speaker: Speaker;
}

export interface GenerateAnswer {
  questionId: string;
  answerText: string;
}

export interface GenerateRequest {
  date: string;
  timezone: string;
  journalLanguage: Language;
  events: GenerateEvent[];
  answers: GenerateAnswer[];
}

export interface GenerateResponse {
  title: string;
  paragraphs: string[];
  contextTags: string[];
}

// ---------------------------------------------------------------------------------------------
// Primitive checks
// ---------------------------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Strict objects: exactly these keys, no more, no fewer.
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return (
    own.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isText(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

function isConfidence(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 1;
}

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= LIMITS.evidenceIds &&
    value.every((id) => isText(id, 1, LIMITS.idChars))
  );
}

// Returns undefined when the text is not JSON (undefined is never a valid JSON document).
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------------------------
// Request parsers. null means invalid; the caller answers 400 without echoing any input.
// ---------------------------------------------------------------------------------------------

function parseSegment(value: unknown): Segment | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['id', 'startMs', 'endMs', 'text', 'language', 'speaker', 'confidence'])
  ) {
    return null;
  }
  const { id, startMs, endMs, text, language, speaker, confidence } = value;
  if (
    !isText(id, 1, LIMITS.idChars) ||
    !isMs(startMs) ||
    !isMs(endMs) ||
    startMs > endMs ||
    !isText(text, 1, LIMITS.segmentTextChars) ||
    !oneOf(LANGUAGES, language) ||
    !oneOf(SPEAKERS, speaker) ||
    !isConfidence(confidence)
  ) {
    return null;
  }
  return { id, startMs, endMs, text, language, speaker, confidence };
}

export function parseAnalyzeRequest(input: unknown): AnalyzeRequest | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ['date', 'timezone', 'segments', 'journalLanguage'])
  ) {
    return null;
  }
  const { date, timezone, segments, journalLanguage } = input;
  if (
    !isCalendarDate(date) ||
    !isTimezone(timezone) ||
    !oneOf(LANGUAGES, journalLanguage) ||
    !Array.isArray(segments) ||
    segments.length < 1 ||
    segments.length > LIMITS.segments
  ) {
    return null;
  }
  const ids = new Set<string>();
  const parsed: Segment[] = [];
  for (const raw of segments) {
    const segment = parseSegment(raw);
    if (segment === null || ids.has(segment.id)) return null;
    ids.add(segment.id);
    parsed.push(segment);
  }
  return { date, timezone, segments: parsed, journalLanguage };
}

function parseGenerateEvent(value: unknown): GenerateEvent | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['kind', 'summary', 'evidenceSegmentIds', 'speaker'])
  ) {
    return null;
  }
  const { kind, summary, evidenceSegmentIds, speaker } = value;
  if (
    !oneOf(EVENT_KINDS, kind) ||
    !isText(summary, 1, LIMITS.summaryChars) ||
    !isIdList(evidenceSegmentIds) ||
    !oneOf(SPEAKERS, speaker)
  ) {
    return null;
  }
  return { kind, summary, evidenceSegmentIds, speaker };
}

function parseGenerateAnswer(value: unknown): GenerateAnswer | null {
  if (!isRecord(value) || !hasExactKeys(value, ['questionId', 'answerText'])) return null;
  const { questionId, answerText } = value;
  if (!isText(questionId, 1, LIMITS.idChars) || !isText(answerText, 1, LIMITS.answerTextChars)) {
    return null;
  }
  return { questionId, answerText };
}

export function parseGenerateRequest(input: unknown): GenerateRequest | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ['date', 'timezone', 'journalLanguage', 'events', 'answers'])
  ) {
    return null;
  }
  const { date, timezone, journalLanguage, events, answers } = input;
  if (
    !isCalendarDate(date) ||
    !isTimezone(timezone) ||
    !oneOf(LANGUAGES, journalLanguage) ||
    !Array.isArray(events) ||
    events.length > LIMITS.events ||
    !Array.isArray(answers) ||
    answers.length > LIMITS.answers
  ) {
    return null;
  }
  const parsedEvents = events.map(parseGenerateEvent);
  const parsedAnswers = answers.map(parseGenerateAnswer);
  if (parsedEvents.includes(null) || parsedAnswers.includes(null)) return null;
  return {
    date,
    timezone,
    journalLanguage,
    events: parsedEvents as GenerateEvent[],
    answers: parsedAnswers as GenerateAnswer[],
  };
}

// ---------------------------------------------------------------------------------------------
// Grounding check (policy: no invented people, places, or feelings).
//
// ponytail: heuristic ceiling - only Latin capitalized names and an English feeling lexicon are
// detected. Devanagari names and feelings are not, and Nepali text passes through untouched. A
// word that opens a sentence is not checked, so a name opening a sentence ("Priya called.") passes;
// the prompt forbids it, and this check cannot tell it from an ordinary capitalized first word. A
// Latin name written in an English summary of Nepali speech cannot occur in the source and is
// rejected (fails closed). Upgrade path: a second model pass or entity extraction.
// ---------------------------------------------------------------------------------------------

const LATIN_WORD = /[A-Za-zÀ-ɏ]+(?:['’][A-Za-zÀ-ɏ]+)*/g;

const ALWAYS_CAPITALIZED = new Set([
  "i", "i'm", "i'll", "i've", "i'd",
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december',
]); // prettier-ignore

const FEELINGS = [
  'happy', 'sad', 'angry', 'anxious', 'excited', 'frustrated', 'grateful', 'worried', 'stressed',
  'proud', 'lonely', 'upset', 'nervous', 'relieved', 'disappointed', 'overwhelmed', 'calm', 'tired',
]; // prettier-ignore

// Every lexicon word plus its -ly and -ness forms (happy, happily, happiness) maps to its base.
const FEELING_STEM = new Map<string, string>();
for (const base of FEELINGS) {
  const root = base.endsWith('y') ? `${base.slice(0, -1)}i` : base;
  FEELING_STEM.set(base, base);
  FEELING_STEM.set(`${root}ly`, base);
  FEELING_STEM.set(`${root}ness`, base);
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/’/g, "'").replace(/'s$/, '');
}

function isSentenceInitial(text: string, index: number): boolean {
  const before = text.slice(0, index).replace(/[ \t"'“‘([]+$/, '');
  return before === '' || /[.!?…।॥\n]$/.test(before);
}

export function isGrounded(text: string, source: string): boolean {
  const sourceWords = new Set<string>();
  const sourceFeelings = new Set<string>();
  for (const match of source.matchAll(LATIN_WORD)) {
    const word = normalizeWord(match[0]);
    sourceWords.add(word);
    const feeling = FEELING_STEM.get(word);
    if (feeling !== undefined) sourceFeelings.add(feeling);
  }
  for (const match of text.matchAll(LATIN_WORD)) {
    const raw = match[0];
    const word = normalizeWord(raw);
    const feeling = FEELING_STEM.get(word);
    if (feeling !== undefined && !sourceFeelings.has(feeling)) return false;
    const capitalized = raw[0] !== raw[0]!.toLowerCase();
    if (
      capitalized &&
      !ALWAYS_CAPITALIZED.has(word) &&
      !isSentenceInitial(text, match.index) &&
      !sourceWords.has(word)
    ) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Model output validation.
//
// Two layers. Shape problems (not JSON, wrong types, unknown keys, bad enum values) make the whole
// output invalid (null) and the service retries once. Value and policy problems drop only the
// offending event or question, so a manipulated or sloppy output degrades to a smaller valid one.
// ---------------------------------------------------------------------------------------------

export interface AnalyzeOutcome {
  response: AnalyzeResponse;
  droppedEvents: number;
}

function isEventShape(value: unknown): value is AnalyzedEvent {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'startMs',
      'endMs',
      'kind',
      'summary',
      'evidenceSegmentIds',
      'speaker',
      'confidence',
    ]) &&
    typeof value.startMs === 'number' &&
    typeof value.endMs === 'number' &&
    oneOf(EVENT_KINDS, value.kind) &&
    typeof value.summary === 'string' &&
    Array.isArray(value.evidenceSegmentIds) &&
    value.evidenceSegmentIds.every((id) => typeof id === 'string') &&
    oneOf(SPEAKERS, value.speaker) &&
    typeof value.confidence === 'number'
  );
}

function isQuestionShape(value: unknown): value is AnalyzedQuestion {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['startMs', 'endMs', 'question', 'reason']) &&
    typeof value.startMs === 'number' &&
    typeof value.endMs === 'number' &&
    typeof value.question === 'string' &&
    oneOf(QUESTION_REASONS, value.reason)
  );
}

function isSupportedEvent(event: AnalyzedEvent, segments: Map<string, Segment>): boolean {
  const ids = event.evidenceSegmentIds;
  if (
    !isMs(event.startMs) ||
    !isMs(event.endMs) ||
    event.startMs > event.endMs ||
    !isText(event.summary, 1, LIMITS.summaryChars) ||
    !isConfidence(event.confidence) ||
    ids.length < 1 ||
    ids.length > LIMITS.evidenceIds
  ) {
    return false;
  }
  const evidence: Segment[] = [];
  for (const id of ids) {
    const segment = segments.get(id);
    if (segment === undefined) return false;
    evidence.push(segment);
  }
  if (event.speaker === 'user' && !evidence.some((segment) => segment.speaker === 'user')) {
    return false;
  }
  const from = Math.min(...evidence.map((segment) => segment.startMs));
  const to = Math.max(...evidence.map((segment) => segment.endMs));
  if (event.startMs < from || event.endMs > to) return false;
  return isGrounded(event.summary, evidence.map((segment) => segment.text).join('\n'));
}

function isSupportedQuestion(question: AnalyzedQuestion, request: AnalyzeRequest): boolean {
  return (
    isMs(question.startMs) &&
    isMs(question.endMs) &&
    question.startMs <= question.endMs &&
    isText(question.question, 1, LIMITS.questionChars) &&
    request.segments.some(
      (segment) => question.startMs <= segment.endMs && question.endMs >= segment.startMs,
    )
  );
}

export function validateAnalyzeOutput(
  output: unknown,
  request: AnalyzeRequest,
): AnalyzeOutcome | null {
  if (!isRecord(output) || !hasExactKeys(output, ['events', 'questions'])) return null;
  const { events, questions } = output;
  if (
    !Array.isArray(events) ||
    events.length > LIMITS.events ||
    !events.every(isEventShape) ||
    !Array.isArray(questions) ||
    !questions.every(isQuestionShape)
  ) {
    return null;
  }
  const segments = new Map(request.segments.map((segment) => [segment.id, segment]));
  const kept = events.filter((event) => isSupportedEvent(event, segments));
  return {
    response: {
      events: kept,
      questions: questions
        .filter((question) => isSupportedQuestion(question, request))
        .slice(0, LIMITS.questions),
    },
    droppedEvents: events.length - kept.length,
  };
}

const CONTEXT_TAG = /^[a-z-]{1,24}$/;

// Any failure here is fatal for the whole response: a journal entry is one piece of prose.
export function validateGenerateOutput(
  output: unknown,
  request: GenerateRequest,
): GenerateResponse | null {
  if (!isRecord(output) || !hasExactKeys(output, ['title', 'paragraphs', 'contextTags'])) {
    return null;
  }
  const { title, paragraphs, contextTags } = output;
  if (
    !isText(title, 1, LIMITS.titleChars) ||
    !Array.isArray(paragraphs) ||
    paragraphs.length < 1 ||
    paragraphs.length > LIMITS.paragraphs ||
    !paragraphs.every((paragraph): paragraph is string =>
      isText(paragraph, 1, LIMITS.paragraphChars),
    ) ||
    !Array.isArray(contextTags) ||
    contextTags.length > LIMITS.contextTags ||
    !contextTags.every((tag): tag is string => typeof tag === 'string' && CONTEXT_TAG.test(tag))
  ) {
    return null;
  }
  const source = [
    ...request.events.map((event) => event.summary),
    ...request.answers.map((answer) => answer.answerText),
  ].join('\n');
  if (![title, ...paragraphs].every((text) => isGrounded(text, source))) return null;
  return { title, paragraphs, contextTags };
}

// ---------------------------------------------------------------------------------------------
// JSON Schemas handed to Gemini as responseJsonSchema. Only keywords that Gemini structured output
// documents as supported are used; string length and tag patterns are enforced above instead.
// ---------------------------------------------------------------------------------------------

const speakerSchema = { type: 'string', enum: [...SPEAKERS] };
const msSchema = { type: 'integer', minimum: 0 };

export const analyzeResponseJsonSchema = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      maxItems: LIMITS.events,
      items: {
        type: 'object',
        properties: {
          startMs: msSchema,
          endMs: msSchema,
          kind: { type: 'string', enum: [...EVENT_KINDS] },
          summary: { type: 'string' },
          evidenceSegmentIds: {
            type: 'array',
            minItems: 1,
            maxItems: LIMITS.evidenceIds,
            items: { type: 'string' },
          },
          speaker: speakerSchema,
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: [
          'startMs',
          'endMs',
          'kind',
          'summary',
          'evidenceSegmentIds',
          'speaker',
          'confidence',
        ],
        additionalProperties: false,
      },
    },
    questions: {
      type: 'array',
      maxItems: LIMITS.questions,
      items: {
        type: 'object',
        properties: {
          startMs: msSchema,
          endMs: msSchema,
          question: { type: 'string' },
          reason: { type: 'string', enum: [...QUESTION_REASONS] },
        },
        required: ['startMs', 'endMs', 'question', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['events', 'questions'],
  additionalProperties: false,
};

export const generateResponseJsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    paragraphs: {
      type: 'array',
      minItems: 1,
      maxItems: LIMITS.paragraphs,
      items: { type: 'string' },
    },
    contextTags: { type: 'array', maxItems: LIMITS.contextTags, items: { type: 'string' } },
  },
  required: ['title', 'paragraphs', 'contextTags'],
  additionalProperties: false,
};
