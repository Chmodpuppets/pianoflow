import { describe, it, expect } from 'vitest';
import {
  clampSemitones,
  clampSplit,
  clampLatency,
  transposeNotes,
  compensateLatency,
  type MidiNote,
} from '../src/index';

function note(midi: number, time = 0): MidiNote {
  return { midi, ticks: 0, durationTicks: 0, time, duration: 0.5, velocity: 0.8, channel: 0, track: 0 };
}

describe('adjust clamps', () => {
  it('clampSemitones bounds to ±12 and rounds', () => {
    expect(clampSemitones(0)).toBe(0);
    expect(clampSemitones(3.4)).toBe(3);
    expect(clampSemitones(99)).toBe(12);
    expect(clampSemitones(-99)).toBe(-12);
    expect(clampSemitones(NaN)).toBe(0);
  });
  it('clampSplit bounds to 21..108', () => {
    expect(clampSplit(60)).toBe(60);
    expect(clampSplit(0)).toBe(21);
    expect(clampSplit(200)).toBe(108);
    expect(clampSplit(NaN)).toBe(60);
  });
  it('clampLatency bounds to ±250', () => {
    expect(clampLatency(120)).toBe(120);
    expect(clampLatency(999)).toBe(250);
    expect(clampLatency(-999)).toBe(-250);
    expect(clampLatency(NaN)).toBe(0);
  });
});

describe('transposeNotes', () => {
  it('returns the same reference for a zero shift', () => {
    const notes = [note(60), note(64)];
    expect(transposeNotes(notes, 0)).toBe(notes);
  });
  it('shifts pitches without mutating the input', () => {
    const notes = [note(60), note(64)];
    const out = transposeNotes(notes, 2);
    expect(out.map((n) => n.midi)).toEqual([62, 66]);
    expect(notes.map((n) => n.midi)).toEqual([60, 64]);
    expect(out).not.toBe(notes);
  });
  it('clamps shifted pitches to the MIDI range', () => {
    const notes = [note(2), note(126)];
    const down = transposeNotes(notes, -12);
    const up = transposeNotes(notes, 12);
    expect(down[0].midi).toBe(0);
    expect(up[1].midi).toBe(127);
  });
  it('preserves timing fields', () => {
    const notes = [note(60, 1.5)];
    const out = transposeNotes(notes, 1);
    expect(out[0].time).toBe(1.5);
    expect(out[0].duration).toBe(0.5);
  });
});

describe('compensateLatency', () => {
  it('subtracts positive latency from the performed time', () => {
    expect(compensateLatency(1.0, 100)).toBeCloseTo(0.9, 6);
  });
  it('adds for negative latency', () => {
    expect(compensateLatency(1.0, -100)).toBeCloseTo(1.1, 6);
  });
  it('is a no-op at zero and clamps extremes', () => {
    expect(compensateLatency(1.0, 0)).toBe(1.0);
    expect(compensateLatency(1.0, 9999)).toBeCloseTo(0.75, 6);
  });
});
