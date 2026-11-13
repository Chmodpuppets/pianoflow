import type { MidiNote } from './types';

/** Clamp a transpose amount to a musically useful ±1 octave range. */
export function clampSemitones(n: number): number {
  if (!isFinite(n)) return 0;
  return Math.max(-12, Math.min(12, Math.round(n)));
}

/** Clamp a hand-split pitch to the 88-key range. */
export function clampSplit(midi: number): number {
  if (!isFinite(midi)) return 60;
  return Math.max(21, Math.min(108, Math.round(midi)));
}

/** Clamp input-latency compensation to ±250 ms. */
export function clampLatency(ms: number): number {
  if (!isFinite(ms)) return 0;
  return Math.max(-250, Math.min(250, Math.round(ms)));
}

/**
 * Shift every note's pitch by `semitones`, clamped to the MIDI range.
 * Returns the original array when the shift is zero (so cached indexes stay
 * valid); otherwise a new array of new note objects (never mutates the input).
 */
export function transposeNotes(notes: MidiNote[], semitones: number): MidiNote[] {
  const s = clampSemitones(semitones);
  if (s === 0) return notes;
  return notes.map((n) => ({
    ...n,
    midi: Math.max(0, Math.min(127, n.midi + s)),
  }));
}

/**
 * Compensate a performed timestamp for input/audio latency. A positive latency
 * means the device reports notes late, so we subtract it to recover the intended
 * musical time. Pure and unit-testable.
 */
export function compensateLatency(performedTime: number, latencyMs: number): number {
  return performedTime - clampLatency(latencyMs) / 1000;
}
