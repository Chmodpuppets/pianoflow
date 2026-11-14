import type { MidiNote, MidiSong } from './types';
import { TempoMap } from './tempo';

/**
 * Grand-staff sheet-music layout. Pure functions (no DOM) so the notation math
 * can be unit-tested headlessly and reused by any renderer.
 *
 * The layout works in the time domain: each note gets a staff, a diatonic
 * position (steps above the staff's bottom line), an accidental and a rhythmic
 * value. A renderer maps time → x and draws a scrolling grand staff with a fixed
 * play cursor.
 */

export type Staff = 'treble' | 'bass';
export type NoteValue = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';

/** Diatonic step (C=0 … B=6) + accidental for a pitch class, preferring sharps. */
const PC_SPELL: ReadonlyArray<readonly [number, number]> = [
  [0, 0], // C
  [0, 1], // C#
  [1, 0], // D
  [1, 1], // D#
  [2, 0], // E
  [3, 0], // F
  [3, 1], // F#
  [4, 0], // G
  [4, 1], // G#
  [5, 0], // A
  [5, 1], // A#
  [6, 0], // B
];

export interface Diatonic {
  step: number; // 0..6 (C..B)
  accidental: number; // -1 | 0 | 1
  octave: number;
  /** Absolute diatonic index = octave*7 + step (C4 = 28). */
  index: number;
}

export function midiToDiatonic(midi: number): Diatonic {
  const pc = ((midi % 12) + 12) % 12;
  const [step, accidental] = PC_SPELL[pc];
  const octave = Math.floor(midi / 12) - 1;
  return { step, accidental, octave, index: octave * 7 + step };
}

/** Bottom line of each staff as an absolute diatonic index. */
export const TREBLE_BOTTOM = midiToDiatonic(64).index; // E4
export const BASS_BOTTOM = midiToDiatonic(43).index; // G2

/** Which staff a pitch belongs to (middle C = 60 is the default split). */
export function staffFor(midi: number, splitMidi = 60): Staff {
  return midi >= splitMidi ? 'treble' : 'bass';
}

/** Steps above the staff's bottom line (may be negative → ledger lines below). */
export function stepsAboveBottom(midi: number, staff: Staff): number {
  return midiToDiatonic(midi).index - (staff === 'treble' ? TREBLE_BOTTOM : BASS_BOTTOM);
}

/** Classify a duration (in beats) into a rhythmic value. */
export function noteValue(beats: number): NoteValue {
  if (beats >= 3.5) return 'whole';
  if (beats >= 1.5) return 'half';
  if (beats >= 0.75) return 'quarter';
  if (beats >= 0.375) return 'eighth';
  return 'sixteenth';
}

export interface SheetNote {
  midi: number;
  time: number; // seconds
  duration: number; // seconds
  hand?: 'left' | 'right';
  staff: Staff;
  steps: number; // steps above staff bottom line
  accidental: number;
  value: NoteValue;
}

export interface SheetLayout {
  notes: SheetNote[];
  /** Barline times in seconds (ascending, includes 0). */
  barTimes: number[];
  beatsPerMeasure: number;
}

/** Build the scrolling grand-staff layout for a song. Pure. */
export function buildSheet(song: MidiSong, splitMidi = 60): SheetLayout {
  const tempo = new TempoMap(song.ppq, song.tempos);
  const sigs = song.timeSignatures.length
    ? [...song.timeSignatures].sort((a, b) => a.ticks - b.ticks)
    : [{ ticks: 0, numerator: 4, denominator: 4 }];

  const barTicks: number[] = [0];
  for (let i = 0; i < sigs.length; i++) {
    const sig = sigs[i];
    const measureTicks = Math.max(1, Math.round((song.ppq * 4 * sig.numerator) / sig.denominator));
    const end = i + 1 < sigs.length ? sigs[i + 1].ticks : song.durationTicks;
    // First barline of this segment aligns to its start tick.
    let t = sig.ticks;
    if (barTicks[barTicks.length - 1] !== t) barTicks.push(t);
    for (t += measureTicks; t < end; t += measureTicks) barTicks.push(t);
  }
  const barTimes = [...new Set(barTicks.map((t) => tempo.ticksToSeconds(t)))].sort((a, b) => a - b);

  const notes: SheetNote[] = song.notes.map((n: MidiNote) => {
    const staff = staffFor(n.midi, splitMidi);
    return {
      midi: n.midi,
      time: n.time,
      duration: n.duration,
      hand: n.hand,
      staff,
      steps: stepsAboveBottom(n.midi, staff),
      accidental: midiToDiatonic(n.midi).accidental,
      value: noteValue(n.durationTicks / song.ppq),
    };
  });
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);

  const first = sigs[0];
  return { notes, barTimes, beatsPerMeasure: first.numerator * (4 / first.denominator) };
}

/** One horizontal row ("system") of a printed full-score page. */
export interface SheetSystem {
  index: number; // 0-based system index
  startMeasure: number; // 1-based number of the first measure in this system
  measureCount: number;
  startTime: number; // seconds (inclusive)
  endTime: number; // seconds (exclusive; start of next system or piece end)
}

/** A run of consecutive eighth/sixteenth notes joined by a beam instead of flags. */
export interface BeamGroup {
  staff: Staff;
  /** indices into layout.notes (time order) */
  indices: number[];
  direction: 'up' | 'down';
}

/**
 * Group beamed notes: consecutive eighth/sixteenth notes on the same staff within
 * the same beat (beat length derived from the first bar span / beatsPerMeasure).
 * Chords share a group, but a group needs >= 2 distinct onsets to carry a beam.
 * Pure + headless-testable; renderers draw the beam and suppress individual flags.
 */
export function buildBeamGroups(layout: SheetLayout): BeamGroup[] {
  const notes = layout.notes;
  const bars = layout.barTimes.length ? layout.barTimes : [0];
  const beats = Math.max(1, layout.beatsPerMeasure);
  const beatDur = bars.length >= 2 ? (bars[1] - bars[0]) / beats : 0.5;
  if (!(beatDur > 0)) return [];
  const barStartFor = (t: number): number => {
    let b = bars[0];
    for (const bt of bars) {
      if (bt <= t + 1e-9) b = bt;
      else break;
    }
    return b;
  };
  const beatKey = (t: number): string => {
    const b = barStartFor(t);
    return `${b}:${Math.floor((t - b) / beatDur + 1e-6)}`;
  };
  const beamed = (v: NoteValue): boolean => v === 'eighth' || v === 'sixteenth';
  const groups: BeamGroup[] = [];
  let run: number[] = [];
  let runStaff: Staff | null = null;
  let runKey = '';
  let lastTime = 0;
  const flush = (): void => {
    if (run.length >= 2 && new Set(run.map((i) => notes[i].time)).size >= 2) {
      const avg = run.reduce((s, i) => s + notes[i].steps, 0) / run.length;
      groups.push({ staff: runStaff as Staff, indices: [...run], direction: avg >= 4 ? 'down' : 'up' });
    }
    run = [];
  };
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (!beamed(n.value)) {
      flush();
      runStaff = null;
      continue;
    }
    const key = beatKey(n.time);
    if (run.length && (n.staff !== runStaff || key !== runKey || n.time - lastTime > beatDur * 0.75)) flush();
    if (!run.length) {
      runStaff = n.staff;
      runKey = key;
    }
    run.push(i);
    lastTime = n.time;
  }
  flush();
  return groups;
}

/**
 * Paginate a grand-staff layout into systems of `measuresPerSystem` measures for
 * a static, printable full-score page. Pure: each `barTimes` entry is a measure
 * START (the final end barline is omitted by buildSheet), so the measure count
 * equals barTimes.length. The last system's endTime extends to the end of the
 * final note (or one typical measure past the last barline) so partial final
 * measures still get horizontal space.
 */
export function buildSheetSystems(layout: SheetLayout, measuresPerSystem = 4): SheetSystem[] {
  const per = Math.max(1, Math.floor(measuresPerSystem));
  const bars = layout.barTimes.length ? layout.barTimes : [0];
  const typical = bars.length >= 2 ? bars[1] - bars[0] : 2;
  let noteEnd = 0;
  let lastWithNote = -1;
  for (const n of layout.notes) {
    noteEnd = Math.max(noteEnd, n.time + n.duration);
    // Measure index = the last barline at or before the note's onset.
    let mi = 0;
    for (let i = 0; i < bars.length; i++) {
      if (bars[i] <= n.time + 1e-9) mi = i;
      else break;
    }
    if (mi > lastWithNote) lastWithNote = mi;
  }
  // Drop trailing empty measures so a printed score never ends on a blank system
  // (the MIDI duration can round up past the final note). Keep >= 1 measure.
  const total = Math.max(1, lastWithNote + 1);
  const pieceEnd = Math.max(noteEnd, bars[Math.min(total, bars.length) - 1] + typical);

  const systems: SheetSystem[] = [];
  for (let i = 0; i < total; i += per) {
    const count = Math.min(per, total - i);
    const startTime = bars[i];
    const endTime = i + count < total ? bars[i + count] : pieceEnd;
    systems.push({ index: systems.length, startMeasure: i + 1, measureCount: count, startTime, endTime });
  }
  return systems;
}
