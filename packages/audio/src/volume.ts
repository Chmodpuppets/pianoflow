/** Clamp a linear volume to [0, 1]. */
export function clamp01(v: number): number {
  if (!isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * The master output gain for a given mute state + volume. Mute always wins
 * (gain 0); otherwise the gain equals the clamped volume. Keeping this pure makes
 * the mute/volume interaction unit-testable without an AudioContext.
 */
export function masterGainValue(muted: boolean, volume: number): number {
  return muted ? 0 : clamp01(volume);
}
