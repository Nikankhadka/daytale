# Daytale

Daytale is a private, device-first daily journaling companion. The canonical documentation baseline is complete and implementation starts with `DYT-001`.

## Canonical documentation

- [Product requirements](Docs/01-PRD.md) - product intent, promise, success measures, and boundaries.
- [MVP boundary](Docs/02-MVP.md) - first-beta scope, platforms, release gates, and milestone sequence.
- [Implementation specification](Docs/03-SPEC.md) - the sole source for screens, behavior, architecture, data, APIs, privacy, and tests.
- [User stories](Docs/04-USER-STORIES.md) - numbered stories with acceptance criteria and traceability.
- [Implementation tickets](Docs/05-TICKETS.md) - ordered backlog and verification obligations.
- [Progress](Docs/06-PROGRESS.md) - current milestone, evidence, blockers, and dated decisions.

## Source authority

The interactive prototype is the only visual, copy, interaction, and token authority: [prototype/index.html](prototype/index.html) and [prototype/tokens.css](prototype/tokens.css). The historical design image at [Docs/ChatGPT Image Sep 25, 2026, 09_20_54 AM.png](<Docs/ChatGPT Image Sep 25, 2026, 09_20_54 AM.png>) is preserved for reference only and is non-authoritative.

Requirements belong in exactly one canonical document. Link to that owner instead of creating parallel architecture, API, test-plan, decision-log, or roadmap documents.

## Current status

Documentation baseline: complete. DYT-001 repository foundation: in progress. The next executable dependency is [DYT-002](Docs/05-TICKETS.md#dyt-002-physical-background-recording-spike).

## Development foundation

Requirements: Node.js 22+, npm 10+, and Expo tooling for local development. Install dependencies and run the verification suite with:

```sh
npm ci
npm run check
```

Start the Expo Router shell with `npm start`. The app currently boots to the Today, Journal, and Settings placeholder tabs. Use `eas build --profile development --platform ios` or `eas build --profile development --platform android` when Apple and Google developer access is available.
