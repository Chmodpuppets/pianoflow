import { TempoMap, type TempoPoint } from './tempo';
import type { TimeSignature } from './types';

export interface Beat {
  /** onset in seconds (tempo-map resolved) */
  time: number;
  /** true on the downbeat of each measure */
  accent: boolean;
}

export interface MeterInput {
  ppq: number;
  tempos: TempoPoint[];
  timeSignatures: TimeSignature[];
  durationTicks: number;
}

/**
 * Build a metronome beat grid from tempo + time-signature events.
 * Pure and dependency-free so it can be unit tested in Node; the audio
 * engine schedules clicks against these times.
 */
export function buildBeatGrid(input: MeterInput): Beat[] {
  const map = new TempoMap(input.ppq, input.tempos);
  const ts = input.timeSignatures.length
    ? [...input.timeSignatures].sort((a, b) => a.ticks - b.ticks)
    : [{ ticks: 0, numerator: 4, denominator: 4 }];

  const beats: Beat[] = [];
  let tsIdx = 0;
  let numerator = ts[0].numerator;
  let denominator = ts[0].denominator;
  let beatInMeasure = 0;
  let tick = 0;
  let guard = 0;

  while (tick <= input.durationTicks && guard++ < 100000) {
    while (tsIdx + 1 < ts.length && ts[tsIdx + 1].ticks <= tick) {
      tsIdx++;
      numerator = ts[tsIdx].numerator;
      denominator = ts[tsIdx].denominator;
      beatInMeasure = 0;
    }
    beats.push({ time: map.ticksToSeconds(tick), accent: beatInMeasure === 0 });
    const ticksPerBeat = (input.ppq * 4) / denominator;
    tick += ticksPerBeat;
    beatInMeasure = (beatInMeasure + 1) % numerator;
  }
  return beats;
}
