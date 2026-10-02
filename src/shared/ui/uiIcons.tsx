import * as React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * The prototype's inline `uiIcon()` glyphs, 24x24, 1.8px stroke, round caps.
 * `sun` and `clock` carry a circle; the rest are a single open path.
 */
export type UiIconName =
  | 'lock'
  | 'spark'
  | 'journal'
  | 'mic'
  | 'trash'
  | 'sun'
  | 'moon'
  | 'play'
  | 'clock'
  | 'check'
  | 'chevron'
  | 'back'
  | 'edit'
  | 'share'
  | 'book';

const PATHS: Record<UiIconName, string> = {
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  spark: 'M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z',
  journal:
    'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 0 4 5.5v14zM4 19.5A2.5 2.5 0 0 0 6.5 22H20',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 0 4 5.5v14zM4 19.5A2.5 2.5 0 0 0 6.5 22H20',
  mic: 'M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v1a7 7 0 0 1-14 0v-1M12 18v4',
  trash:
    'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  sun: 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  play: 'm8 5 11 7-11 7V5z',
  clock: 'M12 7v5l3 3',
  check: 'M20 6 9 17l-5-5',
  chevron: 'm9 6 6 6-6 6',
  back: 'm15 6-6 6 6 6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
};

const CIRCLES: Partial<Record<UiIconName, number>> = { sun: 4, clock: 9 };

type UiIconProps = {
  name: UiIconName;
  color: string;
  size?: number;
  strokeWidth?: number;
};

export function UiIcon({ name, color, size = 18, strokeWidth }: UiIconProps) {
  const radius = CIRCLES[name];
  return (
    <Svg
      fill="none"
      height={size}
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth ?? (name === 'play' ? 2 : 1.8)}
      viewBox="0 0 24 24"
      width={size}
    >
      {radius !== undefined ? <Circle cx={12} cy={12} r={radius} /> : null}
      <Path d={PATHS[name]} />
    </Svg>
  );
}
