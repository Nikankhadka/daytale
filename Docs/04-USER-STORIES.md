# Daytale User Stories

Each story has one acceptance owner in [03-SPEC](03-SPEC.md) and one or more implementation tickets in [05-TICKETS](05-TICKETS.md). Acceptance criteria are executable expectations, not a second product specification.

## Onboarding

### US-001 - Welcome with optional name

Spec: [screen contract](03-SPEC.md#1-product-shell-and-screen-contract)
Tickets: [DYT-004](05-TICKETS.md#dyt-004-prototype-faithful-shell-and-onboarding)

Acceptance:

- A first-run user sees the Welcome state and can continue without a name.
- A supplied first name is stored locally and is editable in Settings.
- The screen works with a screen reader, large text, keyboard, and reduced motion.

### US-002 - Choose spoken and journal languages

Spec: [R1 and data model](03-SPEC.md#5-local-data-model)
Tickets: [DYT-004](05-TICKETS.md#dyt-004-prototype-faithful-shell-and-onboarding), [DYT-007](05-TICKETS.md#dyt-007-local-transcription)

Acceptance:

- English, Nepali, or both spoken languages can be selected.
- A journal language is required and invalid empty selections cannot continue.
- Settings can later change these choices with an explicit save result.

### US-003 - Configure a daily window

Spec: [navigation and schedule](03-SPEC.md#2-navigation-and-state-machine)
Tickets: [DYT-003](05-TICKETS.md#dyt-003-secure-persistence-and-session-state), [DYT-004](05-TICKETS.md#dyt-004-prototype-faithful-shell-and-onboarding)

Acceptance:

- The user selects local start and end times and sees the next scheduled run.
- End-before-start and invalid timezone values are rejected with an explanation.
- The schedule remains correct across midnight, daylight-saving changes, and process restart.

### US-004 - Understand privacy and grant permissions

Spec: [privacy and security](03-SPEC.md#8-security-privacy-and-deletion)
Tickets: [DYT-004](05-TICKETS.md#dyt-004-prototype-faithful-shell-and-onboarding), [DYT-011](05-TICKETS.md#dyt-011-accessibility-privacy-and-visual-quality)

Acceptance:

- The user sees a plain-language explanation of local audio and transcript processing before granting access.
- Microphone and notification denial provide retry and system-settings recovery.
- No recording starts until microphone permission is granted.

### US-005 - Enroll voice

Spec: [recording lifecycle](03-SPEC.md#6-recording-transcription-and-speaker-lifecycle)
Tickets: [DYT-005](05-TICKETS.md#dyt-005-voice-enrollment-and-speaker-identification)

Acceptance:

- Voice Setup requires three short samples and shows progress, retry, and failure recovery.
- The embedding is encrypted on device and is never included in an API request.
- Voice Setup cannot be skipped; re-record and delete are available later in Privacy and Data.

### US-006 - Finish setup

Spec: [screen contract](03-SPEC.md#1-product-shell-and-screen-contract)
Tickets: [DYT-004](05-TICKETS.md#dyt-004-prototype-faithful-shell-and-onboarding)

Acceptance:

- Ready summarizes the saved choices and enters Today.
- Relaunch after completion does not repeat onboarding unless all data was deleted.

## Scheduling and recording

### US-007 - Receive a scheduled prompt

Spec: [navigation and state machine](03-SPEC.md#2-navigation-and-state-machine)
Tickets: [DYT-006](05-TICKETS.md#dyt-006-production-recording-and-recovery), [DYT-010](05-TICKETS.md#dyt-010-native-recording-controls)

Acceptance:

- At the scheduled start the user receives a notification and can start explicitly.
- Starting early is possible only through Start now; duplicate timers do not create duplicate sessions.

### US-008 - Record in the background

Spec: [recording lifecycle](03-SPEC.md#6-recording-transcription-and-speaker-lifecycle)
Tickets: [DYT-002](05-TICKETS.md#dyt-002-physical-background-recording-spike), [DYT-006](05-TICKETS.md#dyt-006-production-recording-and-recovery)

Acceptance:

- Recording continues after screen lock and app backgrounding on both supported platforms.
- The user always sees a recording status and elapsed duration.
- The eight-hour physical-device test does not lose closed chunks.

### US-009 - Pause, resume, stop, and auto-stop

Spec: [state machine](03-SPEC.md#2-navigation-and-state-machine)
Tickets: [DYT-006](05-TICKETS.md#dyt-006-production-recording-and-recovery), [DYT-010](05-TICKETS.md#dyt-010-native-recording-controls)

Acceptance:

- Pause stops capture, Resume starts a new chunk, and Stop ends capture safely.
- The scheduled end stops capture exactly once and begins processing.
- In-app and native system-surface actions produce the same persisted transition.

### US-010 - Recover interruptions

Spec: [offline and failure recovery](03-SPEC.md#9-offline-and-failure-recovery)
Tickets: [DYT-006](05-TICKETS.md#dyt-006-production-recording-and-recovery)

Acceptance:

- Calls, Bluetooth changes, route loss, low storage, and app termination produce a visible safe state.
- After a crash only the active chunk is considered recoverable; corrupt material is discarded.
- No interruption silently resumes recording without reconciliation.

## Privacy and data lifecycle

### US-011 - Control recording privacy

Spec: [security and deletion](03-SPEC.md#8-security-privacy-and-deletion)
Tickets: [DYT-003](05-TICKETS.md#dyt-003-secure-persistence-and-session-state), [DYT-006](05-TICKETS.md#dyt-006-production-recording-and-recovery)

Acceptance:

- The privacy sheet explains microphone state and cleanup without hiding controls.
- Audio is encrypted after chunk close and deleted after successful transcription.

### US-012 - Delete voice and all data

Spec: [security and deletion](03-SPEC.md#8-security-privacy-and-deletion)
Tickets: [DYT-003](05-TICKETS.md#dyt-003-secure-persistence-and-session-state), [DYT-009](05-TICKETS.md#dyt-009-processing-clarification-and-journals)

Acceptance:

- Voice deletion removes embeddings and requires fresh enrollment.
- Delete all data confirms irreversibility, stops active work, removes the key and local content, and returns to Welcome.

## Processing and clarification

### US-013 - Transcribe locally

Spec: [recording lifecycle](03-SPEC.md#6-recording-transcription-and-speaker-lifecycle)
Tickets: [DYT-007](05-TICKETS.md#dyt-007-local-transcription)

Acceptance:

- English, Nepali, and mixed-language fixtures produce timestamped segments and language tags.
- Raw audio is not sent to the journal API.
- Low-confidence transcription remains recoverable and does not invent text.

### US-014 - Attribute speakers conservatively

Spec: [recording lifecycle](03-SPEC.md#6-recording-transcription-and-speaker-lifecycle)
Tickets: [DYT-005](05-TICKETS.md#dyt-005-voice-enrollment-and-speaker-identification), [DYT-007](05-TICKETS.md#dyt-007-local-transcription)

Acceptance:

- Enrolled-user speech is labeled user only above the calibrated threshold.
- Other and uncertain speech are labeled other or unknown; unknown is preferred to false user attribution.

### US-015 - See processing status

Spec: [screen contract](03-SPEC.md#1-product-shell-and-screen-contract)
Tickets: [DYT-009](05-TICKETS.md#dyt-009-processing-clarification-and-journals)

Acceptance:

- Processing clearly names transcribing, analyzing, and generating stages.
- Offline and retry deadlines are visible without exposing content in notifications.

### US-016 - Answer or skip clarification

Spec: [API and clarification](03-SPEC.md#7-journal-api-and-gemini-pipeline)
Tickets: [DYT-008](05-TICKETS.md#dyt-008-cloud-run-and-gemini-journal-api), [DYT-009](05-TICKETS.md#dyt-009-processing-clarification-and-journals)

Acceptance:

- The app shows zero, one, or two time-based questions and never a map or place pin.
- Each question can be answered or skipped, and generation can continue after either action.

## Journals

### US-017 - Generate a grounded journal

Spec: [Gemini pipeline](03-SPEC.md#7-journal-api-and-gemini-pipeline)
Tickets: [DYT-008](05-TICKETS.md#dyt-008-cloud-run-and-gemini-journal-api), [DYT-009](05-TICKETS.md#dyt-009-processing-clarification-and-journals)

Acceptance:

- The result contains a title, paragraphs, and context tags in the requested language.
- Unsupported facts, unsupported feelings, and missing evidence are rejected before save.
- The API and app do not log or persist request bodies.

### US-018 - Browse and read journals

Spec: [screen contract](03-SPEC.md#1-product-shell-and-screen-contract)
Tickets: [DYT-009](05-TICKETS.md#dyt-009-processing-clarification-and-journals)

Acceptance:

- Journal list is chronological and has a useful empty state.
- Detail shows title, paragraphs, date, and context tags without network access.

### US-019 - Edit and share a journal

Spec: [screen contract](03-SPEC.md#1-product-shell-and-screen-contract)
Tickets: [DYT-009](05-TICKETS.md#dyt-009-processing-clarification-and-journals)

Acceptance:

- Edits require Save or Cancel and preserve text through keyboard and process recreation.
- Native share exports only the selected journal and does not alter the stored entry.

### US-020 - Delete a journal

Spec: [security and deletion](03-SPEC.md#8-security-privacy-and-deletion)
Tickets: [DYT-009](05-TICKETS.md#dyt-009-processing-clarification-and-journals)

Acceptance:

- Delete requires an explicit confirmation and removes only the selected entry.
- The list updates immediately and the deleted content cannot be recovered from app storage.

## Settings and accessibility

### US-021 - Edit preferences

Spec: [data model](03-SPEC.md#5-local-data-model)
Tickets: [DYT-004](05-TICKETS.md#dyt-004-prototype-faithful-shell-and-onboarding)

Acceptance:

- Settings can edit name, schedule, spoken languages, journal language, theme, reduced motion, and permissions.
- Changes have explicit save feedback and do not rewrite existing journals.

### US-022 - Use accessible themes and motion

Spec: [visual and interaction system](03-SPEC.md#3-visual-and-interaction-system)
Tickets: [DYT-004](05-TICKETS.md#dyt-004-prototype-faithful-shell-and-onboarding), [DYT-011](05-TICKETS.md#dyt-011-accessibility-privacy-and-visual-quality)

Acceptance:

- Light and dark themes preserve contrast and prototype token roles.
- Large text, screen readers, reduced motion, keyboard, safe areas, and touch targets pass the component and physical-device checks.

## Release operations

### US-023 - Verify privacy and release quality

Spec: [test specification](03-SPEC.md#10-test-and-verification-specification)
Tickets: [DYT-001](05-TICKETS.md#dyt-001-repository-foundation), [DYT-011](05-TICKETS.md#dyt-011-accessibility-privacy-and-visual-quality), [DYT-012](05-TICKETS.md#dyt-012-acceptance-matrix-and-release-sign-off)

Acceptance:

- CI runs lint, type checks, unit/component tests, API contract tests, and documentation checks.
- TestFlight and Play internal builds have evidence for the full acceptance matrix.
- Diagnostics contain no audio, transcripts, journal text, names, embeddings, or custom behavioral analytics.
