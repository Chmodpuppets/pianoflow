import { describe, it, expect } from 'vitest';
import {
  buildReviewNotes,
  reviewByMeasure,
  summarizeReview,
  accuracyColor,
  type NoteJudgement,
} from '../src/review';
import type { MidiNote } from '../src/types';

function note(time: number, midi = 60, hand?: 'left' | 'right'): MidiNote {
  return {
    midi,
    ticks: Math.round(time * 960),
    durationTicks: 480,
    time,
    duration: 0.5,
    velocity: 0.8,
    channel: 0,
    track: 0,
    hand,
  };
}

describe('buildReviewNotes', () => {
  it('zips notes with judgements and excludes null (un-judged) entries', () => {
    const notes = [note(0, 60, 'right'), note(1, 62, 'right'), note(2, 64, 'right')];
    const judgements: (NoteJudgement | null)[] = ['perfect', null, 'miss'];
    const review = buildReviewNotes(notes, judgements);
    expect(review).toHaveLength(2);
    expect(review[0]).toMatchObject({ index: 0, time: 0, midi: 60, hand: 'right', judgement: 'perfect' });
    expect(review[1]).toMatchObject({ index: 2, time: 2, midi: 64, judgement: 'miss' });
  });

  it('returns empty when nothing was judged', () => {
    expect(buildReviewNotes([note(0)], [null])).toHaveLength(0);
    expect(buildReviewNotes([], [])).toHaveLength(0);
  });
});

describe('reviewByMeasure', () => {
  it('buckets notes into measures and computes per-measure accuracy', () => {
    // measure starts at 0, 2, 4 seconds (e.g. 4/4 at 120bpm)
    const review = buildReviewNotes(
      [note(0.1), note(0.5), note(2.1), note(2.6), note(4.2)],
      ['perfect', 'good', 'miss', 'miss', 'perfect'],
    );
    const measures = reviewByMeasure(review, [0, 2, 4]);
    expect(measures).toHaveLength(3);
    expect(measures[0]).toMatchObject({ measure: 1, total: 2, perfect: 1, good: 1, miss: 0, accuracy: 1 });
    expect(measures[1]).toMatchObject({ measure: 2, total: 2, perfect: 0, good: 0, miss: 2, accuracy: 0 });
    expect(measures[2]).toMatchObject({ measure: 3, total: 1, perfect: 1, accuracy: 1 });
  });

  it('omits measures with no judged notes and defaults to a single measure', () => {
    const review = buildReviewNotes([note(5)], ['good']);
    const measures = reviewByMeasure(review, []); // no measure info → one bucket
    expect(measures).toHaveLength(1);
    expect(measures[0]).toMatchObject({ measure: 1, total: 1, good: 1, accuracy: 1 });
  });

  it('places a note exactly on a barline into the new measure', () => {
    const review = buildReviewNotes([note(2.0)], ['perfect']);
    const measures = reviewByMeasure(review, [0, 2, 4]);
    expect(measures).toHaveLength(1);
    expect(measures[0].measure).toBe(2);
  });
});

describe('summarizeReview', () => {
  it('aggregates counts and overall accuracy', () => {
    const review = buildReviewNotes(
      [note(0), note(0.5), note(2), note(2.5)],
      ['perfect', 'good', 'miss', 'perfect'],
    );
    const s = summarizeReview(review, [0, 2]);
    expect(s.total).toBe(4);
    expect(s.perfect).toBe(2);
    expect(s.good).toBe(1);
    expect(s.miss).toBe(1);
    expect(s.accuracy).toBeCloseTo(0.75);
  });

  it('lists the weakest measures first and skips perfect ones', () => {
    const review = buildReviewNotes(
      [note(0.1), note(2.1), note(2.6), note(4.1), note(4.6), note(6.1)],
      ['perfect', 'miss', 'miss', 'good', 'miss', 'perfect'],
    );
    // m1=100%, m2=0%, m3=50%, m4=100%
    const s = summarizeReview(review, [0, 2, 4, 6], 3);
    expect(s.weakest.map((m) => m.measure)).toEqual([2, 3]);
    expect(s.weakest[0].accuracy).toBe(0);
    expect(s.weakest[1].accuracy).toBeCloseTo(0.5);
  });

  it('returns no weakest measures for a flawless run', () => {
    const review = buildReviewNotes([note(0), note(2)], ['perfect', 'perfect']);
    const s = summarizeReview(review, [0, 2]);
    expect(s.weakest).toHaveLength(0);
    expect(s.accuracy).toBe(1);
  });

  it('handles an empty review', () => {
    const s = summarizeReview([], [0, 2]);
    expect(s.total).toBe(0);
    expect(s.accuracy).toBe(0);
    expect(s.measures).toHaveLength(0);
    expect(s.weakest).toHaveLength(0);
  });
});

describe('accuracyColor', () => {
  it('maps accuracy to the green/blue/gold/red scale', () => {
    expect(accuracyColor(1)).toBe('#59d98e');
    expect(accuracyColor(0.9)).toBe('#59d98e');
    expect(accuracyColor(0.89)).toBe('#4ea1ff');
    expect(accuracyColor(0.7)).toBe('#4ea1ff');
    expect(accuracyColor(0.69)).toBe('#ffd166');
    expect(accuracyColor(0.5)).toBe('#ffd166');
    expect(accuracyColor(0.49)).toBe('#ff6b6b');
    expect(accuracyColor(0)).toBe('#ff6b6b');
  });
});