import * as React from 'react';
import type { ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PreferencesRepository } from '../preferences';
import { persistAppPreferences, type AppPreferencesPatch } from '../preferences';
import { useSessionStore } from '../../state/session';
import { DaytaleMascot } from '../../shared/ui/DaytaleMascot';
import {
  Chip,
  ChoiceRow,
  Eyebrow,
  FieldLabel,
  ScreenHeading,
  SubText,
} from '../../shared/ui/primitives';
import { PrimaryButton } from '../../shared/ui/ScreenScaffold';
import { Select, TimeField } from '../../shared/ui/Select';
import { SwitchRow } from '../../shared/ui/SwitchRow';
import { UiIcon } from '../../shared/ui/uiIcons';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';
import type { AppPreferences, Language } from '../../storage/types';
import type { VoiceProfileRepository } from '../../storage/repositories';
import {
  expoPermissionGateway,
  microphonePermissionState,
  type PermissionGateway,
} from '../permissions';
import { VoiceSetupScreen, type VoiceSampleRecorder } from '../voice/VoiceSetupScreen';
import type { SpeakerEmbeddingProvider } from '../voice/enrollment';

export type OnboardingStep = 'welcome' | 'languages' | 'schedule' | 'privacy' | 'voice' | 'ready';

export const READY_AUTO_ADVANCE_MS = 1700;

const LANGUAGE_TAGS: Record<Language, string> = { en: '🇬🇧 English', ne: '🇳🇵 Nepali' };
const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', ne: 'Nepali' };
const LANGUAGE_NATIVE: Record<Language, string> = { en: 'English', ne: 'नेपाली' };
const LANGUAGE_FLAGS: Record<Language, string> = { en: '🇬🇧', ne: '🇳🇵' };

function formatClock12(local: string): string {
  const [hour, minute] = local.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

export type OnboardingScreenProps = {
  repository?: PreferencesRepository;
  permissionGateway?: PermissionGateway;
  voiceProfileRepository?: VoiceProfileRepository;
  speakerProvider?: SpeakerEmbeddingProvider;
  voiceSampleRecorder?: VoiceSampleRecorder;
  now?: () => string;
  timezone?: string;
};

export function getInitialOnboardingStep(preferences: AppPreferences | null): OnboardingStep {
  const stage = preferences?.onboardingStage ?? 'welcome';
  return preferences?.onboardingComplete && stage !== 'ready' ? 'voice' : stage;
}

export function OnboardingScreen({
  repository,
  permissionGateway = expoPermissionGateway,
  voiceProfileRepository,
  speakerProvider,
  voiceSampleRecorder,
  now,
  timezone,
}: OnboardingScreenProps = {}) {
  const preferences = useSessionStore((state) => state.appPreferences);
  const { colors, radii, typography } = useDaytaleTheme();
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

  const continueWelcome = async () => {
    if (await save({ firstName: firstName.trim() || undefined, onboardingStage: 'languages' })) {
      setStep('languages');
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

  const continuePrivacy = async () => {
    setSaving(true);
    setError(undefined);
    let notifications = notificationsEnabled;
    try {
      const response = await permissionGateway.requestNotificationPermissionsAsync();
      notifications = response.granted;
    } catch {
      notifications = false;
    }
    try {
      const response = await permissionGateway.requestRecordingPermissionsAsync();
      const state = microphonePermissionState(response);
      setMicrophoneState(state);
      setNotificationsEnabled(notifications);
      if (
        await save({
          microphonePermissionState: state,
          notificationsEnabled: notifications,
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

  const openSystemSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      setError('System settings could not be opened. Please enable microphone access there.');
    }
  };

  if (step === 'welcome') {
    return (
      <StepFrame
        footer={
          <PrimaryButton
            label="Get Started →"
            onPress={() => void continueWelcome()}
            disabled={saving}
          />
        }
      >
        <Eyebrow>Daytale</Eyebrow>
        <ScreenHeading variant="titleLarge" center style={styles.hero}>
          {'Your day,\nwritten for you.'}
        </ScreenHeading>
        <DaytaleMascot state="ready" />
        <SubText center>You live your day. I&apos;ll remember it.</SubText>
        <View style={styles.trust}>
          <TextInput
            accessibilityLabel="First name (optional)"
            onChangeText={setFirstName}
            placeholder="First name (optional)"
            placeholderTextColor={colors.appFaint}
            style={[
              styles.input,
              typography.body,
              { borderColor: colors.appLine, borderRadius: radii.control, color: colors.appInk },
            ]}
            value={firstName}
          />
          <TrustLine icon="lock" text="Your voice stays on your device." />
          <TrustLine icon="spark" text="Set it once, live your day." />
          <TrustLine icon="journal" text="Turn everyday moments into a journal." />
        </View>
        {error ? (
          <Text
            accessibilityRole="alert"
            style={[typography.label, { color: colors.appRecording }]}
          >
            {error}
          </Text>
        ) : null}
      </StepFrame>
    );
  }

  if (step === 'languages') {
    const active = (['en', 'ne'] as Language[]).filter((language) =>
      spokenLanguages.includes(language),
    );
    return (
      <StepFrame
        footer={
          <PrimaryButton
            label="Continue →"
            onPress={() => void continueLanguages()}
            disabled={saving}
          />
        }
      >
        <ScreenHeading variant="heading">What languages are part of your life?</ScreenHeading>
        <SubText>I&apos;ll understand and transcribe your conversations.</SubText>
        {(['en', 'ne'] as Language[]).map((language) => (
          <ChoiceRow
            key={language}
            detail={LANGUAGE_NATIVE[language]}
            label={LANGUAGE_NAMES[language]}
            leading={LANGUAGE_FLAGS[language]}
            onPress={() => toggleLanguage(language)}
            selected={spokenLanguages.includes(language)}
          />
        ))}
        <View style={styles.block}>
          <FieldLabel>Write my journal in</FieldLabel>
          <Select
            accessibilityLabel="Journal language"
            onChange={(value) => selectJournalLanguage(value as Language)}
            options={active.map((language) => ({
              value: language,
              label: `${LANGUAGE_FLAGS[language]} ${LANGUAGE_NAMES[language]}`,
            }))}
            value={journalLanguage}
          />
          <SubText>
            {`Speak in any of your languages - Daytale still writes one clean journal, in ${
              LANGUAGE_NAMES[journalLanguage]
            }.`}
          </SubText>
        </View>
        {error ? (
          <Text
            accessibilityRole="alert"
            style={[typography.label, { color: colors.appRecording }]}
          >
            {error}
          </Text>
        ) : null}
      </StepFrame>
    );
  }

  if (step === 'schedule') {
    return (
      <StepFrame
        footer={
          <PrimaryButton
            label="Continue →"
            onPress={() => void continueSchedule()}
            disabled={saving}
          />
        }
      >
        <ScreenHeading variant="heading">When should I remember your day?</ScreenHeading>
        <SubText>You can always change this later.</SubText>
        <View style={styles.block}>
          <FieldLabel icon="sun">Start time</FieldLabel>
          <TimeField
            accessibilityLabel="Start time"
            onChange={setScheduleStartLocal}
            value={scheduleStartLocal}
          />
        </View>
        <View style={styles.block}>
          <FieldLabel icon="moon">End time</FieldLabel>
          <TimeField
            accessibilityLabel="End time"
            onChange={setScheduleEndLocal}
            value={scheduleEndLocal}
          />
        </View>
        <SwitchRow
          label="Remind me every morning"
          onValueChange={setNotificationsEnabled}
          value={notificationsEnabled}
        />
        {error ? (
          <Text
            accessibilityRole="alert"
            style={[typography.label, { color: colors.appRecording }]}
          >
            {error}
          </Text>
        ) : null}
      </StepFrame>
    );
  }

  if (step === 'privacy') {
    return (
      <StepFrame
        footer={
          <>
            <PrimaryButton
              label="Allow & Continue →"
              onPress={() => void continuePrivacy()}
              disabled={saving}
            />
            {microphoneState === 'denied' || microphoneState === 'blocked' ? (
              <PrimaryButton
                label="Open system settings"
                onPress={() => void openSystemSettings()}
                secondary
              />
            ) : null}
          </>
        }
      >
        <ScreenHeading variant="heading">
          Take a little privacy break, always on your terms.
        </ScreenHeading>
        <SubText>Here&apos;s exactly how Daytale handles your voice.</SubText>
        <PrivacyCard
          icon="lock"
          text="Speech is transcribed locally wherever possible."
          title="Processed on your device"
        />
        <PrivacyCard
          icon="trash"
          text="Raw audio and transcripts are removed automatically."
          title="Deleted after your journal is written"
        />
        <PrivacyCard
          icon="mic"
          text="Only while a session you started is active."
          title="Microphone access"
        />
        {error ? (
          <Text
            accessibilityRole="alert"
            style={[typography.label, { color: colors.appRecording }]}
          >
            {error}
          </Text>
        ) : null}
      </StepFrame>
    );
  }

  if (step === 'ready') {
    return (
      <ReadyStep
        journalLanguage={journalLanguage}
        onFinish={async () => {
          await save({ onboardingComplete: true, onboardingStage: 'ready' });
        }}
        saving={saving}
        scheduleStart={scheduleStartLocal}
        spokenLanguages={spokenLanguages}
      />
    );
  }

  return (
    <VoiceSetupScreen
      profileRepository={voiceProfileRepository}
      speakerProvider={speakerProvider}
      sampleRecorder={voiceSampleRecorder}
      now={now}
      onComplete={async () => {
        if (await save({ onboardingStage: 'ready' })) {
          setStep('ready');
        }
      }}
      onSkip={async () => {
        if (await save({ onboardingStage: 'ready' })) {
          setStep('ready');
        }
      }}
    />
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

/** Centered prototype column: content top-aligned, one pinned footer action. */
function StepFrame({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const { colors } = useDaytaleTheme();
  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.safe, { backgroundColor: colors.appPaper }]}
    >
      <ScrollView contentContainerStyle={styles.frame} keyboardShouldPersistTaps="handled">
        {children}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function TrustLine({ icon, text }: { icon: 'lock' | 'spark' | 'journal'; text: string }) {
  const { colors, typography } = useDaytaleTheme();
  return (
    <View style={styles.trustLine}>
      <TrustGlyph icon={icon} />
      <Text style={[typography.caption, { color: colors.appMuted }]}>{text}</Text>
    </View>
  );
}

function TrustGlyph({ icon }: { icon: 'lock' | 'spark' | 'journal' }) {
  const { colors } = useDaytaleTheme();
  return <UiIcon color={colors.appCherry} name={icon} size={16} />;
}

function PrivacyCard({
  icon,
  title,
  text,
}: {
  icon: 'lock' | 'trash' | 'mic';
  title: string;
  text: string;
}) {
  const { colors, radii, typography, shadows } = useDaytaleTheme();
  return (
    <View
      style={[
        styles.privacyCard,
        {
          backgroundColor: colors.appSurface,
          borderColor: colors.appLine,
          borderRadius: radii.card,
        },
        shadows,
      ]}
    >
      <UiIcon color={colors.appCherry} name={icon} size={20} />
      <View style={styles.privacyText}>
        <Text style={[typography.label, { color: colors.appInk }]}>{title}</Text>
        <Text style={[typography.sub, { color: colors.appMuted }]}>{text}</Text>
      </View>
    </View>
  );
}

function ReadyStep({
  scheduleStart,
  spokenLanguages,
  journalLanguage,
  saving,
  onFinish,
}: {
  scheduleStart: string;
  spokenLanguages: Language[];
  journalLanguage: Language;
  saving: boolean;
  onFinish: () => Promise<void>;
}) {
  const onFinishRef = React.useRef(onFinish);
  React.useEffect(() => {
    onFinishRef.current = onFinish;
  });
  React.useEffect(() => {
    const timer = setTimeout(() => void onFinishRef.current(), READY_AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <StepFrame
      footer={
        <PrimaryButton
          label="Skip the wait - Go to Today →"
          onPress={() => void onFinish()}
          disabled={saving}
          secondary
        />
      }
    >
      <DaytaleMascot state="celebrating" />
      <ScreenHeading variant="heading" center>
        You&apos;re all set.
      </ScreenHeading>
      <SubText center>
        {`Daytale will greet you at ${formatClock12(scheduleStart)} every day.`}
      </SubText>
      <View style={styles.tagRow}>
        {spokenLanguages.map((language) => (
          <Chip key={language} label={LANGUAGE_TAGS[language]} selected />
        ))}
        <Chip label={`Journal in ${LANGUAGE_NAMES[journalLanguage]}`} />
      </View>
    </StepFrame>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  frame: {
    alignItems: 'center',
    flexGrow: 1,
    gap: 16,
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  hero: { marginTop: 4 },
  block: { alignSelf: 'stretch', gap: 8 },
  trust: { alignSelf: 'stretch', gap: 12, marginTop: 'auto' },
  trustLine: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  input: {
    borderWidth: 1.5,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  privacyCard: {
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  privacyText: { flex: 1, gap: 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  footer: { alignSelf: 'stretch', marginTop: 'auto' },
});
