# DYT-009 Part 1 - App Check token port and journal API client

Status: Ready for build
Ticket: [DYT-009](../../05-TICKETS.md#dyt-009---processing-clarification-and-journals)
Branch: `feat/dyt-009-journal-client`
Owners: mobile client slice; the processing host, Today screen states, and the processing hook are Part 2.

## Problem

The DYT-009 screens and the processing orchestrator already exist, but nothing performs the two
journal API calls. The orchestrator accepts injected `analyze` and `generate` dependencies, so the
next slice needs two bounded pieces: a token provider that attaches Firebase App Check, and a
transport client that sends a validated request, re-validates the response with the shared contract,
and reports a typed failure instead of throwing.

The client is deliberately pure: it owns HTTP, time, and failure mapping, not retries. Retry timing
belongs to the orchestrator and the processing host, which know `retryUntil`.

## Scope

In scope:

- `src/services/appCheck.ts`: a dev-only App Check token provider that fails closed.
- `src/services/journalApi.ts`: a fetch-based client for `POST /v1/journal/analyze` and
  `POST /v1/journal/generate` with request preflight, response re-validation, timeout, and a typed
  failure result.
- `.env.example`: document the local-dev debug token key.
- `__tests__/services/journalApi.test.ts`: unit tests over a fake fetch, never the network.

Out of scope:

- Production Firebase App Check token acquisition. The provider fails closed outside a dev build, so
  a production build reports `app-check-unconfigured` until that work lands.
- Retry loops, offline queueing, and `retryUntil` handling.
- The processing host, the Today screen state changes, and the dependency-wiring hook. Part 2.
- Any new dependency, any UI, and any change to the journal API service.

## Technical contract

Authoritative API and HTTP behavior: [03-SPEC.md section 7](../../03-SPEC.md#7-journal-api-and-gemini-pipeline).

### `src/services/appCheck.ts`

```ts
export type AppCheckTokenProvider = () => Promise<string>;

export type AppCheckTokenProviderOptions = {
  dev?: boolean;
  token?: string;
};

export function createAppCheckTokenProvider(
  options?: AppCheckTokenProviderOptions,
): AppCheckTokenProvider;
```

- `dev` defaults to `__DEV__`.
- `token` defaults to `process.env.EXPO_PUBLIC_APPCHECK_DEV_TOKEN`, read as a literal member
  expression so Expo inlines it at build time.
- Calling the provider rejects with `new Error('app-check-unconfigured')` when `dev` is false or the
  token is blank after trimming.
- The token is never logged. The file has no imports.

### `src/services/journalApi.ts`

Layering: `src/services` must not import from `src/features`. The client imports the contract,
which is dependency-free by design, and defines its own result types so the orchestrator's
structural types fit without a dependency edge.

```ts
export type JournalApiFailureCode =
  | 'api-unconfigured'
  | 'app-check-unconfigured'
  | 'invalid-request'
  | 'payload-too-large'
  | 'invalid-response'
  | 'upstream-unavailable'
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

export function createJournalApiClient(options: {
  baseUrl: string;
  getToken: () => Promise<string>;
  fetch?: FetchLike;
  timeoutMs?: number;
}): {
  analyze(request: AnalyzeRequest): Promise<AnalyzeResult>;
  generate(request: GenerateRequest): Promise<GenerateResult>;
};
```

- `fetch` defaults to the global `fetch`; `timeoutMs` defaults to `60_000`.
- Paths and the body limit come from the contract: `ANALYZE_PATH`, `GENERATE_PATH`,
  `MAX_BODY_BYTES` (`1_048_576`).
- The base URL is whitespace-trimmed and trailing slashes are removed before the path is appended.
- Request headers are exactly `Content-Type: application/json` and
  `x-firebase-appcheck: <token>`. Neither header nor body is logged.

Request order, each step returning its failure without continuing:

1. Blank or whitespace-only `baseUrl` -> `api-unconfigured`; no token call and no fetch.
2. `await getToken()`; a throw -> `app-check-unconfigured`; no fetch.
3. Run the contract request parser. `null` -> `invalid-request`; no fetch.
4. `JSON.stringify` the parsed request and measure its UTF-8 byte length. Over `MAX_BODY_BYTES` ->
   `payload-too-large`; no fetch.
5. `fetch` the POST with the internal `AbortController` signal.

Response handling:

- `200`: read `response.text()`, `parseJson` it, then re-validate. Analyze uses
  `validateAnalyzeOutput(json, request).response`; generate uses
  `validateGenerateOutput(json, request)`. A `null` result -> `invalid-response`.
- Every other status is mapped from the table below without reading, parsing, or echoing the body.

Status mapping:

| Response status | Failure code |
| --- | --- |
| `401`, `403` | `app-check-unconfigured` |
| `400`, `404`, `415`, and any other `4xx` | `invalid-request` |
| `408` | `timeout` |
| `413` | `payload-too-large` |
| `429` | `upstream-unavailable` |
| `5xx` | `upstream-unavailable` |
| `3xx` | `invalid-response` |
| Any other status | `invalid-response` |

Transport failures:

- The client owns one internal `AbortController` and a `setTimeout(timeoutMs)`; the timer is cleared
  in `finally`.
- When the timer fires, the client aborts. A fetch rejection after that abort -> `timeout`.
- Any other rejection -> `network`.
- `aborted` stays in the failure union for a future caller-supplied signal. This client never
  produces it.
- `analyze` and `generate` never throw and never call `console.*`; an unexpected exception becomes a
  typed failure.

### `.env.example`

Append the local-dev App Check debug token key after `EXPO_PUBLIC_API_BASE_URL=`. The value is public
runtime configuration, not a production secret, and is only read when `__DEV__` is true.

## Acceptance scenarios

1. App Check provider returns the configured token when `dev` is true and the token is non-blank.
2. App Check provider rejects with `app-check-unconfigured` for a blank token, and for any token when
   `dev` is false.
3. Analyze happy path sends one POST to the exact analyze URL, with both exact headers, a body equal
   to the parsed request, and one token call; the validated response is returned.
4. Generate happy path sends one POST to the exact generate URL and returns the validated response.
5. Response re-validation drops an unsupported analyze event while the call still succeeds.
6. A malformed generate output returns `invalid-response`.
7. The status table maps `401, 403, 400, 415, 404, 413, 408, 429, 504, 503, 500` to the documented
   codes and each call fetches once.
8. A network rejection returns `network`; an internal timeout with a never-resolving fetch returns
   `timeout`.
9. A blank base URL returns `api-unconfigured` with no token call and no fetch.
10. A request that fails the contract parser (duplicate segment ids, or no segments) returns
    `invalid-request` with no fetch.
11. A serialized body over `MAX_BODY_BYTES` returns `payload-too-large` with no fetch.
12. A failed call writes nothing through `console.*`.

## Test seams and verification

Seam: `__tests__/services/journalApi.test.ts`, driving the exported provider and client with a fake
`FetchLike` that returns `{ status, text() }`. No network, no timers except the internal-timeout test
with fake timers.

```sh
npx tsc --noEmit
npx jest __tests__/services --runInBand
npx prettier --check "src/services/**/*.ts" "__tests__/services/**/*.ts" ".env.example"
npm run check:docs
```

The full `npm run check` runs after Part 2 wires the client in.

## Evidence

The supervisor records acceptance. Expected evidence for this slice: the four commands above pass,
the new spec scans cleanly, and the diff adds no dependency, no `console` call, and no
`src/services` -> `src/features` import.

## Definition of Done

- The provider and client exist with the signatures above.
- Every acceptance scenario has a test in `__tests__/services/journalApi.test.ts`.
- Typecheck, the service test file, prettier on the changed files, and `check:docs` pass.
- The token, headers, and bodies are never logged.
- `.env.example` documents `EXPO_PUBLIC_APPCHECK_DEV_TOKEN` with public-only wording.

## Blockers and follow-ups

- Production App Check token acquisition is not implemented; the provider fails closed outside dev.
- Part 2 owns the processing host, the Today screen state changes, and the hook that assigns the
  client to the orchestrator's `analyze` and `generate` dependencies.
- `aborted` is reserved for a future caller-supplied signal and is not produced by this client.
