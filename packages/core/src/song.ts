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
