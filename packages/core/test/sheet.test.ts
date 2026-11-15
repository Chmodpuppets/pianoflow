import { describe, it, expect } from 'vitest';
import {
  midiToDiatonic,
  staffFor,
  stepsAboveBottom,
  noteValue,
  noteValueToBeats,
  buildSheet,
  buildSheetSystems,
  buildBeamGroups,
  buildRests,
  buildTies,
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

describe('noteValueToBeats', () => {
  it('round-trips with noteValue', () => {
    expect(noteValueToBeats('whole')).toBe(4);
    expect(noteValueToBeats('half')).toBe(2);
    expect(noteValueToBeats('quarter')).toBe(1);
    expect(noteValueToBeats('eighth')).toBe(0.5);
    expect(noteValueToBeats('sixteenth')).toBe(0.25);
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

// --- Rests + ties -----------------------------------------------------------
function sn(time: number, duration: number, midi: number, staff: 'treble' | 'bass' = 'treble'): SheetNote {
  return { midi, time, duration, staff, steps: 0, accidental: 0, value: 'quarter' };
}
function mkLayout(notes: SheetNote[]): SheetLayout {
  return { notes, barTimes: [0, 2, 4], beatsPerMeasure: 4 }; // beatDur 0.5s
}

describe('buildRests', () => {
  it('no rests when a staff is fully covered (no leading/inter-note gap)', () => {
    expect(buildRests(mkLayout([sn(0, 2, 60)]))).toEqual([]);
  });
  it('emits a half rest for a 2-beat inter-note gap, at the gap start', () => {
    const rests = buildRests(mkLayout([sn(0, 0.5, 60), sn(1.5, 0.5, 62)]));
    expect(rests).toEqual([{ time: 0.5, staff: 'treble', value: 'half' }]);
  });
  it('emits a leading rest when a staff enters late', () => {
    const rests = buildRests(mkLayout([sn(1, 0.5, 60)]));
    expect(rests).toEqual([{ time: 0, staff: 'treble', value: 'half' }]);
  });
  it('emits a whole rest for a long (>=3.5 beat) gap', () => {
    const rests = buildRests(mkLayout([sn(0, 0.5, 60), sn(4.5, 0.5, 62)]));
    expect(rests).toEqual([{ time: 0.5, staff: 'treble', value: 'whole' }]);
  });
  it('merges sustained/chord intervals so they do not create spurious rests', () => {
    // A long note covers the shorter ones beneath it → no silence.
    expect(buildRests(mkLayout([sn(0, 2, 60), sn(0.5, 0.5, 64), sn(1, 0.5, 67)]))).toEqual([]);
  });
  it('detects gaps per staff independently', () => {
    const rests = buildRests(mkLayout([sn(0, 2, 60, 'treble'), sn(0, 0.5, 48, 'bass'), sn(1.5, 0.5, 50, 'bass')]));
    expect(rests).toEqual([{ time: 0.5, staff: 'bass', value: 'half' }]);
  });
  it('ignores gaps shorter than minBeats', () => {
    // 0.25s gap = 0.5 beat < 1 → no rest.
    expect(buildRests(mkLayout([sn(0, 0.5, 60), sn(0.75, 0.5, 62)]))).toEqual([]);
  });
  it('omits trailing silence after the last note', () => {
    expect(buildRests(mkLayout([sn(0, 0.5, 60)]))).toEqual([]);
  });
});

describe('buildTies', () => {
  // mkLayout barlines are at 0, 2, 4 — a tie must cross the barline at t=2.
  it('ties contiguous same-pitch notes that cross a barline', () => {
    const ties = buildTies(mkLayout([sn(1.5, 0.5, 60), sn(2, 0.5, 60)]));
    expect(ties).toEqual([{ from: 0, to: 1, staff: 'treble' }]);
  });
  it('does NOT tie repeated notes within a measure (no barline between)', () => {
    // The classic repeated-note case (e.g. Twinkle "C C") must stay un-tied.
    expect(buildTies(mkLayout([sn(0, 1, 60), sn(1, 1, 60)]))).toEqual([]);
  });
  it('does not tie different pitches across a barline', () => {
    expect(buildTies(mkLayout([sn(1.5, 0.5, 60), sn(2, 0.5, 62)]))).toEqual([]);
  });
  it('does not tie re-articulated notes (a real gap between them)', () => {
    expect(buildTies(mkLayout([sn(1.5, 0.25, 60), sn(2, 0.5, 60)]))).toEqual([]);
  });
  it('does not tie overlapping same-pitch notes', () => {
    expect(buildTies(mkLayout([sn(1.5, 1, 60), sn(2, 1, 60)]))).toEqual([]);
  });
  it('ties on the bass staff independently', () => {
    const ties = buildTies(mkLayout([sn(1.5, 0.5, 48, 'bass'), sn(2, 0.5, 48, 'bass')]));
    expect(ties).toEqual([{ from: 0, to: 1, staff: 'bass' }]);
  });
});

describe('buildSheet with rests + ties', () => {
  it('attaches rests and ties when enabled', () => {
    // C4 sustained across the barline at t=2 (tie) + a leading and a 2-beat gap (rests).
    const layout = buildSheet(
      song([note(1440, 480, 60), note(1920, 480, 60), note(3360, 480, 62)], 3840),
      60,
      false,
      true,
    );
    expect(layout.ties).toEqual([{ from: 0, to: 1, staff: 'treble' }]);
    expect(layout.rests).toEqual([
      { time: 0, staff: 'treble', value: 'half' },
      { time: 2.5, staff: 'treble', value: 'half' },
    ]);
  });
  it('default leaves rests/ties undefined', () => {
    const layout = buildSheet(song([note(0, 480, 60)]));
    expect(layout.rests).toBeUndefined();
    expect(layout.ties).toBeUndefined();
  });
});

describe('buildSheet metadata (tempo, timeSig, staccato, dynamics)', () => {
  it('captures bpm and time signature', () => {
    const layout = buildSheet(song([note(0, 480, 60)]));
    expect(layout.bpm).toBe(120);
    expect(layout.timeSig).toEqual([4, 4]);
  });

  it('detects staccato notes (short sounding vs notated value)', () => {
    // A quarter note (480 ticks) that sounds for only 0.1s at 120bpm (beat=0.5s)
    // → duration 0.1 < 0.5 * 1 * 0.5 = 0.25 → staccato.
    const s: MidiSong = {
      name: 't', format: 1, ppq: 480, durationTicks: 3840, duration: 8,
      notes: [{ midi: 60, ticks: 0, durationTicks: 480, time: 0, duration: 0.1, velocity: 0.8, channel: 0, track: 0 }],
      tempos: [{ ticks: 0, bpm: 120, time: 0 }],
      timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }],
      tracks: [],
    };
    const layout = buildSheet(s);
    expect(layout.staccatoIndices?.has(0)).toBe(true);
  });

  it('does not flag legato notes as staccato', () => {
    // A quarter note sounding for its full 0.5s at 120bpm → not staccato.
    const s: MidiSong = {
      name: 't', format: 1, ppq: 480, durationTicks: 3840, duration: 8,
      notes: [{ midi: 60, ticks: 0, durationTicks: 480, time: 0, duration: 0.5, velocity: 0.8, channel: 0, track: 0 }],
      tempos: [{ ticks: 0, bpm: 120, time: 0 }],
      timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }],
      tracks: [],
    };
    const layout = buildSheet(s);
    expect(layout.staccatoIndices).toBeUndefined();
  });

  it('emits dynamic markings from velocity analysis', () => {
    // All notes vel=0.8 → avg 101.6 → 'ff' on measure 0.
    const s: MidiSong = {
      name: 't', format: 1, ppq: 480, durationTicks: 7680, duration: 16,
      notes: [
        { midi: 60, ticks: 0, durationTicks: 480, time: 0, duration: 0.5, velocity: 0.8, channel: 0, track: 0 },
        { midi: 62, ticks: 480, durationTicks: 480, time: 0.5, duration: 0.5, velocity: 0.8, channel: 0, track: 0 },
      ],
      tempos: [{ ticks: 0, bpm: 120, time: 0 }],
      timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }],
      tracks: [],
    };
    const layout = buildSheet(s);
    expect(layout.dynamics?.get(0)).toBe('ff');
  });

  it('omits dynamics when velocity is uniform across all measures', () => {
    // Two measures with same avg velocity → only measure 0 gets a dynamic.
    const s: MidiSong = {
      name: 't', format: 1, ppq: 480, durationTicks: 7680, duration: 16,
      notes: [
        { midi: 60, ticks: 0, durationTicks: 480, time: 0, duration: 0.5, velocity: 0.5, channel: 0, track: 0 },
        { midi: 62, ticks: 1920, durationTicks: 480, time: 2, duration: 0.5, velocity: 0.5, channel: 0, track: 0 },
      ],
      tempos: [{ ticks: 0, bpm: 120, time: 0 }],
      timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }],
      tracks: [],
    };
    const layout = buildSheet(s);
    expect(layout.dynamics?.size).toBe(1);
    expect(layout.dynamics?.get(0)).toBe('mf');
    expect(layout.dynamics?.has(1)).toBe(false);
  });
});
