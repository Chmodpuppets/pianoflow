import { describe, it, expect } from 'vitest';
import { TempoMap } from '../src/tempo';

describe('TempoMap', () => {
  it('converts ticks to seconds at 120bpm ppq480', () => {
    const m = new TempoMap(480, [{ ticks: 0, bpm: 120 }]);
    expect(m.ticksToSeconds(0)).toBeCloseTo(0);
    expect(m.ticksToSeconds(480)).toBeCloseTo(0.5);
    expect(m.ticksToSeconds(960)).toBeCloseTo(1.0);
  });

  it('defaults to 120bpm when no tempo given', () => {
    const m = new TempoMap(480, []);
    expect(m.ticksToSeconds(480)).toBeCloseTo(0.5);
    expect(m.bpmAt(0)).toBe(120);
  });

  it('handles tempo changes', () => {
    const m = new TempoMap(480, [
      { ticks: 0, bpm: 120 },
      { ticks: 480, bpm: 60 },
    ]);
    expect(m.ticksToSeconds(480)).toBeCloseTo(0.5);
    // after tick 480 at 60bpm, 480 ticks = 1s
    expect(m.ticksToSeconds(960)).toBeCloseTo(1.5);
    expect(m.bpmAt(500)).toBe(60);
  });

  it('round-trips seconds <-> ticks', () => {
    const m = new TempoMap(480, [{ ticks: 0, bpm: 90 }]);
    const ticks = 1234;
    expect(m.secondsToTicks(m.ticksToSeconds(ticks))).toBeCloseTo(ticks, 3);
  });
});
