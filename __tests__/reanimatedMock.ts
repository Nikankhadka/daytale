import * as React from 'react';
import { View } from 'react-native';

const AnimatedView = React.forwardRef<View, Record<string, unknown>>((props, ref) => {
  const { children, ...rest } = props;
  return React.createElement(
    View,
    { ...rest, ref } as React.ComponentProps<typeof View> & React.RefAttributes<View>,
    children as React.ReactNode,
  );
});
AnimatedView.displayName = 'AnimatedView';

const identity = <T>(value: T) => value;

export default { View: AnimatedView };
export const cancelAnimation = jest.fn();
export const Easing = { ease: identity, inOut: () => identity };
export const useAnimatedStyle = (callback: () => unknown) => callback();
export const useSharedValue = <T>(value: T) => ({ value });
export const withRepeat = identity;
export const withSequence = <T>(value: T) => value;
export const withTiming = identity;
