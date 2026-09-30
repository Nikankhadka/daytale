import {
  hasSpeechContent,
  isJournalLanguage,
  tagLanguage,
  whisperLanguageOption,
} from '../../src/features/transcription/language';

describe('tagLanguage', () => {
  it('tags Latin text as English', () => {
    expect(tagLanguage('I went to the market.')).toBe('en');
  });

  it('tags text with Devanagari letters as Nepali', () => {
    expect(tagLanguage('म बजार गएँ।')).toBe('ne');
  });

  it('tags mixed text by the presence of any Devanagari letter', () => {
    expect(tagLanguage('I said नमस्ते to her')).toBe('ne');
  });

  it('does not treat Devanagari punctuation or digits as Nepali text', () => {
    expect(tagLanguage('ok। 123 ०१२')).toBe('en');
  });
});

describe('hasSpeechContent', () => {
  it('is false for empty and punctuation-only text', () => {
    for (const text of ['', '   ', '...', '?!', '।', '- -', '[ ]', '♪']) {
      expect(hasSpeechContent(text)).toBe(false);
    }
  });

  it('is true when a Latin letter, digit or Devanagari letter is present', () => {
    for (const text of ['a', '7', 'म', 'Well...', '(नमस्ते)']) {
      expect(hasSpeechContent(text)).toBe(true);
    }
  });

  it('is false for text in a script the app cannot tag', () => {
    expect(hasSpeechContent('字幕')).toBe(false);
  });
});

describe('whisperLanguageOption', () => {
  it('passes a single spoken language through', () => {
    expect(whisperLanguageOption(['en'])).toBe('en');
    expect(whisperLanguageOption(['ne'])).toBe('ne');
  });

  it('detects the language when both or none are spoken', () => {
    expect(whisperLanguageOption(['en', 'ne'])).toBe('auto');
    expect(whisperLanguageOption(['ne', 'en'])).toBe('auto');
    expect(whisperLanguageOption([])).toBe('auto');
  });
});

describe('isJournalLanguage', () => {
  it('accepts only the languages the app stores', () => {
    expect(isJournalLanguage('en')).toBe(true);
    expect(isJournalLanguage('ne')).toBe(true);
    expect(isJournalLanguage('hi')).toBe(false);
    expect(isJournalLanguage('')).toBe(false);
    expect(isJournalLanguage(undefined)).toBe(false);
  });
});
