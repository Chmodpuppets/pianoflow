// Post-run practice review: turn per-note judgements into a spatial picture of
// where the player struggled, so the results screen can point at the measures
// that need work. Pure and headless-testable; the UI renders it as a timeline.
import type { Hand, MidiNote } from './types';

export type NoteJudgement = 'perfect' | 'good' | 'miss';

export interface ReviewNote {
  index: number;
  time: number;
  midi: number;
  hand?: Hand;
  judgement: NoteJudgement;
}

export interface MeasureReview {
  measure: number; // 1-based
  start: number; // seconds
  end: number; // seconds (Infinity for the last measure)
  total: number;
  perfect: number;
  good: number;
  miss: number;
  accuracy: number; // (perfect + good) / total
}

export interface ReviewSummary {
  total: number;
  perfect: number;
  good: number;
  miss: number;
  accuracy: number;
  measures: MeasureReview[]; // only measures that contain judged notes
  weakest: MeasureReview[]; // lowest-accuracy measures to focus on
}

/**
 * Zip notes with their judgements. A null judgement means the note was not part
 * of this run (e.g. skipped by a seek) and is excluded from the review.
 */
export function buildReviewNotes(
  notes: MidiNote[],
  judgements: ReadonlyArray<NoteJudgement | null>,
): ReviewNote[] {
  const out: ReviewNote[] = [];
  for (let i = 0; i < notes.length; i++) {
    const j = judgements[i];
    if (j == null) continue;
    out.push({ index: i, time: notes[i].time, midi: notes[i].midi, hand: notes[i].hand, judgement: j });
  }
  return out;
}

/** Bucket review notes into measures using sorted measure-start times (seconds). */
export function reviewByMeasure(reviewNotes: ReviewNote[], measureStarts: number[]): MeasureReview[] {
  const starts = measureStarts.length ? measureStarts : [0];
  const buckets: MeasureReview[] = starts.map((s, i) => ({
    measure: i + 1,
    start: s,
    end: i + 1 < starts.length ? starts[i + 1] : Infinity,
    total: 0,
    perfect: 0,
    good: 0,
    miss: 0,
    accuracy: 0,
  }));
  for (const n of reviewNotes) {
    let mi = 0;
    for (let i = 0; i < starts.length; i++) {
      if (starts[i] <= n.time + 1e-9) mi = i;
      else break;
    }
    const b = buckets[mi];
    b.total++;
    if (n.judgement === 'perfect') b.perfect++;
    else if (n.judgement === 'good') b.good++;
    else b.miss++;
  }
  for (const b of buckets) b.accuracy = b.total > 0 ? (b.perfect + b.good) / b.total : 0;
  return buckets.filter((b) => b.total > 0);
}

/** Aggregate counts + per-measure breakdown + the weakest measures to focus on. */
export function summarizeReview(
  reviewNotes: ReviewNote[],
  measureStarts: number[],
  weakestCount = 3,
): ReviewSummary {
  let perfect = 0;
  let good = 0;
  let miss = 0;
  for (const n of reviewNotes) {
    if (n.judgement === 'perfect') perfect++;
    else if (n.judgement === 'good') good++;
    else miss++;
  }
  const total = reviewNotes.length;
  const measures = reviewByMeasure(reviewNotes, measureStarts);
  const weakest = measures
    .filter((m) => m.accuracy < 1)
    .sort((a, b) => a.accuracy - b.accuracy || b.miss - a.miss || a.measure - b.measure)
    .slice(0, Math.max(0, weakestCount));
  return {
    total,
    perfect,
    good,
    miss,
    accuracy: total > 0 ? (perfect + good) / total : 0,
    measures,
    weakest,
  };
}

/**
 * Shared accuracy→color scale (green / blue / gold / red) used by both the DOM
 * timeline and the render-preview harness, so the mapping is tested once and
 * stays consistent everywhere it is drawn.
 */
export function accuracyColor(accuracy: number): string {
  if (accuracy >= 0.9) return '#59d98e';
  if (accuracy >= 0.7) return '#4ea1ff';
  if (accuracy >= 0.5) return '#ffd166';
  return '#ff6b6b';
}