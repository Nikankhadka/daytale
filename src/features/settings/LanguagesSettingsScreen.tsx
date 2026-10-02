import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChoiceRow, FieldLabel, SubText } from '../../shared/ui/primitives';
import { Select } from '../../shared/ui/Select';
import { useSessionStore } from '../../state/session';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';
import type { Language } from '../../storage/types';
import { createDefaultAppPreferences, persistAppPreferences } from '../preferences';
import { SettingsFrame } from './frame';

const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', ne: 'Nepali' };
const LANGUAGE_NATIVE: Record<Language, string> = { en: 'English', ne: 'नेपाली' };
const LANGUAGE_FLAGS: Record<Language, string> = { en: '🇬🇧', ne: '🇳🇵' };

export function LanguagesSettingsScreen() {
  const preferences = useSessionStore((state) => state.appPreferences);
  const { colors, typography } = useDaytaleTheme();
  const current = preferences ?? createDefaultAppPreferences();
  const [error, setError] = React.useState<string | undefined>();

  const toggle = (language: Language) => {
    const spokenLanguages = current.spokenLanguages.includes(language)
      ? current.spokenLanguages.filter((item) => item !== language)
      : [...current.spokenLanguages, language];
    if (spokenLanguages.length === 0) {
      setError('Choose at least one spoken language.');
      return;
    }
    setError(undefined);
    const journalLanguage = spokenLanguages.includes(current.journalLanguage)
      ? current.journalLanguage
      : spokenLanguages[0];
    void persistAppPreferences({ spokenLanguages, journalLanguage }).catch(() =>
      setError('That preference could not be saved. Please try again.'),
    );
  };

  const setJournal = (language: Language) => {
    const spokenLanguages = current.spokenLanguages.includes(language)
      ? current.spokenLanguages
      : [...current.spokenLanguages, language];
    setError(undefined);
    void persistAppPreferences({ journalLanguage: language, spokenLanguages }).catch(() =>
      setError('That preference could not be saved. Please try again.'),
    );
  };

  return (
    <SettingsFrame title="Languages">
      <View style={styles.block}>
        <FieldLabel>Spoken languages</FieldLabel>
        {(['en', 'ne'] as Language[]).map((language) => (
          <ChoiceRow
            key={language}
            detail={LANGUAGE_NATIVE[language]}
            label={LANGUAGE_NAMES[language]}
            leading={LANGUAGE_FLAGS[language]}
            onPress={() => toggle(language)}
            selected={current.spokenLanguages.includes(language)}
          />
        ))}
      </View>
      <View style={styles.block}>
        <FieldLabel>Write my journal in</FieldLabel>
        <Select
          accessibilityLabel="Journal language"
          onChange={(value) => setJournal(value as Language)}
          options={current.spokenLanguages.map((language) => ({
            value: language,
            label: `${LANGUAGE_FLAGS[language]} ${LANGUAGE_NAMES[language]}`,
          }))}
          value={current.journalLanguage}
        />
        <SubText>
          {`Daytale still writes one clean journal, in ${LANGUAGE_NAMES[current.journalLanguage]}.`}
        </SubText>
      </View>
      <Text style={[typography.caption, { color: colors.appFaint }]}>
        At least one spoken language stays selected.
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={[typography.label, { color: colors.appRecording }]}>
          {error}
        </Text>
      ) : null}
    </SettingsFrame>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
});
