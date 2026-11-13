import { describe, it, expect } from 'vitest';
import { writeMidi, PerformanceRecorder, parseMidi, type WriteNote } from '../src/index';

describe('writeMidi (SMF format 0)', () => {
  it('writes a valid MThd/MTrk header', () => {
    const bytes = writeMidi([{ midi: 60, start: 0, end: 0.5, velocity: 0.8 }]);
    const head = String.fromCharCode(...bytes.slice(0, 4));
    expect(head).toBe('MThd');
    expect(bytes.length).toBeGreaterThan(20);
  });

  it('round-trips through parseMidi (pitch + timing)', () => {
    const notes: WriteNote[] = [
      { midi: 60, start: 0, end: 0.5, velocity: 0.8 },
      { midi: 64, start: 0.5, end: 1.0, velocity: 0.6 },
      { midi: 67, start: 1.0, end: 1.5, velocity: 1.0 },
    ];
    const song = parseMidi(writeMidi(notes).buffer as ArrayBuffer);
    expect(song.notes.length).toBe(3);
    const midis = song.notes.map((n) => n.midi).sort((a, b) => a - b);
    expect(midis).toEqual([60, 64, 67]);
    const first = song.notes.find((n) => n.midi === 60)!;
    expect(first.time).toBeCloseTo(0, 3);
    expect(first.duration).toBeCloseTo(0.5, 2);
    const last = song.notes.find((n) => n.midi === 67)!;
    expect(last.time).toBeCloseTo(1.0, 2);
  });

  it('handles an empty performance', () => {
    const song = parseMidi(writeMidi([]).buffer as ArrayBuffer);
    expect(song.notes.length).toBe(0);
  });

  it('clamps out-of-range pitch and velocity', () => {
    const song = parseMidi(writeMidi([{ midi: 200, start: 0, end: 0.2, velocity: 5 }]).buffer as ArrayBuffer);
    expect(song.notes[0].midi).toBe(127);
    expect(song.notes[0].velocity).toBeLessThanOrEqual(1);
  });
});

describe('PerformanceRecorder', () => {
  function clock() {
    let t = 0;
    return { now: () => t, set: (v: number) => { t = v; } };
  }

  it('ignores events before start', () => {
    const c = clock();
    const r = new PerformanceRecorder(c.now);
    r.noteOn(60, 0.8);
    r.noteOff(60);
    expect(r.noteCount).toBe(0);
    expect(r.recording).toBe(false);
  });

  it('captures timed notes and closes held keys on stop', () => {
    const c = clock();
    const r = new PerformanceRecorder(c.now);
    r.start();
    c.set(0.1); r.noteOn(60, 0.8);
    c.set(0.6); r.noteOff(60);
    c.set(0.7); r.noteOn(64, 0.5); // held, never released
    c.set(1.2);
    const notes = r.stop();
    expect(r.recording).toBe(false);
    expect(notes.length).toBe(2);
    expect(notes[0]).toMatchObject({ midi: 60, start: 0.1 });
    expect(notes[0].end).toBeCloseTo(0.6, 5);
    expect(notes[1].midi).toBe(64);
    expect(notes[1].end).toBeCloseTo(1.2, 5); // closed at stop
  });

  it('re-triggering the same key closes the previous hold', () => {
    const c = clock();
    const r = new PerformanceRecorder(c.now);
    r.start();
    c.set(0); r.noteOn(60, 0.8);
    c.set(0.3); r.noteOn(60, 0.9);
    c.set(0.5); r.noteOff(60);
    const notes = r.stop();
    expect(notes.length).toBe(2);
    expect(notes[0].end).toBeCloseTo(0.3, 5);
    expect(notes[1].start).toBeCloseTo(0.3, 5);
  });

  it('start clears a previous take', () => {
    const c = clock();
    const r = new PerformanceRecorder(c.now);
    r.start(); r.noteOn(60, 0.8); r.noteOff(60); r.stop();
    r.start();
    expect(r.noteCount).toBe(0);
  });
});
