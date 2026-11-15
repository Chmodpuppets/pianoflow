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

/**
 * Key signature engraving. A signature is an ordered list of altered pitch
 * classes (sharps F–C–G–D–A–E–B, flats B–E–A–D–G–C–F). Notes are respelled to
 * match the key and only carry an explicit accidental when they deviate from it.
 */
export interface KeyMark {
  pc: number; // pitch class affected (0..11)
  step: number; // diatonic step (C=0..B=6) the glyph sits on
  accidental: 1 | -1;
}
export interface KeySignature {
  /** circle-of-fifths position: + sharps, − flats (−7..+7) */
  fifths: number;
  marks: KeyMark[];
}

const SHARP_ORDER: ReadonlyArray<readonly [number, number]> = [
  [5, 3], [0, 0], [7, 4], [2, 1], [9, 5], [4, 2], [11, 6], // F C G D A E B
];
const FLAT_ORDER: ReadonlyArray<readonly [number, number]> = [
  [10, 6], [3, 2], [8, 5], [1, 1], [6, 4], [11, 0], [4, 3], // B E A D G C F
];

/** Build the signature for a circle-of-fifths position (clamped to ±7). Pure. */
export function signatureFor(fifths: number): KeySignature {
  const f = Math.max(-7, Math.min(7, Math.round(fifths)));
  const order = f >= 0 ? SHARP_ORDER : FLAT_ORDER;
  const accidental: 1 | -1 = f >= 0 ? 1 : -1;
  const marks = order.slice(0, Math.abs(f)).map(([pc, step]) => ({ pc, step, accidental }));
  return { fifths: f, marks };
}

/**
 * Respell a pitch for a key. Flat keys name black keys as flats (one diatonic
 * step above the sharp spelling); sharp keys / naturals keep the default spelling.
 */
export function spellInKey(midi: number, sig: KeySignature): Diatonic {
  const base = midiToDiatonic(midi);
  const pc = ((midi % 12) + 12) % 12;
  const mark = sig.marks.find((m) => m.pc === pc);
  if (mark && mark.accidental === -1) {
    const index = base.index + 1; // sharp → flat moves up one diatonic step
    return { step: index % 7, accidental: -1, octave: Math.floor(index / 7), index };
  }
  return base;
}

/**
 * The accidental a note must SHOW given the key signature: 0 none (covered by the
 * signature), 1 sharp, −1 flat, 2 natural (cancels the signature for that step).
 */
export function displayAccidental(d: Diatonic, sig: KeySignature): number {
  const mark = sig.marks.find((m) => m.step === d.step);
  const def = mark ? mark.accidental : 0;
  if (d.accidental === def) return 0;
  if (d.accidental === 0) return 2;
  return d.accidental;
}

// Krumhansl–Kessler key profiles (tonic-relative), major then natural minor.
const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
// Circle-of-fifths position per tonic pitch class (prefers the simpler enharmonic).
const MAJOR_FIFTHS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];
const MINOR_FIFTHS = [-3, 4, -1, -6, 1, -4, 3, -2, 5, 0, -5, 2];

/**
 * Infer a key signature from a piece via duration-weighted pitch-class correlation
 * against the 24 major/minor profiles (Krumhansl–Schmuckler). Empty input → C.
 * Pure + headless-testable; only the resulting signature (fifths) is used.
 */
export function inferKeySignature(notes: ReadonlyArray<{ midi: number; duration?: number }>): KeySignature {
  if (!notes.length) return signatureFor(0);
  const hist = new Array<number>(12).fill(0);
  for (const n of notes) {
    const pc = ((n.midi % 12) + 12) % 12;
    hist[pc] += Math.max(0.05, n.duration ?? 1);
  }
  const total = hist.reduce((a, b) => a + b, 0);
  if (total <= 0) return signatureFor(0);
  const meanH = total / 12;
  const corr = (profile: number[], tonic: number): number => {
    const meanP = profile.reduce((a, b) => a + b, 0) / 12;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < 12; i++) {
      const h = hist[i] - meanH;
      const p = profile[(i - tonic + 12) % 12] - meanP;
      num += h * p;
      da += h * h;
      db += p * p;
    }
    const den = Math.sqrt(da * db);
    return den > 0 ? num / den : 0;
  };
  let best = -Infinity;
  let bestFifths = 0;
  for (let tonic = 0; tonic < 12; tonic++) {
    const cm = corr(KS_MAJOR, tonic);
    if (cm > best) {
      best = cm;
      bestFifths = MAJOR_FIFTHS[tonic];
    }
    const cn = corr(KS_MINOR, tonic);
    if (cn > best) {
      best = cn;
      bestFifths = MINOR_FIFTHS[tonic];
    }
  }
  return signatureFor(bestFifths);
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

/** Convert a NoteValue back to its nominal beat duration. */
export function noteValueToBeats(v: NoteValue): number {
  switch (v) {
    case 'whole': return 4;
    case 'half': return 2;
    case 'quarter': return 1;
    case 'eighth': return 0.5;
    case 'sixteenth': return 0.25;
  }
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

/** A silence on one staff, quantised to a rhythmic value and placed at the gap start. */
export interface Rest {
  time: number; // seconds (start of the silent gap)
  measureEnd?: number; // full-measure rests are centered between these boundaries
  staff: Staff;
  value: NoteValue;
}

/** A tie joining two contiguous same-pitch notes (indices into layout.notes). */
export interface Tie {
  from: number;
  to: number;
  staff: Staff;
}

export interface SheetLayout {
  notes: SheetNote[];
  /** Barline times in seconds (ascending, includes 0). */
  barTimes: number[];
  beatsPerMeasure: number;
  /** Present when built with key-signature engraving; renderers draw it after the clef. */
  keySignature?: KeySignature;
  /** Present when built with rest/tie engraving; renderers draw silences + ties. */
  rests?: Rest[];
  ties?: Tie[];
  /** Tempo in BPM at the start of the piece (for ♩= marking). */
  bpm?: number;
  /** Time signature numerator/denominator at the start (for fraction display). */
  timeSig?: [number, number];
  /** Indices into layout.notes that should show a staccato dot. */
  staccatoIndices?: Set<number>;
  /** Dynamic markings: measure index → dynamic string ('p','mp','mf','f','ff'). */
  dynamics?: Map<number, string>;
}

/**
 * Build the scrolling grand-staff layout for a song. Pure. With `useKeySignature`
 * the piece's key is inferred, notes are respelled into the key and only carry an
 * accidental when they deviate from the signature (which is attached to the layout).
 * With `useRestsTies` per-staff silences (rests) and contiguous same-pitch ties are
 * computed and attached for the renderers to engrave.
 */
export function buildSheet(song: MidiSong, splitMidi = 60, useKeySignature = false, useRestsTies = false): SheetLayout {
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

  const keySig = useKeySignature ? inferKeySignature(song.notes) : null;
  const notes: SheetNote[] = song.notes.map((n: MidiNote) => {
    const staff = staffFor(n.midi, splitMidi);
    const d = keySig ? spellInKey(n.midi, keySig) : midiToDiatonic(n.midi);
    const bottom = staff === 'treble' ? TREBLE_BOTTOM : BASS_BOTTOM;
    return {
      midi: n.midi,
      time: n.time,
      duration: n.duration,
      hand: n.hand,
      staff,
      steps: d.index - bottom,
      accidental: keySig ? displayAccidental(d, keySig) : d.accidental,
      value: noteValue(n.durationTicks / song.ppq),
    };
  });
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);

  const first = sigs[0];
  const layout: SheetLayout = { notes, barTimes, beatsPerMeasure: first.numerator * (4 / first.denominator) };
  if (keySig) layout.keySignature = keySig;

  // Tempo + time signature metadata for engraving.
  const bpm = song.tempos.length ? Math.round(song.tempos[0].bpm) : 120;
  layout.bpm = bpm;
  layout.timeSig = [first.numerator, first.denominator];

  // Staccato detection: notes whose sounding duration is < 50% of their notated beat value.
  const beatDur = barTimes.length >= 2 ? (barTimes[1] - barTimes[0]) / Math.max(1, layout.beatsPerMeasure) : 0.5;
  if (beatDur > 0) {
    const staccatoIndices = new Set<number>();
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      // Use the note's rhythmic value (in beats) from the NoteValue enum.
      const notatedBeats = noteValueToBeats(n.value);
      // A note is staccato if it sounds for less than half its notated rhythmic slot
      // AND the notated value is at least an eighth note (avoid flagging sixteenths).
      if (notatedBeats >= 0.25 && n.duration < beatDur * notatedBeats * 0.5) {
        staccatoIndices.add(i);
      }
    }
    if (staccatoIndices.size > 0) layout.staccatoIndices = staccatoIndices;
  }

  // Dynamic markings from velocity analysis per measure.
  if (song.notes.length > 0 && barTimes.length >= 2) {
    const dynamics = new Map<number, string>();
    for (let mi = 0; mi < barTimes.length; mi++) {
      const mStart = barTimes[mi];
      const mEnd = mi + 1 < barTimes.length ? barTimes[mi + 1] : Infinity;
      let sum = 0;
      let count = 0;
      for (const sn of song.notes) {
        if (sn.time >= mStart && sn.time < mEnd) {
          sum += sn.velocity * 127;
          count++;
        }
      }
      if (count === 0) continue;
      const avg = sum / count;
      // Only emit a dynamic when it changes from the previous measure.
      const dyn = avg < 40 ? 'p' : avg < 60 ? 'mp' : avg < 80 ? 'mf' : avg < 100 ? 'f' : 'ff';
      const prevDyn = mi > 0 ? dynamics.get(mi - 1) : undefined;
      if (dyn !== prevDyn) dynamics.set(mi, dyn);
    }
    if (dynamics.size > 0) layout.dynamics = dynamics;
  }

  if (useRestsTies) {
    layout.rests = buildRests(layout);
    layout.ties = buildTies(layout);
  }
  return layout;
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

/** Beat length in seconds, derived from the first bar span (shared by beams/rests). */
function beatDuration(layout: SheetLayout): number {
  const bars = layout.barTimes.length ? layout.barTimes : [0];
  const beats = Math.max(1, layout.beatsPerMeasure);
  return bars.length >= 2 ? (bars[1] - bars[0]) / beats : 0.5;
}

/** Merge sounding intervals per staff, then write a centered rest for each empty measure. */
export function buildRests(layout: SheetLayout, minBeats = 1): Rest[] {
  const beatDur = beatDuration(layout);
  if (!(beatDur > 0) || layout.notes.length === 0) return [];
  const lastOnset = layout.notes.reduce((last, note) => Math.max(last, note.time), 0);
  const bars = (layout.barTimes.length ? layout.barTimes : [0]).filter((time) => time <= lastOnset + 1e-9);
  const lastBar = bars[bars.length - 1] ?? 0;
  const nextBar = layout.barTimes[bars.length];
  bars.push(nextBar ?? lastBar + beatDur * layout.beatsPerMeasure);

  const rests: Rest[] = [];
  for (const staff of ['treble', 'bass'] as Staff[]) {
    const intervals = layout.notes
      .filter((n) => n.staff === staff)
      .map((n) => [n.time, n.time + n.duration] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const [s, e] of intervals) {
      const last = merged[merged.length - 1];
      if (last && s <= last[1] + 1e-3) last[1] = Math.max(last[1], e);
      else merged.push([s, e]);
    }

    const addPartialRest = (start: number, end: number) => {
      const beats = (end - start) / beatDur;
      if (beats < minBeats - 1e-6) return;
      const value: NoteValue = beats >= 3.5 ? 'whole' : beats >= 1.5 ? 'half' : 'quarter';
      rests.push({ time: start, staff, value });
    };

    let i = 0;
    for (let m = 0; m < bars.length - 1; m++) {
      const start = bars[m];
      const end = bars[m + 1];
      while (i < merged.length && merged[i][1] <= start + 1e-6) i++;
      if (i === merged.length || merged[i][0] >= end - 1e-6) {
        rests.push({ time: start, staff, value: 'whole', measureEnd: end });
        continue;
      }

      let cursor = start;
      for (; i < merged.length && merged[i][0] < end - 1e-6; i++) {
        const [onset, release] = merged[i];
        addPartialRest(cursor, onset);
        cursor = release;
        if (release > end) break;
      }
      if (i < merged.length) addPartialRest(cursor, end);
    }
  }
  return rests.sort((a, b) => a.time - b.time || (a.staff < b.staff ? -1 : 1));
}

/**
 * Detect ties across barlines: consecutive same-pitch notes on a staff where the
 * first ends exactly as the second begins (contiguous within `epsilon`) AND a
 * barline falls between their onsets. The barline requirement is what distinguishes
 * a sustained sound carried over a measure line (a true tie) from a re-articulated
 * repeated note within a measure (which must NOT be tied). Pure + headless-testable.
 */
export function buildTies(layout: SheetLayout, epsilon = 0.03): Tie[] {
  const bars = layout.barTimes.length ? layout.barTimes : [0];
  const crossesBar = (t0: number, t1: number): boolean =>
    bars.some((bt) => bt > t0 + 1e-6 && bt <= t1 + 1e-6);
  const ties: Tie[] = [];
  for (const staff of ['treble', 'bass'] as Staff[]) {
    const idx = layout.notes
      .map((n, i) => ({ n, i }))
      .filter((x) => x.n.staff === staff)
      .sort((a, b) => a.n.time - b.n.time || a.n.midi - b.n.midi);
    for (let k = 1; k < idx.length; k++) {
      const a = idx[k - 1];
      const b = idx[k];
      if (
        a.n.midi === b.n.midi &&
        b.n.time > a.n.time + 1e-6 &&
        Math.abs(a.n.time + a.n.duration - b.n.time) < epsilon &&
        crossesBar(a.n.time, b.n.time)
      ) {
        ties.push({ from: a.i, to: b.i, staff });
      }
    }
  }
  return ties;
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
