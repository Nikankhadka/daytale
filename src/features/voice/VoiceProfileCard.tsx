import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { VOICE_SETUP_ROUTE_PATH } from '../../navigation/routes';
import { getBootstrappedStorage } from '../../storage/bootstrap';
import type { VoiceProfileRepository } from '../../storage/repositories';
import type { VoiceProfile } from '../../storage/types';
import { PrimaryButton } from '../../shared/ui/ScreenScaffold';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';
import { VOICE_PROFILE_ID } from './enrollment';

export type VoiceProfileCardProps = {
  profileRepository?: VoiceProfileRepository;
};

export function VoiceProfileCard({ profileRepository }: VoiceProfileCardProps = {}) {
  const router = useRouter();
  const { colors, radii, shadows, typography } = useDaytaleTheme();
  // The web fork has no repositories, so the card degrades to an unavailable state.
  const repository = profileRepository ?? getBootstrappedStorage()?.repositories?.voiceProfiles;
  const [profile, setProfile] = React.useState<VoiceProfile | null | undefined>();
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  // Re-read on focus so a finished re-record (a separate route) is reflected on return.
  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      repository?.getById(VOICE_PROFILE_ID).then(
        (stored) => active && setProfile(stored),
        () => active && setError('Your voice profile could not be read.'),
      );
      return () => {
        active = false;
      };
    }, [repository]),
  );

  const deleteProfile = async () => {
    if (repository === undefined || busy) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await repository.deleteById(VOICE_PROFILE_ID);
      setProfile(null);
    } catch {
      setError('Your voice profile could not be deleted. Nothing was changed.');
    } finally {
      setBusy(false);
      setConfirmingDelete(false);
    }
  };

  const ready = profile?.status === 'ready';
  const status =
    repository === undefined
      ? 'Voice profiles are not available on this platform.'
      : profile === undefined
        ? 'Checking your voice profile…'
        : ready
          ? `Voice profile ready - ${profile.sampleCount} samples`
          : 'Voice profile not set up';

  return (
    <>
      <Text style={[styles.title, typography.heading, { color: colors.appInk }]}>
        Voice profile
      </Text>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.appSurface,
            borderColor: colors.appLine,
            borderRadius: radii.card,
          },
          shadows,
        ]}
      >
        <Text style={[typography.body, { color: colors.appInk }]}>{status}</Text>
        {error ? (
          <Text
            accessibilityRole="alert"
            style={[typography.caption, { color: colors.appRecording }]}
          >
            {error}
          </Text>
        ) : null}
        {repository === undefined ? null : (
          <>
            <PrimaryButton
              label="Re-record voice"
              onPress={() => router.push(VOICE_SETUP_ROUTE_PATH)}
              disabled={busy}
              secondary
            />
            {ready && !confirmingDelete ? (
              <PrimaryButton
                label="Delete voice profile"
                onPress={() => setConfirmingDelete(true)}
                secondary
              />
            ) : null}
            {confirmingDelete ? (
              <View accessibilityLabel="Delete voice profile confirmation">
                <Text style={[typography.body, { color: colors.appRecording }]}>
                  This removes your voice profile from this device. You will need to record three
                  new samples to set it up again.
                </Text>
                <PrimaryButton
                  label="Confirm delete voice profile"
                  onPress={() => void deleteProfile()}
                  disabled={busy}
                />
                <PrimaryButton
                  label="Cancel"
                  onPress={() => setConfirmingDelete(false)}
                  disabled={busy}
                  secondary
                />
              </View>
            ) : null}
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 12, marginTop: 24 },
  card: { borderWidth: 1, gap: 8, padding: 16 },
});
