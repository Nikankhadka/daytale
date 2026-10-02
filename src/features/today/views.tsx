import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { DaytaleMascot, type MascotState } from '../../shared/ui/DaytaleMascot';
import { PrimaryButton } from '../../shared/ui/ScreenScaffold';
import { withAlpha } from '../../theme/color';
import { useDaytaleTheme } from '../../theme/useDaytaleTheme';

/** The start blockers the user can act on, each with its own way out. */
export type Blocker =
  'permission-denied' | 'permission-blocked' | 'voice-profile-missing' | 'low-storage';

const BLOCKER_COPY: Record<Blocker, string> = {
  'permission-denied':
    'Microphone access is off. Allow it so Daytale can remember your day, then try again.',
  'permission-blocked':
    'Microphone access is blocked. Turn it on in your device settings, then come back and try again.',
  'voice-profile-missing': 'Daytale needs to learn your voice before it can record.',
  'low-storage': 'This device is low on storage. Free up some space, then try again.',
};

type BlockerNoticeProps = {
  blocker: Blocker;
  busy: boolean;
  onOpenSettings: () => void;
  onRetry: () => void;
  onSetUpVoice: () => void;
};

/** Inline recovery for a blocked start or resume; no dead end and no raw diagnostics. */
export function BlockerNotice({
  blocker,
  busy,
  onOpenSettings,
  onRetry,
  onSetUpVoice,
}: BlockerNoticeProps) {
  const { colors, typography } = useDaytaleTheme();
  const permission = blocker === 'permission-denied' || blocker === 'permission-blocked';
  return (
    <View accessibilityRole="alert" style={[styles.box, boxColors(colors)]}>
      <Text style={[typography.caption, { color: colors.appInkSoft }]}>
        {BLOCKER_COPY[blocker]}
      </Text>
      {permission ? (
        <PrimaryButton label="Open settings" onPress={onOpenSettings} secondary />
      ) : null}
      {blocker === 'voice-profile-missing' ? (
        <PrimaryButton label="Set up my voice" onPress={onSetUpVoice} secondary />
      ) : (
        <PrimaryButton label="Try again" onPress={onRetry} disabled={busy} secondary />
      )}
    </View>
  );
}

type Colors = ReturnType<typeof useDaytaleTheme>['colors'];

function boxColors(colors: Colors) {
  // The prototype's err-box border: recording at 30% over the soft fill.
  return {
    backgroundColor: colors.appRecordingSoft,
    borderColor: withAlpha(colors.appRecording, 0.3),
  };
}

const ICON_PATHS = {
  sun: 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  play: 'm8 5 11 7-11 7V5Z',
  clock: 'M12 7v5l3 3',
} as const;

/** Decorative line icons from the prototype's 24px set. */
export function LineIcon({ name, color }: { name: keyof typeof ICON_PATHS; color: string }) {
  const clock = name === 'clock';
  return (
    <Svg
      width={clock ? 17 : 18}
      height={clock ? 17 : 18}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={clock ? 2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === 'play' ? null : <Circle cx={12} cy={12} r={clock ? 9 : 4} />}
      <Path d={ICON_PATHS[name]} />
    </Svg>
  );
}

type TodayFrameProps = {
  /** The date eyebrow or status pill that leads the screen. */
  top?: React.ReactNode;
  mascot: MascotState;
  title: string;
  /** Status screens use the compact 19px heading role. */
  titleVariant?: 'title' | 'titleSmall';
  /** The morning prompt greets before it shows the mascot. */
  titleFirst?: boolean;
  problem?: string;
  children?: React.ReactNode;
  /** Pinned to the bottom of the screen. */
  actions?: React.ReactNode;
};

/** The prototype's centered Today column: status, mascot, heading, content, then actions. */
function TodayFrame({
  top,
  mascot,
  title,
  titleVariant = 'title',
  titleFirst = false,
  problem,
  children,
  actions,
}: TodayFrameProps) {
  const { colors, typography } = useDaytaleTheme();
  const heading = (
    <Text
      accessibilityRole="header"
      style={[
        styles.title,
        titleVariant === 'titleSmall' ? typography.titleSmall : typography.title,
        { color: colors.appInk },
      ]}
    >
      {title}
    </Text>
  );
  const mascotView = <DaytaleMascot state={mascot} />;
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: colors.appPaper }]}>
      <ScrollView contentContainerStyle={styles.frame} keyboardShouldPersistTaps="handled">
        {top}
        {titleFirst ? heading : mascotView}
        {titleFirst ? mascotView : heading}
        {children}
        {problem ? (
          <Text accessibilityRole="alert" style={[typography.sub, { color: colors.appRecording }]}>
            {problem}
          </Text>
        ) : null}
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Eyebrow({ text }: { text: string }) {
  const { colors, typography } = useDaytaleTheme();
  return (
    <Text style={[styles.eyebrow, typography.eyebrow, { color: colors.appMuted }]}>{text}</Text>
  );
}

function Sub({ children }: { children: string }) {
  const { colors, typography } = useDaytaleTheme();
  return <Text style={[styles.sub, typography.sub, { color: colors.appMuted }]}>{children}</Text>;
}

type IdleViewProps = {
  eyebrow: string;
  restingUntil: string;
  windowLabel: string;
  /** Absent when there is no waiting session to open early. */
  onPreview?: () => void;
};

export function IdleView({ eyebrow, restingUntil, windowLabel, onPreview }: IdleViewProps) {
  const { colors, radii, shadows, typography } = useDaytaleTheme();
  return (
    <TodayFrame
      top={<Eyebrow text={eyebrow} />}
      mascot="sleeping"
      title={`Resting until ${restingUntil}.`}
      actions={
        onPreview ? (
          <PrimaryButton label={'Preview morning prompt →'} onPress={onPreview} secondary />
        ) : null
      }
    >
      <Sub>Daytale is off outside your journal hours - nothing is listening right now.</Sub>
      <View
        accessible
        accessibilityLabel={`Next window: ${windowLabel}`}
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
        <View style={styles.cardText}>
          <Text style={[typography.label, { color: colors.appInk }]}>Next window</Text>
          <Text style={[typography.caption, { color: colors.appMuted }]}>{windowLabel}</Text>
        </View>
        <LineIcon name="sun" color={colors.appInk} />
      </View>
    </TodayFrame>
  );
}

type PromptViewProps = {
  eyebrow: string;
  name?: string;
  busy: boolean;
  problem?: string;
  notice?: React.ReactNode;
  onStart: () => void;
  onChangeTime: () => void;
  onSkip: () => void;
};

export function PromptView({
  eyebrow,
  name,
  busy,
  problem,
  notice,
  onStart,
  onChangeTime,
  onSkip,
}: PromptViewProps) {
  const { colors, typography } = useDaytaleTheme();
  return (
    <TodayFrame
      top={<Eyebrow text={eyebrow} />}
      mascot="waking"
      title={name ? `Good morning, ${name}!` : 'Good morning!'}
      titleFirst
      problem={problem}
      actions={
        <>
          <PrimaryButton
            label="Start my day"
            onPress={onStart}
            disabled={busy}
            icon={<LineIcon name="play" color={colors.appOnPrimary} />}
          />
          <Text style={[styles.note, typography.caption, { color: colors.appMuted }]}>
            Recording stays on your device.
          </Text>
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <PrimaryButton label="Change time" onPress={onChangeTime} secondary />
            </View>
            <View style={styles.rowItem}>
              <PrimaryButton label="Skip today" onPress={onSkip} disabled={busy} secondary />
            </View>
          </View>
        </>
      }
    >
      <Sub>Ready for me to remember today?</Sub>
      {notice}
    </TodayFrame>
  );
}

/** A looping 1 -> `low` -> 1 value, flat when the user asked for reduced motion. */
function usePulse(reducedMotion: boolean, low: number, duration: number) {
  const value = useSharedValue(1);
  React.useEffect(() => {
    cancelAnimation(value);
    value.value = 1;
    if (reducedMotion) {
      return undefined;
    }
    value.value = withRepeat(
      withSequence(withTiming(low, { duration }), withTiming(1, { duration })),
      -1,
      false,
    );
    return () => cancelAnimation(value);
  }, [reducedMotion, low, duration, value]);
  return value;
}

function PulsingDot({ color, pulse }: { color: string; pulse: boolean }) {
  const { reducedMotion, motion } = useDaytaleTheme();
  const opacity = usePulse(reducedMotion || !pulse, 0.35, motion.pulse);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

type StatusPillProps = { label: string; tone: 'recording' | 'paused' };

function StatusPill({ label, tone }: StatusPillProps) {
  const { colors, typography } = useDaytaleTheme();
  const recording = tone === 'recording';
  return (
    <View
      accessible
      accessibilityLabel={recording ? 'Recording' : label}
      style={[
        styles.pill,
        { backgroundColor: recording ? colors.appRecordingSoft : colors.appPauseSoft },
      ]}
    >
      <PulsingDot color={recording ? colors.appRecording : colors.appPause} pulse={recording} />
      <Text
        style={[typography.chip, { color: recording ? colors.appRecording : colors.appInkSoft }]}
        importantForAccessibility="no"
      >
        {label}
      </Text>
    </View>
  );
}

const WAVE_HEIGHTS = [14, 22, 10, 28, 16, 24, 12, 20, 15];

function WaveBar({ height, index }: { height: number; index: number }) {
  const { colors, reducedMotion, motion } = useDaytaleTheme();
  // Different speeds keep the bars out of step without a per-bar delay.
  const scale = usePulse(reducedMotion, 0.45, motion.waveBase + index * 70);
  const style = useAnimatedStyle(() => ({ height: height * scale.value }));
  return <Animated.View style={[styles.bar, { backgroundColor: colors.appSunDeep }, style]} />;
}

/** Decorative only: it reacts to nothing the microphone hears. */
function Waveform() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.wave}
      testID="recording-waveform"
    >
      {WAVE_HEIGHTS.map((height, index) => (
        <WaveBar key={index} height={height} index={index} />
      ))}
    </View>
  );
}

function Timer({ value, dimmed }: { value: string; dimmed?: boolean }) {
  const { colors, typography } = useDaytaleTheme();
  return (
    <Text
      accessibilityRole="timer"
      style={[styles.timer, typography.timer, { color: colors.appInk, opacity: dimmed ? 0.55 : 1 }]}
    >
      {value}
    </Text>
  );
}

type CircleButtonProps = {
  label: string;
  caption: string;
  kind: 'pause' | 'stop';
  onPress: () => void;
};

function CircleButton({ label, caption, kind, onPress }: CircleButtonProps) {
  const { colors, typography } = useDaytaleTheme();
  const stop = kind === 'stop';
  return (
    <View style={styles.circleItem}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.circle,
          stop
            ? { backgroundColor: colors.appRecording }
            : {
                backgroundColor: colors.appPauseSoft,
                borderColor: colors.appPause,
                borderWidth: 1.5,
              },
          pressed ? { opacity: 0.8 } : null,
        ]}
      >
        {stop ? (
          <View style={[styles.stopGlyph, { backgroundColor: colors.appPaper }]} />
        ) : (
          <View style={styles.pauseGlyph}>
            <View style={[styles.pauseBar, { backgroundColor: colors.appInk }]} />
            <View style={[styles.pauseBar, { backgroundColor: colors.appInk }]} />
          </View>
        )}
      </Pressable>
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[typography.caption, { color: colors.appMuted }]}
      >
        {caption}
      </Text>
    </View>
  );
}

type RecordingViewProps = {
  elapsed: string;
  problem?: string;
  onPause: () => void;
  onStop: () => void;
};

export function RecordingView({ elapsed, problem, onPause, onStop }: RecordingViewProps) {
  return (
    <TodayFrame
      top={<StatusPill label="RECORDING" tone="recording" />}
      mascot="listening"
      title="I'm remembering your day"
      titleVariant="titleSmall"
      problem={problem}
      actions={
        <View style={styles.controls}>
          <CircleButton
            label="Pause Daytale recording"
            caption="Pause"
            kind="pause"
            onPress={onPause}
          />
          <CircleButton
            label="Stop Daytale recording"
            caption="Stop"
            kind="stop"
            onPress={onStop}
          />
        </View>
      }
    >
      <Waveform />
      <Timer value={elapsed} />
      <Sub>{"Live normally - I'll only ask if I need to."}</Sub>
    </TodayFrame>
  );
}

type PausedViewProps = {
  breakLabel: string;
  /** Present when Daytale, not the user, paused the session. */
  reason?: string;
  elapsed: string;
  busy: boolean;
  problem?: string;
  notice?: React.ReactNode;
  onResume: () => void;
  onStop: () => void;
};

export function PausedView({
  breakLabel,
  reason,
  elapsed,
  busy,
  problem,
  notice,
  onResume,
  onStop,
}: PausedViewProps) {
  return (
    <TodayFrame
      top={<StatusPill label={`PAUSED · ${breakLabel}`} tone="paused" />}
      mascot="paused"
      title={reason ? 'Recording is paused.' : 'Taking a privacy break.'}
      titleVariant="titleSmall"
      problem={problem}
      actions={
        <>
          <PrimaryButton label="Resume recording" onPress={onResume} disabled={busy} />
          <PrimaryButton label="Stop for today" onPress={onStop} disabled={busy} secondary />
        </>
      }
    >
      <Timer value={elapsed} dimmed />
      <Sub>
        {reason
          ? `${reason} Nothing is being recorded right now.`
          : "Nothing is being recorded right now. Resume whenever you're ready."}
      </Sub>
      {notice}
    </TodayFrame>
  );
}

type FailedViewProps = {
  /** Plain words such as "today at 3:10 PM"; absent when no deadline is stored. */
  deadline?: string;
  busy: boolean;
  problem?: string;
  onRetry: () => void;
  onDiscard: () => void;
};

export function FailedView({ deadline, busy, problem, onRetry, onDiscard }: FailedViewProps) {
  const { colors, typography } = useDaytaleTheme();
  const boxText = [typography.caption, { color: colors.appInkSoft }];
  return (
    <TodayFrame
      mascot="error"
      title="Something interrupted your journal."
      titleVariant="titleSmall"
      problem={problem}
      actions={
        <>
          <PrimaryButton label="Try again" onPress={onRetry} disabled={busy} />
          <PrimaryButton
            label="Discard this session"
            onPress={onDiscard}
            disabled={busy}
            secondary
          />
        </>
      }
    >
      <Sub>Nothing is lost - I can pick up right where I left off.</Sub>
      <View style={[styles.box, boxColors(colors)]}>
        <Text style={boxText}>
          {"The last processing step didn't finish. This is usually temporary."}
        </Text>
        {deadline ? (
          <Text style={boxText}>
            {`Try again until ${deadline}. After that, the saved audio is deleted.`}
          </Text>
        ) : null}
      </View>
    </TodayFrame>
  );
}

/** The handoff only; the stages and what follows belong to processing (DYT-009). */
export function ProcessingView() {
  const { colors, typography } = useDaytaleTheme();
  return (
    <TodayFrame mascot="writing" title={'Writing your Daytale…'} titleVariant="titleSmall">
      <Text style={[styles.note, typography.caption, { color: colors.appFaint }]}>
        Source audio is deleted the moment this finishes.
      </Text>
    </TodayFrame>
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
  title: { textAlign: 'center' },
  eyebrow: { textTransform: 'uppercase' },
  sub: { textAlign: 'center' },
  actions: { alignSelf: 'stretch', marginTop: 'auto' },
  box: { alignSelf: 'stretch', borderWidth: 1, gap: 4, padding: 16 },
  card: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  cardText: { flex: 1, gap: 2 },
  note: { marginTop: 12, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12 },
  rowItem: { flex: 1 },
  pill: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  dot: { borderRadius: 4, height: 7, width: 7 },
  wave: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 3,
    height: 34,
    justifyContent: 'center',
  },
  bar: { borderRadius: 3, opacity: 0.75, width: 3.5 },
  timer: { fontVariant: ['tabular-nums'], textAlign: 'center' },
  circleItem: { alignItems: 'center', gap: 8 },
  circle: {
    alignItems: 'center',
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  stopGlyph: { borderRadius: 3, height: 20, width: 20 },
  pauseGlyph: { flexDirection: 'row', gap: 5 },
  pauseBar: { borderRadius: 2, height: 22, width: 6 },
  controls: { flexDirection: 'row', gap: 32, justifyContent: 'center' },
});
