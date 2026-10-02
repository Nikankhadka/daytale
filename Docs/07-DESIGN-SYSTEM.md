# Daytale Design System

This document is the reference for the Daytale design tokens and component conventions. It is the
implementation companion to [03-SPEC](03-SPEC.md), which owns the visual and interaction
requirements. The prototype at [prototype/tokens.css](../prototype/tokens.css) and
[prototype/index.html](../prototype/index.html) remains the sole visual, copy, interaction, and
token authority; this document records how those tokens are mirrored in React Native.

## Consuming the system

All UI reads tokens through one hook: `useDaytaleTheme()` in `src/theme/useDaytaleTheme.ts`. It
returns the active scheme plus the token groups:

```ts
const { scheme, colors, spacing, radii, typography, fontRoles, shadows, motion, reducedMotion } =
  useDaytaleTheme();
```

Rules:

- Never write raw hex, `rgba()`, or magic-number spacing in a component. Add or reuse a token
  instead. The only place colour literals may live is `src/theme/tokens.ts`.
- The prototype expresses colours in OKLCH. React Native has no `oklch()`, so each token is the
  exact sRGB conversion, computed once and stored in `src/theme/tokens.ts`.
- For the prototype's `color-mix()` fills, use `withAlpha(hex, alpha)` from `src/theme/color.ts`.
- Token names mirror the prototype `--color-app-*` names. Prefer the semantic token
  (`appCherry`, `appRecordingSoft`) over a literal description of its appearance.
- Dark mode is a token swap only. Components must not branch on `scheme`.

## Colour tokens

Light and dark values from `prototype/tokens.css`, converted to hex.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `appPaper` | `#FFFFFF` | `#040303` | App background |
| `appSurface` | `#FFFFFF` | `#110D0E` | Cards, tab bar, inputs |
| `appInk` | `#0B0B0B` | `#F8F4F4` | Primary text |
| `appMuted` | `#555555` | `#A0999B` | Secondary text, eyebrows |
| `appFaint` | `#9E9E9E` | `#595355` | Tertiary text, hints |
| `appLine` | `#E4E4E4` | `#2F2629` | Hairline borders |
| `appSakuraMist` | `#FBF2F6` | `#1F181B` | Soft fill, selected chip background |
| `appBlossom` | `#FCE3EE` | `#2B1A1D` | Pink accent fill, mascot disc |
| `appCherry` | `#F75D59` | `#F75D59` | Primary, active tab, focus |
| `appCherryHover` | `#D74745` | `#FD736D` | Primary pressed |
| `appOnPrimary` | `#FFFFFF` | `#040303` | Text on primary |
| `appSun` | `#FFB09B` | `#FFBC9D` | Warm accent |
| `appSunDeep` | `#F47B74` | `#F19485` | Active accents, waveform |
| `appLeaf` | `#569459` | `#8ABD8B` | Success |
| `appLeafSoft` | `#DAEFDA` | `#1E311F` | Success soft fill |
| `appCheek` | `#F19E97` | `#E69399` | Mascot cheek and ears |
| `appRecording` | `#D73337` | `#ED756E` | Recording, destructive, error |
| `appRecordingSoft` | `#FFEDEB` | `#2C1A18` | Destructive soft fill |
| `appPause` | `#BD821A` | `#E4AF72` | Pause, warning |
| `appPauseSoft` | `#FEEFDC` | `#292014` | Pause soft fill |
| `appInkSoft` | `#2E2E2E` | `#DDD5D8` | Softer text on chips and cards |
| `focus` | `#F75D59` | `#F75D59` | Focus ring |

`--color-shell-*` (prototype studio chrome) and `--color-os-*` (device chrome) are not ported; the
shipped app does not render those surfaces.

## Spacing

`DAYTALE_SPACING` mirrors the prototype's eight-step scale.

| Token | Value |
| --- | --- |
| `xs` | 4 |
| `sm` | 8 |
| `md` | 12 |
| `lg` | 16 |
| `xl` | 20 |
| `xxl` | 24 |
| `xxxl` | 32 |
| `huge` | 48 |

## Radii

| Token | Value | Use |
| --- | --- | --- |
| `control` | 12 | Buttons, inputs, chips, check rows |
| `card` | 16 | Cards, panels |
| `pill` | 999 | Status pills |
| `sheet` | 26 | Bottom sheet top corners |

## Typography

Fonts are bundled through `@expo-google-fonts` and loaded by `useDaytaleFonts()` in
`src/theme/fonts.ts`. Prototype roles map to concrete weight files so the family encodes the
weight; no `fontWeight` is set (this avoids Android dropping a custom family for a synthetic
weight).

| Role | Family | Size | Line height | Tracking | Use |
| --- | --- | --- | --- | --- | --- |
| `eyebrow` | IBM Plex Mono 400 | 10.5 | 14 | 1.05 | Screen eyebrow, uppercase |
| `title` | Fredoka 600 | 23 | 29 | -0.23 | Screen heading |
| `titleLarge` | Fredoka 600 | 27 | 34 | -0.27 | Welcome heading |
| `titleSmall` | Fredoka 600 | 19 | 24 | -0.19 | Status and sub-screen heading |
| `heading` | Fredoka 600 | 20 | 25 | | Section heading |
| `body` | Figtree 400 | 15 | 22 | | Body copy |
| `sub` | Figtree 400 | 13.5 | 20 | | Secondary copy |
| `reading` | Newsreader 400 | 16 | 28 | | Journal reading |
| `label` | Figtree 600 | 13.5 | 18 | | Rows, chips, control labels |
| `button` | Figtree 700 | 15 | 20 | | Button labels |
| `chip` | Figtree 600 | 13 | 17 | | Chips and status pills |
| `caption` | Figtree 400 | 12 | 16 | | Captions and hints |
| `fieldLabel` | Figtree 700 | 12 | 16 | 0.24 | Field labels |
| `timer` | IBM Plex Mono 500 | 44 | 50 | 0.9 | Recording timer |
| `monoLabel` | IBM Plex Mono 400 | 11 | 14 | 1.1 | Month and index labels |

## Motion and shadows

`DAYTALE_MOTION` holds the prototype easing curves as cubic-bezier control points for
Reanimated's `Easing.bezier`, plus duration constants (`fast` 120, `normal` 200, `mascotBreath`
1400, `pulse` 700, `waveBase` 600). Looping motion must stop when `reducedMotion` is true.

`DAYTALE_SHADOWS` approximates the prototype's two-layer `--shadow-soft` with a single shadow
plus Android elevation. The inline 1px layer is not portable to React Native.

## Component conventions

- **Buttons** (`PrimaryButton`): primary is `appCherry` with `appOnPrimary` text; ghost is
  transparent with a 1.5px `appLine` border and `appInk` text, pressed to `appSakuraMist`; danger
  is `appRecordingSoft` with `appRecording` text. Minimum height 44, radius `control`.
- **Cards**: `appSurface` fill, 1px `appLine` border, radius `card`.
- **Check rows and chips**: radius `control`, 1.5px border. Selected state uses an `appCherry`
  border with an `appSakuraMist` fill.
- **Inputs**: `appSurface` fill, 1.5px `appLine` border, radius `control`, `label` text.
- **Selects and schedules**: same as inputs, `label` text.
- **Switches**: off track `appLine`, on track `appCherry`, thumb `appSurface`.
- **Bottom sheets**: `appPaper` fill, radius `sheet` on the top corners, scrim
  `withAlpha(appInk, 0.42)`.
- **Tab bar**: `appSurface` fill, 1px `appLine` top border, active `appCherry`, inactive
  `appMuted`, 22px line icons, 10.5px Figtree 600 labels.
- **Lists**: hairline `appLine` separators; bless targets at 44 points or more.

### Shared primitives

Implementation rule: implement each prototype app class once in `src/shared/ui/` and reuse it. Do
not re-implement a row, chip, or field inside a feature.

| Module | Exports | Prototype class |
| --- | --- | --- |
| `src/shared/ui/primitives.tsx` | `Card` | `.a-card` |
| | `ChoiceRow` | `.a-check-row` + `.a-check` |
| | `Chip` | `.a-chip`, `.j-context-chip`, `.j-mini-chip` |
| | `Eyebrow` | `.a-eyebrow` |
| | `SubText` | `.a-sub` |
| | `ScreenHeading` / `SectionHeading` | `.a-h1` / card titles |
| | `FieldLabel` | `.a-field-label` |
| | `ListRow` / `RowDivider` | `.set-row` |
| | `InlineConfirm` | `.inline-confirm` |
| | `ProgressDots` | `.dots` |
| | `StatusPill` | `.rec-pill`, `.pause-pill` |
| `src/shared/ui/Select.tsx` | `Select`, `TimeField`, `buildTimeOptions` | `.a-select` |
| `src/shared/ui/SwitchRow.tsx` | `SwitchRow` | `.a-check-row` + `.switch` |
| `src/shared/ui/uiIcons.tsx` | `UiIcon` | prototype `uiIcon()` glyphs |
| `src/shared/ui/ScreenScaffold.tsx` | `ScreenScaffold`, `PrimaryButton` | `.a-btn`, `.a-btn-primary`, `.a-btn-ghost`, `.a-btn-danger` |

React Native approximations, all sanctioned:

- **Select** opens a modal option list; RN has no native `<select>` and no OS wheel picker is added.
- **Privacy sheet** uses the `.sheet` scrim with opacity only; `filter: blur(2px)` needs `expo-blur`
  and is intentionally not added.
- **Journal edit** uses `TextInput multiline` in place of a `contenteditable` region.
- **Clarification** replaces the prototype `.clar-map` map/place pin with a neutral time card; no
  map, location, or pin is rendered (see [03-SPEC](03-SPEC.md)).
- **Reading width**: the prototype's `.j-read p { max-width: 38ch }` has no `ch` unit in RN and is
  left uncapped.

## Known contrast gaps

The frozen palette itself measures below the WCAG text floor for a few pairs, so the app mirror
cannot clear them without diverging from the prototype. `__tests__/features/theme-contrast.test.ts`
asserts these as expected failures so the gap stays visible. The light scheme cannot clear
`appFaint` on `appSakuraMist`, `appOnPrimary` on `appCherry`, `appRecording` on
`appRecordingSoft`, and `appSunDeep` on `appPauseSoft`. The dark scheme cannot clear `appFaint` on
`appSakuraMist`. All other pairs meet the floor.
