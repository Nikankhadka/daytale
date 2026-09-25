# Daytale MVP Boundary

Status: Canonical first-beta boundary
Related: [01-PRD](01-PRD.md) for product intent, [03-SPEC](03-SPEC.md) for implementation behavior, [05-TICKETS](05-TICKETS.md) for execution.

## Beta definition

The MVP is a device-first mobile app that records one scheduled daily window, processes English, Nepali, and mixed-language speech, produces a grounded editable journal, and keeps journals and voice data on the device. The app works without an account and can retry transient processing after a network interruption.

## Supported platforms and distribution

- iOS 17 and later, tested on a physical iPhone through TestFlight.
- Android 12 and later, tested on physical devices through Google Play internal testing.
- Expo development builds are required; a simulator-only implementation does not satisfy the beta gate.
- Required system surfaces are the iOS Lock Screen and Dynamic Island Live Activity, plus the Android foreground notification. Each exposes Pause, Resume, and Stop.

## Included boundary

| Area | Included in MVP |
| --- | --- |
| Setup | Optional first name, spoken and journal language selection, schedule, notification and microphone permissions, required three-sample voice setup |
| Daily loop | Scheduled notification, foreground and background recording, pause/resume/stop, automatic scheduled end, processing, clarification, journal ready |
| Languages | English, Nepali, and mixed-language speech fixtures; journal language selected by the user |
| Privacy | Local encrypted audio chunks, local encrypted voice embeddings, local journals, explicit deletion, 24-hour retry expiry |
| Journals | List, detail, edit, native share, delete, empty and failure states |
| Accessibility | Screen-reader labels, large text, reduced motion, keyboard handling, safe areas, minimum touch targets, light and dark themes |
| Operations | Crash-only redacted diagnostics, release acceptance matrix, TestFlight and Play internal builds |

## Explicit exclusions

The first beta does not include accounts, sign-in, sync, cloud journal storage, location or place pins, widgets, Control Center controls, hardware-button controls, social features, collaborative journals, calendar or health integrations, photo ingestion, custom behavioral analytics, or a local journal-generation LLM. Raw audio is never sent to the journal API.

## Required external services

The journal API is a stateless Google Cloud Run service using Firebase App Check and Google Secret Manager. It calls a paid Gemini service configuration with structured JSON output and zero-data-retention controls. The mobile app never contains the Gemini API key. The key and cloud project are provisioned only when the Cloud Run ticket begins.

## Release gates

The beta cannot ship until all of the following are evidenced:

1. Physical-device recording works in the background for an eight-hour session and survives screen lock, app backgrounding, an incoming call, Bluetooth route changes, route loss, low storage, and app termination with the specified recovery behavior.
2. Permissions, onboarding, recording controls, clarification, generation, editing, sharing, deletion, offline retry, and all error/empty/loading states pass cross-platform E2E checks.
3. Local English, Nepali, and mixed-language transcription fixtures pass, with conservative multi-speaker attribution.
4. API contract tests pass for valid and malformed output, prompt-injection text, unsupported facts, retry behavior, oversized requests, App Check failures, and log redaction.
5. Deletion verification proves temporary audio, transcripts, extracted events, and clarification data are removed at the required lifecycle points.
6. Visual and accessibility comparison against the interactive prototype passes in light mode, dark mode, large text, reduced motion, keyboard, safe-area, and minimum-touch-target cases.
7. TestFlight and Play internal builds are installable, signed, versioned, and accompanied by a completed acceptance matrix and release sign-off.

## Milestones

Milestones follow the risk and dependency order in [05-TICKETS](05-TICKETS.md): foundation, physical recording proof, secure persistence, prototype-faithful shell, voice identity, production recording, local transcription, cloud journal API, processing and journals, system controls, quality/privacy review, and release sign-off. A later milestone cannot silently redefine this boundary; changes are recorded in [06-PROGRESS](06-PROGRESS.md) and approved against [01-PRD](01-PRD.md).

## Beta prerequisites

Implementation requires Apple and Google developer accounts for physical builds, Firebase and Google Cloud projects for App Check and Cloud Run, and a paid Gemini service configuration. The Google AI Studio or equivalent key is requested only for the cloud integration ticket, stored in Secret Manager, and never committed or pasted into mobile configuration.
