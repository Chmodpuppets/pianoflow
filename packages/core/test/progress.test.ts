import { describe, it, expect } from 'vitest';
import {
  ScoreKeeper,
  summarize,
  mergeRecord,
  estimateDifficulty,
  type SessionResult,
  type MidiSong,
} from '../src/index';

function result(partial: Partial<SessionResult> = {}): SessionResult {
  return {
    total: 10,
    hits: 9,
    perfect: 5,
    good: 4,
    miss: 1,
    wrong: 0,
    maxCombo: 9,
    accuracy: 0.9,
    grade: 'A',
    ...partial,
  };
}

function makeSong(notes: { midi: number; time: number }[], duration: number): MidiSong {
  return {
    name: 'test',
    format: 1,
    ppq: 480,
    durationTicks: Math.round(duration * 480),
    duration,
    notes: notes.map((n) => ({
      midi: n.midi,
      ticks: 0,
      durationTicks: 480,
      time: n.time,
      duration: 1,
      velocity: 0.8,
      channel: 0,
      track: 0,
    })),
    tempos: [],
    timeSignatures: [],
    tracks: [],
  };
}

describe('summarize', () => {
  it('snapshots the ScoreKeeper state', () => {
    const s = new ScoreKeeper();
    s.registerHit('perfect');
    s.registerHit('good');
    s.registerMiss();
    const r = summarize(s);
    expect(r.total).toBe(3);
    expect(r.hits).toBe(2);
    expect(r.perfect).toBe(1);
    expect(r.good).toBe(1);
    expect(r.miss).toBe(1);
    expect(r.accuracy).toBeCloseTo(2 / 3);
    expect(r.grade).toBe(s.grade);
  });
});

describe('mergeRecord', () => {
  it('creates a first record', () => {
    const rec = mergeRecord(undefined, result(), 1000);
    expect(rec.plays).toBe(1);
    expect(rec.bestAccuracy).toBe(0.9);
    expect(rec.bestGrade).toBe('A');
    expect(rec.bestCombo).toBe(9);
    expect(rec.lastAccuracy).toBe(0.9);
    expect(rec.lastPlayedAt).toBe(1000);
  });

  it('keeps the best when a later run is worse', () => {
    const prev = mergeRecord(undefined, result(), 1000);
    const rec = mergeRecord(prev, result({ accuracy: 0.5, grade: 'C', maxCombo: 4 }), 2000);
    expect(rec.plays).toBe(2);
    expect(rec.bestAccuracy).toBe(0.9);
    expect(rec.bestGrade).toBe('A');
    expect(rec.bestCombo).toBe(9);
    expect(rec.lastAccuracy).toBe(0.5);
    expect(rec.lastPlayedAt).toBe(2000);
  });

  it('updates the best when a later run is better', () => {
    const prev = mergeRecord(undefined, result({ accuracy: 0.5, grade: 'C', maxCombo: 4 }), 1000);
    const rec = mergeRecord(prev, result({ accuracy: 0.96, grade: 'S', maxCombo: 12 }), 2000);
    expect(rec.bestAccuracy).toBe(0.96);
    expect(rec.bestGrade).toBe('S');
    expect(rec.bestCombo).toBe(12);
    expect(rec.plays).toBe(2);
  });
});

describe('estimateDifficulty', () => {
  it('rates an empty song as beginner', () => {
    expect(estimateDifficulty(makeSong([], 4)).level).toBe(1);
  });

  it('rates a sparse, narrow melody as beginner', () => {
    const song = makeSong(
      [
        { midi: 60, time: 0 },
        { midi: 62, time: 2 },
        { midi: 64, time: 4 },
        { midi: 65, time: 6 },
      ],
      8,
    );
    expect(estimateDifficulty(song).level).toBe(1);
  });

  it('rates a dense stream as expert', () => {
    const notes = Array.from({ length: 40 }, (_, i) => ({ midi: 60 + (i % 12), time: i * 0.1 }));
    const song = makeSong(notes, 4);
    expect(estimateDifficulty(song).level).toBe(5);
  });

  it('returns a human-readable label', () => {
    const d = estimateDifficulty(makeSong([{ midi: 60, time: 0 }], 4));
    expect(typeof d.label).toBe('string');
    expect(d.label.length).toBeGreaterThan(0);
  });
});
