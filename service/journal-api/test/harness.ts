import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { TestContext } from 'node:test';
import { createServer } from '../src/app.ts';
import type { Deps, LogEntry, ModelRequest } from '../src/app.ts';
import { ANALYZE_PATH, GENERATE_PATH } from '../src/contract.ts';

export const APP_CHECK_TOKEN = 'app-check-token-7f3a9c1e-valid';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ALLOWED_LOG_KEYS = new Set([
  'requestId',
  'route',
  'status',
  'durationMs',
  'code',
  'segments',
  'events',
  'questions',
  'paragraphs',
  'droppedEvents',
]);

// A scripted model output: raw text, an object (sent as JSON), or an error to throw.
export type Output = string | object | Error;

export interface Reply {
  status: number;
  headers: Headers;
  text: string;
  json: any;
}

export interface Harness {
  url: string;
  logs: LogEntry[];
  calls: ModelRequest[];
  verifyCalls: string[];
  post(path: string, body: unknown, headers?: Record<string, string | null>): Promise<Reply>;
}

function leaves(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') {
    if (value.length >= 5) into.add(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => leaves(item, into));
  } else if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach((item) => leaves(item, into));
  }
}

// Starts the real server on an ephemeral port with fakes behind it. After the test it asserts the
// log lines hold only the allowed keys and none of the content that went through the service.
export async function startHarness(
  t: TestContext,
  outputs: Output[] = [],
  overrides: Partial<Deps> = {},
): Promise<Harness> {
  const logs: LogEntry[] = [];
  const calls: ModelRequest[] = [];
  const verifyCalls: string[] = [];
  const sensitive = new Set<string>([APP_CHECK_TOKEN]);
  outputs.forEach((output) => leaves(output instanceof Error ? output.message : output, sensitive));
  const queue = [...outputs];

  const server = createServer({
    verifyAppCheck: async (token) => {
      verifyCalls.push(token);
      if (token !== APP_CHECK_TOKEN) throw new Error('rejected');
    },
    generate: async (request) => {
      calls.push(request);
      const next = queue.shift();
      if (next === undefined) throw new Error('no scripted output left');
      if (next instanceof Error) throw next;
      return typeof next === 'string' ? next : JSON.stringify(next);
    },
    requestId: randomUUID,
    now: Date.now,
    ...overrides,
    log: (entry) => {
      logs.push(entry);
      overrides.log?.(entry);
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const text = logs.map((entry) => JSON.stringify(entry)).join('\n');
    for (const entry of logs) {
      for (const key of Object.keys(entry)) assert.ok(ALLOWED_LOG_KEYS.has(key), `log key ${key}`);
      assert.match(entry.requestId, UUID);
    }
    for (const value of sensitive) {
      assert.ok(!text.includes(value), 'log lines must not contain request or response content');
    }
  });

  return {
    url,
    logs,
    calls,
    verifyCalls,
    async post(path, body, headers = {}) {
      leaves(body, sensitive);
      const merged: Record<string, string | null> = {
        'Content-Type': 'application/json',
        'X-Firebase-AppCheck': APP_CHECK_TOKEN,
        ...headers,
      };
      for (const value of Object.values(merged)) if (value !== null) leaves(value, sensitive);
      const response = await fetch(`${url}${path}`, {
        method: 'POST',
        headers: Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== null)) as Record<
          string,
          string
        >,
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
      const text = await response.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      return { status: response.status, headers: response.headers, text, json };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

export const SEGMENTS = [
  {
    id: 'seg-1',
    startMs: 1000,
    endMs: 5000,
    text: 'I had lunch with Maya at the office and felt happy about it.',
    language: 'en',
    speaker: 'user',
    confidence: 0.95,
  },
  {
    id: 'seg-2',
    startMs: 6000,
    endMs: 9000,
    text: 'We talked about the project deadline.',
    language: 'en',
    speaker: 'other',
    confidence: 0.9,
  },
  {
    id: 'seg-3',
    startMs: 10000,
    endMs: 14000,
    text: 'Then I walked home along the river.',
    language: 'en',
    speaker: 'user',
    confidence: 0.92,
  },
];

export function analyzeBody(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-09-25',
    timezone: 'Australia/Sydney',
    segments: SEGMENTS,
    journalLanguage: 'en',
    ...overrides,
  };
}

export function event(overrides: Record<string, unknown> = {}) {
  return {
    startMs: 1000,
    endMs: 5000,
    kind: 'moment',
    summary: 'You had lunch with Maya at the office.',
    evidenceSegmentIds: ['seg-1'],
    speaker: 'user',
    confidence: 0.9,
    ...overrides,
  };
}

export function question(overrides: Record<string, unknown> = {}) {
  return {
    startMs: 1000,
    endMs: 5000,
    question: 'What would you like to remember about this moment?',
    reason: 'missing_context',
    ...overrides,
  };
}

export function generateBody(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-09-25',
    timezone: 'Australia/Sydney',
    journalLanguage: 'en',
    events: [
      {
        kind: 'moment',
        summary: 'You had lunch with Maya at the office.',
        evidenceSegmentIds: ['seg-1'],
        speaker: 'user',
      },
    ],
    answers: [{ questionId: 'question-1', answerText: 'It was a good chance to catch up.' }],
    ...overrides,
  };
}

export const GENERATED = {
  title: 'Lunch with Maya',
  paragraphs: ['You had lunch with Maya at the office. It was a good chance to catch up.'],
  contextTags: ['work', 'friends'],
};

export { ANALYZE_PATH, GENERATE_PATH };
