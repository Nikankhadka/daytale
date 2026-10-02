import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JOURNAL_ROUTE_PATHS } from '../../navigation/routes';
import { Chip, Eyebrow, InlineConfirm, SubText } from '../../shared/ui/primitives';
import { UiIcon } from '../../shared/ui/uiIcons';
import { useJournalStore } from '../../state/journal';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';
import { formatEntryEyebrow } from './format';
import { shareEntry } from './share';

export function JournalDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entries = useJournalStore((state) => state.entries);
  const loadState = useJournalStore((state) => state.loadState);
  const loadEntries = useJournalStore((state) => state.loadEntries);
  const removeEntry = useJournalStore((state) => state.removeEntry);
  const { colors, typography, fontRoles } = useDaytaleTheme();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (loadState === 'idle') {
      void loadEntries();
    }
  }, [loadState, loadEntries]);

  const entry = entries.find((item) => item.id === id) ?? null;

  const onDelete = async () => {
    if (!entry) {
      return;
    }
    setBusy(true);
    setDeleteError(undefined);
    const ok = await removeEntry(entry.id);
    setBusy(false);
    if (!ok) {
      setDeleteError('That journal could not be deleted.');
      return;
    }
    setConfirming(false);
    router.back();
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.appPaper }]}>
      <View style={styles.top}>
        <Pressable
          accessibilityLabel="Back to journals"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.back}
        >
          <UiIcon color={colors.appInk} name="back" size={20} strokeWidth={2} />
          <Text style={[typography.sub, { color: colors.appInk }]}>Journal</Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel="Edit entry"
            accessibilityRole="button"
            disabled={!entry}
            onPress={() =>
              entry && router.push({ pathname: JOURNAL_ROUTE_PATHS.edit, params: { id: entry.id } })
            }
            style={styles.iconButton}
          >
            <UiIcon color={colors.appInk} name="edit" size={19} />
          </Pressable>
          <Pressable
            accessibilityLabel="Share entry"
            accessibilityRole="button"
            disabled={!entry}
            onPress={() => entry && void shareEntry(entry)}
            style={styles.iconButton}
          >
            <UiIcon color={colors.appInk} name="share" size={19} />
          </Pressable>
          <Pressable
            accessibilityLabel="Delete entry"
            accessibilityRole="button"
            disabled={!entry}
            onPress={() => setConfirming(true)}
            style={styles.iconButton}
          >
            <UiIcon color={colors.appRecording} name="trash" size={19} />
          </Pressable>
        </View>
      </View>

      {entry ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Eyebrow>{formatEntryEyebrow(entry.date)}</Eyebrow>
          <Text style={[typography.title, { color: colors.appInk, fontFamily: fontRoles.reading }]}>
            {entry.title}
          </Text>
          {entry.contextTags.length > 0 ? (
            <View style={styles.chips}>
              {entry.contextTags.map((tag) => (
                <Chip key={tag} label={tag} small />
              ))}
            </View>
          ) : null}
          <View style={styles.body}>
            {entry.paragraphs.map((paragraph, index) => (
              <Text key={index} style={[typography.reading, { color: colors.appInk }]}>
                {paragraph}
              </Text>
            ))}
          </View>
          {confirming ? (
            <InlineConfirm
              busy={busy}
              confirmLabel="Delete"
              message="Delete this journal entry? This can't be undone."
              onCancel={() => {
                setConfirming(false);
                setDeleteError(undefined);
              }}
              onConfirm={() => void onDelete()}
            />
          ) : null}
          {deleteError ? (
            <Text
              accessibilityRole="alert"
              style={[typography.label, { color: colors.appRecording }]}
            >
              {deleteError}
            </Text>
          ) : null}
        </ScrollView>
      ) : (
        <View style={styles.missing}>
          <SubText center>This journal could not be found.</SubText>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  top: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  back: { alignItems: 'center', flexDirection: 'row', gap: 4, padding: 10 },
  actions: { flexDirection: 'row', gap: 4 },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  content: { gap: 12, paddingBottom: 24, paddingHorizontal: 24, paddingTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  body: { gap: 16, marginTop: 4 },
  missing: { alignItems: 'center', paddingVertical: 48 },
});
