import type { MidiNote, MidiSong, Hand } from './types';

export interface AssignHandsOptions {
  /** pitch threshold for single-track split (default C4 = 60) */
  splitMidi?: number;
}

/**
 * Assign left/right hand to each note.
 * - Multi-track: the track with the highest average pitch is the right hand,
 *   the rest are left hand (typical piano MIDI layout).
 * - Single-track: split by pitch threshold.
 * Mutates and returns the notes for convenience.
 */
export function assignHands(notes: MidiNote[], opts: AssignHandsOptions = {}): MidiNote[] {
  const split = opts.splitMidi ?? 60;
  const byTrack = new Map<number, MidiNote[]>();
  for (const n of notes) {
    const a = byTrack.get(n.track) ?? [];
    a.push(n);
    byTrack.set(n.track, a);
  }
  const trackIds = [...byTrack.keys()];
  if (trackIds.length >= 2) {
    const avg = (arr: MidiNote[]) => arr.reduce((s, n) => s + n.midi, 0) / arr.length;
    const sorted = [...trackIds].sort((a, b) => avg(byTrack.get(b)!) - avg(byTrack.get(a)!));
    const rightTrack = sorted[0];
    for (const n of notes) n.hand = n.track === rightTrack ? 'right' : 'left';
  } else {
    for (const n of notes) n.hand = n.midi >= split ? 'right' : 'left';
  }
  return notes;
}

export function splitByPitch(notes: MidiNote[], splitMidi = 60): { left: MidiNote[]; right: MidiNote[] } {
  const left: MidiNote[] = [];
  const right: MidiNote[] = [];
  for (const n of notes) (n.midi >= splitMidi ? right : left).push(n);
  return { left, right };
}

export interface SongStats {
  noteCount: number;
  notesPerSecond: number;
  minMidi: number;
  maxMidi: number;
  hands: Hand[];
}

export function songStats(song: MidiSong): SongStats {
  const notes = song.notes;
  if (notes.length === 0) {
    return { noteCount: 0, notesPerSecond: 0, minMidi: 0, maxMidi: 0, hands: [] };
  }
  let min = 127;
  let max = 0;
  const hands = new Set<Hand>();
  for (const n of notes) {
    if (n.midi < min) min = n.midi;
    if (n.midi > max) max = n.midi;
    if (n.hand) hands.add(n.hand);
  }
  return {
    noteCount: notes.length,
    notesPerSecond: song.duration > 0 ? notes.length / song.duration : 0,
    minMidi: min,
    maxMidi: max,
    hands: [...hands],
  };
}

/**
 * Group notes that sound simultaneously into chords. Notes whose onset is
 * within `epsilon` seconds of the group's first note belong to the same chord.
 * Returns groups ordered by time, each group ordered by pitch.
 */
export function groupChords(notes: MidiNote[], epsilon = 0.03): MidiNote[][] {
  const sorted = [...notes].sort((a, b) => a.time - b.time || a.midi - b.midi);
  const groups: MidiNote[][] = [];
  let cur: MidiNote[] = [];
  let anchor = 0;
  for (const n of sorted) {
    if (cur.length && n.time - anchor > epsilon) {
      groups.push(cur);
      cur = [];
    }
    if (!cur.length) anchor = n.time;
    cur.push(n);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteName(midi: number): string {
  return NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

export interface KeyboardRange {
  startMidi: number;
  endMidi: number;
}

export interface FitKeyboardOptions {
  /** semitones of headroom added above/below the song's extremes (default 2) */
  padding?: number;
  /** minimum span in semitones so narrow songs still show ~2 octaves (default 24) */
  minSpan?: number;
}

const BLACK_PC = new Set([1, 3, 6, 8, 10]);
const isBlackMidi = (m: number): boolean => BLACK_PC.has(((m % 12) + 12) % 12);
const snapDownWhite = (m: number): number => {
  while (isBlackMidi(m)) m--;
  return m;
};
const snapUpWhite = (m: number): number => {
  while (isBlackMidi(m)) m++;
  return m;
};

/** Full 88-key piano range (A0–C8). */
export const FULL_KEYBOARD: KeyboardRange = { startMidi: 21, endMidi: 108 };

/**
 * Fit the visible keyboard to a song's actual pitch span (Synthesia-style auto-zoom),
 * so the falling notes fill the stage instead of clustering in the middle of 88 keys.
 * Snaps the boundaries to white keys, keeps a minimum span, and clamps to A0–C8.
 * Pure: returns the full range for empty input.
 */
export function fitKeyboardRange(notes: MidiNote[], opts: FitKeyboardOptions = {}): KeyboardRange {
  if (!notes.length) return { ...FULL_KEYBOARD };
  let min = 127;
  let max = 0;
  for (const n of notes) {
    if (n.midi < min) min = n.midi;
    if (n.midi > max) max = n.midi;
  }
  const padding = opts.padding ?? 2;
  const minSpan = opts.minSpan ?? 24;
  let start = min - padding;
  let end = max + padding;
  if (end - start < minSpan) {
    const center = Math.round((min + max) / 2);
    start = center - Math.floor(minSpan / 2);
    end = start + minSpan;
  }
  start = snapDownWhite(start);
  end = snapUpWhite(end);
  start = Math.max(FULL_KEYBOARD.startMidi, start);
  end = Math.min(FULL_KEYBOARD.endMidi, end);
  if (end <= start) return { ...FULL_KEYBOARD };
  return { startMidi: start, endMidi: end };
}
