import { describe, it, expect } from 'vitest';
import {
  midiToDiatonic,
  staffFor,
  stepsAboveBottom,
  noteValue,
  buildSheet,
  buildSheetSystems,
  buildBeamGroups,
  signatureFor,
  spellInKey,
  displayAccidental,
  inferKeySignature,
  TREBLE_BOTTOM,
  BASS_BOTTOM,
} from '../src/sheet';
import type { MidiSong, MidiNote } from '../src/types';
import type { SheetLayout, SheetNote } from '../src/sheet';

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

describe('buildSheetSystems', () => {
  // Two measures of 4/4 with a note in each (barTimes [0,2]).
  const twoMeasures = () => buildSheet(song([note(0, 480, 60), note(1920, 480, 62)]));

  it('paginates measures into systems of the requested size', () => {
    const systems = buildSheetSystems(twoMeasures(), 1);
    expect(systems).toHaveLength(2);
    expect(systems.map((s) => s.startMeasure)).toEqual([1, 2]);
    expect(systems.map((s) => s.measureCount)).toEqual([1, 1]);
    expect(systems[0]).toMatchObject({ index: 0, startTime: 0, endTime: 2 });
    expect(systems[1]).toMatchObject({ index: 1, startTime: 2 });
    expect(systems[1].endTime).toBeGreaterThanOrEqual(4);
  });
  it('packs multiple measures per system and handles a partial last system', () => {
    const layout = twoMeasures();
    const one = buildSheetSystems(layout, 4);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ startMeasure: 1, measureCount: 2 });
    const two = buildSheetSystems(layout, 2);
    expect(two).toHaveLength(1);
    expect(two[0].measureCount).toBe(2);
  });
  it('extends the final system to the end of the last note', () => {
    const layout = buildSheet(song([note(0, 480, 60), note(1920, 3840, 48)])); // last note ends at 6s
    const systems = buildSheetSystems(layout, 4);
    expect(systems[systems.length - 1].endTime).toBeGreaterThanOrEqual(6);
  });
  it('drops trailing empty measures so the score never ends on a blank system', () => {
    // barTimes span 2 measures but the only note is in measure 1 → 1 measure printed.
    const layout = buildSheet(song([note(0, 480, 60)]));
    const systems = buildSheetSystems(layout, 1);
    expect(systems).toHaveLength(1);
    expect(systems[0].measureCount).toBe(1);
  });
  it('produces one system for an empty layout', () => {
    const layout = buildSheet(song([]));
    const systems = buildSheetSystems(layout, 4);
    expect(systems).toHaveLength(1);
    expect(systems[0]).toMatchObject({ startMeasure: 1, startTime: 0 });
    expect(systems[0].measureCount).toBeGreaterThanOrEqual(1);
  });
  it('clamps a non-positive measures-per-system to 1', () => {
    const layout = twoMeasures();
    expect(buildSheetSystems(layout, 0)).toHaveLength(2);
    expect(buildSheetSystems(layout, -3)).toHaveLength(2);
  });
  it('covers 3/4 measures with correct numbering', () => {
    const s = song([note(0, 480, 60), note(2880, 480, 60)], 4320); // notes in measures 1 and 3
    s.timeSignatures = [{ ticks: 0, numerator: 3, denominator: 4 }];
    const layout = buildSheet(s);
    const systems = buildSheetSystems(layout, 2);
    expect(systems).toHaveLength(2);
    expect(systems[0]).toMatchObject({ startMeasure: 1, measureCount: 2 });
    expect(systems[1]).toMatchObject({ startMeasure: 3, measureCount: 1 });
  });
});

describe('buildBeamGroups', () => {
  const sn = (time: number, value: SheetNote['value'], over: Partial<SheetNote> = {}): SheetNote => ({
    midi: 64, time, duration: 0.2, hand: 'right', staff: 'treble', steps: 0, accidental: 0, value, ...over,
  });
  // barTimes [0,2], 4 beats → beatDur 0.5s (a quarter = 0.5s, an eighth = 0.25s).
  const lay = (notes: SheetNote[]): SheetLayout => ({ notes, barTimes: [0, 2], beatsPerMeasure: 4 });

  it('beams consecutive eighths within the same beat and staff', () => {
    const groups = buildBeamGroups(lay([sn(0, 'eighth'), sn(0.25, 'eighth')]));
    expect(groups).toHaveLength(1);
    expect(groups[0].indices).toEqual([0, 1]);
    expect(groups[0].staff).toBe('treble');
  });
  it('does not beam across a beat boundary', () => {
    const groups = buildBeamGroups(lay([sn(0, 'eighth'), sn(0.5, 'eighth')]));
    expect(groups).toHaveLength(0);
  });
  it('ignores quarter and whole notes', () => {
    expect(buildBeamGroups(lay([sn(0, 'quarter'), sn(0.25, 'quarter')]))).toHaveLength(0);
    expect(buildBeamGroups(lay([sn(0, 'whole')]))).toHaveLength(0);
  });
  it('keeps staves separate', () => {
    const groups = buildBeamGroups(lay([
      sn(0, 'eighth'), sn(0.25, 'eighth', { staff: 'bass', hand: 'left' }),
    ]));
    expect(groups).toHaveLength(0);
  });
  it('requires at least two distinct onsets (a lone chord is not beamed)', () => {
    const groups = buildBeamGroups(lay([sn(0, 'eighth'), sn(0, 'eighth', { midi: 67 })]));
    expect(groups).toHaveLength(0);
  });
  it('beams a sixteenth run and picks stem direction from average height', () => {
    const low = buildBeamGroups(lay([sn(0, 'sixteenth'), sn(0.125, 'sixteenth'), sn(0.25, 'sixteenth')]));
    expect(low).toHaveLength(1);
    expect(low[0].direction).toBe('up'); // steps 0 (low on staff) → stems up
    const high = buildBeamGroups(lay([
      sn(0, 'eighth', { steps: 6 }), sn(0.25, 'eighth', { steps: 6 }),
    ]));
    expect(high[0].direction).toBe('down');
  });
  it('returns no groups for an empty layout', () => {
    expect(buildBeamGroups(lay([]))).toHaveLength(0);
  });
});

describe('signatureFor', () => {
  it('C major (0) has no marks', () => {
    expect(signatureFor(0)).toEqual({ fifths: 0, marks: [] });
  });
  it('G major (+1) is F#; D major (+2) adds C# in order', () => {
    expect(signatureFor(1).marks).toEqual([{ pc: 5, step: 3, accidental: 1 }]);
    expect(signatureFor(2).marks.map((m) => m.pc)).toEqual([5, 0]);
  });
  it('F major (−1) is B♭ on step B', () => {
    expect(signatureFor(-1).marks).toEqual([{ pc: 10, step: 6, accidental: -1 }]);
  });
  it('clamps to ±7', () => {
    expect(signatureFor(9).marks).toHaveLength(7);
    expect(signatureFor(-9).marks).toHaveLength(7);
    expect(signatureFor(9).fifths).toBe(7);
  });
});

describe('spellInKey / displayAccidental', () => {
  const G = signatureFor(1); // F#
  const F = signatureFor(-1); // B♭
  it('respells a flat-key black key as a flat (B♭ sits on the B line)', () => {
    const bb = spellInKey(70, F); // A#4 → B♭4
    expect(bb).toMatchObject({ step: 6, accidental: -1 });
    expect(bb.index).toBe(midiToDiatonic(70).index + 1);
  });
  it('keeps sharp spelling in sharp keys', () => {
    expect(spellInKey(66, G)).toMatchObject({ step: 3, accidental: 1 }); // F#4
  });
  it('suppresses an accidental covered by the signature', () => {
    expect(displayAccidental(spellInKey(66, G), G)).toBe(0); // F# in G major
    expect(displayAccidental(spellInKey(70, F), F)).toBe(0); // B♭ in F major
  });
  it('shows a natural to cancel the signature', () => {
    expect(displayAccidental(spellInKey(65, G), G)).toBe(2); // F♮ in G major
    expect(displayAccidental(spellInKey(71, F), F)).toBe(2); // B♮ in F major
  });
  it('shows an explicit sharp for a chromatic note outside the signature', () => {
    expect(displayAccidental(spellInKey(61, G), G)).toBe(1); // C# in G major
  });
});

describe('inferKeySignature', () => {
  const scale = (midis: number[]) => midis.map((midi) => ({ midi, duration: 1 }));
  it('empty input → C major', () => {
    expect(inferKeySignature([]).fifths).toBe(0);
  });
  it('C major scale → 0', () => {
    expect(inferKeySignature(scale([60, 62, 64, 65, 67, 69, 71, 72])).fifths).toBe(0);
  });
  it('G major scale (F#) → +1', () => {
    expect(inferKeySignature(scale([67, 69, 71, 72, 74, 76, 78, 79])).fifths).toBe(1);
  });
  it('F major scale (B♭) → −1', () => {
    expect(inferKeySignature(scale([65, 67, 69, 70, 72, 74, 76, 77])).fifths).toBe(-1);
  });
  it('D major scale (F#, C#) → +2', () => {
    expect(inferKeySignature(scale([62, 64, 66, 67, 69, 71, 73, 74])).fifths).toBe(2);
  });
  it('A natural minor scale → 0 (relative of C)', () => {
    expect(inferKeySignature(scale([69, 71, 72, 74, 76, 77, 79, 81])).fifths).toBe(0);
  });
});

describe('buildSheet with key signature', () => {
  it('attaches the inferred signature and suppresses covered accidentals', () => {
    // A full G-major scale establishes the key; a short chromatic F♮4 forces a natural.
    const gScale = [67, 69, 71, 72, 74, 76, 78, 79].map((m, i) => note(i * 480, 480, m));
    const layout = buildSheet(song([...gScale, note(3840, 120, 65)], 4320), 60, true);
    expect(layout.keySignature?.fifths).toBe(1);
    const fSharp = layout.notes.find((n) => n.midi === 78)!; // F#5 in the scale
    const fNatural = layout.notes.find((n) => n.midi === 65)!;
    expect(fSharp.accidental).toBe(0); // covered by the F# signature
    expect(fNatural.accidental).toBe(2); // natural cancels the signature
  });
  it('default (no key signature) keeps raw sharp accidentals and no signature field', () => {
    const layout = buildSheet(song([note(0, 480, 66)]));
    expect(layout.keySignature).toBeUndefined();
    expect(layout.notes[0].accidental).toBe(1); // F# spelled sharp, shown
  });
});
