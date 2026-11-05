import {
  ANALYZE_PATH,
  GENERATE_PATH,
  MAX_BODY_BYTES,
  parseAnalyzeRequest,
  parseGenerateRequest,
  parseJson,
  validateAnalyzeOutput,
  validateGenerateOutput,
} from '../../service/journal-api/src/contract';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  GenerateRequest,
  GenerateResponse,
} from '../../service/journal-api/src/contract';

export type JournalApiFailureCode =
  | 'api-unconfigured'
  | 'app-check-unconfigured'
  | 'app-check-rejected'
  | 'invalid-request'
  | 'payload-too-large'
  | 'invalid-response'
  | 'upstream-unavailable'
  | 'rate-limited'
  | 'timeout'
  | 'network'
  | 'aborted';

export type JournalApiFailure = { status: 'failed'; code: JournalApiFailureCode };

export type AnalyzeResult = { status: 'ok'; response: AnalyzeResponse } | JournalApiFailure;

export type GenerateResult = { status: 'ok'; response: GenerateResponse } | JournalApiFailure;

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{ status: number; text(): Promise<string> }>;

export type JournalApiClientOptions = {
  baseUrl: string;
  getToken: () => Promise<string>;
  /** Defaults to the global fetch. */
  fetch?: FetchLike;
  /** Defaults to 60 seconds. */
  timeoutMs?: number;
};

export type JournalApiClient = {
  analyze: (request: AnalyzeRequest) => Promise<AnalyzeResult>;
  generate: (request: GenerateRequest) => Promise<GenerateResult>;
};

type Endpoint<TRequest, TResponse> = {
  path: string;
  parse: (input: unknown) => TRequest | null;
  validate: (output: unknown, request: TRequest) => TResponse | null;
};

const DEFAULT_TIMEOUT_MS = 60_000;

const encoder = new TextEncoder();

const analyzeEndpoint: Endpoint<AnalyzeRequest, AnalyzeResponse> = {
  path: ANALYZE_PATH,
  parse: parseAnalyzeRequest,
  validate: (output, request) => validateAnalyzeOutput(output, request)?.response ?? null,
};

const generateEndpoint: Endpoint<GenerateRequest, GenerateResponse> = {
  path: GENERATE_PATH,
  parse: parseGenerateRequest,
  validate: validateGenerateOutput,
};

const defaultFetch: FetchLike = (url, init) => fetch(url, init);

/**
 * Builds the journal API transport for one base URL. It owns HTTP, timeouts, and failure mapping;
 * retries belong to the pipeline that knows `retryUntil`. It never throws: every failure is a typed
 * result, and neither the App Check token nor any body is logged.
 */
export function createJournalApiClient(options: JournalApiClientOptions): JournalApiClient {
  const doFetch = options.fetch ?? defaultFetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = trimBaseUrl(options.baseUrl);

  const send = async <TRequest, TResponse>(
    endpoint: Endpoint<TRequest, TResponse>,
    request: TRequest,
  ): Promise<{ status: 'ok'; response: TResponse } | JournalApiFailure> => {
    try {
      if (baseUrl === '') return failure('api-unconfigured');

      let token: string;
      try {
        token = await options.getToken();
      } catch {
        return failure('app-check-unconfigured');
      }

      const parsed = endpoint.parse(request);
      if (parsed === null) return failure('invalid-request');

      const body = JSON.stringify(parsed);
      if (utf8ByteLength(body) > MAX_BODY_BYTES) return failure('payload-too-large');

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      try {
        const response = await doFetch(`${baseUrl}${endpoint.path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-firebase-appcheck': token,
          },
          body,
          signal: controller.signal,
        });
        if (response.status !== 200) return failure(failureCodeForStatus(response.status));

        const output = parseJson(await response.text());
        const validated = endpoint.validate(output, parsed);
        if (validated === null) return failure('invalid-response');
        return { status: 'ok', response: validated };
      } catch {
        // Only this client aborts the request, so the timeout flag is the reliable signal.
        return failure(timedOut ? 'timeout' : 'network');
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return failure('network');
    }
  };

  return {
    analyze: (request) => send(analyzeEndpoint, request),
    generate: (request) => send(generateEndpoint, request),
  };
}

function trimBaseUrl(baseUrl: string): string {
  if (typeof baseUrl !== 'string') return '';
  return baseUrl.trim().replace(/\/+$/, '');
}

function utf8ByteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function failure(code: JournalApiFailureCode): JournalApiFailure {
  return { status: 'failed', code };
}

function failureCodeForStatus(status: number): JournalApiFailureCode {
  if (status === 401 || status === 403) return 'app-check-rejected';
  if (status === 408) return 'timeout';
  if (status === 413) return 'payload-too-large';
  if (status === 429) return 'rate-limited';
  if (status >= 500 && status <= 599) return 'upstream-unavailable';
  // 400, 404, 415, and any other 4xx mean the request will not become valid by retrying it.
  if (status >= 400 && status <= 499) return 'invalid-request';
  return 'invalid-response';
}
