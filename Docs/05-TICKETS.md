# Daytale Implementation Tickets

Status values are `Not Started`, `In Progress`, `Blocked`, `Ready for Review`, and `Verified`. Ticket status is updated only with evidence in [06-PROGRESS](06-PROGRESS.md). The order below is dependency order and is intentionally risk-first.

| ID | Ticket | Status | Depends on |
| --- | --- | --- | --- |
| DYT-001 | Repository foundation | In Progress | None |
| DYT-002 | Physical background-recording spike | In Progress | DYT-001 |
| DYT-003 | Secure persistence and session state | In Progress | DYT-001 |
| DYT-004 | Prototype-faithful shell and onboarding | In Progress | DYT-001, DYT-003 |
| DYT-005 | Voice enrollment and speaker identification | Ready for Review | DYT-002, DYT-003 |
| DYT-006 | Production recording and recovery | Ready for Review | DYT-002, DYT-003, DYT-005 |
| DYT-007 | Local transcription | Ready for Review | DYT-005, DYT-006 |
| DYT-008 | Cloud Run and Gemini journal API | Ready for Review | DYT-001 |
| DYT-009 | Processing, clarification, and journals | Not Started | DYT-003, DYT-007, DYT-008 |
| DYT-010 | Native recording controls | Not Started | DYT-006 |
| DYT-011 | Accessibility, privacy, and visual quality | Not Started | DYT-004, DYT-009, DYT-010 |
| DYT-012 | Acceptance matrix and release sign-off | Not Started | DYT-011 |

## DYT-001 - Repository foundation

Status: `In Progress`
Dependencies: None

Outcome: Create the Expo TypeScript development-build project, Expo Router shell, Zustand foundation, feature folders, CI, linting, type checks, unit/component test harness, and documentation/link checks.

In scope: supported Node/package versions, iOS and Android development builds, environment template without secrets, test commands, and a minimal bootable app.

Exclusions: product screens, recording, cloud calls, authentication, analytics, and native controls.

Definition of Done:

- A clean checkout installs and builds development clients for both platforms.
- CI runs formatting/lint, type check, unit/component tests, and documentation checks.
- Secrets are absent from source and the app starts on the three-tab shell placeholder.

Automated verification: clean-install CI, type/lint/test pass, route smoke test, internal-link and placeholder scan.
Physical-device verification: install and launch on iOS 17+ and Android 12+ development builds.

Evidence to date (2026-09-25): `npm ci`, `npm run check`, `npx expo config --type public`, and `npx expo export --platform web` pass. The repository now contains the Expo Router shell, Zustand session foundation, CI workflow, route smoke check, documentation check, unit/component tests, supported Node/npm pins, a secret-free environment template, and repository hygiene rules for generated output and local secrets. Physical iOS and Android development-client verification remains outstanding.

## DYT-002 - Physical background-recording spike

Status: `In Progress`
Dependencies: DYT-001

Outcome: Prove `expo-audio` can record a compressed mono stream in background with Android microphone foreground service and a recoverable iOS path.

In scope: permission prompts, screen lock, backgrounding, pause/resume/stop, route changes, eight-hour sampling plan, and measured storage/battery behavior.

Exclusions: transcription, speaker ID, journals, cloud API, and polished UI.

Definition of Done: a short spike app and physical-device evidence document the supported configuration, missing capabilities, chunk format, and any narrowly scoped native gap.

Automated verification: adapter tests for command idempotency and permission state.
Physical-device verification: iOS 17+ and Android 12+ background, screen lock, call, Bluetooth, route loss, low storage, and app termination checks.

Implementation evidence (2026-09-25): `expo-audio` is configured with explicit background recording and Android microphone foreground-service options. The development-only spike route provides permission, prepare, start, pause, resume, stop, native-finished status, and idempotent discard controls for a 30-second mono AAC/M4A voice target. Adapter tests cover denied permission, command idempotency, native-finished state, cleanup, and protection against losing an undiscarded output. `npm ci`, `npm run check`, Expo config resolution, and config introspection pass. Physical-device verification remains outstanding.

## DYT-003 - Secure persistence and session state

Status: `In Progress`
Dependencies: DYT-001

Outcome: Implement SQLCipher through `expo-sqlite`, SecureStore key management, persisted types, state reducer, cleanup worker, and recovery records.

In scope: all types in [03-SPEC](03-SPEC.md#5-local-data-model), migrations, encrypted paths, deadlines, receipts, and transaction boundaries.

Exclusions: UI polish, model inference, network API, and native system surfaces.

Definition of Done: records survive process recreation, invalid transitions are rejected, keys are protected, expiry cleanup is idempotent, and no content is written to diagnostics.

Automated verification: reducer, schema, migration, deadline, deletion, and cleanup receipt tests.
Physical-device verification: lock/unlock, restart, low storage, and delete-all-data key removal.

Implementation evidence (2026-09-26): SQLCipher-backed SQLite initialization, SecureStore key management, schema migrations, persisted repositories, reducer-driven idempotent session operations, bounded retry expiry, content-free cleanup receipts, delete-all-data handling, and startup hydration are implemented. `npm run check` passes with 11 suites and 55 tests; physical lock/unlock, restart, low-storage, and delete-all-data key-removal verification remains outstanding.

## DYT-004 - Prototype-faithful shell and onboarding

Status: `In Progress`
Dependencies: DYT-001, DYT-003

Outcome: Implement the three-tab shell, all onboarding screens except voice capture, theme/token mapping, reduced motion, accessible controls, and prototype-faithful empty/loading/error states.

In scope: all non-recording screen IDs in [03-SPEC](03-SPEC.md#1-product-shell-and-screen-contract), optional name, schedule/language forms, permission explanation, navigation restoration, and settings forms.

Exclusions: actual audio capture, voice embeddings, Gemini, native Live Activity/notification actions.

Definition of Done: interactive prototype comparison passes for implemented screens and user choices persist through restart.

Automated verification: component interaction, validation, permission denial, keyboard, accessibility, reduced-motion, and route restoration tests.
Physical-device verification: safe areas, large text, dark mode, reduced motion, keyboard, touch targets, and screen-reader smoke tests.

Implementation evidence (2026-09-26): DYT-004A implements the three-tab route shell, prototype token and font mapping, semantic light/dark themes, reduced-motion mascot states, accessible empty/loading/error surfaces, optional name, language and schedule forms, persisted onboarding-stage restoration, native notification and microphone permission boundaries with denial recovery, and explicit delete-all confirmation. The flow stops at the Voice Setup state for DYT-005 to implement. `npm run check` passes formatting, lint, TypeScript, 14 test suites with 66 tests, documentation checks, and route smoke checks; public Expo config, native config introspection, web export, and diff checks pass. Physical safe-area, large-text, dark-mode, reduced-motion, keyboard, touch-target, and screen-reader verification remains outstanding.

## DYT-005 - Voice enrollment and speaker identification

Status: `Ready for Review`
Dependencies: DYT-002, DYT-003

Outcome: Capture three guided samples, encrypt the local embedding, provide re-record/delete, and classify user/other/unknown with conservative thresholds using sherpa-onnx.

In scope: Voice Setup state, profile lifecycle, model versioning, fixture calibration, and unknown fallback.

Exclusions: cloud speaker processing, voice cloning, remote profile backup, and attribution of unsupported emotions.

Definition of Done: profile is encrypted and local, three samples are required, uncertainty yields unknown, and profile deletion is verified.

Automated verification: sample flow, encryption boundary, threshold, multi-speaker, silence, and delete tests.
Physical-device verification: microphone routes, background interruption, re-enrollment, and memory/storage behavior.

Implementation evidence (2026-09-30): Voice Setup requires three guided samples with per-sample delete and retry and no skip, averages the sherpa-onnx CAM++ embeddings, and stores only an opaque encrypted envelope in the SQLCipher `voice_profiles` table once all three samples succeed; sample audio files are discarded after analysis. Speaker classification returns `unknown` below the calibrated user threshold, for ambiguous multi-speaker matches, for silence, and for profiles from another model version. The English CAM++ model (`3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx`, 29,596,978 bytes, sha256 `357a834f702b80161e5b981182c038e18553c1f2ca752ed6cec2052365d4129b`) is downloaded on first use into the app document directory and verified by size and md5 before use. Onboarding continues from Voice Setup to Ready, and onboarding completes only when Ready is left. Settings shows voice profile status with Re-record voice and Delete voice profile with confirmation; deletion runs in an exclusive transaction and the next enrollment requires three new samples. Schema v5 adds the `ready` onboarding stage through a table rebuild. `npm run check` passes formatting, lint, TypeScript, 19 test suites with 109 tests, documentation checks, and route smoke checks; web export and public Expo config pass. Physical-device verification of model download, M4A embedding extraction, microphone routes, interruption, re-enrollment, and memory/storage behavior remains outstanding.

## DYT-006 - Production recording and recovery

Status: `Ready for Review`
Dependencies: DYT-002, DYT-003, DYT-005

Outcome: Build the production recording lifecycle with encrypted chunk rotation, pause/resume/stop, automatic scheduled end, interruption handling, and crash recovery.

In scope: session reducer integration, protected sandbox, active-chunk recovery, offline retention deadline, Today status, and processing handoff.

Exclusions: local transcription implementation, Gemini, Live Activity, Android action wiring.

Definition of Done: duplicate end/stop is safe, closed chunks are durable before rotation, scheduled end begins processing, and failure retains only retry material for at most 24 hours.

Automated verification: lifecycle, timing, chunk integrity, interruption, storage, retry, and expiry tests.
Physical-device verification: eight-hour session, lock/background, calls, Bluetooth, route loss, low storage, termination, and recovery.

Implementation evidence (2026-10-01): `src/features/recording/` promotes the spike into a serial recording engine with 30-second chunk rotation. Each closed chunk is hashed, stored in the SQLCipher database, and its plaintext capture file deleted before the next chunk opens. Start, pause, resume, stop, and scheduled end are idempotent through reducer operation ids. Interruptions (permission loss, route loss, low storage, termination) pause the session with a failure code, crash recovery restores only the active chunk, and failed sessions keep retry material until `retryUntil` (at most 24 hours) before the launch-time expiry sweep deletes it and writes a content-free receipt. The Today tab renders the prototype `today-idle`, `morning-prompt`, `recording`, `privacy-sheet`, `paused`, `error`, and `processing` screens, blocks start on microphone permission and a ready voice profile, and was compared against the prototype through web screenshots. `npm run check` passes 32 test suites with 317 tests; web export passes. Known limits: timed privacy breaks auto-resume only while the app is in the foreground, the chosen break label is not persisted across restarts, and the expiry sweep runs at launch. Physical-device verification remains outstanding.

## DYT-007 - Local transcription

Status: `Ready for Review`
Dependencies: DYT-005, DYT-006

Outcome: Select and pin a whisper.cpp React Native binding and transcribe English, Nepali, and mixed-language chunks locally with timestamps and confidence.

In scope: model packaging decision, language tags, segment persistence, audio deletion after durable transcript, and test fixtures.

Exclusions: remote transcription, journal generation, and UI redesign.

Definition of Done: supported fixtures produce usable segments, raw audio never enters API payloads, and low-confidence output remains explicit.

Automated verification: language, mixed-language, timestamps, silence, malformed audio, confidence, and deletion tests.
Physical-device verification: representative iOS and Android performance, storage, thermal, and battery checks.

Implementation evidence (2026-10-01): `src/features/transcription/` pins `whisper.rn` 0.7.4 (whisper.cpp) with the multilingual `ggml-small-q5_1` model and the Silero VAD model, both downloaded on first use and verified by pinned size and md5. A local Expo module, `modules/audio-decoder/`, decodes each stored AAC chunk to a 16 kHz mono PCM16 WAV in a cache scratch directory that is emptied at the start of every run, and both temporary files are deleted after each chunk. Silent chunks skip transcription. Each segment gets chunk-relative millisecond timestamps, a per-segment `en` or `ne` tag from its script, speaker attribution scored against the ready voice profile (`unknown` for windows under one second or when no profile is ready), and a heuristic transcript confidence. Low-confidence segments are kept with their score, never rewritten. The transcript segments are inserted and the chunk audio is set to NULL in one exclusive transaction, so re-running is idempotent. Undecodable or hash-mismatched chunks are discarded without a transcript, other failures leave the chunk closed for retry, and one content-free success receipt is written once no closed chunk remains. Results carry only counts and codes, never text, audio, or paths. `npm run check` passes 40 test suites with 429 tests. Web export and iOS and Android release bundles of the slice pass. The iOS transcoder was compiled and run against real AVFoundation on macOS; the Android decoder and both module builds are unverified until a development-client build. Known limits: confidence is a heuristic because the binding exposes no token probabilities, whisper timestamp units are confirmed from source only, and nothing invokes transcription until the DYT-009 orchestrator. Physical-device verification remains outstanding.

## DYT-008 - Cloud Run and Gemini journal API

Status: `Ready for Review`
Dependencies: DYT-001

Outcome: Deploy stateless `/v1/journal/analyze` and `/v1/journal/generate` with App Check, Secret Manager, structured validation, size limits, Gemini configuration, retry responses, and redacted logging.

In scope: schemas and policy validation in [03-SPEC](03-SPEC.md#7-journal-api-and-gemini-pipeline), prompt-injection handling, unsupported-fact rejection, and service test environment.

Exclusions: raw audio, persistence, user accounts, journal storage, and client UI.

Definition of Done: API key exists only in Secret Manager, request/response bodies are never logged or persisted, and contracts are versioned and tested.

Automated verification: valid/malformed output, App Check, payload limit, prompt injection, unsupported facts, maximum questions, retry, and log-redaction tests.
Physical-device verification: authenticated mobile requests over Wi-Fi and cellular with offline recovery.

Implementation evidence (2026-10-01): `service/journal-api/` is a stateless Node 22 service with no build step and two runtime dependencies (`@google/genai`, `firebase-admin`). It serves both versioned endpoints behind Firebase App Check, verified before the body is read. Requests are strictly parsed (unknown keys, bad dates or time zones, duplicate segment ids, and limits answer 400; bodies over 1 MiB answer 413 while streaming). Gemini `gemini-3.8-flash` is called with a JSON response schema, medium thinking, no tools, and no cached content, with transcript data sent only inside a delimited untrusted-data block. Model output is validated again: malformed output is retried once and then answers 502; events without known evidence, `user` events without user evidence, events outside their evidence span, and events naming people, places, or feelings missing from their evidence are dropped; questions are capped at two. Upstream rate limits answer 429 with `Retry-After`, timeouts 504, and other failures 503. Every response carries a server `X-Request-Id`, and each log line holds only the request id, route, status, duration, error code, and counts. `src/contract.ts` has no imports so the app can reuse it for its own validation. `npm run check` now includes `check:service` (TypeScript plus 107 `node:test` tests over real HTTP, with a log-redaction assertion after every test). A local run with fake App Check and Gemini returned 200, 400, 401, 413, 429, 502, and 503 as specified, and the Docker image built and rejected an unauthenticated request with 401. Known limits: the grounding check covers Latin capitalized names and an English feeling lexicon only and does not check the first word of a sentence. Cloud Run deployment, Secret Manager, real App Check, a live Gemini call, and physical-device verification remain outstanding.

## DYT-009 - Processing, clarification, and journals

Status: `Not Started`
Dependencies: DYT-003, DYT-007, DYT-008

Outcome: Connect local transcription to analysis, time-based clarification, generation, local journal CRUD, native share, and lifecycle deletion.

In scope: Processing, Clarification, Journal Ready, Journal list/detail/edit, empty/error/offline states, answer/skip, idempotent retry, and cleanup receipts.

Exclusions: social sharing, cloud journal storage, location, and new visual language.

Definition of Done: a full daily loop works offline where possible, generated content is grounded and editable, and deletion evidence passes.

Automated verification: orchestration, question count, answer/skip, CRUD, share payload, generation validation, retry, and deletion tests.
Physical-device verification: end-to-end daily loop on both platforms, including offline queue and network recovery.

## DYT-010 - Native recording controls

Status: `Not Started`
Dependencies: DYT-006

Outcome: Add iOS Lock Screen and Dynamic Island Live Activity plus Android foreground notification actions for Pause, Resume, and Stop.

In scope: action routing, stale-action handling, privacy-safe labels, lifecycle cleanup, and system-surface accessibility.

Exclusions: widgets, Control Center controls, hardware buttons, and new notification analytics.

Definition of Done: all actions are idempotent, reflect the persisted state, and never include transcript or journal content.

Automated verification: action reducer, stale action, lifecycle, permission, and redaction tests.
Physical-device verification: lock screen, Dynamic Island, Android notification shade, background, and termination scenarios.

## DYT-011 - Accessibility, privacy, and visual quality

Status: `Not Started`
Dependencies: DYT-004, DYT-009, DYT-010

Outcome: Complete accessibility audit, crash-only diagnostics review, privacy/deletion review, and pixel-level comparison against the prototype.

In scope: every screen and transition, light/dark themes, large text, reduced motion, keyboard, safe areas, touch targets, privacy strings, and diagnostic redaction.

Exclusions: feature expansion and analytics instrumentation.

Definition of Done: all high-severity issues are closed, visual comparison evidence is attached, and privacy review confirms the MVP promise.

Automated verification: accessibility tree assertions, snapshot/visual comparison, lint, type, unit, component, API, E2E, and documentation checks.
Physical-device verification: both platform accessibility and visual matrix from [03-SPEC](03-SPEC.md#10-test-and-verification-specification).

## DYT-012 - Acceptance matrix and release sign-off

Status: `Not Started`
Dependencies: DYT-011

Outcome: Execute the full acceptance matrix, produce signed TestFlight and Play internal builds, record evidence, and complete release sign-off.

In scope: all stories, physical-device matrix, deletion proof, offline/recovery proof, build signing, install/upgrade smoke tests, and release notes.

Exclusions: post-beta roadmap work and unapproved scope changes.

Definition of Done: every included story is verified, every release gate in [02-MVP](02-MVP.md#release-gates) is evidenced, and [06-PROGRESS](06-PROGRESS.md) records the final build and exceptions.

Automated verification: full CI and acceptance suite on release candidates.
Physical-device verification: TestFlight and Play internal installs, upgrades, daily loop, deletion, and rollback/recovery checks.
