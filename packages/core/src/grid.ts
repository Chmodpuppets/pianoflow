import { buildBeatGrid, type MeterInput } from './meter';

/**
 * A horizontal rhythm guide line in the falling-notes playfield, scrolled in
 * sync with the notes. Measure lines (downbeats) are drawn stronger and carry a
 * 1-based measure number; beat lines mark the remaining beats of the bar.
 */
export interface GridLine {
  /** onset in seconds (tempo-map resolved) */
  time: number;
  /** 'measure' on the downbeat of each bar, 'beat' otherwise */
  kind: 'measure' | 'beat';
  /** 1-based measure number this line belongs to */
  measure: number;
  /** 1-based beat position within the measure */
  beat: number;
}

/**
 * Build the scrolling measure/beat grid from tempo + time-signature events.
 * Pure and dependency-free (reuses the metronome beat grid) so it can be unit
 * tested in Node; the renderer draws these lines behind the falling notes.
 */
export function buildTimeGrid(input: MeterInput): GridLine[] {
  const beats = buildBeatGrid(input);
  const lines: GridLine[] = [];
  let measure = 0;
  let beat = 0;
  for (const b of beats) {
    if (b.accent) {
      measure += 1;
      beat = 1;
    } else {
      beat += 1;
    }
    lines.push({
      time: b.time,
      kind: b.accent ? 'measure' : 'beat',
      measure,
      beat,
    });
  }
  return lines;
}