# Daytale Progress

This file records current delivery evidence and decisions. It does not repeat requirements or acceptance criteria; those remain in [01-PRD](01-PRD.md), [02-MVP](02-MVP.md), [03-SPEC](03-SPEC.md), [04-USER-STORIES](04-USER-STORIES.md), and [05-TICKETS](05-TICKETS.md).

## Current milestone

Canonical documentation baseline complete. DYT-001 repository foundation is in progress. The next dependency after its physical-device gate is DYT-002.

## Ticket status

Completed: none.
Active: DYT-001.
Blocked: none.
Ready for review: none.
Verified: none.
Not started: DYT-002 through DYT-012.

## Blockers and prerequisites

There is no repository implementation blocker. DYT-001 still needs Apple and Google developer access plus physical devices for development-build verification. DYT-008 needs the Google Cloud/Firebase project and a paid Gemini service configuration; the key must be provided only when that ticket starts and stored in Secret Manager.

## Latest verified build

Expo SDK 57 repository foundation verified locally on 2026-09-25: public Expo config resolved, web export completed, and no native signed build was produced. The prototype remains unchanged and is the visual authority for implementation.

## Test evidence

2026-09-25: `npm ci` succeeded; `npm run check` passed formatting, lint, TypeScript, three test suites with four tests, documentation links/placeholders, and route smoke checks. `npx expo config --type public` resolved the Daytale Expo Router configuration, and `npx expo export --platform web` bundled the route graph successfully. Watchman emitted a recrawl warning during Jest but did not affect results. Physical iOS 17+ and Android 12+ development-client checks remain pending.

## Dated decisions

| Date | Decision | Owner |
| --- | --- | --- |
| 2026-09-25 | Codex native supervised development is the implementation flow. | Product/engineering |
| 2026-09-25 | MVP targets iOS 17+ and Android 12+ through TestFlight and Play internal testing. | Product/engineering |
| 2026-09-25 | Journals are device-only; accounts, sync, location, widgets, Control Center, hardware controls, and social features are excluded. | Product |
| 2026-09-25 | English and Nepali speech are supported first, including mixed-language fixtures. | Product |
| 2026-09-25 | Voice Setup is required, uses three samples, and keeps encrypted embeddings on device. | Product/privacy |
| 2026-09-25 | Transcript-derived API calls may leave the phone; raw audio and voice embeddings may not. | Privacy/engineering |
| 2026-09-25 | Cloud Run is the minimal stateless Gemini proxy; credentials live in Secret Manager. | Engineering |
| 2026-09-25 | Failed or offline processing retains encrypted retry material for at most 24 hours, then writes a content-free cleanup receipt. | Privacy/engineering |
| 2026-09-25 | `prototype/index.html` and `prototype/tokens.css` are the sole visual and interaction authority; the historical PNG is non-authoritative. | Design/engineering |
