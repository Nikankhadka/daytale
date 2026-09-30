# AGENTS.md

Daytale: private, device-first daily journaling app. Single Expo package (not a monorepo).

## Commands
- Install: `npm ci && npm ci --prefix service/journal-api` (Node 22 / npm 10 per .nvmrc + package.json engines; CI installs both the same way).
- Full gate, fixed order: `npm run check` = format -> lint -> typecheck -> jest -> check:docs -> check:routes -> check:service (journal API typecheck + node:test).
- Single test: `npx jest __tests__/<file>.test.ts --runInBand` (e.g. `routes.test.ts`).
- Format fix: `npm run format:write`. Run app: `npm start`.
- CI (.github/workflows/ci.yml) runs both installs then `npm run check` on push to main, feat/**, fix/** and every PR. Keep the chain green.

## Native build gotcha
- Requires an EAS dev-client build (`eas build --profile development --platform ios|android`). Expo Go will NOT work: app.json enables expo-sqlite SQLCipher, @siteed/sherpa-onnx.rn, expo-audio background recording, expo-secure-store, expo-notifications - native modules Expo Go lacks.

## Architecture you must respect
- File-based routes under `app/`, typedRoutes on. check:routes enforces app/_layout.tsx, app/index.tsx, app/(tabs)/_layout.tsx, app/(tabs)/{today,journal,settings}.tsx. Do not rename/remove them without updating scripts/check-routes.mjs.
- `src/navigation/routes.ts` is the source of truth for tab paths and onboarding routing (routeForOnboardingState). Reuse it; never hardcode route strings.
- Storage lives only in `src/storage/`. database.ts owns daytale.db (`PRAGMA key`, `foreign_keys ON`, applyMigrations). bootstrap.ts is a singleton with a generation guard; it hydrates the zustand session store (`src/state/session.ts`) and preferences before the root layout renders. Feature code reads state, not SQLite directly.
- Root gate: app/_layout.tsx blocks on bootstrapStorage + useDaytaleFonts (loading / error-retry), then renders Stack with headerShown false. Preserve this.

## Platform forks
- `.web.ts` files are the web fallback where SecureStore/SQLite are unavailable (bootstrap.web.ts, deleteData.web.ts). When changing bootstrap.ts or deleteData.ts, mirror the web fork.

## Docs, visuals, env
- Canonical docs: Docs/01-PRD.md .. 06-PROGRESS.md. Each requirement lives in exactly one doc - link to the owner, do not duplicate.
- Visual, copy, and token authority is prototype/index.html + prototype/tokens.css only. The Docs design PNG is non-authoritative.
- check:docs fails on TODO/TBD/FIXME in README/Docs and on broken relative md links. Never leave those markers.
- Env: only `EXPO_PUBLIC_*` values (bundled - never secrets). Copy .env.example to .env.local only when needed; .env.local is gitignored.

## Code conventions
- Strict TS (`tsc --noEmit`), ESLint (eslint-config-expo), Prettier singleQuote, trailingComma all, printWidth 100.
- Tests: jest-expo, testMatch `__tests__/**/*.test.[jt]s?(x)`; reanimated mocked via `__tests__/reanimatedMock.ts`.
- Feature slices in `src/features/<name>/`, shared UI in `src/shared/ui/`, theme in `src/theme/`. Match this structure.
