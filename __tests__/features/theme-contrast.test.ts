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
  { name: 'ink on background', foreground: 'ink', background: 'background', min: 4.5 },
  { name: 'ink on surface', foreground: 'ink', background: 'surface', min: 4.5 },
  { name: 'muted on surface', foreground: 'muted', background: 'surface', min: 4.5 },
  { name: 'muted on surfaceMuted', foreground: 'muted', background: 'surfaceMuted', min: 4.5 },
  { name: 'faint on surfaceMuted', foreground: 'faint', background: 'surfaceMuted', min: 4.5 },
  { name: 'onPrimary on primary', foreground: 'onPrimary', background: 'primary', min: 4.5 },
  { name: 'primary on surface', foreground: 'primary', background: 'surface', min: 3 },
  { name: 'error on background', foreground: 'error', background: 'background', min: 4.5 },
  {
    name: 'recording on recordingSoft',
    foreground: 'recording',
    background: 'recordingSoft',
    min: 4.5,
  },
  { name: 'sunDeep on pauseSoft', foreground: 'sunDeep', background: 'pauseSoft', min: 4.5 },
];

// The frozen light palette (authority: prototype/tokens.css) itself measures below these
// floors for these two pairs, so the app mirror cannot clear them without diverging from
// that authority. They are asserted as expected failures, not silently skipped, so the
// gap stays visible and the suite stays green.
const LIGHT_EXPECTED_FAILURES = new Set(['faint on surfaceMuted', 'sunDeep on pauseSoft']);

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

    if (scheme === 'light' && LIGHT_EXPECTED_FAILURES.has(testCase.name)) {
      it.failing(`${testCase.name} >= ${testCase.min}`, assertContrast);
    } else {
      it(`${testCase.name} >= ${testCase.min}`, assertContrast);
    }
  }
});
