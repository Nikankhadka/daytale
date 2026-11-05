# DYT-009 Part 1 - App Check token port and journal API client

Status: Accepted - device gate pending
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
- Paths and the body limit come from the contract: `ANALYZE_PATH`, `GENERATE_PATH`, `MAX_BODY_BYTES` (`1_048_576`).
- The base URL is whitespace-trimmed and trailing slashes are removed before the path is appended.
- Request headers are exactly `Content-Type: application/json` and `x-firebase-appcheck: <token>`.
  Neither header nor body is logged.

Request order, each step returning its failure without continuing:

1. Blank or whitespace-only `baseUrl` -> `api-unconfigured`; no token call and no fetch.
2. `await getToken()`; a throw -> `app-check-unconfigured`; no fetch.
3. Run the contract request parser. `null` -> `invalid-request`; no fetch.
4. `JSON.stringify` the parsed request and measure its UTF-8 byte length. Over `MAX_BODY_BYTES` -> `payload-too-large`; no fetch.
5. `fetch` the POST with the internal `AbortController` signal.

Response handling:

- `200`: read `response.text()`, `parseJson` it, then re-validate. Analyze uses `validateAnalyzeOutput(json, request).response`; generate uses `validateGenerateOutput(json, request)`. A `null` result -> `invalid-response`.
- Every other status is mapped from the table below without reading, parsing, or echoing the body.

Status mapping:

| Response status | Failure code |
| --- | --- |
| `401`, `403` | `app-check-rejected` |
| `400`, `404`, `415`, and any other `4xx` | `invalid-request` |
| `408` | `timeout` |
| `413` | `payload-too-large` |
| `429` | `rate-limited` |
| `5xx` | `upstream-unavailable` |
| `3xx` | `invalid-response` |
| Any other status | `invalid-response` |

`app-check-unconfigured` is reserved for a missing or blank token provider, never for a status. A `401` or `403` means a token was sent and refused, so it is non-retryable; a `429` means the upstream asked us to slow down, so it stays retryable.

Transport failures:

- The client owns one internal `AbortController` and a `setTimeout(timeoutMs)`; the timer is cleared in `finally`.
- When the timer fires, the client aborts. A fetch rejection after that abort -> `timeout`.
- Any other rejection -> `network`.
- `aborted` stays in the failure union for a future caller-supplied signal. This client never produces it.
- `analyze` and `generate` never throw and never call `console.*`; an unexpected exception becomes a typed failure.

### `.env.example`

Append the local-dev App Check debug token key after `EXPO_PUBLIC_API_BASE_URL=`. The value is public runtime configuration, not a production secret, and is only read when `__DEV__` is true.

## Acceptance scenarios

1. App Check provider returns the configured token when `dev` is true and the token is non-blank.
2. App Check provider rejects with `app-check-unconfigured` for a blank token, and for any token when
   `dev` is false.
3. Analyze happy path sends one POST to the exact analyze URL, with both exact headers, a body equal
   to the parsed request, and one token call; the validated response is returned.
4. Generate happy path sends one POST to the exact generate URL and returns the validated response.
5. Response re-validation drops an unsupported analyze event while the call still succeeds.
6. A malformed generate output returns `invalid-response`.
7. The status table maps `401, 403, 400, 415, 404, 413, 408, 429, 504, 503, 500, 302` to the documented
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

Part 2 wired the client in and ran the full gate; the counts are in Evidence below.

## Evidence

Independent review passed with risks. The final commit carries the review fixes: a 300 ms
clarification cooldown for a rapid double-tap, a single-flight reconcile with a 10-minute stale
bound for overlapping or hung passes, the two missing failure codes in this spec, and the added
coverage below.

Final `npm run check`:

- format: all matched files pass Prettier.
- lint: clean.
- typecheck: `tsc --noEmit` clean.
- tests: 51 suites, 555 tests passed.
- docs: 9 Markdown files scanned, passed.
- routes: 15 route files, passed.
- service: 107 tests, 0 failed.

Targeted: `npx jest __tests__/services __tests__/processing __tests__/features/today-screen.test.tsx --runInBand`
-> 7 suites, 132 tests passed.

## Definition of Done

- The provider and client exist with the signatures above.
- Every acceptance scenario has a test in `__tests__/services/journalApi.test.ts`.
- Typecheck, the service test file, prettier on the changed files, and `check:docs` pass.
- The token, headers, and bodies are never logged.
- `.env.example` documents `EXPO_PUBLIC_APPCHECK_DEV_TOKEN` with public-only wording.

## Blockers and follow-ups

- Device gate: the full loop (recording -> clarification -> generation -> journal) is unverified on
  iOS and Android with real App Check and Gemini.
- Production App Check/RNFB token acquisition (or a supported Firebase bridge) is not implemented;
  the provider fails closed outside dev.
- Non-retryable error-specific UI and next-retry-window copy for failures such as 413,
  `app-check-rejected`, and `payload-too-large` is not built; the failed view shows the generic
  retry/discard surface and the retry deadline.
- `aborted` is reserved for a future caller-supplied signal and is not produced by this client.

## Part 2 - Processing host and Today wiring

Status: Built and reviewed - device gate pending. Depends on Part 1 (the client and token port).

Scope: drive analysis, clarification, and generation for every ready persisted session; own retry
timing bounded by `retryUntil`; resume work on launch, every minute, and on foreground; and submit
Today's clarification answers once. Lifecycle rules stay owned by
[03-SPEC.md section 6](../../03-SPEC.md#6-recording-transcription-and-speaker-lifecycle) and offline
behavior by [03-SPEC.md section 9](../../03-SPEC.md#9-offline-and-failure-recovery). Out of scope:
schema changes, new dependencies, NetInfo/RNFB, request splitting, server changes, and production App
Check. The persisted session is the offline queue; no second queue is added.

### Technical contract

`src/features/processing/host.ts`

```ts
export const RETRY_BASE_MS = 30_000;
export const RETRY_CAP_MS = 900_000;
export const RECONCILE_STALE_MS = 600_000;
export function retryDelayMs(attempt: number): number; // min(30s * 2^attempt, 15m)

export type ProcessingHostDependencies = {
  getStorage: () => StorageBootstrapResult | undefined;
  getClient: () => JournalApiClient;
  transcribe?: TranscribeDependency;
  now?: () => Date;
  uuid?: () => string;
  publish?: (session: RecordingSession) => void; // defaults to setRecordingSession
};
export type ProcessingHost = {
  kick: (sessionId: string) => Promise<void>;
  reconcile: (now: Date) => Promise<void>;
  attach: () => () => void;
};
export function createProcessingHost(dependencies: ProcessingHostDependencies): ProcessingHost;
```

- `kick` returns without storage. An in-flight `Set<string>`, checked before any await and cleared in
  `finally`, is the re-entrancy guard because `publish` can refire `attach` synchronously.
- `transcribing`/`analyzing` run `processSession`, publish a non-`noop` result, then run
  `processGeneration` when the resulting status is `generating` and publish that result. `generating`
  runs `processGeneration` directly. `failed` only records retry state; other statuses are no-ops.
- One `Map<sessionId, { attempts, nextAt }>` tracks retries. Retryable codes are `network`, `timeout`,
  `rate-limited`, and `upstream-unavailable`; the target must be `transcribing`, `analyzing`, or
  `generating`, and `retryUntil` must be in the future. The first failure sets `attempts = 1` and
  `nextAt = now + retryDelayMs(0)` (30 s); later failures use 60 s, 120 s, ... up to 15 minutes.
  Success, awaiting-clarification, generating, and non-retryable failures clear the entry.
- `reconcile(now)` lists sessions. Processing statuses `await kick`. A retryable `failed` session with
  `retryUntil > now` retries immediately when the map has no entry (a fresh process), otherwise once
  `now >= nextAt`. It calls `retrySession(storage, id, uuid(), { now: () => now, uuid })`, then `kick`
  on `retried`, and clears the entry on `expired` or `rejected`. It never retries at or after
  `retryUntil`; expiry cleanup owns that session.
- `reconcile` is single-flight: a concurrent tick is dropped, not queued. A pass older than
  `RECONCILE_STALE_MS` (10 minutes) may be overlapped, so a hung native call cannot disable retries
  until the app restarts.
- `attach()` subscribes to the store, compares the previous `id` and `status`, and kicks only when the
  session becomes `transcribing`, `analyzing`, or `generating`. It kicks an already processing current
  session once on attach and returns the unsubscribe.
- `kick` and `reconcile` swallow unexpected errors for the next reconcile. Neither logs content,
  tokens, or bodies.

`src/features/processing/useProcessingHost.ts`

- `processingHost` is built once with `getBootstrappedStorage` and a client built from
  `EXPO_PUBLIC_API_BASE_URL` plus `createAppCheckTokenProvider()`.
- `PROCESSING_RECONCILE_INTERVAL_MS = 60_000`. `useProcessingReconciliation(host = processingHost)`
  no-ops until onboarding is complete. Then it reconciles on mount, every interval, and on `AppState`
  `active`, attaches the store subscription, and detaches with the interval and listener on cleanup.
- `src/features/processing/index.ts` also exports `createProcessingHost`, the host types,
  `retryDelayMs`, `processingHost`, `useProcessingReconciliation`, and
  `PROCESSING_RECONCILE_INTERVAL_MS`.

`app/(tabs)/_layout.tsx` calls `useProcessingReconciliation()` beside `useRecordingReconciliation()`.

`src/features/today/index.tsx`

- `listOpenClarifications` still loads open questions. A `ClarificationAnswerInput[]` ref accumulates
  answers; answering drops any earlier entry with the same id and appends the new one.
- A synchronous 300 ms cooldown (`canAnswer`/`answerUnlock` refs, timer cleared on unmount) drops a
  rapid second tap so it cannot answer the next question with the previous tap's label.
- Every answer but the last only advances `clarIndex`. The last answer calls
  `submitClarification({ storage }, session.id, batch)` once. `submitted` clears the ref, resets
  `clarIndex`, and publishes `result.session`, which the tabs hook picks up. `rejected` shows the
  existing problem line and keeps the batch, so a repeated tap replaces the entry instead of
  duplicating it. The host is never imported into Today.
- `answerClarification` and `advanceSession` are deleted from
  `src/features/today/clarification.ts`; only `listOpenClarifications` remains.

### Acceptance scenarios

1. Stop -> transcribing -> analyzing -> awaiting clarification, with two concurrent kicks running one transcribe and one analyze.
2. Analysis with no questions -> generating -> ready journal, saved with source transcripts and events cleaned up atomically.
3. Answered and skipped clarification answers submit once and produce a generating session.
4. A non-retryable failure (`invalid-response`, `app-check-rejected`, `api-unconfigured`, `payload-too-large`) stays for the user and never auto-retries.
5. A transient failure retries after 30 s, then 60 s, then 120 s, capped at 15 minutes and bounded by `retryUntil`.
6. A failed session at or after `retryUntil` is never retried; expiry cleanup owns it.
7. A duplicate kick, or a fresh host after restart, does not duplicate work; an empty retry map retries a retryable failed session on the first reconcile.
8. A token or config failure is a non-retryable failed session, not a crash or a silent retry.
9. A rejected response leaves no journal, transcript, or event changes behind.
10. An oversized request reports `payload-too-large`; nothing is split or resent.
11. Offline retention keeps retry material until `retryUntil`; expiry cleanup, not the host, removes it.
12. `attach` kicks on a store change to a processing status and ignores unrelated preference updates.
13. Onboarding incomplete disables the hook; unmount removes the interval, listener, and subscription.

### Test seams and verification

- `__tests__/processing/host.test.ts` drives the host through `createProcessingFixture` with jest-spy clients and publishes.
- `__tests__/processing/useProcessingHost.test.tsx` uses a fake host for mount, interval, foreground, unmount, and onboarding gating.
- `__tests__/features/today-screen.test.tsx` mocks `../../src/features/processing` and asserts one submit, the store publish, and the rejected problem line.

```sh
npx jest __tests__/services __tests__/processing __tests__/features/today-screen.test.tsx --runInBand
npm run check
```

### Definition of Done

- The host, hook, exports, tabs mount, and Today batch submit exist as specified.
- Every acceptance scenario has a test at the seams above.
- `npm run check` passes with no dependency, schema, or server change.
- No `answerClarification` or `advanceSession` reference remains.
