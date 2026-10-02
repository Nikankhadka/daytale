import * as React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DaytaleMascot } from '../../shared/ui/DaytaleMascot';
import { Chip, Eyebrow, ScreenHeading, SubText } from '../../shared/ui/primitives';
import { PrimaryButton } from '../../shared/ui/ScreenScaffold';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';

type JournalReadyViewProps = {
  eyebrow: string;
  title: string;
  tags: string[];
  paragraphs: string[];
  onRead: () => void;
  onEdit: () => void;
  onShare: () => void;
};

/** The prototype's `journal-ready`: a celebratory preview before the full entry. */
export function JournalReadyView({
  eyebrow,
  title,
  tags,
  paragraphs,
  onRead,
  onEdit,
  onShare,
}: JournalReadyViewProps) {
  const { colors, typography, radii } = useDaytaleTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.appPaper }]}>
      <ScrollView contentContainerStyle={styles.frame}>
        <DaytaleMascot state="celebrating" />
        <ScreenHeading center>{title}</ScreenHeading>
        <Eyebrow>{eyebrow}</Eyebrow>
        {tags.length > 0 ? (
          <View style={styles.chips}>
            {tags.map((tag) => (
              <Chip key={tag} label={tag} small />
            ))}
          </View>
        ) : null}
        <View style={[styles.preview, { borderColor: colors.appLine, borderRadius: radii.card }]}>
          {paragraphs.slice(0, 2).map((paragraph, index) => (
            <Text key={index} style={[typography.reading, { color: colors.appInk }]}>
              {paragraph}
            </Text>
          ))}
          <View style={[styles.fade, { backgroundColor: colors.appPaper }]} />
        </View>
        <SubText center>A new day is ready to read.</SubText>
        <View style={styles.actions}>
          <View style={styles.actionRow}>
            <View style={styles.flex}>
              <PrimaryButton label="Edit" onPress={onEdit} secondary />
            </View>
            <View style={styles.flex}>
              <PrimaryButton label="Share" onPress={onShare} secondary />
            </View>
          </View>
          <PrimaryButton label="Read full journal →" onPress={onRead} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  frame: {
    alignItems: 'center',
    flexGrow: 1,
    gap: 12,
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  preview: {
    alignSelf: 'stretch',
    borderWidth: 1,
    gap: 12,
    maxHeight: 190,
    overflow: 'hidden',
    padding: 16,
  },
  fade: { bottom: 0, height: 48, left: 0, opacity: 0.92, position: 'absolute', right: 0 },
  actions: { alignSelf: 'stretch', marginTop: 'auto' },
  actionRow: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
});
