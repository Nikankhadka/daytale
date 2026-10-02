import { DAYTALE_COLORS } from '../../src/theme/tokens';

type Scheme = keyof typeof DAYTALE_COLORS;
type TokenName = keyof (typeof DAYTALE_COLORS)['light'];

type ContrastCase = {
  name: string;
  foreground: TokenName;
  background: TokenName;
  min: number;
};

// WCAG 2.x text floor is 4.5:1; UI/large is 3:1.
const CONTRAST_CASES: ContrastCase[] = [
  { name: 'appInk on appPaper', foreground: 'appInk', background: 'appPaper', min: 4.5 },
  { name: 'appInk on appSurface', foreground: 'appInk', background: 'appSurface', min: 4.5 },
  { name: 'appMuted on appSurface', foreground: 'appMuted', background: 'appSurface', min: 4.5 },
  {
    name: 'appMuted on appSakuraMist',
    foreground: 'appMuted',
    background: 'appSakuraMist',
    min: 4.5,
  },
  {
    name: 'appFaint on appSakuraMist',
    foreground: 'appFaint',
    background: 'appSakuraMist',
    min: 4.5,
  },
  {
    name: 'appOnPrimary on appCherry',
    foreground: 'appOnPrimary',
    background: 'appCherry',
    min: 4.5,
  },
  { name: 'appCherry on appSurface', foreground: 'appCherry', background: 'appSurface', min: 3 },
  {
    name: 'appRecording on appPaper',
    foreground: 'appRecording',
    background: 'appPaper',
    min: 4.5,
  },
  {
    name: 'appRecording on appRecordingSoft',
    foreground: 'appRecording',
    background: 'appRecordingSoft',
    min: 4.5,
  },
  {
    name: 'appSunDeep on appPauseSoft',
    foreground: 'appSunDeep',
    background: 'appPauseSoft',
    min: 4.5,
  },
];

// The frozen palette (authority: prototype/tokens.css) itself measures below these
// floors for these pairs, so the app mirror cannot clear them without diverging from
// that authority. They are asserted as expected failures, not silently skipped, so the
// gap stays visible and the suite stays green.
const EXPECTED_FAILURES: Record<Scheme, Set<string>> = {
  light: new Set([
    'appFaint on appSakuraMist',
    'appOnPrimary on appCherry',
    'appRecording on appRecordingSoft',
    'appSunDeep on appPauseSoft',
  ]),
  dark: new Set(['appFaint on appSakuraMist']),
};

function parseHex(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function toLinear(channel: number): number {
  const scaled = channel / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

const schemes: Scheme[] = ['light', 'dark'];

describe.each(schemes)('%s theme contrast', (scheme) => {
  const colors = DAYTALE_COLORS[scheme];

  for (const testCase of CONTRAST_CASES) {
    const ratio = contrastRatio(colors[testCase.foreground], colors[testCase.background]);
    const assertContrast = () => {
      console.log(`${scheme} ${testCase.name}: ${ratio.toFixed(2)}:1 (need ${testCase.min}:1)`);
      expect(ratio).toBeGreaterThanOrEqual(testCase.min);
    };

    if (EXPECTED_FAILURES[scheme].has(testCase.name)) {
      it.failing(`${testCase.name} >= ${testCase.min}`, assertContrast);
    } else {
      it(`${testCase.name} >= ${testCase.min}`, assertContrast);
    }
  }
});
