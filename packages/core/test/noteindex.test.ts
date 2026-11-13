import { describe, it, expect } from 'vitest';
import { NoteIndex, type MidiNote } from '../src/index';

function note(time: number, duration: number, midi = 60): MidiNote {
  return { midi, ticks: 0, durationTicks: 0, time, duration, velocity: 0.8, channel: 0, track: 0 };
}
function brute(notes: MidiNote[], t0: number, t1: number): MidiNote[] {
  return notes.filter((n) => n.time <= t1 && n.time + n.duration >= t0);
}

describe('NoteIndex', () => {
  it('returns nothing for an empty index', () => {
    expect(new NoteIndex([]).query(0, 10)).toEqual([]);
  });

  it('matches brute force across many windows', () => {
    const notes = [note(0, 1), note(0.5, 0.2), note(2, 3), note(5, 0.5), note(9, 1)];
    const idx = new NoteIndex(notes, 1);
    const windows: [number, number][] = [
      [0, 1], [1, 2], [0, 10], [4, 6], [-1, 0.5], [2.5, 2.5], [8, 20], [100, 200],
    ];
    for (const [t0, t1] of windows) {
      const got = idx.query(t0, t1).map((n) => n.time).sort((a, b) => a - b);
      const want = brute(notes, t0, t1).map((n) => n.time).sort((a, b) => a - b);
      expect(got).toEqual(want);
    }
  });

  it('finds long notes that start before the window', () => {
    const notes = [note(0, 100), note(40.5, 0.1), note(50, 0.1)];
    const idx = new NoteIndex(notes, 1);
    // long note (0..100) + the 40.5 note overlap [40,41]; the 50 note is outside.
    expect(idx.query(40, 41).length).toBe(2);
    expect(idx.query(101, 102).length).toBe(0);
  });

  it('is equivalent to brute force on randomized data', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const notes = Array.from({ length: 2000 }, () =>
      note(rnd() * 100, rnd() * 3, 21 + Math.floor(rnd() * 88)),
    ).sort((a, b) => a.time - b.time);
    const ids = new Map(notes.map((n, i) => [n, i]));
    const idx = new NoteIndex(notes, 1);
    for (let i = 0; i < 120; i++) {
      const t0 = rnd() * 100;
      const t1 = t0 + rnd() * 5;
      const got = idx.query(t0, t1).map((n) => ids.get(n)!).sort((a, b) => a - b);
      const want = brute(notes, t0, t1).map((n) => ids.get(n)!).sort((a, b) => a - b);
      expect(got).toEqual(want);
    }
  });

  it('culls a 100k-note set to a small visible window, fast', () => {
    const notes = Array.from({ length: 100000 }, (_, i) => note(i * 0.01, 0.05, 21 + (i % 88)));
    const idx = new NoteIndex(notes, 1);
    const visible = idx.query(500, 503);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(1000); // ~300, not 100000
    // Correctness vs brute force on the large set.
    expect(visible.length).toBe(brute(notes, 500, 503).length);

    const start = performance.now();
    for (let q = 0; q < 1000; q++) idx.query(500, 503);
    const ms = performance.now() - start;
    // Generous guard against pathological regressions (not a tight benchmark).
    expect(ms).toBeLessThan(2000);
    console.log(`[bench] 1000 queries over 100k notes: ${ms.toFixed(1)}ms (${(ms / 1000).toFixed(3)}ms/query)`);
  });
});
