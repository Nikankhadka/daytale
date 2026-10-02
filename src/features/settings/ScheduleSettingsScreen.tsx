import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FieldLabel, SubText } from '../../shared/ui/primitives';
import { TimeField } from '../../shared/ui/Select';
import { SwitchRow } from '../../shared/ui/SwitchRow';
import { useSessionStore } from '../../state/session';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';
import { createDefaultAppPreferences, persistAppPreferences } from '../preferences';
import { SettingsFrame } from './frame';

function toLabel(local: string): string {
  const [hour, minute] = local.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function ScheduleSettingsScreen() {
  const preferences = useSessionStore((state) => state.appPreferences);
  const { colors, typography } = useDaytaleTheme();
  const current = preferences ?? createDefaultAppPreferences();
  const [start, setStart] = React.useState(current.scheduleStartLocal);
  const [end, setEnd] = React.useState(current.scheduleEndLocal);
  const [error, setError] = React.useState<string | undefined>();

  const save = (nextStart: string, nextEnd: string) => {
    if (nextEnd <= nextStart) {
      setError('The end time must be later than the start time.');
      return;
    }
    setError(undefined);
    void persistAppPreferences({
      scheduleStartLocal: nextStart,
      scheduleEndLocal: nextEnd,
    }).catch(() => setError('That preference could not be saved. Please try again.'));
  };

  return (
    <SettingsFrame title="Schedule">
      <View style={styles.block}>
        <FieldLabel icon="sun">Start time</FieldLabel>
        <TimeField
          accessibilityLabel="Start time"
          onChange={(value) => {
            setStart(value);
            save(value, end);
          }}
          value={start}
        />
      </View>
      <View style={styles.block}>
        <FieldLabel icon="moon">End time</FieldLabel>
        <TimeField
          accessibilityLabel="End time"
          onChange={(value) => {
            setEnd(value);
            save(start, value);
          }}
          value={end}
        />
      </View>
      <SwitchRow
        label="Remind me every morning"
        onValueChange={(notificationsEnabled) => {
          setError(undefined);
          void persistAppPreferences({ notificationsEnabled }).catch(() =>
            setError('That preference could not be saved. Please try again.'),
          );
        }}
        value={current.notificationsEnabled}
      />
      {error ? (
        <Text accessibilityRole="alert" style={[typography.label, { color: colors.appRecording }]}>
          {error}
        </Text>
      ) : null}
      <View
        style={[styles.note, { backgroundColor: colors.appLeafSoft, borderColor: 'transparent' }]}
      >
        <Text style={[typography.caption, { color: colors.appInkSoft }]}>
          {`Today's Morning Prompt will show at ${toLabel(start)}.`}
        </Text>
      </View>
      <SubText>You can always change this later.</SubText>
    </SettingsFrame>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  note: { borderWidth: 1, borderRadius: 16, padding: 16 },
});
