import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JOURNAL_ROUTE_PATHS } from '../../navigation/routes';
import { DaytaleMascot } from '../../shared/ui/DaytaleMascot';
import { Chip, Eyebrow, ScreenHeading, SubText } from '../../shared/ui/primitives';
import { UiIcon } from '../../shared/ui/uiIcons';
import { useJournalStore } from '../../state/journal';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';
import type { JournalEntry } from '../../storage/types';
import { dayNumber, groupByMonth, weekdayShort } from './format';

export function JournalListScreen() {
  const router = useRouter();
  const entries = useJournalStore((state) => state.entries);
  const loadState = useJournalStore((state) => state.loadState);
  const loadEntries = useJournalStore((state) => state.loadEntries);
  const { colors, typography } = useDaytaleTheme();

  React.useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const groups = React.useMemo(() => groupByMonth(entries), [entries]);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.appPaper }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Eyebrow>Journal</Eyebrow>
        <ScreenHeading>Your days, written.</ScreenHeading>

        {loadState === 'loading' && entries.length === 0 ? (
          <SubText>Gathering your journals…</SubText>
        ) : null}

        {loadState !== 'loading' && entries.length === 0 ? (
          <View style={styles.empty}>
            <DaytaleMascot state="sleeping" />
            <SubText center>No journal entries yet.</SubText>
          </View>
        ) : null}

        {groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <Text style={[typography.monoLabel, styles.month, { color: colors.appMuted }]}>
              {group.label.toUpperCase()}
            </Text>
            {group.entries.map((entry) => (
              <EntryRow
                entry={entry}
                key={entry.id}
                onPress={() =>
                  router.push({ pathname: JOURNAL_ROUTE_PATHS.detail, params: { id: entry.id } })
                }
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function EntryRow({ entry, onPress }: { entry: JournalEntry; onPress: () => void }) {
  const { colors, typography } = useDaytaleTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        { borderBottomColor: colors.appLine },
        pressed ? { backgroundColor: colors.appSakuraMist } : null,
      ]}
    >
      <View style={styles.date}>
        <Text style={[typography.titleSmall, { color: colors.appInk }]}>
          {dayNumber(entry.date)}
        </Text>
        <Text style={[typography.monoLabel, { color: colors.appMuted }]}>
          {weekdayShort(entry.date).toUpperCase()}
        </Text>
      </View>
      <View style={styles.itemBody}>
        <Text numberOfLines={1} style={[typography.label, { color: colors.appInk }]}>
          {entry.title}
        </Text>
        {entry.paragraphs[0] ? (
          <Text numberOfLines={1} style={[typography.caption, { color: colors.appMuted }]}>
            {entry.paragraphs[0]}
          </Text>
        ) : null}
        <View style={styles.chips}>
          {entry.contextTags.slice(0, 3).map((tag) => (
            <Chip key={tag} label={tag} small />
          ))}
        </View>
      </View>
      <UiIcon color={colors.appFaint} name="chevron" size={17} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1, gap: 12, paddingBottom: 24, paddingHorizontal: 24, paddingTop: 24 },
  group: { gap: 4 },
  month: { marginBottom: 8, marginTop: 12 },
  item: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  date: { alignItems: 'center', width: 44 },
  itemBody: { flex: 1, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 32 },
});
