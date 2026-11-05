import type {
  AnalyzeRequest,
  AnalyzeResponse,
  GenerateRequest,
  GenerateResponse,
} from '../../service/journal-api/src/contract';
import { createAppCheckTokenProvider } from '../../src/services/appCheck';
import {
  createJournalApiClient,
  type FetchLike,
  type JournalApiFailureCode,
} from '../../src/services/journalApi';

const BASE_URL = 'https://journal.example.test';
const TOKEN = 'debug-token';

const SEGMENT = {
  id: 'segment-1',
  startMs: 1_200,
  endMs: 5_200,
  text: 'I walked to the park and read a book.',
  language: 'en',
  speaker: 'user',
  confidence: 0.96,
} as const;

const ANALYZE_REQUEST: AnalyzeRequest = {
  date: '2026-09-25',
  timezone: 'Australia/Sydney',
  segments: [SEGMENT],
  journalLanguage: 'en',
};

const ANALYZE_RESPONSE: AnalyzeResponse = {
  events: [
    {
      startMs: 1_200,
      endMs: 5_200,
      kind: 'moment',
      summary: 'Walked to the park and read a book.',
      evidenceSegmentIds: ['segment-1'],
      speaker: 'user',
      confidence: 0.9,
    },
  ],
  questions: [],
};

const GENERATE_REQUEST: GenerateRequest = {
  date: '2026-09-25',
  timezone: 'Australia/Sydney',
  journalLanguage: 'en',
  events: [
    {
      kind: 'moment',
      summary: 'Walked to the park and read a book.',
      evidenceSegmentIds: ['segment-1'],
      speaker: 'user',
    },
  ],
  answers: [],
};

const GENERATE_RESPONSE: GenerateResponse = {
  title: 'A quiet afternoon',
  paragraphs: ['I walked to the park and read a book.'],
  contextTags: ['reflection'],
};

type FetchCall = { url: string; init: Parameters<FetchLike>[1] };
type FetchResponse = { status: number; text(): Promise<string> };

function recordingFetch(response: FetchResponse) {
  const calls: FetchCall[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return response;
  };
  return { calls, fetchImpl };
}

function okResponse(body: unknown): FetchResponse {
  return { status: 200, text: async () => JSON.stringify(body) };
}

function tokenProvider() {
  return jest.fn(async () => TOKEN);
}

describe('App Check token provider', () => {
  it('returns the configured token in development', async () => {
    const getToken = createAppCheckTokenProvider({ dev: true, token: 'dev-token' });

    await expect(getToken()).resolves.toBe('dev-token');
  });

  it('refuses a blank token', async () => {
    const getToken = createAppCheckTokenProvider({ dev: true, token: '   ' });

    await expect(getToken()).rejects.toThrow('app-check-unconfigured');
  });

  it('refuses every token outside a development build', async () => {
    const getToken = createAppCheckTokenProvider({ dev: false, token: 'dev-token' });

    await expect(getToken()).rejects.toThrow('app-check-unconfigured');
  });
});

describe('journal API client', () => {
  it('posts the parsed analyze request once with both exact headers', async () => {
    const { calls, fetchImpl } = recordingFetch(okResponse(ANALYZE_RESPONSE));
    const getToken = tokenProvider();
    const client = createJournalApiClient({ baseUrl: BASE_URL, getToken, fetch: fetchImpl });

    const result = await client.analyze(ANALYZE_REQUEST);

    expect(result).toEqual({ status: 'ok', response: ANALYZE_RESPONSE });
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${BASE_URL}/v1/journal/analyze`);
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.headers).toEqual({
      'Content-Type': 'application/json',
      'x-firebase-appcheck': TOKEN,
    });
    expect(JSON.parse(calls[0]!.init.body)).toEqual(ANALYZE_REQUEST);
  });

  it('drops an unsupported analyze event during response re-validation', async () => {
    const unsupported = {
      ...ANALYZE_RESPONSE.events[0]!,
      summary: 'Met Priya at the park.',
    };
    const { fetchImpl } = recordingFetch(
      okResponse({ events: [ANALYZE_RESPONSE.events[0]!, unsupported], questions: [] }),
    );
    const client = createJournalApiClient({
      baseUrl: BASE_URL,
      getToken: tokenProvider(),
      fetch: fetchImpl,
    });

    const result = await client.analyze(ANALYZE_REQUEST);

    expect(result).toEqual({ status: 'ok', response: ANALYZE_RESPONSE });
  });

  it('posts the parsed generate request once and returns the validated journal', async () => {
    const { calls, fetchImpl } = recordingFetch(okResponse(GENERATE_RESPONSE));
    const client = createJournalApiClient({
      baseUrl: BASE_URL,
      getToken: tokenProvider(),
      fetch: fetchImpl,
    });

    const result = await client.generate(GENERATE_REQUEST);

    expect(result).toEqual({ status: 'ok', response: GENERATE_RESPONSE });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${BASE_URL}/v1/journal/generate`);
    expect(JSON.parse(calls[0]!.init.body)).toEqual(GENERATE_REQUEST);
  });

  it('rejects a malformed generate output', async () => {
    const malformed = { title: 'A quiet afternoon', paragraphs: [], contextTags: [] };
    const { fetchImpl } = recordingFetch(okResponse(malformed));
    const client = createJournalApiClient({
      baseUrl: BASE_URL,
      getToken: tokenProvider(),
      fetch: fetchImpl,
    });

    const result = await client.generate(GENERATE_REQUEST);

    expect(result).toEqual({ status: 'failed', code: 'invalid-response' });
  });

  const statusCases: [number, JournalApiFailureCode][] = [
    [401, 'app-check-rejected'],
    [403, 'app-check-rejected'],
    [400, 'invalid-request'],
    [415, 'invalid-request'],
    [404, 'invalid-request'],
    [413, 'payload-too-large'],
    [408, 'timeout'],
    [429, 'rate-limited'],
    [504, 'upstream-unavailable'],
    [503, 'upstream-unavailable'],
    [500, 'upstream-unavailable'],
    [302, 'invalid-response'],
  ];

  it.each(statusCases)('maps status %i to %s without reading the body', async (status, code) => {
    const readBody = jest.fn(async () => '{"unexpected":true}');
    const { calls, fetchImpl } = recordingFetch({ status, text: readBody });
    const client = createJournalApiClient({
      baseUrl: BASE_URL,
      getToken: tokenProvider(),
      fetch: fetchImpl,
    });

    const result = await client.analyze(ANALYZE_REQUEST);

    expect(result).toEqual({ status: 'failed', code });
    expect(calls).toHaveLength(1);
    expect(readBody).not.toHaveBeenCalled();
  });

  it('reports a network failure when the fetch rejects', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('offline');
    };
    const client = createJournalApiClient({
      baseUrl: BASE_URL,
      getToken: tokenProvider(),
      fetch: fetchImpl,
    });

    const result = await client.analyze(ANALYZE_REQUEST);

    expect(result).toEqual({ status: 'failed', code: 'network' });
  });

  it('reports a timeout when the internal deadline aborts the request', async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl: FetchLike = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      const client = createJournalApiClient({
        baseUrl: BASE_URL,
        getToken: tokenProvider(),
        fetch: fetchImpl,
        timeoutMs: 1_000,
      });

      const pending = client.analyze(ANALYZE_REQUEST);
      await jest.advanceTimersByTimeAsync(1_000);

      await expect(pending).resolves.toEqual({ status: 'failed', code: 'timeout' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails closed on a blank base URL before the token or fetch', async () => {
    const getToken = tokenProvider();
    const { calls, fetchImpl } = recordingFetch(okResponse(ANALYZE_RESPONSE));
    const client = createJournalApiClient({ baseUrl: '   ', getToken, fetch: fetchImpl });

    const result = await client.analyze(ANALYZE_REQUEST);

    expect(result).toEqual({ status: 'failed', code: 'api-unconfigured' });
    expect(getToken).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('fails closed when the token provider rejects, before the fetch', async () => {
    const { calls, fetchImpl } = recordingFetch(okResponse(ANALYZE_RESPONSE));
    const client = createJournalApiClient({
      baseUrl: BASE_URL,
      getToken: async () => {
        throw new Error('app-check-unconfigured');
      },
      fetch: fetchImpl,
    });

    const result = await client.analyze(ANALYZE_REQUEST);

    expect(result).toEqual({ status: 'failed', code: 'app-check-unconfigured' });
    expect(calls).toHaveLength(0);
  });

  const invalidRequests: [string, AnalyzeRequest][] = [
    ['duplicate segment ids', { ...ANALYZE_REQUEST, segments: [SEGMENT, { ...SEGMENT }] }],
    ['no segments', { ...ANALYZE_REQUEST, segments: [] }],
  ];

  it.each(invalidRequests)(
    'rejects %s as invalid-request without fetching',
    async (_name, request) => {
      const { calls, fetchImpl } = recordingFetch(okResponse(ANALYZE_RESPONSE));
      const client = createJournalApiClient({
        baseUrl: BASE_URL,
        getToken: tokenProvider(),
        fetch: fetchImpl,
      });

      const result = await client.analyze(request);

      expect(result).toEqual({ status: 'failed', code: 'invalid-request' });
      expect(calls).toHaveLength(0);
    },
  );

  it('rejects an oversized body without fetching', async () => {
    const text = 'a'.repeat(4_000);
    const segments = Array.from({ length: 300 }, (_unused, index) => ({
      ...SEGMENT,
      id: `segment-${index}`,
      text,
    }));
    const { calls, fetchImpl } = recordingFetch(okResponse(ANALYZE_RESPONSE));
    const client = createJournalApiClient({
      baseUrl: BASE_URL,
      getToken: tokenProvider(),
      fetch: fetchImpl,
    });

    const result = await client.analyze({ ...ANALYZE_REQUEST, segments });

    expect(result).toEqual({ status: 'failed', code: 'payload-too-large' });
    expect(calls).toHaveLength(0);
  });

  it('writes nothing through console on a failure', async () => {
    const spies = [
      jest.spyOn(console, 'log'),
      jest.spyOn(console, 'info'),
      jest.spyOn(console, 'warn'),
      jest.spyOn(console, 'error'),
      jest.spyOn(console, 'debug'),
    ];
    const { fetchImpl } = recordingFetch({ status: 503, text: async () => '' });
    const client = createJournalApiClient({
      baseUrl: BASE_URL,
      getToken: tokenProvider(),
      fetch: fetchImpl,
    });

    const result = await client.analyze(ANALYZE_REQUEST);

    expect(result).toEqual({ status: 'failed', code: 'upstream-unavailable' });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('sends the token returned by the provider', async () => {
    const { calls, fetchImpl } = recordingFetch(okResponse(ANALYZE_RESPONSE));
    const client = createJournalApiClient({
      baseUrl: `${BASE_URL}/`,
      getToken: async () => 'fresh-token',
      fetch: fetchImpl,
    });

    await client.analyze(ANALYZE_REQUEST);

    expect(calls[0]!.url).toBe(`${BASE_URL}/v1/journal/analyze`);
    expect(calls[0]!.init.headers['x-firebase-appcheck']).toBe('fresh-token');
  });

  it('requests a fresh token for every call', async () => {
    const { fetchImpl } = recordingFetch(okResponse(ANALYZE_RESPONSE));
    const getToken = tokenProvider();
    const client = createJournalApiClient({ baseUrl: BASE_URL, getToken, fetch: fetchImpl });

    await client.analyze(ANALYZE_REQUEST);
    await client.analyze(ANALYZE_REQUEST);

    expect(getToken).toHaveBeenCalledTimes(2);
  });
});
