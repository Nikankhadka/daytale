import type { Language } from '../../storage/types';

export type WhisperLanguageOption = Language | 'auto';

// Devanagari letters only: independent vowels and consonants plus the letter-like signs. The
// danda (U+0964), its double, and the digits (U+0966-U+096F) are punctuation and numerals.
const DEVANAGARI_LETTER = /[ऄ-हऽॐक़-ॡॱ-ॿ]/;
// Anything that can be read as words: Latin letters, digits, or Devanagari letters.
const SPEECH_CONTENT = /[A-Za-z0-9]|[ऄ-हऽॐक़-ॡॱ-ॿ]/;

/** Deterministic per-segment tag: any Devanagari letter means Nepali, everything else English. */
export function tagLanguage(text: string): Language {
  return DEVANAGARI_LETTER.test(text) ? 'ne' : 'en';
}

/**
 * False for empty, punctuation-only or untaggable-script text. Transcript rows only hold en/ne,
 * so text that is neither (for example a stray CJK caption hallucination) carries nothing usable.
 */
export function hasSpeechContent(text: string): boolean {
  return SPEECH_CONTENT.test(text);
}

/** Pins whisper to the one language the user speaks; otherwise lets it detect per chunk. */
export function whisperLanguageOption(spoken: readonly Language[]): WhisperLanguageOption {
  const distinct = [...new Set(spoken)];
  return distinct.length === 1 ? distinct[0] : 'auto';
}

export function isJournalLanguage(code: string | undefined): code is Language {
  return code === 'en' || code === 'ne';
}
