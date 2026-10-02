import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const requiredRoutes = [
  'app/_layout.tsx',
  'app/index.tsx',
  'app/(tabs)/_layout.tsx',
  'app/(tabs)/today.tsx',
  'app/(tabs)/journal/_layout.tsx',
  'app/(tabs)/journal/index.tsx',
  'app/(tabs)/journal/detail.tsx',
  'app/(tabs)/journal/edit.tsx',
  'app/(tabs)/settings/_layout.tsx',
  'app/(tabs)/settings/index.tsx',
  'app/(tabs)/settings/schedule.tsx',
  'app/(tabs)/settings/languages.tsx',
  'app/(tabs)/settings/privacy.tsx',
  'app/onboarding.tsx',
  'app/voice-setup.tsx',
];

const missingRoutes = requiredRoutes.filter((route) => !existsSync(resolve(projectRoot, route)));

if (missingRoutes.length > 0) {
  console.error('Missing required routes:');
  for (const route of missingRoutes) console.error(`- ${route}`);
  process.exitCode = 1;
} else {
  console.log(`Route smoke check passed (${requiredRoutes.length} routes).`);
}
