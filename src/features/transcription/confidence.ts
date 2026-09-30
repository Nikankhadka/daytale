import { isJournalLanguage } from './language';
import type { SpeechRegion } from './whisper';

export const LOW_CONFIDENCE_THRESHOLD = 0.5;

export type ConfidenceInput = {
  text: string;
  /** Chunk-relative span of the segment, in milliseconds. */
  startMs: number;
  endMs: number;
  /** Chunk-relative voiced regions reported by the VAD. */
  speechRegions: readonly SpeechRegion[];
  /** Language whisper reported for the chunk, when it reported one. */
  detectedLanguage?: string;
  /** Text of the segment just before this one in the same chunk. */
  previousText?: string;
};

// Letters per second beyond which a transcript cannot be real speech (fast speech is ~20), and
// below which a long span holds almost nothing (normal pauses are caught by the VAD coverage).
const MAX_CHARS_PER_SECOND = 30;
const MIN_CHARS_PER_SECOND = 1.5;
const SLOW_RATE_MIN_SPAN_MS = 4_000;
// Share of a segment that must be voiced before coverage stops lowering the score.
const FULL_COVERAGE = 0.6;
const FULL_UNIQUE_RATIO = 0.5;
const MIN_WORDS_FOR_UNIQUE_RATIO = 4;
// A loop is one phrase back to back at least this many times, covering at least this many words.
const LOOP_MIN_REPEATS = 3;
const LOOP_MIN_WORDS = 6;
const LOOP_MAX_PHRASE_WORDS = 12;
const LOOP_FACTOR = 0.3;
const REPEATS_PREVIOUS_FACTOR = 0.3;
const ZERO_LENGTH_FACTOR = 0.2;
const OUT_OF_LANGUAGE_FACTOR = 0.5;
// The score is a heuristic, never certainty, so even clean speech stays below 1.
const CEILING = 0.95;

const WORD_SEPARATOR = /[\s.,!?;:"'()[\]{}\-…।॥]+/;

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(WORD_SEPARATOR)
    .filter((word) => word.length > 0);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Fraction of [startMs, endMs] covered by the union of the regions, between 0 and 1. */
export function speechCoverage(
  startMs: number,
  endMs: number,
  regions: readonly SpeechRegion[],
): number {
  if (endMs <= startMs) {
    return regions.some((region) => region.startMs <= startMs && startMs <= region.endMs) ? 1 : 0;
  }
  let covered = 0;
  let cursor = startMs;
  for (const region of [...regions].sort((a, b) => a.startMs - b.startMs)) {
    const from = Math.max(region.startMs, cursor);
    const to = Math.min(region.endMs, endMs);
    if (to > from) {
      covered += to - from;
      cursor = to;
    }
  }
  return clamp01(covered / (endMs - startMs));
}

function hasLoop(words: readonly string[]): boolean {
  const longest = Math.min(LOOP_MAX_PHRASE_WORDS, Math.floor(words.length / LOOP_MIN_REPEATS));
  for (let size = 1; size <= longest; size += 1) {
    for (let start = 0; start + size * LOOP_MIN_REPEATS <= words.length; start += 1) {
      let repeats = 1;
      while (
        start + (repeats + 1) * size <= words.length &&
        words
          .slice(start + repeats * size, start + (repeats + 1) * size)
          .every((word, index) => word === words[start + index])
      ) {
        repeats += 1;
      }
      if (repeats >= LOOP_MIN_REPEATS && repeats * size >= LOOP_MIN_WORDS) {
        return true;
      }
    }
  }
  return false;
}

function rateFactor(text: string, startMs: number, endMs: number): number {
  const spanMs = endMs - startMs;
  if (spanMs <= 0) {
    return ZERO_LENGTH_FACTOR;
  }
  const charsPerSecond = text.replace(/\s/g, '').length / (spanMs / 1_000);
  if (charsPerSecond > MAX_CHARS_PER_SECOND) {
    return (MAX_CHARS_PER_SECOND / charsPerSecond) ** 2;
  }
  if (spanMs >= SLOW_RATE_MIN_SPAN_MS && charsPerSecond < MIN_CHARS_PER_SECOND) {
    return charsPerSecond / MIN_CHARS_PER_SECOND;
  }
  return 1;
}

/**
 * Confidence in [0, 1] that a segment is real speech transcribed faithfully.
 *
 * ponytail: this is a heuristic, because whisper.rn 0.7.4 exposes no token probabilities. The
 * upgrade path is exposing `whisper_full_get_token_p` from the native binding and scoring from
 * the real per-token probabilities, keeping these checks as hallucination guards.
 */
export function transcriptConfidence(input: ConfidenceInput): number {
  const words = wordsOf(input.text);
  if (words.length === 0) {
    return 0;
  }

  let score = CEILING;
  score *= clamp01(speechCoverage(input.startMs, input.endMs, input.speechRegions) / FULL_COVERAGE);
  if (words.length >= MIN_WORDS_FOR_UNIQUE_RATIO) {
    score *= clamp01(new Set(words).size / words.length / FULL_UNIQUE_RATIO) ** 2;
  }
  if (hasLoop(words)) {
    score *= LOOP_FACTOR;
  }
  if (words.length >= 2 && input.previousText !== undefined) {
    if (wordsOf(input.previousText).join(' ') === words.join(' ')) {
      score *= REPEATS_PREVIOUS_FACTOR;
    }
  }
  score *= rateFactor(input.text, input.startMs, input.endMs);
  if (input.detectedLanguage && !isJournalLanguage(input.detectedLanguage)) {
    score *= OUT_OF_LANGUAGE_FACTOR;
  }
  return clamp01(score);
}
