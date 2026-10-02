import * as React from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { bootstrapStorage, getBootstrappedStorage } from '../../storage/bootstrap';
import type { StorageBootstrapResult } from '../../storage/bootstrap';
import type { EntityRepository } from '../../storage/repositories';
import { type AppPreferences, validateAppPreferences } from '../../storage/types';
import { useSessionStore } from '../../state/session';
import { PrimaryButton, ScreenScaffold } from '../../shared/ui/ScreenScaffold';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';
import { syncDailyPrompt } from '../recording/notifications';
import { VoiceProfileCard } from '../voice/VoiceProfileCard';
import { deleteAllAppData } from './deleteData';

export const APP_PREFERENCES_ID = '00000000-0000-4000-8000-000000000004';

export type PreferencesRepository = Pick<EntityRepository<AppPreferences>, 'getById' | 'save'>;

export type PreferencesPersistenceDependencies = {
  repository?: PreferencesRepository;
  bootstrap?: () => Promise<StorageBootstrapResult>;
  now?: () => string;
  timezone?: string;
};

export function getDefaultTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function createDefaultAppPreferences(
  now = new Date().toISOString(),
  timezone = getDefaultTimezone(),
): AppPreferences {
  return validateAppPreferences({
    id: APP_PREFERENCES_ID,
    spokenLanguages: ['en'],
    journalLanguage: 'en',
    scheduleStartLocal: '07:00',
    scheduleEndLocal: '21:00',
    timezone,
    notificationsEnabled: false,
    microphonePermissionState: 'undetermined',
    onboardingComplete: false,
    onboardingStage: 'welcome',
    theme: 'light',
    reducedMotion: false,
    createdAt: now,
    updatedAt: now,
  });
}

export type AppPreferencesPatch = Partial<
  Pick<
    AppPreferences,
    | 'firstName'
    | 'spokenLanguages'
    | 'journalLanguage'
    | 'scheduleStartLocal'
    | 'scheduleEndLocal'
    | 'timezone'
    | 'notificationsEnabled'
    | 'microphonePermissionState'
    | 'onboardingComplete'
    | 'onboardingStage'
    | 'theme'
    | 'reducedMotion'
  >
>;

export function mergeAppPreferences(
  current: AppPreferences | null,
  patch: AppPreferencesPatch,
  now = new Date().toISOString(),
  timezone = getDefaultTimezone(),
): AppPreferences {
  const base = current ?? createDefaultAppPreferences(now, timezone);
  return validateAppPreferences({ ...base, ...patch, id: APP_PREFERENCES_ID, updatedAt: now });
}

export async function persistAppPreferences(
  patch: AppPreferencesPatch,
  dependencies: PreferencesPersistenceDependencies = {},
): Promise<AppPreferences> {
  let storage = getBootstrappedStorage();
  let repository = dependencies.repository ?? storage?.repositories?.appPreferences;
  if (!repository && dependencies.repository === undefined) {
    storage = await (dependencies.bootstrap ?? bootstrapStorage)();
    repository = storage.repositories?.appPreferences;
  }

  const current = repository
    ? await repository.getById(APP_PREFERENCES_ID)
    : useSessionStore.getState().appPreferences;
  const next = mergeAppPreferences(
    current ?? useSessionStore.getState().appPreferences,
    patch,
    dependencies.now?.() ?? new Date().toISOString(),
    dependencies.timezone ?? getDefaultTimezone(),
  );
  const saved = repository ? await repository.save(next) : next;
  useSessionStore.getState().setAppPreferences(saved);
  // Onboarding finishing and a schedule change both land here, so one call keeps the daily
  // reminder in step with what was saved. It never throws: a reminder must not fail a save.
  await syncDailyPrompt(saved);
  return saved;
}

export function PreferencesSettingsScreen() {
  const router = useRouter();
  const preferences = useSessionStore((state) => state.appPreferences);
  const { colors, typography } = useDaytaleTheme();
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const current = preferences ?? createDefaultAppPreferences();
  const [scheduleStartLocal, setScheduleStartLocal] = React.useState(current.scheduleStartLocal);
  const [scheduleEndLocal, setScheduleEndLocal] = React.useState(current.scheduleEndLocal);

  const save = async (patch: AppPreferencesPatch) => {
    setSaving(true);
    setError(undefined);
    try {
      await persistAppPreferences(patch);
    } catch {
      setError('That preference could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const deleteData = async () => {
    const storage = getBootstrappedStorage();
    if (!storage) {
      setError('Secure storage is unavailable.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await deleteAllAppData(storage.database);
      router.replace('/onboarding');
    } catch {
      setError('Your data could not be removed. Nothing was changed in this screen.');
    } finally {
      setSaving(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <ScreenScaffold
      title="Settings"
      description="Keep the ritual fitted to your day. Changes are saved on this device."
      error={error}
      loading={saving}
    >
      <Text style={[styles.sectionTitle, typography.heading, { color: colors.appInk }]}>
        Spoken languages
      </Text>
      <View style={styles.rowGroup}>
        {(['en', 'ne'] as const).map((language) => (
          <PreferenceChoice
            key={language}
            label={language === 'en' ? 'English' : 'Nepali'}
            selected={current.spokenLanguages.includes(language)}
            onPress={() => {
              const spokenLanguages = current.spokenLanguages.includes(language)
                ? current.spokenLanguages.filter((item) => item !== language)
                : [...current.spokenLanguages, language];
              if (spokenLanguages.length > 0) {
                void save({ spokenLanguages });
              }
            }}
          />
        ))}
      </View>

      <Text style={[styles.sectionTitle, typography.heading, { color: colors.appInk }]}>
        Journal language
      </Text>
      <View style={styles.rowGroup}>
        {(['en', 'ne'] as const).map((language) => (
          <PreferenceChoice
            key={language}
            label={language === 'en' ? 'English' : 'Nepali'}
            selected={current.journalLanguage === language}
            onPress={() => {
              const spokenLanguages = current.spokenLanguages.includes(language)
                ? current.spokenLanguages
                : [...current.spokenLanguages, language];
              void save({ journalLanguage: language, spokenLanguages });
            }}
          />
        ))}
      </View>

      <Text style={[styles.sectionTitle, typography.heading, { color: colors.appInk }]}>
        About you
      </Text>
      <TextInput
        accessibilityLabel="First name"
        onChangeText={(firstName) => void save({ firstName: firstName.trim() || undefined })}
        placeholder="First name (optional)"
        style={[styles.scheduleInput, typography.label, { color: colors.appInk }]}
        defaultValue={current.firstName}
      />

      <Text style={[styles.sectionTitle, typography.heading, { color: colors.appInk }]}>
        Appearance
      </Text>
      <View style={[styles.switchRow, { borderColor: colors.appLine }]}>
        <Text style={[typography.body, { color: colors.appInk, flex: 1 }]}>Dark mode</Text>
        <Switch
          accessibilityLabel="Dark mode"
          ios_backgroundColor={colors.appLine}
          onValueChange={(darkMode) => void save({ theme: darkMode ? 'dark' : 'light' })}
          thumbColor={colors.appSurface}
          trackColor={{ false: colors.appLine, true: colors.appCherry }}
          value={current.theme === 'dark'}
        />
      </View>
      <View style={[styles.switchRow, { borderColor: colors.appLine }]}>
        <Text style={[typography.body, { color: colors.appInk, flex: 1 }]}>Reduce motion</Text>
        <Switch
          accessibilityLabel="Reduce motion"
          ios_backgroundColor={colors.appLine}
          onValueChange={(reducedMotion) => void save({ reducedMotion })}
          thumbColor={colors.appSurface}
          trackColor={{ false: colors.appLine, true: colors.appCherry }}
          value={current.reducedMotion}
        />
      </View>

      <Text style={[styles.sectionTitle, typography.heading, { color: colors.appInk }]}>
        Schedule
      </Text>
      <View style={styles.scheduleRow}>
        <ScheduleField
          label="Start"
          value={scheduleStartLocal}
          onChangeText={setScheduleStartLocal}
        />
        <ScheduleField label="End" value={scheduleEndLocal} onChangeText={setScheduleEndLocal} />
      </View>
      <Switch
        accessibilityLabel="Schedule reminders"
        ios_backgroundColor={colors.appLine}
        onValueChange={(notificationsEnabled) => void save({ notificationsEnabled })}
        thumbColor={colors.appSurface}
        trackColor={{ false: colors.appLine, true: colors.appCherry }}
        value={current.notificationsEnabled}
      />
      <PrimaryButton
        label="Save schedule"
        onPress={() => void save({ scheduleStartLocal, scheduleEndLocal })}
        secondary
      />

      <VoiceProfileCard />

      <Text style={[styles.sectionTitle, typography.heading, { color: colors.appInk }]}>Data</Text>
      {!confirmingDelete ? (
        <PrimaryButton
          label="Delete all data"
          onPress={() => setConfirmingDelete(true)}
          secondary
        />
      ) : (
        <View accessibilityLabel="Delete all data confirmation">
          <Text style={[typography.body, { color: colors.appRecording }]}>
            This removes journals, recordings, and preferences from this device.
          </Text>
          <PrimaryButton
            label="Confirm delete all data"
            onPress={() => void deleteData()}
            disabled={saving}
          />
          <PrimaryButton label="Cancel" onPress={() => setConfirmingDelete(false)} secondary />
        </View>
      )}
    </ScreenScaffold>
  );
}

function PreferenceChoice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, typography, radii } = useDaytaleTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        backgroundColor: selected ? colors.appSakuraMist : colors.appSurface,
        borderColor: selected ? colors.appCherry : colors.appLine,
        borderRadius: radii.control,
        borderWidth: 1.5,
        paddingHorizontal: 14,
        paddingVertical: 13,
      }}
    >
      <Text style={[typography.label, { color: selected ? colors.appCherry : colors.appInk }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ScheduleField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  const { colors, typography, radii } = useDaytaleTheme();
  return (
    <View style={styles.scheduleField}>
      <Text style={[typography.label, { color: colors.appInk }]}>{label}</Text>
      <TextInput
        accessibilityLabel={`${label} schedule time`}
        keyboardType="numbers-and-punctuation"
        onChangeText={onChangeText}
        style={[
          styles.scheduleInput,
          typography.label,
          { borderColor: colors.appLine, borderRadius: radii.control, color: colors.appInk },
        ]}
        value={value}
      />
    </View>
  );
}

export const SettingsScreen = PreferencesSettingsScreen;
export const SettingsPlaceholder = PreferencesSettingsScreen;

const styles = StyleSheet.create({
  sectionTitle: { marginBottom: 12, marginTop: 24 },
  rowGroup: { gap: 8 },
  scheduleRow: { flexDirection: 'row', gap: 12 },
  scheduleField: { flex: 1 },
  scheduleInput: {
    borderWidth: 1.5,
    marginTop: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  switchRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingVertical: 16,
  },
});
