/**
 * Colour helpers. The prototype uses `color-mix()` for translucent fills; React
 * Native only understands solid hex or `rgba()`, so this is the translation.
 */
export function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
