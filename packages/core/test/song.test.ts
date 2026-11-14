import { describe, it, expect } from 'vitest';
import { assignHands, splitByPitch, noteName, groupChords, fitKeyboardRange, FULL_KEYBOARD } from '../src/song';
import type { MidiNote } from '../src/types';

function note(midi: number, track: number): MidiNote {
  return { midi, track, ticks: 0, durationTicks: 480, time: 0, duration: 0.5, velocity: 0.8, channel: 0 };
}

describe('assignHands', () => {
  it('splits single track by pitch threshold', () => {
    const notes = [note(48, 0), note(60, 0), note(72, 0)];
    assignHands(notes, { splitMidi: 60 });
    expect(notes[0].hand).toBe('left');
    expect(notes[1].hand).toBe('right');
    expect(notes[2].hand).toBe('right');
  });
  it('assigns multi-track by average pitch', () => {
    const notes = [note(72, 1), note(76, 1), note(48, 2), note(40, 2)];
    assignHands(notes);
    expect(notes[0].hand).toBe('right');
    expect(notes[2].hand).toBe('left');
  });
});

describe('splitByPitch', () => {
  it('partitions notes', () => {
    const { left, right } = splitByPitch([note(50, 0), note(70, 0)], 60);
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(1);
  });
});

describe('noteName', () => {
  it('names pitches', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(69)).toBe('A4');
    expect(noteName(21)).toBe('A0');
  });
});

describe('groupChords', () => {
  const at = (midi: number, time: number): MidiNote => ({
    midi, track: 0, ticks: 0, durationTicks: 480, time, duration: 0.5, velocity: 0.8, channel: 0,
  });
  it('groups simultaneous notes and separates distinct onsets', () => {
    const notes = [at(60, 0), at(64, 0.01), at(67, 0.02), at(72, 1.0)];
    const groups = groupChords(notes);
    expect(groups).toHaveLength(2);
    expect(groups[0].map((n) => n.midi)).toEqual([60, 64, 67]);
    expect(groups[1].map((n) => n.midi)).toEqual([72]);
  });
  it('returns empty for no notes', () => {
    expect(groupChords([])).toEqual([]);
  });
});

describe('fitKeyboardRange', () => {
  const BLACK = [1, 3, 6, 8, 10];
  it('returns the full 88-key range for empty input', () => {
    expect(fitKeyboardRange([])).toEqual(FULL_KEYBOARD);
  });
  it('zooms to the song span with white-key boundaries (Für Elise-like)', () => {
    const r = fitKeyboardRange([note(40, 0), note(76, 1)]);
    expect(r).toEqual({ startMidi: 38, endMidi: 79 });
    expect(r.endMidi - r.startMidi).toBeLessThan(88);
    expect(BLACK).not.toContain(r.startMidi % 12);
    expect(BLACK).not.toContain(r.endMidi % 12);
  });
  it('enforces a minimum span for a very narrow song', () => {
    const r = fitKeyboardRange([note(60, 0)]);
    expect(r).toEqual({ startMidi: 48, endMidi: 72 });
    expect(r.endMidi - r.startMidi).toBeGreaterThanOrEqual(24);
  });
  it('clamps to the full piano for extreme registers', () => {
    expect(fitKeyboardRange([note(21, 0), note(108, 1)])).toEqual(FULL_KEYBOARD);
  });
  it('honours custom padding and minimum span', () => {
    const r = fitKeyboardRange([note(60, 0), note(64, 0)], { padding: 0, minSpan: 12 });
    expect(r).toEqual({ startMidi: 55, endMidi: 69 });
    expect(BLACK).not.toContain(r.startMidi % 12);
    expect(BLACK).not.toContain(r.endMidi % 12);
  });
  it('always stays within A0–C8', () => {
    const r = fitKeyboardRange([note(30, 0), note(90, 1)]);
    expect(r.startMidi).toBeGreaterThanOrEqual(21);
    expect(r.endMidi).toBeLessThanOrEqual(108);
  });
});
