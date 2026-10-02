import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { useDaytaleTheme } from '../../theme/useDaytaleTheme';

export type MascotState =
  | 'sleeping'
  | 'waking'
  | 'ready'
  | 'listening'
  | 'paused'
  | 'thinking'
  | 'writing'
  | 'celebrating'
  | 'error';

type DaytaleMascotProps = {
  state?: MascotState;
  accessibilityLabel?: string;
};

export function getMascotMotionPlan(state: MascotState, reducedMotion: boolean) {
  return {
    looping: !reducedMotion,
    peakScale: reducedMotion ? 1 : state === 'celebrating' ? 1.045 : 1.025,
  } as const;
}

export function DaytaleMascot({ state = 'ready', accessibilityLabel }: DaytaleMascotProps) {
  const { colors, motion, reducedMotion, typography } = useDaytaleTheme();
  const motionPlan = getMascotMotionPlan(state, reducedMotion);
  const scale = useSharedValue(1);
  const label = accessibilityLabel ?? `Daytale mascot: ${state}`;

  React.useEffect(() => {
    cancelAnimation(scale);
    scale.value = 1;
    if (!motionPlan.looping) {
      return undefined;
    }
    const ease = Easing.bezier(...motion.easeInOut);
    scale.value = withRepeat(
      withSequence(
        withTiming(motionPlan.peakScale, { duration: motion.mascotBreath, easing: ease }),
        withTiming(1, { duration: motion.mascotBreath, easing: ease }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(scale);
  }, [motion.easeInOut, motion.mascotBreath, motionPlan.looping, motionPlan.peakScale, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="image"
      accessibilityState={{ busy: state === 'listening' }}
      accessibilityValue={{ text: reducedMotion ? 'Reduced motion' : 'Gently animated' }}
      style={styles.wrap}
      testID="daytale-mascot"
    >
      <Animated.View style={animatedStyle} testID="daytale-mascot-motion">
        <Svg
          accessibilityLabel="Daytale mascot artwork"
          height={160}
          testID="daytale-mascot-art"
          viewBox="0 0 160 160"
          width={160}
        >
          <Circle cx="80" cy="80" fill={colors.appBlossom} r="76" />
          <MascotStateParts colors={colors} state={state} />
          <Ellipse cx="80" cy="91" fill={colors.appSurface} rx="46" ry="42" />
          <MascotFace colors={colors} state={state} />
        </Svg>
      </Animated.View>
      <Text style={[styles.state, typography.caption, { color: colors.appCherry }]}>{state}</Text>
    </View>
  );
}

type ArtworkProps = {
  colors: ReturnType<typeof useDaytaleTheme>['colors'];
  state: MascotState;
};

function MascotStateParts({ colors, state }: ArtworkProps) {
  const sharedProps = {
    accessibilityLabel: `${state} mascot artwork`,
    testID: `daytale-mascot-${state}-art`,
  };

  switch (state) {
    case 'sleeping':
      return (
        <G {...sharedProps}>
          <Circle cx="120" cy="34" fill={colors.appCheek} r="12" />
          <Path d="m121 26-2 7-6 2 6 2 2 7 2-7 6-2-6-2-2-7Z" fill={colors.appSurface} />
          <Path
            d="M55 83c-11 2-16 8-17 17 8-1 14-5 17-17ZM105 83c11 2 16 8 17 17-8-1-14-5-17-17Z"
            fill={colors.appMuted}
          />
          <Path d="M77 27c-2-16 7-22 18-25-1 13-5 21-18 25Z" fill={colors.appLeaf} />
          <Path d="M78 31c-13-5-20-13-20-25 13 2 21 9 20 25Z" fill={colors.appLeafSoft} />
        </G>
      );
    case 'waking':
      return (
        <G {...sharedProps}>
          <Path
            d="M80 23v-9M61 28l-5-7M99 28l5-7"
            stroke={colors.appCheek}
            strokeLinecap="round"
            strokeWidth="4"
          />
          <Path d="M77 27c-2-16 7-22 18-25-1 13-5 21-18 25Z" fill={colors.appLeaf} />
          <Path d="M78 31c-13-5-20-13-20-25 13 2 21 9 20 25Z" fill={colors.appLeafSoft} />
          <Path
            d="M39 76c-13 2-17 10-17 19 8-1 15-7 17-19ZM121 76c13 2 17 10 17 19-8-1-15-7-17-19Z"
            fill={colors.appCheek}
          />
        </G>
      );
    case 'listening':
      return (
        <G {...sharedProps}>
          <Path
            d="M37 64c-9 7-12 17-8 27M123 64c9 7 12 17 8 27"
            fill="none"
            stroke={colors.appCherry}
            strokeLinecap="round"
            strokeWidth="4"
          />
          <Path
            d="M29 58c-13 9-17 24-10 37M131 58c13 9 17 24 10 37"
            fill="none"
            stroke={colors.appCheek}
            strokeLinecap="round"
            strokeWidth="3"
          />
          <Path d="M77 27c-2-16 7-22 18-25-1 13-5 21-18 25Z" fill={colors.appLeaf} />
          <Path d="M78 31c-13-5-20-13-20-25 13 2 21 9 20 25Z" fill={colors.appLeafSoft} />
        </G>
      );
    case 'paused':
      return (
        <G {...sharedProps}>
          <Rect fill={colors.appCheek} height="20" rx="3" width="7" x="51" y="45" />
          <Rect fill={colors.appCheek} height="20" rx="3" width="7" x="63" y="45" />
          <Path
            d="M39 76c-13 2-17 10-17 19 8-1 15-7 17-19ZM121 76c13 2 17 10 17 19-8-1-15-7-17-19Z"
            fill={colors.appMuted}
          />
          <Path d="M77 27c-2-16 7-22 18-25-1 13-5 21-18 25Z" fill={colors.appLeaf} />
          <Path d="M78 31c-13-5-20-13-20-25 13 2 21 9 20 25Z" fill={colors.appLeafSoft} />
        </G>
      );
    case 'thinking':
      return (
        <G {...sharedProps}>
          <Circle cx="122" cy="42" fill={colors.appCheek} r="7" />
          <Circle cx="134" cy="30" fill={colors.appCheek} r="4" />
          <Path d="M77 27c-2-16 7-22 18-25-1 13-5 21-18 25Z" fill={colors.appLeaf} />
          <Path d="M78 31c-13-5-20-13-20-25 13 2 21 9 20 25Z" fill={colors.appLeafSoft} />
          <Path
            d="M39 76c-13 2-17 10-17 19 8-1 15-7 17-19ZM121 76c13 2 17 10 17 19-8-1-15-7-17-19Z"
            fill={colors.appCheek}
          />
        </G>
      );
    case 'writing':
      return (
        <G {...sharedProps}>
          <Path d="m115 49 13-13 8 8-13 13-8 2Z" fill={colors.appCheek} />
          <Path d="m128 36 4-4 8 8-4 4" fill={colors.appCherry} />
          <Path
            d="M115 49 110 60l11-5"
            fill={colors.appSurface}
            stroke={colors.appCherry}
            strokeWidth="2"
          />
          <Path d="M77 27c-2-16 7-22 18-25-1 13-5 21-18 25Z" fill={colors.appLeaf} />
          <Path d="M78 31c-13-5-20-13-20-25 13 2 21 9 20 25Z" fill={colors.appLeafSoft} />
        </G>
      );
    case 'celebrating':
      return (
        <G {...sharedProps}>
          <Path
            d="m31 35 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7ZM130 73l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z"
            fill={colors.appCheek}
          />
          <Path
            d="M39 76c-13-2-19-8-21-18 10 1 17 6 21 18ZM121 76c13-2 19-8 21-18-10 1-17 6-21 18Z"
            fill={colors.appCherry}
          />
          <Path d="M77 27c-2-16 7-22 18-25-1 13-5 21-18 25Z" fill={colors.appLeaf} />
          <Path d="M78 31c-13-5-20-13-20-25 13 2 21 9 20 25Z" fill={colors.appLeafSoft} />
        </G>
      );
    case 'error':
      return (
        <G {...sharedProps}>
          <Circle cx="122" cy="39" fill={colors.appRecording} r="14" />
          <Path
            d="m116 33 12 12M128 33l-12 12"
            stroke={colors.appPaper}
            strokeLinecap="round"
            strokeWidth="3"
          />
          <Path
            d="M39 76c-13 2-17 10-17 19 8-1 15-7 17-19ZM121 76c13 2 17 10 17 19-8-1-15-7-17-19Z"
            fill={colors.appRecording}
          />
          <Path d="M77 27c-2-16 7-22 18-25-1 13-5 21-18 25Z" fill={colors.appLeaf} />
          <Path d="M78 31c-13-5-20-13-20-25 13 2 21 9 20 25Z" fill={colors.appLeafSoft} />
        </G>
      );
    case 'ready':
    default:
      return (
        <G {...sharedProps}>
          <Path d="M77 27c-2-16 7-22 18-25-1 13-5 21-18 25Z" fill={colors.appLeaf} />
          <Path d="M78 31c-13-5-20-13-20-25 13 2 21 9 20 25Z" fill={colors.appLeafSoft} />
          <Path
            d="M39 76c-13 2-17 10-17 19 8-1 15-7 17-19ZM121 76c13 2 17 10 17 19-8-1-15-7-17-19Z"
            fill={colors.appCheek}
          />
        </G>
      );
  }
}

function MascotFace({ colors, state }: ArtworkProps) {
  if (state === 'sleeping' || state === 'paused') {
    return (
      <>
        <Path
          d="M57 88c4 4 8 4 12 0M91 88c4 4 8 4 12 0"
          fill="none"
          stroke={colors.appInk}
          strokeLinecap="round"
          strokeWidth="4"
        />
        <Path
          d="M71 108c6 3 12 3 18 0"
          fill="none"
          stroke={colors.appMuted}
          strokeLinecap="round"
          strokeWidth="3"
        />
      </>
    );
  }

  if (state === 'error') {
    return (
      <>
        <Path
          d="m58 86 12 4M90 90l12-4"
          stroke={colors.appInk}
          strokeLinecap="round"
          strokeWidth="4"
        />
        <Path
          d="M68 108c8-5 16-5 24 0"
          fill="none"
          stroke={colors.appRecording}
          strokeLinecap="round"
          strokeWidth="4"
        />
      </>
    );
  }

  return (
    <>
      <Circle cx="64" cy="88" fill={colors.appInk} r="5" />
      <Circle cx="96" cy="88" fill={colors.appInk} r="5" />
      <Path
        d={state === 'celebrating' ? 'M66 102c8 12 20 12 28 0' : 'M67 106c8 8 18 8 26 0'}
        fill="none"
        stroke={colors.appCherry}
        strokeLinecap="round"
        strokeWidth="4"
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginBottom: 24 },
  state: { marginTop: 2, textTransform: 'capitalize' },
});
