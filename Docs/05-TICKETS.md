# Daytale Implementation Tickets

Status values are `Not Started`, `In Progress`, `Blocked`, `Ready for Review`, and `Verified`. Ticket status is updated only with evidence in [06-PROGRESS](06-PROGRESS.md). The order below is dependency order and is intentionally risk-first.

| ID | Ticket | Status | Depends on |
| --- | --- | --- | --- |
| DYT-001 | Repository foundation | In Progress | None |
| DYT-002 | Physical background-recording spike | In Progress | DYT-001 |
| DYT-003 | Secure persistence and session state | In Progress | DYT-001 |
| DYT-004 | Prototype-faithful shell and onboarding | In Progress | DYT-001, DYT-003 |
| DYT-005 | Voice enrollment and speaker identification | Not Started | DYT-002, DYT-003 |
| DYT-006 | Production recording and recovery | Not Started | DYT-002, DYT-003, DYT-005 |
| DYT-007 | Local transcription | Not Started | DYT-005, DYT-006 |
| DYT-008 | Cloud Run and Gemini journal API | Not Started | DYT-001 |
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

Status: `Not Started`
Dependencies: DYT-002, DYT-003

Outcome: Capture three guided samples, encrypt the local embedding, provide re-record/delete, and classify user/other/unknown with conservative thresholds using sherpa-onnx.

In scope: Voice Setup state, profile lifecycle, model versioning, fixture calibration, and unknown fallback.

Exclusions: cloud speaker processing, voice cloning, remote profile backup, and attribution of unsupported emotions.

Definition of Done: profile is encrypted and local, three samples are required, uncertainty yields unknown, and profile deletion is verified.

Automated verification: sample flow, encryption boundary, threshold, multi-speaker, silence, and delete tests.
Physical-device verification: microphone routes, background interruption, re-enrollment, and memory/storage behavior.

## DYT-006 - Production recording and recovery

Status: `Not Started`
Dependencies: DYT-002, DYT-003, DYT-005

Outcome: Build the production recording lifecycle with encrypted chunk rotation, pause/resume/stop, automatic scheduled end, interruption handling, and crash recovery.

In scope: session reducer integration, protected sandbox, active-chunk recovery, offline retention deadline, Today status, and processing handoff.

Exclusions: local transcription implementation, Gemini, Live Activity, Android action wiring.

Definition of Done: duplicate end/stop is safe, closed chunks are durable before rotation, scheduled end begins processing, and failure retains only retry material for at most 24 hours.

Automated verification: lifecycle, timing, chunk integrity, interruption, storage, retry, and expiry tests.
Physical-device verification: eight-hour session, lock/background, calls, Bluetooth, route loss, low storage, termination, and recovery.

## DYT-007 - Local transcription

Status: `Not Started`
Dependencies: DYT-005, DYT-006

Outcome: Select and pin a whisper.cpp React Native binding and transcribe English, Nepali, and mixed-language chunks locally with timestamps and confidence.

In scope: model packaging decision, language tags, segment persistence, audio deletion after durable transcript, and test fixtures.

Exclusions: remote transcription, journal generation, and UI redesign.

Definition of Done: supported fixtures produce usable segments, raw audio never enters API payloads, and low-confidence output remains explicit.

Automated verification: language, mixed-language, timestamps, silence, malformed audio, confidence, and deletion tests.
Physical-device verification: representative iOS and Android performance, storage, thermal, and battery checks.

## DYT-008 - Cloud Run and Gemini journal API

Status: `Not Started`
Dependencies: DYT-001

Outcome: Deploy stateless `/v1/journal/analyze` and `/v1/journal/generate` with App Check, Secret Manager, structured validation, size limits, Gemini configuration, retry responses, and redacted logging.

In scope: schemas and policy validation in [03-SPEC](03-SPEC.md#7-journal-api-and-gemini-pipeline), prompt-injection handling, unsupported-fact rejection, and service test environment.

Exclusions: raw audio, persistence, user accounts, journal storage, and client UI.

Definition of Done: API key exists only in Secret Manager, request/response bodies are never logged or persisted, and contracts are versioned and tested.

Automated verification: valid/malformed output, App Check, payload limit, prompt injection, unsupported facts, maximum questions, retry, and log-redaction tests.
Physical-device verification: authenticated mobile requests over Wi-Fi and cellular with offline recovery.

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
