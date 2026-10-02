import * as React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DaytaleMascot } from '../../shared/ui/DaytaleMascot';
import { Card, Chip, Eyebrow, ScreenHeading, SubText } from '../../shared/ui/primitives';
import { UiIcon } from '../../shared/ui/uiIcons';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';

/** The prototype's one-tap clarification chips. `Ignore` skips the question. */
export const CLARIFICATION_CHIPS: { label: string; emoji?: string }[] = [
  { label: 'Work', emoji: '💼' },
  { label: 'Study', emoji: '📚' },
  { label: 'Social', emoji: '👥' },
  { label: 'Travel', emoji: '🚆' },
  { label: 'Gym', emoji: '🏋️' },
  { label: 'Shopping', emoji: '🛍️' },
  { label: 'Other', emoji: '✨' },
  { label: 'Ignore' },
];

type ClarificationViewProps = {
  index: number;
  total: number;
  question: string;
  /** Neutral time window; the prototype's map/place pin is intentionally not rendered. */
  timeLabel: string;
  busy?: boolean;
  onAnswer: (label: string | null) => void;
};

/** The prototype's `clarification`: one tiny question, answered with a single tap. */
export function ClarificationView({
  index,
  total,
  question,
  timeLabel,
  busy = false,
  onAnswer,
}: ClarificationViewProps) {
  const { colors, typography } = useDaytaleTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.appPaper }]}>
      <ScrollView contentContainerStyle={styles.frame}>
        <Eyebrow>{`Question ${index + 1} of ${total}`}</Eyebrow>
        <ScreenHeading variant="titleSmall" center>
          One tiny question before I finish…
        </ScreenHeading>
        <DaytaleMascot state="thinking" />
        <Card style={styles.timeCard}>
          <View style={styles.timeRow}>
            <UiIcon color={colors.appInk} name="clock" size={18} />
            <Text style={[typography.label, { color: colors.appInk }]}>{timeLabel}</Text>
          </View>
        </Card>
        <Text style={[typography.label, { color: colors.appInk, textAlign: 'center' }]}>
          {question}
        </Text>
        <SubText center>What were you doing here?</SubText>
        <View style={styles.chips}>
          {CLARIFICATION_CHIPS.map((chip) => (
            <Chip
              key={chip.label}
              emoji={chip.emoji}
              label={chip.label}
              onPress={
                busy ? undefined : () => onAnswer(chip.label === 'Ignore' ? null : chip.label)
              }
            />
          ))}
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
    gap: 14,
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  timeCard: { alignSelf: 'stretch' },
  timeRow: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center' },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 'auto',
  },
});
