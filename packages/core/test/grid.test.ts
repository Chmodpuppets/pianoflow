import { describe, it, expect } from 'vitest';
import { buildTimeGrid } from '../src/grid';

describe('buildTimeGrid', () => {
  it('marks downbeats as measure lines with 1-based measure numbers in 4/4', () => {
    const grid = buildTimeGrid({
      ppq: 480,
      tempos: [{ ticks: 0, bpm: 120 }],
      timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }],
      durationTicks: 480 * 8, // 2 measures + the next downbeat
    });
    expect(grid).toHaveLength(9);
    const measures = grid.filter((l) => l.kind === 'measure');
    expect(measures.map((l) => l.measure)).toEqual([1, 2, 3]);
    expect(measures.map((l) => l.time)).toEqual([0, 2, 4]);
    expect(measures.every((l) => l.beat === 1)).toBe(true);
    // the beats between downbeats are numbered 2,3,4 within their measure
    expect(grid.slice(1, 4).map((l) => [l.kind, l.measure, l.beat])).toEqual([
      ['beat', 1, 2],
      ['beat', 1, 3],
      ['beat', 1, 4],
    ]);
    expect(grid[1].time).toBeCloseTo(0.5);
  });

  it('numbers every beat 1..3 in 3/4', () => {
    const grid = buildTimeGrid({
      ppq: 480,
      tempos: [{ ticks: 0, bpm: 120 }],
      timeSignatures: [{ ticks: 0, numerator: 3, denominator: 4 }],
      durationTicks: 480 * 6,
    });
    expect(grid.map((l) => l.beat)).toEqual([1, 2, 3, 1, 2, 3, 1]);
    expect(grid.filter((l) => l.kind === 'measure').map((l) => l.measure)).toEqual([1, 2, 3]);
  });

  it('defaults to 4/4 120bpm when no events are given', () => {
    const grid = buildTimeGrid({ ppq: 480, tempos: [], timeSignatures: [], durationTicks: 480 * 4 });
    expect(grid).toHaveLength(5);
    expect(grid[0]).toMatchObject({ kind: 'measure', measure: 1, beat: 1 });
    expect(grid[4]).toMatchObject({ kind: 'measure', measure: 2, beat: 1 });
  });

  it('continues measure numbering across a time-signature change', () => {
    const grid = buildTimeGrid({
      ppq: 480,
      tempos: [{ ticks: 0, bpm: 120 }],
      timeSignatures: [
        { ticks: 0, numerator: 4, denominator: 4 },
        { ticks: 480 * 4, numerator: 3, denominator: 4 }, // switch to 3/4 at 2s
      ],
      durationTicks: 480 * 7,
    });
    // measure 1 (4/4): beats 1-4 at 0,0.5,1,1.5 ; measure 2 (3/4): 1-3 at 2,2.5,3
    const m2 = grid.filter((l) => l.measure === 2);
    expect(m2.map((l) => l.beat)).toEqual([1, 2, 3]);
    expect(m2[0].kind).toBe('measure');
    expect(m2[0].time).toBeCloseTo(2);
    expect(grid.filter((l) => l.kind === 'measure').map((l) => l.measure)).toEqual([1, 2, 3]);
  });

  it('returns a single downbeat for a zero-length span', () => {
    const grid = buildTimeGrid({ ppq: 480, tempos: [], timeSignatures: [], durationTicks: 0 });
    expect(grid).toHaveLength(1);
    expect(grid[0]).toMatchObject({ kind: 'measure', measure: 1, beat: 1, time: 0 });
  });
});