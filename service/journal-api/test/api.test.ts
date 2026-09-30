import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { MAX_BODY_BYTES } from '../src/contract.ts';
import {
  ANALYZE_PATH,
  APP_CHECK_TOKEN,
  GENERATE_PATH,
  GENERATED,
  UUID,
  analyzeBody,
  event,
  generateBody,
  question,
  startHarness,
} from './harness.ts';

test('analyze happy path returns events and questions with a request id', async (t) => {
  const events = [event()];
  const questions = [question()];
  const h = await startHarness(t, [{ events, questions }]);
  const reply = await h.post(ANALYZE_PATH, analyzeBody());
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, { events, questions });
  assert.match(reply.headers.get('x-request-id') ?? '', UUID);
  assert.match(reply.headers.get('content-type') ?? '', /^application\/json/);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0]?.kind, 'analyze');
  assert.equal(h.logs.length, 1);
  assert.deepEqual(
    { ...h.logs[0], requestId: undefined, durationMs: undefined },
    {
      requestId: undefined,
      route: ANALYZE_PATH,
      status: 200,
      durationMs: undefined,
      code: null,
      segments: 3,
      events: 1,
      questions: 1,
      droppedEvents: 0,
    },
  );
  assert.equal(h.logs[0]?.requestId, reply.headers.get('x-request-id'));
});

test('generate happy path returns the journal entry', async (t) => {
  const h = await startHarness(t, [GENERATED]);
  const reply = await h.post(GENERATE_PATH, generateBody());
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, GENERATED);
  assert.match(reply.headers.get('x-request-id') ?? '', UUID);
  assert.equal(h.calls[0]?.kind, 'generate');
  assert.deepEqual(
    { ...h.logs[0], requestId: undefined, durationMs: undefined },
    {
      requestId: undefined,
      route: GENERATE_PATH,
      status: 200,
      durationMs: undefined,
      code: null,
      events: 1,
      paragraphs: 1,
    },
  );
});

test('generate accepts an empty events and answers request', async (t) => {
  const h = await startHarness(t, [
    { title: 'A quiet day', paragraphs: ['Nothing was recorded.'], contextTags: [] },
  ]);
  const reply = await h.post(GENERATE_PATH, generateBody({ events: [], answers: [] }));
  assert.equal(reply.status, 200);
});

test('a client supplied request id is ignored', async (t) => {
  const h = await startHarness(t, [{ events: [], questions: [] }]);
  const reply = await h.post(ANALYZE_PATH, analyzeBody(), { 'X-Request-Id': 'client-chosen-id-1' });
  const id = reply.headers.get('x-request-id') ?? '';
  assert.match(id, UUID);
  assert.notEqual(id, 'client-chosen-id-1');
});

test('missing App Check header returns 401 and never calls Gemini', async (t) => {
  const h = await startHarness(t, [{ events: [], questions: [] }]);
  const reply = await h.post(ANALYZE_PATH, analyzeBody(), { 'X-Firebase-AppCheck': null });
  assert.equal(reply.status, 401);
  assert.deepEqual(reply.json, {
    error: { code: 'app_check_required', requestId: reply.headers.get('x-request-id') },
  });
  assert.equal(h.calls.length, 0);
  assert.equal(h.verifyCalls.length, 0);
});

test('invalid App Check token returns 401 and never calls Gemini', async (t) => {
  const h = await startHarness(t, [{ events: [], questions: [] }]);
  const reply = await h.post(ANALYZE_PATH, analyzeBody(), {
    'X-Firebase-AppCheck': 'forged-token-value-123',
  });
  assert.equal(reply.status, 401);
  assert.equal(reply.json.error.code, 'app_check_invalid');
  assert.match(reply.headers.get('x-request-id') ?? '', UUID);
  assert.deepEqual(h.verifyCalls, ['forged-token-value-123']);
  assert.equal(h.calls.length, 0);
});

test('App Check is checked before the body is parsed', async (t) => {
  const h = await startHarness(t);
  const badJson = await h.post(ANALYZE_PATH, '{not json', {
    'X-Firebase-AppCheck': 'forged-token',
  });
  assert.equal(badJson.status, 401);
  const noToken = await h.post(GENERATE_PATH, '{not json', { 'X-Firebase-AppCheck': null });
  assert.equal(noToken.status, 401);
  const oversized = await h.post(ANALYZE_PATH, 'x'.repeat(MAX_BODY_BYTES + 1), {
    'X-Firebase-AppCheck': 'forged-token',
  });
  assert.equal(oversized.status, 401);
  assert.equal(h.calls.length, 0);
});

test('a body over the limit is rejected by Content-Length with 413', async (t) => {
  const h = await startHarness(t, [{ events: [], questions: [] }]);
  const reply = await h.post(ANALYZE_PATH, 'x'.repeat(MAX_BODY_BYTES + 1));
  assert.equal(reply.status, 413);
  assert.equal(reply.json.error.code, 'payload_too_large');
  assert.match(reply.headers.get('x-request-id') ?? '', UUID);
  assert.equal(h.calls.length, 0);
});

test('a chunked body over the limit is rejected while streaming with 413', async (t) => {
  const h = await startHarness(t, [{ events: [], questions: [] }]);
  const outcome = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request(
      `${h.url}${ANALYZE_PATH}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Firebase-AppCheck': APP_CHECK_TOKEN,
          'Transfer-Encoding': 'chunked',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    const chunk = Buffer.alloc(64 * 1024, 0x61);
    for (let sent = 0; sent <= MAX_BODY_BYTES + 64 * 1024; sent += chunk.length) req.write(chunk);
    req.end();
  });
  assert.equal(outcome.status, 413);
  assert.equal(JSON.parse(outcome.body).error.code, 'payload_too_large');
  assert.equal(h.calls.length, 0);
});

test('a body exactly at the limit is read, then judged by the schema', async (t) => {
  const h = await startHarness(t);
  const reply = await h.post(ANALYZE_PATH, ' '.repeat(MAX_BODY_BYTES));
  assert.equal(reply.status, 400);
});

const badRequests: [string, string, unknown][] = [
  ['invalid JSON', ANALYZE_PATH, '{"date": "2026-09-25", '],
  ['empty body', ANALYZE_PATH, ''],
  ['unknown top-level key', ANALYZE_PATH, analyzeBody({ extra: 'SENSITIVE-UNKNOWN-KEY-VALUE' })],
  [
    'unknown segment key',
    ANALYZE_PATH,
    analyzeBody({
      segments: [
        {
          id: 'a',
          startMs: 0,
          endMs: 10,
          text: 'SENSITIVE-SEGMENT-TEXT',
          language: 'en',
          speaker: 'user',
          confidence: 0.5,
          extra: 1,
        },
      ],
    }),
  ],
  ['impossible date', ANALYZE_PATH, analyzeBody({ date: '2026-02-30' })],
  ['malformed date', ANALYZE_PATH, analyzeBody({ date: '25-09-2026' })],
  ['unknown timezone', ANALYZE_PATH, analyzeBody({ timezone: 'Mars/Olympus_Mons' })],
  ['unsupported language', ANALYZE_PATH, analyzeBody({ journalLanguage: 'fr' })],
  ['no segments', ANALYZE_PATH, analyzeBody({ segments: [] })],
  [
    'duplicate segment ids',
    ANALYZE_PATH,
    analyzeBody({
      segments: [
        {
          id: 'dup',
          startMs: 0,
          endMs: 1,
          text: 'one',
          language: 'en',
          speaker: 'user',
          confidence: 1,
        },
        {
          id: 'dup',
          startMs: 2,
          endMs: 3,
          text: 'two',
          language: 'en',
          speaker: 'user',
          confidence: 1,
        },
      ],
    }),
  ],
  [
    'confidence above 1',
    ANALYZE_PATH,
    analyzeBody({
      segments: [
        {
          id: 'a',
          startMs: 0,
          endMs: 1,
          text: 'one',
          language: 'en',
          speaker: 'user',
          confidence: 1.5,
        },
      ],
    }),
  ],
  [
    'end before start',
    ANALYZE_PATH,
    analyzeBody({
      segments: [
        {
          id: 'a',
          startMs: 9,
          endMs: 1,
          text: 'one',
          language: 'en',
          speaker: 'user',
          confidence: 1,
        },
      ],
    }),
  ],
  [
    'segment text too long',
    ANALYZE_PATH,
    analyzeBody({
      segments: [
        {
          id: 'a',
          startMs: 0,
          endMs: 1,
          text: 'x'.repeat(4001),
          language: 'en',
          speaker: 'user',
          confidence: 1,
        },
      ],
    }),
  ],
  ['unknown generate key', GENERATE_PATH, generateBody({ extra: 'SENSITIVE-GENERATE-EXTRA' })],
  [
    'too many answers',
    GENERATE_PATH,
    generateBody({
      answers: [1, 2, 3].map((n) => ({
        questionId: `q-${n}`,
        answerText: `SENSITIVE-ANSWER-${n}`,
      })),
    }),
  ],
  [
    'generate event without evidence',
    GENERATE_PATH,
    generateBody({
      events: [
        { kind: 'moment', summary: 'SENSITIVE-SUMMARY', evidenceSegmentIds: [], speaker: 'user' },
      ],
    }),
  ],
  ['generate events not an array', GENERATE_PATH, generateBody({ events: 'nope' })],
];

for (const [name, path, body] of badRequests) {
  test(`invalid request returns 400 and echoes nothing: ${name}`, async (t) => {
    const h = await startHarness(t, [{ events: [], questions: [] }]);
    const reply = await h.post(path, body);
    assert.equal(reply.status, 400);
    const requestId = reply.headers.get('x-request-id');
    assert.match(requestId ?? '', UUID);
    assert.deepEqual(reply.json, { error: { code: 'invalid_request', requestId } });
    assert.equal(h.calls.length, 0);
  });
}

test('a non-JSON content type returns 415', async (t) => {
  const h = await startHarness(t);
  const reply = await h.post(ANALYZE_PATH, JSON.stringify(analyzeBody()), {
    'Content-Type': 'text/plain',
  });
  assert.equal(reply.status, 415);
  assert.equal(reply.json.error.code, 'unsupported_media_type');
  assert.equal(h.calls.length, 0);
});

test('a JSON content type with a charset is accepted', async (t) => {
  const h = await startHarness(t, [{ events: [], questions: [] }]);
  const reply = await h.post(ANALYZE_PATH, analyzeBody(), {
    'Content-Type': 'application/json; charset=utf-8',
  });
  assert.equal(reply.status, 200);
});

test('GET on a known path returns 405 with Allow', async (t) => {
  const h = await startHarness(t);
  const response = await fetch(`${h.url}${ANALYZE_PATH}`);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'POST');
  assert.match(response.headers.get('x-request-id') ?? '', UUID);
  assert.equal(((await response.json()) as any).error.code, 'method_not_allowed');
});

test('PUT on a known path returns 405', async (t) => {
  const h = await startHarness(t);
  const response = await fetch(`${h.url}${GENERATE_PATH}`, { method: 'PUT', body: '{}' });
  assert.equal(response.status, 405);
});

test('an unknown path returns 404 and is not logged by name', async (t) => {
  const h = await startHarness(t);
  const response = await fetch(`${h.url}/v1/journal/secret-path-name`, {
    method: 'POST',
    body: '{}',
  });
  assert.equal(response.status, 404);
  assert.equal(((await response.json()) as any).error.code, 'not_found');
  assert.equal(h.logs[0]?.route, 'unknown');
  assert.ok(!JSON.stringify(h.logs).includes('secret-path-name'));
});

test('a trailing slash is not a route', async (t) => {
  const h = await startHarness(t);
  const response = await fetch(`${h.url}${ANALYZE_PATH}/`, { method: 'POST', body: '{}' });
  assert.equal(response.status, 404);
});

test('a query string does not change routing', async (t) => {
  const h = await startHarness(t, [{ events: [], questions: [] }]);
  const reply = await h.post(`${ANALYZE_PATH}?debug=1`, analyzeBody());
  assert.equal(reply.status, 200);
});

class SdkError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

test('a Gemini 429 returns 429 with Retry-After', async (t) => {
  const h = await startHarness(t, [new SdkError(429, 'quota exceeded for SENSITIVE-QUOTED-TEXT')]);
  const reply = await h.post(ANALYZE_PATH, analyzeBody());
  assert.equal(reply.status, 429);
  assert.equal(reply.json.error.code, 'upstream_rate_limited');
  assert.equal(reply.headers.get('retry-after'), '30');
  assert.equal(h.calls.length, 1);
  assert.ok(!reply.text.includes('SENSITIVE-QUOTED-TEXT'));
});

test('a Gemini timeout returns 504', async (t) => {
  const h = await startHarness(t, [new DOMException('timed out', 'TimeoutError')]);
  const reply = await h.post(GENERATE_PATH, generateBody());
  assert.equal(reply.status, 504);
  assert.equal(reply.json.error.code, 'upstream_timeout');
});

test('an aborted Gemini request returns 504', async (t) => {
  const h = await startHarness(t, [new DOMException('aborted', 'AbortError')]);
  const reply = await h.post(ANALYZE_PATH, analyzeBody());
  assert.equal(reply.status, 504);
});

test('any other Gemini failure returns 503 without retrying', async (t) => {
  const h = await startHarness(t, [
    new SdkError(500, 'internal error quoting SENSITIVE-UPSTREAM-MESSAGE'),
    { events: [], questions: [] },
  ]);
  const reply = await h.post(ANALYZE_PATH, analyzeBody());
  assert.equal(reply.status, 503);
  assert.equal(reply.json.error.code, 'upstream_unavailable');
  assert.equal(h.calls.length, 1);
  assert.ok(!reply.text.includes('SENSITIVE-UPSTREAM-MESSAGE'));
});

test('a thrown non-Error upstream value returns 503', async (t) => {
  const h = await startHarness(t, [], {
    generate: async () => {
      throw 'plain string failure';
    },
  });
  const reply = await h.post(ANALYZE_PATH, analyzeBody());
  assert.equal(reply.status, 503);
});

test('an unexpected fault is logged as internal, by code only', async (t) => {
  let faulted = false;
  const h = await startHarness(t, [{ events: [], questions: [] }], {
    log: () => {
      if (faulted) return;
      faulted = true;
      throw new Error('SENSITIVE-LOGGER-FAULT');
    },
  });
  await h.post(ANALYZE_PATH, analyzeBody());
  assert.equal(h.logs.length, 2);
  assert.equal(h.logs[1]?.status, 500);
  assert.equal(h.logs[1]?.code, 'internal');
  assert.ok(!JSON.stringify(h.logs).includes('SENSITIVE-LOGGER-FAULT'));
});
