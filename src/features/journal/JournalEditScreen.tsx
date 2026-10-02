import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Eyebrow, SubText } from '../../shared/ui/primitives';
import { useJournalStore } from '../../state/journal';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';
import { formatEntryEyebrow } from './format';

export function JournalEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entries = useJournalStore((state) => state.entries);
  const loadState = useJournalStore((state) => state.loadState);
  const loadEntries = useJournalStore((state) => state.loadEntries);
  const updateEntry = useJournalStore((state) => state.updateEntry);
  const { colors, typography, fontRoles } = useDaytaleTheme();

  React.useEffect(() => {
    if (loadState === 'idle') {
      void loadEntries();
    }
  }, [loadState, loadEntries]);

  const entry = entries.find((item) => item.id === id) ?? null;
  const [editedTitle, setEditedTitle] = React.useState<string | null>(null);
  const [editedBody, setEditedBody] = React.useState<string | null>(null);
  const title = editedTitle ?? entry?.title ?? '';
  const body = editedBody ?? entry?.paragraphs.join('\n\n') ?? '';

  const save = async () => {
    if (!entry) {
      return;
    }
    const paragraphs = body
      .split(/\n+/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0);
    await updateEntry(entry.id, {
      title: title.trim() || entry.title,
      paragraphs: paragraphs.length > 0 ? paragraphs : entry.paragraphs,
    });
    router.back();
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.appPaper }]}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.action}>
          <Text style={[typography.sub, { color: colors.appInk }]}>Cancel</Text>
        </Pressable>
        <Eyebrow>Editing</Eyebrow>
        <Pressable accessibilityRole="button" onPress={() => void save()} style={styles.action}>
          <Text style={[typography.label, { color: colors.appCherry }]}>Save</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {entry ? (
          <>
            <Eyebrow>{formatEntryEyebrow(entry.date)}</Eyebrow>
            <TextInput
              accessibilityLabel="Entry title"
              onChangeText={setEditedTitle}
              style={[styles.title, { color: colors.appInk, fontFamily: fontRoles.reading }]}
              value={title}
            />
            <TextInput
              accessibilityLabel="Entry body"
              multiline
              onChangeText={setEditedBody}
              scrollEnabled={false}
              style={[
                styles.body,
                typography.reading,
                { color: colors.appInk, fontFamily: fontRoles.reading },
              ]}
              textAlignVertical="top"
              value={body}
            />
            <SubText center style={styles.note}>
              You own the final words - Daytale only drafts them.
            </SubText>
          </>
        ) : (
          <SubText center>This journal could not be found.</SubText>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  top: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  content: { gap: 10, paddingBottom: 24, paddingHorizontal: 24, paddingTop: 8 },
  title: { fontSize: 22, lineHeight: 29 },
  body: { minHeight: 240, padding: 0 },
  note: { marginTop: 8 },
});
