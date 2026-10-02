import { useRouter } from 'expo-router';
import * as React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Card, InlineConfirm, ListRow, ScreenHeading, SubText } from '../../shared/ui/primitives';
import { UiIcon, type UiIconName } from '../../shared/ui/uiIcons';
import { getBootstrappedStorage } from '../../storage/bootstrap';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';
import { deleteAllAppData } from '../preferences/deleteData';
import { VoiceProfileCard } from '../voice/VoiceProfileCard';
import { SettingsFrame } from './frame';

type Dialog = 'journals' | 'all' | null;

export function PrivacySettingsScreen() {
  const router = useRouter();
  const { colors, typography } = useDaytaleTheme();
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  const deleteJournals = async () => {
    const storage = getBootstrappedStorage();
    if (!storage) {
      setError('Secure storage is unavailable.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const entries = await storage.repositories.journalEntries.list();
      await Promise.all(
        entries.map((entry) => storage.repositories.journalEntries.deleteById(entry.id)),
      );
    } catch {
      setError('Your journals could not be removed. Nothing was changed.');
    } finally {
      setBusy(false);
      setDialog(null);
    }
  };

  const deleteEverything = async () => {
    const storage = getBootstrappedStorage();
    if (!storage) {
      setError('Secure storage is unavailable.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await deleteAllAppData(storage.database);
      router.replace('/onboarding');
    } catch {
      setError('Your data could not be removed. Nothing was changed in this screen.');
    } finally {
      setBusy(false);
      setDialog(null);
    }
  };

  return (
    <SettingsFrame title="Privacy & Data">
      <ScreenHeading variant="titleSmall">How your voice is handled.</ScreenHeading>
      <InfoCard
        icon="lock"
        text="Speech is transcribed locally wherever possible."
        title="Processed on your device"
      />
      <InfoCard
        icon="trash"
        text="The moment your journal finishes writing, source audio and transcripts are gone."
        title="Raw audio deleted immediately"
      />
      <InfoCard
        icon="book"
        text="The written entry is what's kept - never the recording it came from."
        title="Only your journal remains"
      />

      <VoiceProfileCard />

      <Card padded={false}>
        <View style={styles.cardPad}>
          <ListRow
            danger
            icon="trash"
            onPress={() => setDialog('journals')}
            subtitle="Removes every entry from this device"
            title="Delete all journal data"
          />
        </View>
        {dialog === 'journals' ? (
          <View style={styles.confirmPad}>
            <InlineConfirm
              busy={busy}
              confirmLabel="Delete journals"
              message="Delete all journal entries? This can't be undone."
              onCancel={() => setDialog(null)}
              onConfirm={() => void deleteJournals()}
            />
          </View>
        ) : null}
      </Card>

      <Card padded={false}>
        <View style={styles.cardPad}>
          <ListRow
            danger
            icon="trash"
            onPress={() => setDialog('all')}
            subtitle="Removes journals, voice profile, and preferences"
            title="Delete all data"
          />
        </View>
        {dialog === 'all' ? (
          <View style={styles.confirmPad}>
            <InlineConfirm
              busy={busy}
              confirmLabel="Delete all"
              message="Delete everything and return to setup? This can't be undone."
              onCancel={() => setDialog(null)}
              onConfirm={() => void deleteEverything()}
            />
          </View>
        ) : null}
      </Card>

      <Card padded={false}>
        <View style={styles.cardPad}>
          <ListRow
            chevron
            icon="mic"
            onPress={() => void Linking.openSettings().catch(() => undefined)}
            subtitle="Microphone and notifications"
            title="Permissions"
          />
        </View>
      </Card>

      {error ? (
        <Text accessibilityRole="alert" style={[typography.label, { color: colors.appRecording }]}>
          {error}
        </Text>
      ) : null}
      <SubText>Daytale keeps everything on this device.</SubText>
    </SettingsFrame>
  );
}

function InfoCard({ icon, title, text }: { icon: UiIconName; title: string; text: string }) {
  const { colors, radii, typography, shadows } = useDaytaleTheme();
  return (
    <View
      style={[
        styles.infoCard,
        {
          backgroundColor: colors.appSurface,
          borderColor: colors.appLine,
          borderRadius: radii.card,
        },
        shadows,
      ]}
    >
      <UiIcon color={colors.appCherry} name={icon} size={20} />
      <View style={styles.infoText}>
        <Text style={[typography.label, { color: colors.appInk }]}>{title}</Text>
        <Text style={[typography.sub, { color: colors.appMuted }]}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  infoCard: {
    alignItems: 'flex-start',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  infoText: { flex: 1, gap: 3 },
  cardPad: { paddingHorizontal: 14, paddingVertical: 2 },
  confirmPad: { paddingBottom: 14, paddingHorizontal: 14, paddingTop: 4 },
});
