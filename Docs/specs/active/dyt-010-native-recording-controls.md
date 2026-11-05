# DYT-010 - Native recording controls

Status: Ready for build - Part 0 dependency spike is the gate.
Ticket: [DYT-010](../../05-TICKETS.md#dyt-010---native-recording-controls)
Branch: `feat/dyt-010-native-recording-controls`
Owners: recording controls, iOS Live Activity, Android recording notification.

## Problem

DYT-010 requires Pause, Resume, and Stop on the iOS Lock Screen and Dynamic Island Live Activity and
on the Android foreground notification ([02-MVP.md:15](../../02-MVP.md#supported-platforms-and-distribution),
[03-SPEC.md:121](../../03-SPEC.md#4-architecture), device matrix
[03-SPEC.md:287](../../03-SPEC.md#10-test-and-verification-specification)). Today the app has no such
surface. `src/features/recording/notifications.ts` owns only the daily prompt and break reminders.
The Android recording notification is entirely expo-audio's `AudioRecordingService` notification,
which has exactly one hard-coded Stop action that calls native `stopRecording()` and bypasses the JS
command layer. iOS has no ActivityKit target, no `LiveActivityIntent`, and no button anywhere.

In-app controls go through `recordingHost.engine` (`src/features/recording/useRecordingEngine.ts:9-19`),
whose `pause`, `resume`, and `stop` are serialized and idempotent
(`src/features/recording/engine.ts:305-371`). `Docs/03-SPEC.md:119-121` permits native Swift/Kotlin
only when a physical-device test demonstrates a missing capability, and requires native controls to
call the same idempotent session commands. This ticket is that demonstrated gap: Android cannot
express Pause or Resume and its Stop diverges from the persisted session; iOS has no control surface.
The reason is recorded here and in the progress ledger note at the end.

## Scope

In scope:

- A persisted, content-free intent record shared by both native surfaces.
- A JS drain mapping each record onto `recordingHost.engine`'s `pause`, `resume`, and `stop`.
- iOS: a widget target for a Live Activity, shared `ActivityAttributes`, Lock Screen and Dynamic
  Island presentation, a local Expo module for `start`/`update`/`end`, and `LiveActivityIntent`
  actions.
- Android: a config-plugin patch of expo-audio 57.0.5's `AudioRecordingService.kt` that routes
  notification actions to a broadcast receiver, a paused-state notification, and a launch-resume
  bridge.
- App wiring, capability gating, and the physical-device gate.

Out of scope:

- Widgets, Control Center controls, hardware buttons, Siri/Shortcuts, and Live Activity push
  updates (`pushType: nil`).
- Transcript, journal, prompt, speaker, or session content on any system surface.
- Any server change, account, analytics, or new notification analytics.
- Reworking the recording engine, chunking, storage schema, or expo-audio's recorder lifecycle.
- A headless JS runtime or `expo-task-manager`.
- Acceptance claims in `Docs/05-TICKETS.md` or `Docs/06-PROGRESS.md`; the supervisor owns both and
  authorizes only the status line recorded with this spec.

## Technical contract

Every system action is an intent record first. No native surface writes the session database, calls
the recorder, or stops audio; every action is applied by the JS drain through
`recordingHost.engine`. All state changes go through `recordingHost.engine`. Operation ids stay
engine-minted (`src/features/recording/engine.ts:141-147`); storage idempotency stays owned by
`applyRecordingSessionOperation` (`src/storage/repositories.ts:943-979`).

### Intent record

```ts
export const RECORDING_INTENT_VERSION = 1;

export type RecordingIntentRecord = {
  version: 1;
  id: string;          // lowercase UUID, native-minted
  kind: 'pause' | 'resume' | 'stop';
  sessionId: string;   // lowercase UUID of the active session
  createdAt: string;   // ISO-8601 UTC with milliseconds, ends with Z
  source: 'ios-activity' | 'android-notification';
};
```

- Exactly six fields. Extra fields are dropped at parse. The record contains no transcript,
  journal, prompt, speaker, or audio path.
- Native writers cap the queue at 32 records, drop the oldest, and drop a duplicate `id`.
- iOS storage: App Group `group.com.daytale.app`, `UserDefaults(suiteName:)`, key
  `daytale.pendingRecordingIntents` (JSON array string), plus `daytale.activeRecordingSessionId`.
- Android storage: `SharedPreferences("daytale_recording_controls", MODE_PRIVATE)`, key
  `pending_recording_intents` (JSON array string), plus `active_recording_session_id`.
- The active session id is written when the persisted session becomes `recording` or `paused`, and
  cleared otherwise. It is the only session identity a native intent carries.

### Research inputs

The research brief (2026-11-06) is the source for the foreign facts below.

- `@bacons/apple-targets` npm `latest` is `5.0.0` (peer `expo >=52`, SDK 55 line). `6.0.0` exists
  only in an unpublished draft PR. 5.0.0 depends on `@expo/prebuild-config ~55.0.6`; whether that
  breaks SDK 57 prebuild is UNVERIFIED.
- Plugin usage: adding `"@bacons/apple-targets"` and `ios.appleTeamId`, then `npx expo prebuild -p
  ios`; target Swift lives in `targets/<name>/`; `expo-target.config.js` uses `type: "widget"` for
  Live Activities; `deploymentTarget` defaults to 18.0 and must be set explicitly; `_shared/` is
  linked into the app and widget targets; CocoaPods 1.16.2+ and Xcode 16 are required; EAS signing
  of the second target is author-asserted but theoretical.
- `ios.infoPlist.NSSupportsLiveActivities: true` is required. The App Group is
  `group.com.daytale.app`, declared through `ios.entitlements`.
- ActivityKit: `ActivityAuthorizationInfo().areActivitiesEnabled`, `Activity.request`, `update`,
  `end`; updates are allowed in the background; content state is limited to 4 KB; an activity can
  only start while the app is foreground; `pushType: nil` is sufficient.
- Widget buttons require `Button(intent:)` with an `AppIntent`. A `LiveActivityIntent` runs in the
  app process without opening the app and never in Hermes. Whether Hermes is alive during that
  launch is UNVERIFIED.
- Lock Screen buttons are inert until the device is unlocked and the person authenticates.
  Buttons appear in the expanded and Lock Screen presentations, not compact or minimal.
- expo-audio 57.0.5 Android service: `expo.modules.audio.service.AudioRecordingService`, notification
  id 2001, channel `expo_audio_recording_channel`, `CATEGORY_SERVICE`, `setOngoing(true)`,
  `setSilent(true)`, `VISIBILITY_SECRET`, and one Stop action that calls native `stopRecording()`
  and bypasses JS.
- Android cannot start a microphone foreground service from the background on Android 12+, and
  `POST_NOTIFICATIONS` is required on API 33+.
- `expo-notifications` cannot modify expo-audio's service notification, and its action responses
  foreground the app. There is no headless JS entry point in this repo.

### Behavior matrix

Illegal transitions are no-ops, never crashes. "Applied" means the engine returned `ok` and the
session status changed. "No-op" includes engine `rejected` and an already-in-state `ok`. The system
surface reflects the persisted state after the next drain; it never invents a state.

| Persisted status | Pause | Resume | Stop | What the user sees after the drain |
| --- | --- | --- | --- | --- |
| `scheduled` | `rejected` -> no-op | `rejected` -> no-op | `rejected` -> no-op | No surface. A queued record is dropped. |
| `recording` | applied -> `paused` | no-op (already recording) | applied -> `transcribing` | iOS shows "Paused"; Android shows the paused notification with Resume and Stop. |
| `paused` | no-op (already paused) | applied -> `recording`, or a start blocker leaves it paused | applied -> `transcribing` | iOS shows "Recording"; Android shows the recording notification again. |
| `transcribing` | no-op | no-op | no-op (idempotent `ok`) | iOS ends "Completed"; the Android surface ends with the service. |
| `analyzing` | no-op | no-op | no-op | Same as transcribing. |
| `awaiting clarification` | no-op | no-op | no-op | Same. |
| `generating` | no-op | no-op | no-op | Same. |
| `ready` | no-op | no-op | no-op | Same. |
| `failed` | no-op | no-op | no-op | Surface ends "Interrupted"; the in-app failed view owns retry and discard. |
| `expired` | no-op | no-op | no-op | Surface ends "Expired". |
| `discarded` | no-op | no-op | no-op | Surface ends "Discarded". |

A `resume` blocked by `checkStartPreconditions` is the only non-noop failure. It is reported in the
drain outcome and is not shown on the system surface. No system action stops audio natively; until
the drain, the surface keeps showing the last persisted state.

### When JS is not running

The record is durable before the command runs. "Immediate" means the intent event reaches a live JS
runtime; otherwise the next drain applies it.

| Platform / state | Intent delivery | Applied | Audio effect |
| --- | --- | --- | --- |
| iOS foreground, JS live | App Group + native event | Immediate | Via `engine` |
| iOS background, JS live | App Group + native event, best effort | Immediate or next foreground | Via `engine` if applied |
| iOS background, JS suspended or killed | App Group only | Next foreground | None; capture continues after Pause or Stop |
| iOS terminated | App Group only | Next launch | None; Stop best-effort ends the activity |
| iOS locked | Buttons inert until unlock | After unlock, as above | After the drain |
| Android foreground, JS live | SharedPreferences + broadcast | Immediate | Via `engine` |
| Android background, process live | SharedPreferences + broadcast, best effort | Immediate or next foreground | Via `engine` if applied |
| Android background, process killed | Manifest receiver starts the process | Next launch | None; the service notification stays until the drain |
| Android terminated | Manifest receiver starts the process | Next launch | None; the service notification stays until the drain |
| Android locked | Public notification, actions available | As above | Via `engine` if applied; otherwise none |
| Android notification permission denied | No visible surface | At the next foreground drain | Recording is unaffected |

The product promise "the action reflects the persisted state" holds. The stronger promise "the action
takes effect immediately while the app is not running" does not hold on iOS, or on Android whenever
the JS runtime is gone, and is a release blocker (see Blockers). The foreground service may keep the
Android process alive, but this spec does not claim an audio effect it cannot prove; the surface
keeps showing the last persisted state until the drain.

## Acceptance scenarios

1. A valid record parses to exactly the six fields; a wrong version, kind, source, non-UUID id or
   session id, or malformed timestamp returns `null`. (jest: intents)
2. A record carrying extra `transcript` or `journal` fields parses without those fields. (jest:
   intents)
3. Pause from `recording` calls `engine.pause`, changes the session, and removes the record. (jest:
   drain)
4. Pause from `paused` is a no-op with outcome `noop`. (jest: drain)
5. Resume from `paused` calls `engine.resume` and applies. (jest: drain)
6. Resume from `recording` is a no-op. (jest: drain)
7. Stop from `recording` calls `engine.stop` and applies. (jest: drain)
8. Stop from `transcribing` is an idempotent `ok` and a `noop` outcome. (jest: drain)
9. An engine `rejected` result maps to `noop`, not `failed`. (jest: drain)
10. An engine `not-found` result maps to `unknown-session` and removes the record. (jest: drain)
11. A record for a different session is removed as `unknown-session`. (jest: drain)
12. A stale pause or stop record is removed without a command; a resume older than two minutes is
    removed as `stale`. (jest: drain)
13. Resume is `deferred` and kept when `isForeground()` is false. (jest: drain)
14. Duplicate ids run once; records apply in `createdAt` order. (jest: drain)
15. A failed command removes its record and does not block later records. (jest: drain)
16. The Live Activity port is unsupported on web and Android, and native errors become `false` or a
    no-op. (jest: liveActivity)
17. The hook drains on mount, on `AppState` `active`, and on a native intent event; concurrent
    drains are serialized. (jest: useRecordingControls)
18. The hook starts, updates, and ends the activity on status transitions, and does not end it on
    unmount. (jest: useRecordingControls)
19. The tabs layout mounts the controls hook; the existing recording-wiring test still passes.
    (jest: features/recording-wiring)
20. Part 0 proves the SDK 57 iOS prebuild generates the widget target and entitlements, and the
    Android prebuild still succeeds. (device: D1)
21. iOS Lock Screen and expanded Dynamic Island expose the correct two buttons; compact and minimal
    have none; a locked device prompts for unlock. (device: D2, D8)
22. iOS foreground, background, suspended, terminated, and locked behavior matches the no-JS table;
    the measured Stop gap is recorded. (device: D3)
23. Android recording and paused notifications expose the correct actions; Pause and Stop are
    applied only by the drain; Resume opens the app and resumes; process death and lock screen match
    the table. (device: D4, D9)
24. No system surface shows transcript, journal, prompt, speaker, or audio path; VoiceOver and
    TalkBack read every button. (device: D5, D6)

## Test seams and verification

New test files:

- `__tests__/recording/controls/intents.test.ts` - schema, redaction, malformed values.
- `__tests__/recording/controls/drain.test.ts` - fake `RecordingIntentStore` and a fake
  `Pick<RecordingEngine, 'pause' | 'resume' | 'stop'>`; every row of the behavior matrix, stale,
  duplicate, deferred, unknown session, ordering, failure isolation, record removal.
- `__tests__/recording/controls/liveActivity.test.ts` - `jest.mock('expo', () => ({
  requireNativeModule: jest.fn(() => fake) }))`; unsupported platforms, call shapes, swallowed
  errors, no content fields in the start input.
- `__tests__/recording/controls/useRecordingControls.test.tsx` - fake host, store, activity, and
  mocked `getRecordingControls`; mount, foreground, native event, serialization, activity lifetime,
  Android paused-notification and launch-resume calls.
- `__tests__/features/recording-wiring.test.tsx` - add a mock for
  `../../src/features/recording/controls` and assert `useRecordingControls` is called.

Jest cannot execute Swift or Kotlin. Those files are covered by the device gate only; the patch
hash guard is covered by the Part 0 command.

```sh
npx jest __tests__/recording/controls __tests__/features/recording-wiring.test.tsx --runInBand
npx tsc --noEmit
npx prettier --check "src/features/recording/controls/**/*.{ts,tsx}" \
  "modules/recording-controls/**/*.{ts,js,cjs}" \
  "__tests__/recording/controls/**/*.{ts,tsx}"
npm run check
```

Part 0 commands:

```sh
npm ls @bacons/apple-targets @expo/prebuild-config --all
npx expo prebuild -p ios --no-install --clean
xcodebuild -list -project ios/Daytale.xcodeproj
find ios -name '*.entitlements' -maxdepth 4 -print -exec plutil -p {} \;
plutil -p ios/Daytale/Info.plist | grep NSSupportsLiveActivities
npx expo prebuild -p android --no-install
test ! -d ios && test ! -d android
```

## Evidence

No build evidence exists yet. Part 0 evidence is the gate to Part 1. Append the following as each
part lands; the device rows stay open until the physical matrix runs.

| Part | Evidence to append |
| --- | --- |
| 0 | `npm ls` tree, prebuild exit codes, `xcodebuild -list` target list, entitlement dumps, Info.plist key, Android prebuild result, `test ! -d ios && test ! -d android`. |
| 1 | Jest counts for `__tests__/recording/controls`, `tsc --noEmit`, Prettier. |
| 2 | iOS prebuild/pod install log, the generated target and App Group, a signed EAS dev build, the queue read/write check. |
| 3 | Android prebuild log, patched-file hash, merged manifest with the receiver, an assembled dev build, the notification and paused-notification checks. |
| 4 | Full `npm run check` counts and the recording-wiring result. |
| Device | D1-D10 with device model, OS version, build hash, and screenshots; no content visible on any surface. |

## Definition of Done

Automated half:

- Part 0 evidence is recorded and no generated `ios/` or `android/` directory is committed.
- Every file and export in Parts 1-4 exists with the signatures below.
- Every acceptance scenario marked `jest` passes at its named seam; `npm run check` is green.
- `package.json` pins `expo-audio` exactly to `57.0.5` and `@bacons/apple-targets` exactly to
  `5.0.0`; the patch hash guard rejects any other expo-audio source.
- `Docs/05-TICKETS.md` and `Docs/06-PROGRESS.md` carry only the supervisor-recorded status line; the
  builder makes no acceptance claim in either.
- No new file contains transcript, journal, prompt, speaker, or audio-path copy.
- `check:docs` passes on this spec and every relative link resolves.

Device-gated half:

- D1: Part 0 prebuild proof on Xcode 16+ and CocoaPods 1.16.2+.
- D2: iOS Lock Screen and expanded Dynamic Island show Pause/Stop while recording and Resume/Stop
  while paused; compact and minimal have no buttons; locked buttons prompt for unlock.
- D3: iOS foreground, background, suspended, terminated, and locked match the no-JS table; the
  Stop-without-JS gap is measured and recorded.
- D4: Android recording and paused notifications expose the right actions; Pause and Stop are
  applied only by the drain and claim no audio effect while JS is dead; Resume opens the app and
  resumes; background, process death, and lock screen match.
- D5: Android notification permission denied leaves recording usable and produces no crash.
- D6: No content on any system surface; VoiceOver and TalkBack labels are correct; large text and
  dark mode are checked.
- D7: EAS development builds sign and install the second iOS target; the App Group queue works.
- D8: ActivityKit type identity and App Group sharing work across the app, pod, and widget.
- D9: No action starts recording or stops the recorder outside the engine from the background;
  Resume opens the app; Pause and Stop defer to the drain.
- D10: After each action, and after a drain following process death, the persisted session matches
  the surface and no duplicate operation is written.

The ticket cannot be marked Verified without D1-D10. The automated half alone is not acceptance.

## Blockers and follow-ups

1. **SDK 57 plugin risk (hard stop).** `@bacons/apple-targets@5.0.0` is the SDK 55 line and depends
   on `@expo/prebuild-config ~55.0.6`. If `npx expo prebuild -p ios --no-install --clean` fails, or
   the target, entitlements, or `NSSupportsLiveActivities` are missing, stop and report. No fallback
   implementation is designed; the supervisor decides the escalation.
2. **iOS unlock requirement.** Lock Screen buttons are inert until unlock and authentication. This
   is Apple behavior, not a defect.
3. **No-JS guarantee gap (release blocker).** On iOS, and on Android whenever the JS runtime is
   gone, Pause and Stop cannot affect capture while JS is suspended or dead; the record is applied
   at the next foreground drain. This differs from the product promise. Resolving it requires a
   native recorder controller or a headless entry point, both out of scope. It must be accepted
   explicitly or fixed before Verified.
4. **Stop dual-path risk (hard stop).** If the expo-audio patch is not applied, its Stop action
   calls native `stopRecording()` and bypasses the record. The patch must remove that direct call; do
   not accept expo-audio's Stop-only action as a fallback.
5. **ActivityKit type identity.** The activity attributes are compiled into the pod, the app target,
   and the widget target. Whether ActivityKit treats those copies as one type is UNVERIFIED. If it
   fails, stop and report; the escalation is to move start/update into the app target.
6. **EAS second-target signing.** The plugin author calls it theoretical. D7 covers it.
7. **App Group provisioning.** Requires a paid Apple developer account and a registered
   `group.com.daytale.app`. Part 0 or Part 2 stops if unavailable.
8. **Android paused notification.** The hook posts the paused notification (id 2002) after the
   drain applies pause. expo-audio likely stops its foreground service when the engine stops the
   recorder, so the recording notification disappears; if the service survives, both notifications
   may appear briefly. The patched service does not force a stop. D4 covers it.
9. **Android resume opens the app.** Starting capture from a background action is forbidden. Resume
   is a `PendingIntent.getActivity` with `daytale.recordingAction=resume`; the module's
   `consumePendingResume` reads it on foreground. Whether `onNewIntent` updates the intent is
   UNVERIFIED. If it does not, Resume is lost; D4 covers it.
10. **iOS resume opens the app.** `ResumeRecordingIntent` sets `openAppWhenRun = true` because iOS
    cannot start capture without JS. Whether `LiveActivityIntent` honors that flag is UNVERIFIED.
    Pause and Stop keep `openAppWhenRun = false`.
11. **Notification permission.** If `POST_NOTIFICATIONS` is denied, the Android surface may be
    hidden. There is no in-app fallback; recording still works.
12. **Patch maintenance.** Replacing `AudioRecordingService.kt` couples the repo to expo-audio
    57.0.5. The exact pin and SHA guard make an upgrade fail loudly; every upgrade must rebase the
    patch.
13. **Two queue implementations.** The Swift pod and `_shared` copies, and the Kotlin copy, can
    drift. The JSON shape and keys in this spec are the contract; D10 checks the end-to-end result.
14. **Android service life after process death.** Whether the foreground service survives, restarts,
    or keeps the recorder is UNVERIFIED; D4 covers it.
15. **No headless JS by design.** `expo-task-manager`, `TaskManager.registerTaskAsync`, and
    `getLastNotificationResponseAsync` are not used. Do not add them in this ticket.

## Part 0 - Dependency spike

Status: The first and only gate. No Part 1 work starts until this passes.

Scope: prove that `@bacons/apple-targets@5.0.0` generates a Live Activity widget target on Expo SDK
57, and that the Android prebuild still works. This part adds the dependency, the app config, a
minimal target, and nothing else.

### Technical contract

- Install `@bacons/apple-targets@5.0.0` in `dependencies` with an exact version.
- `app.json`:

  ```json
  {
    "expo": {
      "plugins": ["@bacons/apple-targets"],
      "ios": {
        "appleTeamId": "<the Daytale Apple team id>",
        "infoPlist": { "NSSupportsLiveActivities": true },
        "entitlements": {
          "com.apple.security.application-groups": ["group.com.daytale.app"]
        }
      }
    }
  }
  ```

  The team id is not a secret. If it is unavailable, Part 0 stops.
- `targets/recording-activity/expo-target.config.js`:

  ```js
  module.exports = {
    type: 'widget',
    deploymentTarget: '17.0',
    entitlements: {
      'com.apple.security.application-groups': ['group.com.daytale.app'],
    },
  };
  ```

- `targets/_shared/RecordingActivityAttributes.swift` with the final `ActivityAttributes` shape from
  Part 2, and a minimal `targets/recording-activity/RecordingActivityWidget.swift` that compiles an
  `ActivityConfiguration` and a `DynamicIsland` and renders static text. No JS module, no buttons,
  no intents in Part 0.
- Do not add the Android patch plugin in Part 0. The Android prebuild check only proves the iOS
  plugin does not break the Android path.

### Acceptance scenarios

1. `npm ls @bacons/apple-targets` resolves exactly `5.0.0`; `npm ls @expo/prebuild-config --all`
   records whether a second copy exists.
2. `npx expo prebuild -p ios --no-install --clean` exits 0.
3. `xcodebuild -list -project ios/Daytale.xcodeproj` lists the generated widget target.
4. The app target and the widget target each have an entitlements file containing
   `group.com.daytale.app`.
5. The app `Info.plist` contains `NSSupportsLiveActivities` with `true`.
6. `npx expo prebuild -p android --no-install` exits 0.
7. Both generated directories are removed before the part is closed.

### Definition of Done

- The dependency, app config, target directory, and shared attributes are committed.
- The seven evidence items above are in the Evidence section.
- Any failure stops the ticket; no fallback is built.

## Part 1 - Cross-platform action core

Status: Planned. Depends on Part 0.

Scope: the JS wrapper, intent schema, native store port, drain, Live Activity port, and the controls
hook. Native implementations arrive in Parts 2 and 3; Part 1 typechecks and tests with fakes.

### Technical contract

#### `modules/recording-controls/index.ts`

```ts
import { requireNativeModule } from 'expo';

export type NativeRecordingIntent = {
  version: number;
  id: string;
  kind: string;
  sessionId: string;
  createdAt: string;
  source: string;
};

export type RecordingControlsNativeModule = {
  isLiveActivitySupported: () => boolean;
  setActiveSession: (sessionId: string | null) => Promise<void>;
  startLiveActivity: (input: {
    sessionId: string;
    status: string;
    startedAt: string;
    scheduledEnd: string;
  }) => Promise<boolean>;
  updateLiveActivity: (input: { status: string; updatedAt: string }) => Promise<boolean>;
  endLiveActivity: (input: { status: string }) => Promise<void>;
  readPendingIntents: () => Promise<NativeRecordingIntent[]>;
  removePendingIntents: (ids: string[]) => Promise<void>;
  showPausedNotification: (sessionId: string) => Promise<void>;
  hidePausedNotification: () => Promise<void>;
  consumePendingResume: () => Promise<boolean>;
  enqueueIntent: (kind: 'pause' | 'resume' | 'stop') => Promise<void>;
  addListener: (
    event: 'onRecordingIntent',
    listener: (intent: NativeRecordingIntent) => void,
  ) => { remove: () => void };
};

export function getRecordingControls(): RecordingControlsNativeModule | null;
export function subscribeRecordingIntents(
  listener: (intent: NativeRecordingIntent) => void,
): () => void;
```

- `getRecordingControls` returns `null` on web and on any `requireNativeModule` failure. It resolves
  once and caches the result.
- `subscribeRecordingIntents` returns a no-op when the module is null.

#### `src/features/recording/controls/intents.ts`

```ts
export const RECORDING_INTENT_VERSION = 1;
export const RECORDING_INTENT_KINDS = ['pause', 'resume', 'stop'] as const;
export const RECORDING_INTENT_SOURCES = ['ios-activity', 'android-notification'] as const;

export type RecordingIntentKind = (typeof RECORDING_INTENT_KINDS)[number];
export type RecordingIntentSource = (typeof RECORDING_INTENT_SOURCES)[number];

export type RecordingIntentRecord = {
  version: typeof RECORDING_INTENT_VERSION;
  id: string;
  kind: RecordingIntentKind;
  sessionId: string;
  createdAt: string;
  source: RecordingIntentSource;
};

export function parseRecordingIntentRecord(value: unknown): RecordingIntentRecord | null;
export function isRecordingIntentRecord(value: unknown): value is RecordingIntentRecord;
```

- UUIDs use the repository pattern (versions 1-5, case-insensitive).
- `createdAt` must end with `Z` and parse as a date.
- Unknown keys are dropped; a record with a missing or invalid field returns `null`.

#### `src/features/recording/controls/intentStore.ts`

```ts
export type RecordingIntentStore = {
  read: () => Promise<unknown[]>;
  remove: (ids: string[]) => Promise<void>;
};

export function createNativeRecordingIntentStore(
  load?: () => Promise<RecordingControlsNativeModule | null>,
): RecordingIntentStore;

export const nativeRecordingIntentStore: RecordingIntentStore;
```

- `read` returns `[]` and `remove` is a no-op when the module is absent or throws.
- The store never parses; the drain owns validation.

#### `src/features/recording/controls/drain.ts`

```ts
export const RECORDING_INTENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const RECORDING_RESUME_MAX_AGE_MS = 2 * 60 * 1000;

export type RecordingIntentOutcomeStatus =
  | 'applied'
  | 'noop'
  | 'stale'
  | 'unknown-session'
  | 'invalid'
  | 'duplicate'
  | 'deferred'
  | 'failed';

export type RecordingIntentOutcome = {
  id: string;
  kind: RecordingIntentKind | 'invalid';
  status: RecordingIntentOutcomeStatus;
};

export type DrainRecordingIntentsOptions = {
  store?: RecordingIntentStore;
  engine?: Pick<RecordingEngine, 'pause' | 'resume' | 'stop'>;
  getSession?: () => RecordingSession | null;
  isForeground?: () => boolean;
  now?: () => Date;
};

export async function drainRecordingIntents(
  options?: DrainRecordingIntentsOptions,
): Promise<RecordingIntentOutcome[]>;
```

Rules:

1. Read, parse, dedupe by `id`, sort by `createdAt` then `id`.
2. Invalid records are removed and reported as `invalid`. A duplicate is removed and reported as
   `duplicate`.
3. A record whose `sessionId` does not match the current session is removed as `unknown-session`.
4. A record older than `RECORDING_INTENT_MAX_AGE_MS` is removed as `stale`. A `resume` older than
   `RECORDING_RESUME_MAX_AGE_MS` is removed as `stale`.
5. A `resume` while `isForeground()` is false is kept and reported as `deferred`.
6. Map `pause`, `resume`, `stop` to the engine command. If the engine returns `ok` with the same
   status as before, report `noop`; otherwise `applied`.
7. `rejected` is a `noop`. `not-found` is `unknown-session`. Any other failure is `failed`.
8. Remove the record after every outcome except `deferred`. A `failed` record is not retried; the
   in-app paused or failed view owns recovery.
9. Never throw. Never log content. A batch continues after a failure.
10. The function is not re-entrant; the hook serializes calls. Replay after a crash is safe because
    the engine's status checks are idempotent and operation ids are minted per call.

#### `src/features/recording/controls/liveActivity.ts`

```ts
export type LiveActivityStatus = 'recording' | 'paused';
export type LiveActivityEndStatus = 'completed' | 'interrupted' | 'expired' | 'discarded';

export type LiveActivityPort = {
  isSupported: () => Promise<boolean>;
  start: (input: {
    sessionId: string;
    status: LiveActivityStatus;
    startedAt: string;
    scheduledEnd: string;
  }) => Promise<boolean>;
  update: (input: { status: LiveActivityStatus; updatedAt: string }) => Promise<boolean>;
  end: (input: { status: LiveActivityEndStatus }) => Promise<void>;
};

export function createLiveActivityPort(
  load?: () => Promise<RecordingControlsNativeModule | null>,
): LiveActivityPort;

export const liveActivityPort: LiveActivityPort;
```

- Non-iOS returns `false` or a no-op before loading the module.
- Native errors become `false` or a no-op; nothing is logged.

#### `src/features/recording/controls/useRecordingControls.ts`

```ts
export function useRecordingControls(options?: {
  host?: RecordingHost;
  store?: RecordingIntentStore;
  activity?: LiveActivityPort;
}): void;
```

- One serial queue per hook instance wraps drain and surface sync.
- Runs on mount, on `AppState` `active`, and on a native `onRecordingIntent` event.
- On foreground, calls `consumePendingResume()`; when true, calls `enqueueIntent('resume')`, then
  drains. This is the Android launch-resume path.
- Subscribes to `useSessionStore`. On session id or status change it calls `setActiveSession(id)` for
  `recording` or `paused`, otherwise `setActiveSession(null)`.
- On `paused`, calls `showPausedNotification(session.id)`; on every other status, calls
  `hidePausedNotification()`. Both are no-ops on iOS.
- Activity sync: `recording` starts or updates "Recording"; `paused` starts or updates "Paused";
  `transcribing`, `analyzing`, `awaiting clarification`, `generating`, `ready` end `completed`;
  `failed` ends `interrupted`; `expired` ends `expired`; `discarded` ends `discarded`; `scheduled`
  and `null` end any activity this process started. `startedAt` is `actualStart` or `createdAt`;
  `scheduledEnd` is the session field.
- Dedupes with a `{ sessionId, status }` ref. Does not end the activity on unmount; listeners are
  removed and the activity survives.
- Swallows every native error.

#### `src/features/recording/controls/index.ts`

Re-exports the types and functions above.

### Acceptance scenarios

The Part 1 rows of the top-level acceptance list (1-19).

### Definition of Done

- The wrapper, schema, store, drain, port, hook, and index exist with the signatures above.
- Every Part 1 scenario has a test at its named seam.
- `npx jest __tests__/recording/controls --runInBand`, `npx tsc --noEmit`, and Prettier pass.

## Part 2 - iOS Live Activity

Status: Planned. Depends on Part 0 and Part 1.

### Technical contract

- `targets/recording-activity/expo-target.config.js` is the final config from Part 0 with
  `deploymentTarget: '17.0'`.
- `targets/_shared/RecordingActivityAttributes.swift`:

  ```swift
  import ActivityKit

  struct RecordingActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
      var status: String      // "recording" or "paused"
      var startedAt: String   // ISO-8601 UTC
      var updatedAt: String
      var scheduledEnd: String
    }
    var sessionId: String
  }
  ```

- `targets/_shared/RecordingIntentQueue.swift`:

  ```swift
  enum RecordingIntentQueue {
    static let appGroup = "group.com.daytale.app"
    static let pendingKey = "daytale.pendingRecordingIntents"
    static let activeSessionKey = "daytale.activeRecordingSessionId"
    static let maxRecords = 32
    static func setActiveSessionId(_ id: String?)
    static func activeSessionId() -> String?
    static func append(kind: String)
    static func read() -> [[String: Any]]
    static func remove(ids: [String])
  }
  ```

  `append` reads the active session, mints a lowercase UUID and an ISO-8601 UTC timestamp, writes
  `source: "ios-activity"`, dedupes by id, and caps at 32. It does nothing without an active session.
  All reads and writes use the App Group `UserDefaults`. No logging.

- `targets/_shared/RecordingControlIntents.swift`:

  ```swift
  import AppIntents
  import ActivityKit

  @available(iOS 17.0, *)
  struct PauseRecordingIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Pause recording"
    static var openAppWhenRun: Bool = false
    func perform() async throws -> some IntentResult {
      RecordingIntentQueue.append(kind: "pause")
      NotificationCenter.default.post(name: .daytaleRecordingIntent, object: nil)
      return .result()
    }
  }
  ```

  `ResumeRecordingIntent` is identical with `kind: "resume"` and `openAppWhenRun = true`.
  `StopRecordingIntent` uses `kind: "stop"`, `openAppWhenRun = false`, posts the notification, and
  best-effort ends every `Activity<RecordingActivityAttributes>` with `.immediate`.
  `Notification.Name.daytaleRecordingIntent` is declared here.

- `targets/recording-activity/RecordingActivityWidget.swift`:

  - `@main struct RecordingActivityWidgetBundle: WidgetBundle`.
  - `ActivityConfiguration(for: RecordingActivityAttributes.self)`.
  - Lock Screen view: "Daytale" caption, "Recording" or "Paused" headline, an elapsed timer, and
    buttons. While recording: Pause and Stop. While paused: Resume and Stop.
  - Dynamic Island expanded: the status and the same two buttons. Compact and minimal: status icon
    only, no buttons.
  - Every button uses `Button(intent:)`, a `Label` with a text title, and an explicit
    `.accessibilityLabel`.
  - No transcript, journal, prompt, speaker, or audio path. No `widgetURL`.

- `modules/recording-controls/ios/RecordingControls.podspec`:

  - `s.name = 'DaytaleRecordingControls'`, `s.platforms = { :ios => '17.0' }`,
    `s.static_framework = true`, `s.dependency 'ExpoModulesCore'`.
  - `s.source_files = "**/*.{h,m,swift}", "../../targets/_shared/RecordingActivityAttributes.swift",
    "../../targets/_shared/RecordingIntentQueue.swift"`.
  - If CocoaPods rejects the relative paths, duplicate the two files into the module with identical
    content and record the build result. This is a packaging detail, not a second design.

- `modules/recording-controls/ios/RecordingControlsModule.swift`:

  ```swift
  public class RecordingControlsModule: Module {
    public func definition() -> ModuleDefinition {
      Name("DaytaleRecordingControls")
      Events("onRecordingIntent")
      Function("isLiveActivitySupported") { ActivityAuthorizationInfo().areActivitiesEnabled }
      AsyncFunction("setActiveSession") { (sessionId: String?) in /* queue */ }
      AsyncFunction("startLiveActivity") { (sessionId: String, status: String, startedAt: String,
        scheduledEnd: String) -> Bool in /* Activity.request(pushType: nil) */ }
      AsyncFunction("updateLiveActivity") { (status: String, updatedAt: String) -> Bool in }
      AsyncFunction("endLiveActivity") { (status: String) in }
      AsyncFunction("readPendingIntents") { () -> [[String: Any]] in }
      AsyncFunction("removePendingIntents") { (ids: [String]) in }
      AsyncFunction("showPausedNotification") { (_: String) in }
      AsyncFunction("hidePausedNotification") { () in }
      AsyncFunction("consumePendingResume") { () -> Bool in false }
      AsyncFunction("enqueueIntent") { (kind: String) in /* queue.append */ }
      OnCreate { /* NotificationCenter observer -> sendEvent("onRecordingIntent", [:]) */ }
      OnDestroy { /* remove observer, clear activity reference */ }
    }
  }
  ```

  `startLiveActivity` ends any existing activity, builds
  `ActivityContent(state: ContentState(...), staleDate: parsed scheduledEnd)`, requests with
  `pushType: nil`, and returns `true`; any error returns `false`. `updateLiveActivity` uses the
  stored activity or `Activity<RecordingActivityAttributes>.activities.first`; no activity returns
  `false`. `endLiveActivity` ends all matching activities; `.immediate` for `discarded`, `expired`,
  and `interrupted`, `.default` for `completed`. No logging.

- `modules/recording-controls/expo-module.config.json` adds the Apple module.

- `app.json` keeps `NSSupportsLiveActivities`, the App Group entitlement, and `appleTeamId`.

### Acceptance scenarios

The iOS rows of the top-level acceptance list (20-22) and D2, D3, D7, D8.

### Definition of Done

- The target, shared files, widget, podspec, module, and config exist as specified.
- `npx expo prebuild -p ios --no-install --clean` still succeeds and the target is present.
- A signed EAS dev build installs and the activity starts, updates, and ends.
- The device items D2, D3, D7, D8 pass.

## Part 3 - Android notification

Status: Planned. Depends on Part 0 and Part 1.

### Decision

Option A: native surfaces never stop audio. Pause and Stop append an intent record; the JS drain
applies `engine.pause()` or `engine.stop()`. The receiver never calls `stopRecording`, never calls
`startService`, and never posts or hides a recording notification. `stopAudioIfRunning` is removed
entirely.

Why the alternatives lose:

- Option B (native Stop only) leaves the same external-stop hazard on the privacy-critical Stop
  path: the engine may still hold an open `capture` and an active chunk row when `settle()` runs,
  and this spec would need a recovery contract the engine does not have.
- Option C (both native stops plus an engine change) edits `engine.ts` and adds an
  externally-stopped state to the recorder lifecycle only to win latency that the drain already
  provides whenever JS is alive. It is more code and more state for no correctness gain.
- Option A keeps one owner for the recorder and the chunk. When JS is alive, the drain applies the
  action immediately. When JS is gone, the record waits and the surface keeps showing the last
  persisted state. No action ever starts recording from the background.

The config-plugin patch remains because expo-audio's notification is the only Android recording
surface and its default Stop action calls native `stopRecording()` outside the command layer. The
patch replaces that action with a broadcast to `RecordingActionReceiver`, which writes a record only.
The service's `expo.modules.audio.action.STOP_RECORDING` handler stays for the engine's own JS stop
path.

When the drain applies pause or stop, the engine stops the recorder and the foreground service
likely stops with it. The recording notification then disappears. On pause, the hook posts a plain
paused notification with Resume and Stop; it is not a foreground service, and it is the only way to
keep Resume available while nothing is capturing.

### Technical contract

- `package.json` pins `"expo-audio": "57.0.5"` exactly. Add
  `"./modules/recording-controls/plugin/withRecordingService"` to `app.json` plugins.
- The format glob becomes `"modules/**/*.{ts,js,cjs,mjs}"`; `.eslintrc.cjs` adds a Node override for
  `modules/recording-controls/plugin/**`.

#### `modules/recording-controls/android/patch/AudioRecordingService.kt`

A full checked-in replacement for
`node_modules/expo-audio/android/src/main/java/expo/modules/audio/service/AudioRecordingService.kt`
at 57.0.5. Keep the package, class name, recorder lifecycle, channel
`expo_audio_recording_channel`, notification id 2001, `CATEGORY_SERVICE`, `setOngoing(true)`, and
`setSilent(true)`. Change only:

- `VISIBILITY_SECRET` becomes `VISIBILITY_PUBLIC`; the notification is content-free, and lock screen
  actions require visibility.
- Title "Daytale", text "Recording your voice journal".
- Actions become Pause and Stop, both `PendingIntent.getBroadcast` to
  `expo.modules.recordingcontrols.RecordingActionReceiver` with request codes 2101 and 2102,
  `FLAG_IMMUTABLE or FLAG_UPDATE_CURRENT`, and package-scoped intents.
- The Pause action sends `expo.modules.recordingcontrols.action.PAUSE`; Stop sends
  `expo.modules.recordingcontrols.action.STOP`.
- The notification no longer calls `stopRecording()` directly. The existing
  `expo.modules.audio.action.STOP_RECORDING` handler remains for the JS stop path only.
- No `daytale.audio_service_running` flag is written; nothing reads it.

#### `modules/recording-controls/plugin/withRecordingService.js`

```js
const { withDangerousMod } = require('@expo/config-plugins');
const { copyPatchedService } = require('./audio-service.cjs');

module.exports = function withRecordingService(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      copyPatchedService(config.modRequest.projectRoot);
      return config;
    },
  ]);
};
```

`audio-service.cjs` exports `copyPatchedService(projectRoot)` and
`assertAudioServiceSource(source, expectedHash)`. It:

- Reads `node_modules/expo-audio/package.json` and throws unless the version is `57.0.5`.
- Reads `modules/recording-controls/plugin/expected-audio-service.sha256` and hashes the upstream
  `AudioRecordingService.kt`; a mismatch throws with both hashes.
- Copies `modules/recording-controls/android/patch/AudioRecordingService.kt` over the upstream file.
- Never runs outside `android` prebuild.

The builder computes the hash from a pristine `npm ci` and commits it. The value is intentionally not
written in this spec because it must match the installed file exactly.

#### `modules/recording-controls/android/src/main/java/expo/modules/recordingcontrols/RecordingIntentQueue.kt`

```kotlin
object RecordingIntentQueue {
  const val PREFS = "daytale_recording_controls"
  const val PENDING_KEY = "pending_recording_intents"
  const val ACTIVE_SESSION_KEY = "active_recording_session_id"
  const val MAX_RECORDS = 32
  fun setActiveSession(context: Context, sessionId: String?)
  fun activeSession(context: Context): String?
  fun append(context: Context, kind: String, source: String = "android-notification"): Map<String, String>?
  fun read(context: Context): List<Map<String, Any>>
  fun remove(context: Context, ids: List<String>)
}
```

`append` returns the new record, or `null` without an active session. Use a process-wide lock around
the read-modify-write. JSON uses `org.json.JSONArray` and `JSONObject`.

#### `RecordingActionReceiver.kt`

```kotlin
class RecordingActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val kind = when (intent.action) {
      RecordingNotifications.ACTION_PAUSE -> "pause"
      RecordingNotifications.ACTION_STOP -> "stop"
      else -> return
    }
    val record = RecordingIntentQueue.append(context, kind) ?: return
    context.sendBroadcast(
      Intent(RecordingControlsModule.ACTION_INTENT_ADDED)
        .setPackage(context.packageName)
        .putExtras(Bundle().apply { record.forEach { (k, v) -> putString(k, v) } })
    )
  }
}
```

The receiver only writes the record and wakes a live JS runtime. It does not touch the recorder, the
session database, or any notification.

#### `RecordingNotifications.kt`

```kotlin
object RecordingNotifications {
  const val PAUSED_ID = 2002
  const val CHANNEL_ID = "daytale_recording_controls"
  const val ACTION_PAUSE = "expo.modules.recordingcontrols.action.PAUSE"
  const val ACTION_STOP = "expo.modules.recordingcontrols.action.STOP"
  fun showPaused(context: Context, sessionId: String)
  fun hidePaused(context: Context)
}
```

- Channel `daytale_recording_controls`, `IMPORTANCE_LOW`, no sound or vibration.
- Paused notification: title "Daytale", text "Recording paused", `setOngoing(true)`,
  `setSilent(true)`, `VISIBILITY_PUBLIC`, `setOnlyAlertOnce(true)`, `CATEGORY_SERVICE`,
  `setShowWhen(false)`.
- Resume action: `PendingIntent.getActivity` to `MainActivity` with
  `FLAG_ACTIVITY_SINGLE_TOP or FLAG_ACTIVITY_NEW_TASK`, extra
  `daytale.recordingAction = "resume"`, request code 2201.
- Stop action: `PendingIntent.getBroadcast` to `RecordingActionReceiver` with `ACTION_STOP`,
  request code 2202.
- Content intent: the same resume intent, so tapping the body opens the app.
- `hidePaused` cancels id 2002. No transcript or journal copy.
- `stopAudioIfRunning` is removed; no function in this object touches the recorder.

#### `RecordingControlsModule.kt`

```kotlin
class RecordingControlsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DaytaleRecordingControls")
    Events("onRecordingIntent")
    AsyncFunction("isLiveActivitySupported") { false }
    AsyncFunction("setActiveSession") { sessionId: String? -> /* queue */ }
    AsyncFunction("startLiveActivity") { /* ... */ -> false }
    AsyncFunction("updateLiveActivity") { /* ... */ -> false }
    AsyncFunction("endLiveActivity") { /* ... */ -> Unit }
    AsyncFunction("readPendingIntents") { RecordingIntentQueue.read(context) }
    AsyncFunction("removePendingIntents") { ids: List<String> -> /* queue */ }
    AsyncFunction("showPausedNotification") { sessionId: String ->
      RecordingNotifications.showPaused(context, sessionId)
    }
    AsyncFunction("hidePausedNotification") { RecordingNotifications.hidePaused(context) }
    AsyncFunction("consumePendingResume") { /* reads and clears the launch extra */ }
    AsyncFunction("enqueueIntent") { kind: String ->
      RecordingIntentQueue.append(context, kind, "android-notification")
    }
    OnCreate { /* register the ACTION_INTENT_ADDED receiver, non-exported */ }
    OnDestroy { /* unregister */ }
  }
}
```

- `ACTION_INTENT_ADDED = "expo.modules.recordingcontrols.INTENT_ADDED"`.
- The internal receiver sends `sendEvent("onRecordingIntent", record)`.
- `consumePendingResume` reads `appContext.currentActivity?.intent?.getStringExtra(
  "daytale.recordingAction")`, removes it, and returns `true` for `"resume"`. Whether `onNewIntent`
  refreshes the intent is UNVERIFIED; D4 covers it.

#### Manifest

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
  <application>
    <receiver
      android:name=".RecordingActionReceiver"
      android:exported="false" />
  </application>
</manifest>
```

`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, and `RECORD_AUDIO` stay owned by the
expo-audio plugin; do not duplicate them.

### Acceptance scenarios

The Android rows of the top-level acceptance list (23) and D4, D5, D9, D10.

### Definition of Done

- The patch, plugin, hash guard, receiver, paused notification, module, and manifest exist.
- `npx expo prebuild -p android --no-install --clean` succeeds; the patch is applied; the merged
  manifest contains the receiver; an assembled dev build installs.
- Pause and Stop are applied only by the drain. No action stops audio or starts recording outside
  the engine, and no action starts recording from the background.
- When JS is dead, the record waits and the surface keeps the last persisted state; it never claims
  a pause or stop that has not been applied.
- Resume opens the app and resumes; D4, D5, D9, D10 pass.

## Part 4 - Wiring, gating, and docs

Status: Planned. Depends on Parts 1-3.

### Technical contract

- `app/(tabs)/_layout.tsx` imports `useRecordingControls` from
  `../../src/features/recording/controls` and calls it before `useRecordingReconciliation()`.
- `__tests__/features/recording-wiring.test.tsx` mocks the controls module and asserts the hook is
  called alongside the existing reconciliation hooks.
- iOS capability gating: `isLiveActivitySupported()` false means no start, update, or end, with no
  error and no user-facing message. This covers Settings > Live Activities disabled.
- Android capability gating: the hook posts and hides the paused notification; the recording
  notification is owned by expo-audio and appears only while capture runs. The existing
  onboarding/settings notification permission flow stays the owner of `POST_NOTIFICATIONS`. This
  ticket does not request it again and does not block recording when it is denied.
- The only doc change is this spec. Do not edit `Docs/03-SPEC.md`; its rule is already the governing
  constraint. The supervisor copies the progress note below into `Docs/06-PROGRESS.md` and updates
  `Docs/05-TICKETS.md`.
- The builder must not add `expo-task-manager`, `getLastNotificationResponseAsync`, or a second
  foreground service.

### Acceptance scenarios

The wiring and gating rows of the top-level acceptance list (17, 19, 24), plus the full gate.

### Definition of Done

- The tabs layout mounts the hook; the wiring test passes.
- `npm run check` is green with the final suite and test counts recorded.
- The progress ledger note is handed to the supervisor and the ticket is not marked Verified until
  D1-D10 pass.

## Progress ledger note

The supervisor owns `Docs/06-PROGRESS.md` and `Docs/05-TICKETS.md`. Copy this text into the progress
ledger when the spec is accepted:

> 2026-11-06: DYT-010 native recording controls planned. Native Swift/Kotlin is justified under
> Docs/03-SPEC.md:119-121 by a demonstrated device gap: expo-audio's Android foreground notification
> exposes only Stop and its action calls native stopRecording() outside the JS command layer, and
> iOS has no Lock Screen or Dynamic Island control surface. Every system action becomes a persisted,
> content-free intent record drained into recordingHost.engine's idempotent pause/resume/stop. Part 0
> is a hard gate on @bacons/apple-targets@5.0.0 and SDK 57 prebuild. The physical-device matrix is
> still required before Verified.
