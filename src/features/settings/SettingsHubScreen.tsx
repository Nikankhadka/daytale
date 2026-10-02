import { useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { SETTINGS_ROUTE_PATHS } from '../../navigation/routes';
import {
  Card,
  Eyebrow,
  ListRow,
  RowDivider,
  ScreenHeading,
  SubText,
} from '../../shared/ui/primitives';
import { SwitchRow } from '../../shared/ui/SwitchRow';
import { useSessionStore } from '../../state/session';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';
import type { Language } from '../../storage/types';
import { createDefaultAppPreferences, persistAppPreferences } from '../preferences';

const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', ne: 'Nepali' };

function toLabel(local: string): string {
  const [hour, minute] = local.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function SettingsHubScreen() {
  const router = useRouter();
  const preferences = useSessionStore((state) => state.appPreferences);
  const { colors, typography, radii } = useDaytaleTheme();
  const current = preferences ?? createDefaultAppPreferences();

  const save = (patch: Parameters<typeof persistAppPreferences>[0]) => {
    void persistAppPreferences(patch).catch(() => undefined);
  };

  const languages = current.spokenLanguages.map((language) => LANGUAGE_NAMES[language]).join(', ');

  return (
    <View style={[styles.safe, { backgroundColor: colors.appPaper }]}>
      <View style={styles.body}>
        <Eyebrow>Settings</Eyebrow>
        <ScreenHeading>Your Daytale.</ScreenHeading>

        <Card padded={false}>
          <View style={styles.cardPad}>
            <ListRow
              chevron
              icon="sun"
              onPress={() => router.push(SETTINGS_ROUTE_PATHS.schedule)}
              subtitle={`${toLabel(current.scheduleStartLocal)} - ${toLabel(current.scheduleEndLocal)}`}
              title="Schedule"
            />
          </View>
          <RowDivider />
          <View style={styles.cardPad}>
            <ListRow
              chevron
              icon="spark"
              onPress={() => router.push(SETTINGS_ROUTE_PATHS.languages)}
              subtitle={`${languages} · journal in ${LANGUAGE_NAMES[current.journalLanguage]}`}
              title="Languages"
            />
          </View>
          <RowDivider />
          <View style={styles.cardPad}>
            <ListRow
              chevron
              icon="lock"
              onPress={() => router.push(SETTINGS_ROUTE_PATHS.privacy)}
              subtitle="On-device processing, auto-delete"
              title="Privacy & Data"
            />
          </View>
        </Card>

        <Text style={[typography.heading, styles.section, { color: colors.appInk }]}>
          About you
        </Text>
        <TextInput
          accessibilityLabel="First name"
          onChangeText={(firstName) => save({ firstName: firstName.trim() || undefined })}
          placeholder="First name (optional)"
          placeholderTextColor={colors.appFaint}
          style={[
            styles.input,
            typography.body,
            { borderColor: colors.appLine, borderRadius: radii.control, color: colors.appInk },
          ]}
          defaultValue={current.firstName}
        />

        <Text style={[typography.heading, styles.section, { color: colors.appInk }]}>
          Appearance
        </Text>
        <View style={styles.group}>
          <SwitchRow
            label="Dark mode"
            onValueChange={(dark) => save({ theme: dark ? 'dark' : 'light' })}
            value={current.theme === 'dark'}
          />
          <SwitchRow
            label="Reduce motion"
            onValueChange={(reducedMotion) => save({ reducedMotion })}
            value={current.reducedMotion}
          />
        </View>

        <Card padded={false}>
          <View style={styles.cardPad}>
            <ListRow subtitle="Version 1.0" title="About Daytale" />
          </View>
        </Card>

        <SubText center style={styles.credit}>
          An alarm clock for your life.
        </SubText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, gap: 16, paddingBottom: 24, paddingHorizontal: 24, paddingTop: 22 },
  cardPad: { paddingHorizontal: 14, paddingVertical: 2 },
  section: { marginTop: 8 },
  group: { gap: 10 },
  input: {
    borderWidth: 1.5,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  credit: { marginTop: 'auto' },
});
