import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import {
  ANALYZE_PATH,
  GENERATE_PATH,
  MAX_BODY_BYTES,
  parseAnalyzeRequest,
  parseGenerateRequest,
  parseJson,
  validateAnalyzeOutput,
  validateGenerateOutput,
} from './contract.ts';
import type { AnalyzeRequest, GenerateRequest } from './contract.ts';

export type ModelRequest =
  { kind: 'analyze'; data: AnalyzeRequest } | { kind: 'generate'; data: GenerateRequest };

// One line per request. Counts only: never bodies, text, prompts, model output, tokens, headers,
// or upstream error messages (those can quote content).
export interface LogEntry {
  requestId: string;
  route: string;
  status: number;
  durationMs: number;
  code: string | null;
  segments?: number;
  events?: number;
  questions?: number;
  paragraphs?: number;
  droppedEvents?: number;
}

// Everything external is injected so tests run the real server against fakes.
export interface Deps {
  verifyAppCheck(token: string): Promise<void>;
  generate(request: ModelRequest): Promise<string>;
  log(entry: LogEntry): void;
  requestId(): string;
  now(): number;
}

const RETRY_AFTER_SECONDS = '30';
const JSON_CONTENT_TYPE = /^application\/json\s*(;|$)/i;
const ROUTES = new Map<string, 'analyze' | 'generate'>([
  [ANALYZE_PATH, 'analyze'],
  [GENERATE_PATH, 'generate'],
]);

class ApiFailure extends Error {
  status: number;
  code: string;
  headers: Record<string, string>;
  constructor(status: number, code: string, headers: Record<string, string> = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

function upstreamFailure(error: unknown): ApiFailure {
  const { status, name } = (error ?? {}) as { status?: unknown; name?: unknown };
  if (status === 429) {
    return new ApiFailure(429, 'upstream_rate_limited', { 'Retry-After': RETRY_AFTER_SECONDS });
  }
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new ApiFailure(504, 'upstream_timeout');
  }
  return new ApiFailure(503, 'upstream_unavailable');
}

// One retry when the model output fails schema or policy validation, then 502. Upstream errors
// are not retried here: the client owns backoff for those.
async function callModel<T>(
  deps: Deps,
  request: ModelRequest,
  validate: (output: unknown) => T | null,
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: unknown;
    try {
      text = await deps.generate(request);
    } catch (error) {
      throw upstreamFailure(error);
    }
    const result = typeof text === 'string' ? validate(parseJson(text)) : null;
    if (result !== null) return result;
  }
  throw new ApiFailure(502, 'model_output_invalid');
}

// Streams the body and stops collecting as soon as it passes the limit (null), so an oversized
// upload never sits in memory. The rest of that upload is discarded as it arrives.
function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        settled = true;
        chunks.length = 0;
        resolve(null);
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
    req.on('close', () => {
      if (settled) return;
      settled = true;
      reject(new ApiFailure(499, 'client_closed'));
    });
  });
}

async function handle(deps: Deps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestId = deps.requestId();
  const startedAt = deps.now();
  const path = (req.url ?? '').split('?')[0] ?? '';
  const kind = ROUTES.get(path);
  let counts: Partial<LogEntry> = {};

  const reply = (
    status: number,
    body: unknown,
    code: string | null,
    headers: Record<string, string> = {},
  ): void => {
    if (!res.destroyed && !res.headersSent) {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Request-Id': requestId,
        ...headers,
      });
      res.end(JSON.stringify(body));
    }
    deps.log({
      requestId,
      route: kind === undefined ? 'unknown' : path,
      status,
      durationMs: deps.now() - startedAt,
      code,
      ...counts,
    });
  };

  try {
    if (kind === undefined) throw new ApiFailure(404, 'not_found');
    if (req.method !== 'POST') throw new ApiFailure(405, 'method_not_allowed', { Allow: 'POST' });

    // App Check gates everything below, including reading the body.
    const token = req.headers['x-firebase-appcheck'];
    if (typeof token !== 'string' || token === '') throw new ApiFailure(401, 'app_check_required');
    try {
      await deps.verifyAppCheck(token);
    } catch {
      throw new ApiFailure(401, 'app_check_invalid');
    }

    if (!JSON_CONTENT_TYPE.test(req.headers['content-type'] ?? '')) {
      throw new ApiFailure(415, 'unsupported_media_type');
    }
    const tooLarge = new ApiFailure(413, 'payload_too_large');
    if (Number(req.headers['content-length']) > MAX_BODY_BYTES) throw tooLarge;
    const body = await readBody(req, MAX_BODY_BYTES);
    if (body === null) throw tooLarge;

    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } catch {
      throw new ApiFailure(400, 'invalid_request');
    }

    if (kind === 'analyze') {
      const request = parseAnalyzeRequest(json);
      if (request === null) throw new ApiFailure(400, 'invalid_request');
      counts = { segments: request.segments.length };
      const { response, droppedEvents } = await callModel(deps, { kind, data: request }, (output) =>
        validateAnalyzeOutput(output, request),
      );
      counts = {
        segments: request.segments.length,
        events: response.events.length,
        questions: response.questions.length,
        droppedEvents,
      };
      reply(200, response, null);
    } else {
      const request = parseGenerateRequest(json);
      if (request === null) throw new ApiFailure(400, 'invalid_request');
      counts = { events: request.events.length };
      const response = await callModel(deps, { kind, data: request }, (output) =>
        validateGenerateOutput(output, request),
      );
      counts = { events: request.events.length, paragraphs: response.paragraphs.length };
      reply(200, response, null);
    }
  } catch (error) {
    const failure = error instanceof ApiFailure ? error : new ApiFailure(500, 'internal');
    reply(
      failure.status,
      { error: { code: failure.code, requestId } },
      failure.code,
      failure.headers,
    );
  }
}

export function createServer(deps: Deps): Server {
  return createHttpServer((req, res) => {
    // handle() answers every request itself; this only guards a throwing injected logger.
    handle(deps, req, res).catch(() => res.destroy());
  });
}
