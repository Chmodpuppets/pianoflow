import { describe, it, expect } from 'vitest';
import { buildBeatGrid } from '../src/meter';

describe('buildBeatGrid', () => {
  it('produces quarter-note beats at 120bpm in 4/4', () => {
    const beats = buildBeatGrid({
      ppq: 480,
      tempos: [{ ticks: 0, bpm: 120 }],
      timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }],
      durationTicks: 480 * 8, // 8 beats = 2 measures
    });
    expect(beats).toHaveLength(9); // ticks 0..3840 inclusive
    expect(beats[0].time).toBeCloseTo(0);
    expect(beats[1].time).toBeCloseTo(0.5);
    expect(beats[4].time).toBeCloseTo(2.0);
    expect(beats[8].time).toBeCloseTo(4.0);
    // downbeats at measure starts (beats 0 and 4)
    expect(beats.map((b) => b.accent)).toEqual([
      true, false, false, false, true, false, false, false, true,
    ]);
  });
  it('defaults to 4/4 120bpm when no events are given', () => {
    const beats = buildBeatGrid({ ppq: 480, tempos: [], timeSignatures: [], durationTicks: 480 * 4 });
    expect(beats).toHaveLength(5);
    expect(beats[1].time).toBeCloseTo(0.5);
    expect(beats[0].accent).toBe(true);
    expect(beats[4].accent).toBe(true);
  });
  it('respects a 3/4 time signature', () => {
    const beats = buildBeatGrid({
      ppq: 480,
      tempos: [{ ticks: 0, bpm: 120 }],
      timeSignatures: [{ ticks: 0, numerator: 3, denominator: 4 }],
      durationTicks: 480 * 6,
    });
    expect(beats).toHaveLength(7);
    expect(beats.map((b) => b.accent)).toEqual([true, false, false, true, false, false, true]);
  });
});
