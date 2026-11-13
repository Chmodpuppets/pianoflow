import { describe, it, expect } from 'vitest';
import {
  midiToDiatonic,
  staffFor,
  stepsAboveBottom,
  noteValue,
  buildSheet,
  TREBLE_BOTTOM,
  BASS_BOTTOM,
} from '../src/sheet';
import type { MidiSong, MidiNote } from '../src/types';

describe('midiToDiatonic', () => {
  it('spells C4 as step 0, no accidental, octave 4', () => {
    expect(midiToDiatonic(60)).toEqual({ step: 0, accidental: 0, octave: 4, index: 28 });
  });
  it('uses sharps for black keys', () => {
    expect(midiToDiatonic(61)).toMatchObject({ step: 0, accidental: 1 });
    expect(midiToDiatonic(66)).toMatchObject({ step: 3, accidental: 1 });
  });
  it('anchors the staff bottom lines', () => {
    expect(TREBLE_BOTTOM).toBe(midiToDiatonic(64).index); // E4
    expect(BASS_BOTTOM).toBe(midiToDiatonic(43).index); // G2
  });
});

describe('staffFor / stepsAboveBottom', () => {
  it('splits at middle C by default', () => {
    expect(staffFor(60)).toBe('treble');
    expect(staffFor(59)).toBe('bass');
    expect(staffFor(50, 48)).toBe('treble');
  });
  it('E4 sits on the treble bottom line; C4 is two steps below', () => {
    expect(stepsAboveBottom(64, 'treble')).toBe(0);
    expect(stepsAboveBottom(60, 'treble')).toBe(-2);
  });
  it('G2 sits on the bass bottom line; C4 is ten steps above', () => {
    expect(stepsAboveBottom(43, 'bass')).toBe(0);
    expect(stepsAboveBottom(60, 'bass')).toBe(10);
  });
});

describe('noteValue', () => {
  it('classifies by beats', () => {
    expect(noteValue(4)).toBe('whole');
    expect(noteValue(2)).toBe('half');
    expect(noteValue(1)).toBe('quarter');
    expect(noteValue(0.5)).toBe('eighth');
    expect(noteValue(0.25)).toBe('sixteenth');
  });
});

function note(ticks: number, dur: number, midi: number): MidiNote {
  return {
    midi,
    ticks,
    durationTicks: dur,
    time: ticks / 960, // 120bpm, ppq480 → 0.5s per quarter (480 ticks)
    duration: dur / 960,
    velocity: 0.8,
    channel: 0,
    track: 0,
  };
}

function song(notes: MidiNote[], durationTicks = 3840): MidiSong {
  return {
    name: 't',
    format: 1,
    ppq: 480,
    durationTicks,
    duration: durationTicks / 480,
    notes,
    tempos: [{ ticks: 0, bpm: 120, time: 0 }],
    timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }],
    tracks: [],
  };
}

describe('buildSheet', () => {
  it('computes barline times from the time signature + tempo', () => {
    const layout = buildSheet(song([note(0, 480, 60)]));
    expect(layout.barTimes).toEqual([0, 2]); // 4/4 at 120bpm = 2s per bar
    expect(layout.beatsPerMeasure).toBe(4);
  });
  it('assigns staff, steps, accidental and value per note, sorted by time', () => {
    const layout = buildSheet(
      song([note(960, 480, 67), note(0, 480, 60), note(480, 240, 61), note(1920, 960, 45)]),
    );
    expect(layout.notes.map((n) => n.time)).toEqual([0, 0.5, 1, 2]);
    const [c4, cs4, g4, a2] = layout.notes;
    expect(c4).toMatchObject({ staff: 'treble', steps: -2, accidental: 0, value: 'quarter' });
    expect(cs4).toMatchObject({ accidental: 1, value: 'eighth' });
    expect(g4).toMatchObject({ staff: 'treble', value: 'quarter' });
    expect(a2).toMatchObject({ staff: 'bass', value: 'half' });
  });
  it('handles an empty song', () => {
    const layout = buildSheet(song([]));
    expect(layout.notes).toEqual([]);
    expect(layout.barTimes[0]).toBe(0);
  });
  it('respects 3/4 time', () => {
    const s = song([note(0, 480, 60)], 2880);
    s.timeSignatures = [{ ticks: 0, numerator: 3, denominator: 4 }];
    const layout = buildSheet(s);
    expect(layout.beatsPerMeasure).toBe(3);
    expect(layout.barTimes).toEqual([0, 1.5]); // barlines at the start of each measure
  });
});
