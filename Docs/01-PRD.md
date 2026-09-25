# Daytale Product Requirements

Status: Canonical and approved for MVP implementation
Scope: Product requirements only. Implementation detail belongs in [03-SPEC](03-SPEC.md); delivery sequencing belongs in [05-TICKETS](05-TICKETS.md).

## Product vision

Daytale turns a small, scheduled slice of a person’s day into a useful private journal. It listens only when invited, helps the person remember what happened, and produces a grounded reflection without requiring them to write while life is happening.

## Audience and problem

The primary user is a person who wants a consistent journal but cannot reliably stop to write. They may switch between English and Nepali, speak with other people during the day, and care more about an honest record than a polished social post.

The problem is not a lack of blank pages. It is the friction of remembering, sorting, and writing after a busy day. Existing voice notes preserve raw material but do not produce a trustworthy, editable reflection. Daytale must reduce that friction without turning a private day into a data product.

## Product promise

Daytale makes a daily journal from a user-chosen recording window, keeps raw audio on the device, identifies the enrolled speaker conservatively, asks at most two useful follow-up questions when context is missing, and stores the finished journal on the device. The user can inspect, edit, share, or delete the result at any time.

## Principles

1. **Private by construction.** Raw audio is local. Only the minimum transcript-derived material needed for analysis and generation may leave the phone.
2. **Grounded over impressive.** A journal may contain only what the transcript and user answers support. Unsupported facts, places, people, and emotions are not invented.
3. **Unknown is safer than wrong.** Uncertain speaker attribution is labeled unknown rather than assigned to the user.
4. **The user is in control.** Recording has visible status and pause, resume, and stop controls. Deletion is understandable and irreversible only after confirmation.
5. **Small daily habit.** The product should make one reliable daily loop feel lighter, not introduce a second productivity system.
6. **Accessible by default.** The experience works with large text, screen readers, reduced motion, keyboard input, safe areas, and minimum touch targets.

## MVP product requirements

### R1. First-run setup

The product must guide a new user through Welcome, Languages, Schedule, Privacy and Permissions, Voice Setup, and Ready. Welcome may collect an optional first name. The user selects spoken and journal languages, a daily start and end time, microphone and notification permissions, and three short voice samples. The same settings remain editable later.

### R2. Daily recording loop

At the scheduled start, Daytale must notify the user and make recording available in the background. The user can pause, resume, or stop from the app and from the required platform recording surface. At the scheduled end, recording stops automatically and processing begins. A clear state must be visible throughout.

### R3. Trustworthy understanding

Daytale must transcribe supported English, Nepali, and mixed-language speech locally. It must distinguish the enrolled user from other speakers when evidence is sufficient and mark uncertain speech as unknown. Feelings and opinions may be attributed to the user only when speaker and transcript evidence meet the conservative threshold.

### R4. Clarification and journal

After local processing, Daytale may ask zero, one, or two time-based clarification questions. Questions must be answerable or skippable. The final journal must have a title, readable paragraphs, and context tags, and must be editable, shareable through the native share sheet, and deletable.

### R5. Local ownership

Finished journals, preferences, and the encrypted voice profile are device-only MVP data. There are no accounts, social features, or cloud journal storage. A user can delete a voice profile, a journal, or all local data and can re-enroll their voice.

### R6. Honest failure behavior

If processing cannot finish or the network is unavailable, Daytale must preserve only the encrypted material required for retry for no more than 24 hours, explain the situation, retry when possible, and automatically delete expired material while recording a content-free cleanup receipt.

## Privacy promise

- Audio is recorded, chunked, and encrypted in the protected app sandbox. It is deleted after successful transcription.
- Transcript-derived requests sent to the journal service are protected by Firebase App Check, contain no raw audio, are not persisted by the service, and have bodies excluded from logs.
- Transcripts, extracted events, and clarification data are deleted after a journal is saved.
- Journals, preferences, encrypted voice embeddings, and content-free cleanup receipts remain on the device until the user deletes them.
- Crash and performance diagnostics are redacted and content-free. Daytale does not collect audio, transcripts, journal text, names, or custom behavioral analytics.

## Success measures

The first beta is successful when:

- A new user can complete setup and understand the recording state without assistance.
- A scheduled session survives an eight-hour physical-device run, screen lock, backgrounding, and a recoverable interruption.
- At least 95% of generated journal claims are supported by transcript or clarification evidence in the acceptance fixture set; unsupported claims are rejected.
- Speaker attribution favors unknown over false user attribution in multi-speaker fixtures.
- A user can locate, edit, share, and delete a journal without network access after generation.
- Deletion verification proves that temporary audio and analysis material disappear while the intended local records remain.
- Accessibility and visual checks pass for light and dark themes, large text, reduced motion, keyboard behavior, safe areas, and touch targets.

These measures are quality gates, not product analytics. They are evaluated with fixtures, device evidence, and manual review.

## Non-goals for MVP

Accounts, sign-in, cloud sync, location, places, widgets, Control Center controls, hardware-button controls, social sharing, collaborative journals, calendar or health integrations, photo ingestion, custom behavioral analytics, and a local journal-generation LLM are outside this product release.

## Long-term boundaries

Future work may add capabilities only if it preserves device ownership, explicit recording consent, conservative attribution, and grounded output. A future feature must not silently expand collection, introduce a second source of truth, or make cloud retention a prerequisite for the daily loop. Scope changes are recorded in [06-PROGRESS](06-PROGRESS.md) and must update the owning requirement here before implementation.
