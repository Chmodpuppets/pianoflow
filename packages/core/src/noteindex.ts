import type { MidiNote } from './types';

/**
 * Time-bucket index over a (time-sorted) note list, for fast viewport culling.
 *
 * Notes are bucketed by their start time. A query for the visible window
 * [t0, t1] scans only the buckets that could contain an overlapping note:
 * from `t0 - maxDuration` (a long note may start before the window and still
 * ring into it) up to `t1`. This turns per-frame rendering from O(all notes)
 * into O(visible notes + a few buckets), which is what makes very dense
 * "black MIDI" files render smoothly.
 *
 * Pure and platform-agnostic; the renderer rebuilds it only when the note
 * array reference changes.
 */
export class NoteIndex {
  private buckets: MidiNote[][] = [];
  private readonly bucketWidth: number;
  private maxDuration = 0;
  readonly size: number;

  constructor(notes: MidiNote[], bucketWidth = 1) {
    this.bucketWidth = Math.max(0.05, bucketWidth);
    this.size = notes.length;
    for (const n of notes) {
      const b = Math.floor(n.time / this.bucketWidth);
      (this.buckets[b] ??= []).push(n);
      if (n.duration > this.maxDuration) this.maxDuration = n.duration;
    }
  }

  /**
   * Notes whose [time, time+duration] overlaps [t0, t1] (inclusive).
   * Result order is not guaranteed; callers that need ordering should sort.
   */
  query(t0: number, t1: number): MidiNote[] {
    if (this.size === 0 || t1 < t0) return [];
    const w = this.bucketWidth;
    const lo = Math.max(0, Math.floor((t0 - this.maxDuration) / w));
    const hi = Math.floor(t1 / w);
    const out: MidiNote[] = [];
    for (let b = lo; b <= hi; b++) {
      const bucket = this.buckets[b];
      if (!bucket) continue;
      for (const n of bucket) {
        if (n.time <= t1 && n.time + n.duration >= t0) out.push(n);
      }
    }
    return out;
  }
}
