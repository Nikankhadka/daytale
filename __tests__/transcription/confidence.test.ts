import {
  LOW_CONFIDENCE_THRESHOLD,
  speechCoverage,
  transcriptConfidence,
  type ConfidenceInput,
} from '../../src/features/transcription/confidence';

function input(overrides: Partial<ConfidenceInput> = {}): ConfidenceInput {
  return {
    text: 'I went to the market and bought some vegetables',
    startMs: 1_000,
    endMs: 5_000,
    speechRegions: [{ startMs: 0, endMs: 6_000 }],
    ...overrides,
  };
}

function distinctWords(count: number): string {
  return Array.from(
    { length: count },
    (_, index) => `word${'abcdefghij'[index % 10]}${index}`,
  ).join(' ');
}

describe('speechCoverage', () => {
  it('is the share of the span inside speech regions', () => {
    expect(speechCoverage(1_000, 5_000, [{ startMs: 0, endMs: 2_000 }])).toBeCloseTo(0.25);
    expect(
      speechCoverage(0, 4_000, [
        { startMs: 0, endMs: 1_000 },
        { startMs: 2_000, endMs: 4_000 },
      ]),
    ).toBeCloseTo(0.75);
  });

  it('counts overlapping regions once and never exceeds 1', () => {
    expect(
      speechCoverage(0, 1_000, [
        { startMs: 0, endMs: 800 },
        { startMs: 500, endMs: 2_000 },
      ]),
    ).toBe(1);
  });

  it('is 0 without regions and handles a zero-length span', () => {
    expect(speechCoverage(0, 1_000, [])).toBe(0);
    expect(speechCoverage(500, 500, [{ startMs: 0, endMs: 1_000 }])).toBe(1);
    expect(speechCoverage(500, 500, [{ startMs: 600, endMs: 1_000 }])).toBe(0);
  });
});

describe('transcriptConfidence', () => {
  it('rates normal, fully voiced speech well above the threshold', () => {
    expect(transcriptConfidence(input())).toBeGreaterThan(0.85);
  });

  it('rates normal Nepali speech the same way', () => {
    expect(
      transcriptConfidence(input({ text: 'म आज बजार गएँ र तरकारी किनें', endMs: 4_000 })),
    ).toBeGreaterThan(0.85);
  });

  it('rates a repeated-word loop below the threshold', () => {
    expect(
      transcriptConfidence(input({ text: 'thank you thank you thank you thank you thank you' })),
    ).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
    expect(transcriptConfidence(input({ text: 'no no no no no no no no' }))).toBeLessThan(
      LOW_CONFIDENCE_THRESHOLD,
    );
  });

  it('rates a long repeated phrase below the threshold even with many distinct words', () => {
    const phrase = 'we went to the old market near the river';
    expect(
      transcriptConfidence(
        input({ text: `so ${phrase} ${phrase} ${phrase} and`, endMs: 40_000, startMs: 0 }),
      ),
    ).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
  });

  it('rates a segment that repeats the previous one below the threshold', () => {
    expect(
      transcriptConfidence(
        input({ text: 'Thanks for watching.', previousText: 'thanks for watching' }),
      ),
    ).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
  });

  it('rates text that barely overlaps detected speech below the threshold', () => {
    expect(
      transcriptConfidence(input({ speechRegions: [{ startMs: 1_000, endMs: 1_600 }] })),
    ).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
    expect(transcriptConfidence(input({ speechRegions: [] }))).toBeLessThan(
      LOW_CONFIDENCE_THRESHOLD,
    );
  });

  it('rates an implausibly fast rate below the threshold', () => {
    expect(
      transcriptConfidence(input({ text: distinctWords(60), startMs: 0, endMs: 2_000 })),
    ).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
    expect(
      transcriptConfidence(
        input({ text: 'this is a perfectly ordinary sentence here', startMs: 0, endMs: 0 }),
      ),
    ).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
  });

  it('rates a long span holding almost no text below the threshold', () => {
    expect(
      transcriptConfidence(
        input({
          text: 'Okay.',
          startMs: 0,
          endMs: 12_000,
          speechRegions: [{ startMs: 0, endMs: 12_000 }],
        }),
      ),
    ).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
  });

  it('keeps short natural utterances above the threshold', () => {
    expect(
      transcriptConfidence(input({ text: 'Yes.', startMs: 1_000, endMs: 1_600 })),
    ).toBeGreaterThan(LOW_CONFIDENCE_THRESHOLD);
  });

  it('penalizes a chunk language outside the journal languages', () => {
    const normal = transcriptConfidence(input());
    const hindi = transcriptConfidence(input({ detectedLanguage: 'hi' }));

    expect(hindi).toBeLessThan(normal);
    expect(hindi).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
    expect(transcriptConfidence(input({ detectedLanguage: 'ne' }))).toBe(normal);
    expect(transcriptConfidence(input({ detectedLanguage: 'en' }))).toBe(normal);
    expect(transcriptConfidence(input({ detectedLanguage: undefined }))).toBe(normal);
  });

  it('scores text without any words as 0 and always stays within 0..1', () => {
    expect(transcriptConfidence(input({ text: '...' }))).toBe(0);
    for (const text of ['a', 'word '.repeat(500), 'x'.repeat(10_000)]) {
      const score = transcriptConfidence(input({ text, endMs: 100_000 }));
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});
