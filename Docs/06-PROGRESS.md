# Daytale Progress

This file records current delivery evidence and decisions. It does not repeat requirements or acceptance criteria; those remain in [01-PRD](01-PRD.md), [02-MVP](02-MVP.md), [03-SPEC](03-SPEC.md), [04-USER-STORIES](04-USER-STORIES.md), and [05-TICKETS](05-TICKETS.md).

## Current milestone

Canonical documentation baseline complete. DYT-001 repository foundation checks are green locally, but its iOS and Android development-client gate remains outstanding. DYT-002 implementation is in progress with its physical-device gate pending. DYT-003 implementation is in progress with automated persistence and cleanup checks green; its physical-device gate remains pending. DYT-004A implementation is in progress through the Voice Setup boundary, with its physical accessibility and visual gate pending. DYT-005 voice enrollment, DYT-006 production recording, and DYT-007 local transcription are ready for review with their physical-device gates pending. DYT-008 journal API is ready for review with its Cloud Run deployment and device gate pending.

## Ticket status

Completed: none.
Active: DYT-001, DYT-002, DYT-003, DYT-004.
Blocked: none.
Ready for review: DYT-005, DYT-006, DYT-007, DYT-008.
Verified: none.
Not started: DYT-009 through DYT-012.

## Blockers and prerequisites

There is no repository implementation blocker. DYT-001 and DYT-002 still need Apple and Google developer access plus physical devices for development-build and background-recording verification. DYT-008 deployment needs the Google Cloud/Firebase project, App Check registration, and a paid Gemini key stored only in Secret Manager.

## Latest verified build

Expo SDK 57 repository foundation, DYT-002 recording-spike configuration, DYT-003 secure persistence, and DYT-004A shell/onboarding configuration verified locally on 2026-09-26: clean install, public Expo config, native config introspection, and web export completed; no native signed build was produced. The prototype remains unchanged and is the visual authority for implementation.

## Test evidence

2026-09-26: `npm run check` passed formatting, lint, TypeScript, 14 test suites with 66 tests, documentation links/placeholders, and route smoke checks. `npx expo config --type public`, native config introspection, and `npx expo export --platform web` passed for SQLCipher, SecureStore backup configuration, audio recording, notification/font/Reanimated/SVG dependencies, and the route graph. Watchman emitted a recrawl warning during Jest and Node emitted the expected SQLite experimental warning; neither affected results. Physical iOS 17+ and Android 12+ development-client, background-recording, secure persistence, delete-all-data key-removal, safe-area, large-text, dark-mode, reduced-motion, keyboard, touch-target, and screen-reader checks remain pending.

2026-09-30: DYT-005 `npm run check` passed formatting, lint, TypeScript, 19 test suites with 109 tests, documentation links/placeholders, and route smoke checks. `npx expo export --platform web` and `npx expo config --type public` passed. Speaker model download and sherpa-onnx embedding extraction were exercised only through mocks; device verification is pending.

2026-10-01: DYT-006 `npm run check` passed formatting, lint, TypeScript, 32 test suites with 317 tests, documentation links/placeholders, and route smoke checks. `npx expo export --platform web` passed. Today screens were compared with the prototype through web screenshots; capture, background behavior, interruptions, and recovery were exercised only through a fake recorder, and device verification is pending.

2026-10-01: DYT-007 `npm run check` passed formatting, lint, TypeScript, 40 test suites with 429 tests, documentation links/placeholders, and route smoke checks. `npx expo export --platform web` and iOS and Android `expo export:embed` release bundles of the transcription slice passed. The iOS WAV transcoder was compiled with `swiftc` and decoded 16, 44.1, and 48 kHz inputs to 16 kHz mono PCM16; whisper.cpp itself ran only through a mocked binding, and device verification is pending.

2026-10-01: DYT-008 `npm run check` passed formatting, lint, TypeScript, 40 test suites with 429 tests, documentation links/placeholders, route smoke checks, and the journal API service check (TypeScript plus 107 `node:test` tests). A local server with fake App Check and Gemini was exercised with curl for 200, 400, 401, 413, 429, 502, and 503, and log lines held no content. The Docker image built and answered an unauthenticated request with 401. No deployment, real App Check token, or live Gemini call has run.

## Dated decisions

| Date | Decision | Owner |
| --- | --- | --- |
| 2026-09-30 | Claude native supervised development is the implementation flow, replacing Codex native. | Product/engineering |
| 2026-09-25 | MVP targets iOS 17+ and Android 12+ through TestFlight and Play internal testing. | Product/engineering |
| 2026-09-25 | Journals are device-only; accounts, sync, location, widgets, Control Center, hardware controls, and social features are excluded. | Product |
| 2026-09-25 | English and Nepali speech are supported first, including mixed-language fixtures. | Product |
| 2026-09-25 | Voice Setup is required, uses three samples, and keeps encrypted embeddings on device. | Product/privacy |
| 2026-09-25 | Transcript-derived API calls may leave the phone; raw audio and voice embeddings may not. | Privacy/engineering |
| 2026-09-25 | Cloud Run is the minimal stateless Gemini proxy; credentials live in Secret Manager. | Engineering |
| 2026-09-25 | Failed or offline processing retains encrypted retry material for at most 24 hours, then writes a content-free cleanup receipt. | Privacy/engineering |
| 2026-09-25 | `prototype/index.html` and `prototype/tokens.css` are the sole visual and interaction authority; the historical PNG is non-authoritative. | Design/engineering |
| 2026-09-30 | Speaker identification uses the English CAM++ sherpa-onnx model, downloaded on first use and verified by pinned size and md5 instead of being committed to the repository. | Engineering |
| 2026-09-30 | Ready copy reads "every day" because the MVP schedule has no repeat-day selection. | Design/engineering |
| 2026-10-01 | Closed audio chunks are stored as BLOBs inside the SQLCipher database with `secure_delete` on, instead of separately encrypted files; only the active chunk exists as a plaintext sandbox file. | Privacy/engineering |
| 2026-10-01 | Chunk `deleteAfter` is close time plus 24 hours, and the expiry sweep runs at app launch. | Privacy/engineering |
| 2026-10-01 | Timed privacy breaks auto-resume only while the app is in the foreground; otherwise the session stays paused until the user resumes. | Product/engineering |
| 2026-10-01 | Local transcription pins `whisper.rn` 0.7.4 with the multilingual `ggml-small-q5_1` model and the Silero v5.1.2 VAD model, downloaded on first use and verified by pinned size and md5; the device performance gate may downgrade to a smaller model. | Engineering |
| 2026-10-01 | A local Expo module decodes stored AAC chunks to 16 kHz mono PCM16 WAV for whisper.cpp, instead of adding a general audio library. | Engineering |
| 2026-10-01 | Transcript confidence is a heuristic (VAD coverage, repetition loops, speech rate, out-of-set language) because the binding exposes no token probabilities; low-confidence segments are kept and marked, not rewritten. | Engineering |
| 2026-10-01 | Each transcript segment is tagged `ne` when it contains Devanagari letters and `en` otherwise; whisper is pinned to the one language the user speaks and auto-detects when both are selected. | Product/engineering |
| 2026-10-01 | The journal API lives in `service/journal-api/` as a Node 22 service run directly from TypeScript, with `node:http`, `node:test`, and no web framework; its dependency-free `contract.ts` is shared with the app for response validation. | Engineering |
| 2026-10-01 | Event kinds are `moment`, `activity`, `conversation`, `plan`, and `reflection`; question reasons are `missing_context`, `ambiguous_speaker`, and `unclear_speech`. | Product/engineering |
| 2026-10-01 | Unsupported analyze events are dropped rather than failing the response; unsupported generate output fails the response. Malformed model output is retried once, then answers 502. | Engineering |
| 2026-10-01 | Unsupported people, places, and feelings are detected heuristically (Latin capitalized words and an English feeling lexicon must appear in the evidence); Devanagari names are not detected. | Engineering |
| 2026-10-01 | The mobile journal API client (App Check token, response re-validation, retry until `retryUntil`) is built with DYT-009, which owns processing. | Engineering |
| 2026-10-01 | Light is the default theme; the user toggles light/dark; the system-follow option was removed; the dark palette was re-derived from the light identity with AA contrast. | Design/engineering |
| 2026-10-02 | React Native adopts the prototype `--color-app-*` token names and one `useDaytaleTheme()` design system across every screen, documented in [07-DESIGN-SYSTEM](07-DESIGN-SYSTEM.md); the frozen palette's inherent contrast gaps are asserted as expected test failures rather than changed. | Design/engineering |
