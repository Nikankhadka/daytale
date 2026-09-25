import * as React from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import type { PreferencesRepository } from '../preferences';
import { persistAppPreferences, type AppPreferencesPatch } from '../preferences';
import { useSessionStore } from '../../state/session';
import { PrimaryButton, ScreenScaffold } from '../../shared/ui/ScreenScaffold';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';
import type { AppPreferences, Language } from '../../storage/types';
import {
  expoPermissionGateway,
  microphonePermissionState,
  type PermissionGateway,
} from '../permissions';

export type OnboardingStep = 'welcome' | 'languages' | 'schedule' | 'privacy' | 'voice';

export type OnboardingScreenProps = {
  repository?: PreferencesRepository;
  permissionGateway?: PermissionGateway;
  now?: () => string;
  timezone?: string;
};

export function getInitialOnboardingStep(preferences: AppPreferences | null): OnboardingStep {
  return preferences?.onboardingComplete ? 'voice' : (preferences?.onboardingStage ?? 'welcome');
}

export function OnboardingScreen({
  repository,
  permissionGateway = expoPermissionGateway,
  now,
  timezone,
}: OnboardingScreenProps = {}) {
  const preferences = useSessionStore((state) => state.appPreferences);
  const { colors, typography } = useDaytaleTheme();
  const bodyStyle = [typography.body, { color: colors.muted }];
  const [step, setStep] = React.useState<OnboardingStep>(() =>
    getInitialOnboardingStep(preferences),
  );
  const [spokenLanguages, setSpokenLanguages] = React.useState<Language[]>(
    preferences?.spokenLanguages ?? ['en'],
  );
  const [firstName, setFirstName] = React.useState(preferences?.firstName ?? '');
  const [journalLanguage, setJournalLanguage] = React.useState<Language>(
    preferences?.journalLanguage ?? 'en',
  );
  const [scheduleStartLocal, setScheduleStartLocal] = React.useState(
    preferences?.scheduleStartLocal ?? '07:00',
  );
  const [scheduleEndLocal, setScheduleEndLocal] = React.useState(
    preferences?.scheduleEndLocal ?? '21:00',
  );
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(
    preferences?.notificationsEnabled ?? false,
  );
  const [microphoneState, setMicrophoneState] = React.useState(
    preferences?.microphonePermissionState ?? 'undetermined',
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  const save = async (patch: AppPreferencesPatch) => {
    setSaving(true);
    setError(undefined);
    try {
      await persistAppPreferences(patch, { repository, now, timezone });
      return true;
    } catch {
      setError('Your choice could not be saved. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const continueLanguages = async () => {
    if (spokenLanguages.length === 0) {
      setError('Choose at least one spoken language.');
      return;
    }
    if (await save({ spokenLanguages, journalLanguage, onboardingStage: 'schedule' })) {
      setStep('schedule');
    }
  };

  const continueSchedule = async () => {
    if (scheduleEndLocal <= scheduleStartLocal) {
      setError('The end time must be later than the start time.');
      return;
    }
    if (
      await save({
        scheduleStartLocal,
        scheduleEndLocal,
        notificationsEnabled,
        onboardingStage: 'privacy',
      })
    ) {
      setStep('privacy');
    }
  };

  const requestPermission = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const response = await permissionGateway.requestRecordingPermissionsAsync();
      const state = microphonePermissionState(response);
      setMicrophoneState(state);
      if (
        await save({
          microphonePermissionState: state,
          onboardingStage: state === 'granted' ? 'voice' : 'privacy',
        })
      ) {
        if (state === 'granted') {
          setStep('voice');
        } else {
          setError('Microphone access was not granted. You can change it in system settings.');
        }
      }
    } catch {
      setError('Microphone permission could not be checked.');
    } finally {
      setSaving(false);
    }
  };

  const requestNotifications = async () => {
    try {
      const response = await permissionGateway.requestNotificationPermissionsAsync();
      const granted = response.granted;
      if (await save({ notificationsEnabled: granted })) {
        if (!granted) {
          setError('Notifications are off. You can try again or continue without reminders.');
        }
      }
    } catch {
      setError('Notification permission could not be checked. You can continue without reminders.');
    }
  };

  const openSystemSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      setError('System settings could not be opened. Please enable microphone access there.');
    }
  };

  const continueWelcome = async () => {
    if (await save({ firstName: firstName.trim() || undefined, onboardingStage: 'languages' })) {
      setStep('languages');
    }
  };

  if (step === 'welcome') {
    return (
      <ScreenScaffold
        title="A quiet little ritual for remembering your day."
        description="Daytale listens only when you invite it, then helps you keep the moments that matter."
        mascotState="sleeping"
        loading={saving}
        error={error}
        footer={
          <PrimaryButton
            label="Get started"
            onPress={() => void continueWelcome()}
            disabled={saving}
          />
        }
      >
        <TextInput
          accessibilityLabel="First name (optional)"
          onChangeText={setFirstName}
          placeholder="First name (optional)"
          style={styles.input}
          value={firstName}
        />
        <Text style={bodyStyle}>Everything stays on this device while you find your rhythm.</Text>
      </ScreenScaffold>
    );
  }

  if (step === 'languages') {
    return (
      <ScreenScaffold
        title="Which languages feel like home?"
        description="Choose the languages you may use while speaking."
        mascotState="waking"
        loading={saving}
        error={error}
        footer={
          <PrimaryButton
            label="Continue"
            onPress={() => void continueLanguages()}
            disabled={saving}
          />
        }
      >
        <LanguageOption
          label="English"
          selected={spokenLanguages.includes('en')}
          onPress={() => toggleLanguage('en')}
        />
        <LanguageOption
          label="नेपाली"
          selected={spokenLanguages.includes('ne')}
          onPress={() => toggleLanguage('ne')}
        />
        <Text style={bodyStyle}>Journal language</Text>
        <LanguageOption
          label="English"
          selected={journalLanguage === 'en'}
          onPress={() => selectJournalLanguage('en')}
          single
        />
        <LanguageOption
          label="नेपाली"
          selected={journalLanguage === 'ne'}
          onPress={() => selectJournalLanguage('ne')}
          single
        />
      </ScreenScaffold>
    );
  }

  if (step === 'schedule') {
    return (
      <ScreenScaffold
        title="When should Daytale make space for you?"
        description="Set a gentle daily window. You can change it later."
        mascotState="ready"
        loading={saving}
        error={error}
        footer={
          <PrimaryButton
            label="Continue"
            onPress={() => void continueSchedule()}
            disabled={saving}
          />
        }
      >
        <TimeField label="Start" value={scheduleStartLocal} onChangeText={setScheduleStartLocal} />
        <TimeField label="End" value={scheduleEndLocal} onChangeText={setScheduleEndLocal} />
        <View style={styles.switchRow}>
          <Text style={bodyStyle}>Remind me in this window</Text>
          <Switch
            accessibilityLabel="Remind me in this window"
            onValueChange={setNotificationsEnabled}
            value={notificationsEnabled}
          />
        </View>
      </ScreenScaffold>
    );
  }

  if (step === 'privacy') {
    return (
      <ScreenScaffold
        title="Privacy and permissions"
        description="Daytale uses the microphone only while you choose to record. Audio stays on this device. If you later enable transcription, transcript text may be sent to the configured transcription service; raw audio is not uploaded by this slice."
        mascotState="listening"
        loading={saving}
        error={error}
      >
        <Text style={bodyStyle}>
          Notifications are optional and only support reminders for your chosen schedule.
        </Text>
        <PrimaryButton
          label={notificationsEnabled ? 'Notifications enabled' : 'Allow notifications'}
          onPress={() => void requestNotifications()}
          disabled={saving}
          secondary
        />
        <PrimaryButton
          label="Allow microphone and continue"
          onPress={() => void requestPermission()}
          disabled={saving}
        />
        {microphoneState === 'denied' || microphoneState === 'blocked' ? (
          <>
            <Text style={bodyStyle}>
              Microphone access is blocked. Open system settings to change it, then retry.
            </Text>
            <PrimaryButton
              label="Open system settings"
              onPress={() => void openSystemSettings()}
              secondary
            />
            <PrimaryButton
              label="Retry microphone permission"
              onPress={() => void requestPermission()}
              secondary
            />
          </>
        ) : null}
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold
      title="Voice setup"
      description="Your microphone is ready. Voice setup arrives in the next slice."
      mascotState="ready"
    >
      <Text style={bodyStyle}>Daytale will not start recording until you choose to record.</Text>
    </ScreenScaffold>
  );

  function toggleLanguage(language: Language) {
    setSpokenLanguages((current) =>
      current.includes(language)
        ? current.filter((item) => item !== language)
        : [...current, language],
    );
  }

  function selectJournalLanguage(language: Language) {
    setJournalLanguage(language);
    setSpokenLanguages((current) =>
      current.includes(language) ? current : [...current, language],
    );
  }
}

function LanguageOption({
  label,
  selected,
  onPress,
  single = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  single?: boolean;
}) {
  const { colors, radii, typography } = useDaytaleTheme();
  return (
    <Pressable
      accessibilityRole={single ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: selected, selected }}
      onPress={onPress}
      style={[
        styles.option,
        { borderColor: selected ? colors.primary : colors.line, borderRadius: radii.control },
      ]}
    >
      <Text style={[typography.body, { color: colors.ink }]}>
        {selected ? '✓ ' : ''}
        {label}
      </Text>
    </Pressable>
  );
}

function TimeField({
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
    <View style={styles.timeField}>
      <Text style={[typography.label, { color: colors.ink }]}>{label}</Text>
      <TextInput
        accessibilityLabel={`${label} time`}
        keyboardType="numbers-and-punctuation"
        onChangeText={onChangeText}
        style={[
          styles.input,
          typography.body,
          { borderColor: colors.line, borderRadius: radii.control, color: colors.ink },
        ]}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  option: { borderWidth: 1, marginBottom: 10, padding: 16 },
  timeField: { marginBottom: 16 },
  input: { borderWidth: 1, marginTop: 6, minHeight: 48, paddingHorizontal: 14 },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
});

export const OnboardingPlaceholder = OnboardingScreen;
