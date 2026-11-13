import { describe, it, expect } from 'vitest';
import {
  makeSession,
  isSessionEntry,
  appendSession,
  recentSessions,
  songTrend,
  summarizeHistory,
  practicedSongIds,
  type SessionEntry,
} from '../src/history';
import type { SessionResult } from '../src/progress';
import type { Grade } from '../src/scoring';

function result(accuracy: number, grade: Grade = 'A'): SessionResult {
  return {
    total: 10,
    hits: Math.round(accuracy * 10),
    perfect: 0,
    good: 0,
    miss: 0,
    wrong: 0,
    maxCombo: 5,
    accuracy,
    grade,
  };
}

function entry(songId: string, accuracy: number, at: number, grade: Grade = 'A'): SessionEntry {
  return makeSession(songId, 'Song ' + songId, result(accuracy, grade), at);
}

describe('makeSession', () => {
  it('copies the run result into a session entry', () => {
    const e = makeSession('twinkle', 'Twinkle', result(0.9, 'S'), 1000);
    expect(e).toEqual({
      songId: 'twinkle',
      songTitle: 'Twinkle',
      at: 1000,
      accuracy: 0.9,
      grade: 'S',
      maxCombo: 5,
      hits: 9,
      total: 10,
    });
  });
});

describe('isSessionEntry', () => {
  it('accepts a well-formed entry', () => {
    expect(isSessionEntry(entry('a', 0.5, 1))).toBe(true);
  });
  it('rejects non-objects and malformed entries', () => {
    expect(isSessionEntry(null)).toBe(false);
    expect(isSessionEntry(undefined)).toBe(false);
    expect(isSessionEntry(42)).toBe(false);
    expect(isSessionEntry({})).toBe(false);
    expect(isSessionEntry({ ...entry('a', 0.5, 1), grade: 'Z' })).toBe(false);
    expect(isSessionEntry({ ...entry('a', 0.5, 1), accuracy: 'high' })).toBe(false);
    const { songTitle, ...missing } = entry('a', 0.5, 1);
    expect(isSessionEntry(missing)).toBe(false);
  });
});

describe('appendSession', () => {
  it('appends without mutating the input', () => {
    const log = [entry('a', 0.5, 1)];
    const next = appendSession(log, entry('b', 0.6, 2));
    expect(next).toHaveLength(2);
    expect(next[1].songId).toBe('b');
    expect(log).toHaveLength(1); // original untouched
  });
  it('caps the log, dropping the oldest entries', () => {
    let log: SessionEntry[] = [];
    for (let i = 0; i < 5; i++) log = appendSession(log, entry('s', i / 10, i), 3);
    expect(log).toHaveLength(3);
    expect(log.map((e) => e.at)).toEqual([2, 3, 4]);
  });
  it('floors the cap to at least one entry', () => {
    const log = appendSession([entry('a', 0.5, 1)], entry('b', 0.6, 2), 0);
    expect(log).toHaveLength(1);
    expect(log[0].songId).toBe('b');
  });
});

describe('recentSessions', () => {
  const log = [entry('a', 0.5, 1), entry('b', 0.6, 2), entry('c', 0.7, 3)];
  it('returns the newest first', () => {
    expect(recentSessions(log, 2).map((e) => e.songId)).toEqual(['c', 'b']);
  });
  it('handles n larger than the log', () => {
    expect(recentSessions(log, 99)).toHaveLength(3);
  });
  it('returns empty for n=0', () => {
    expect(recentSessions(log, 0)).toEqual([]);
  });
});

describe('songTrend', () => {
  it('returns null when the song has no sessions', () => {
    expect(songTrend([entry('a', 0.5, 1)], 'b')).toBeNull();
  });
  it('aggregates first / latest / best / average / improvement', () => {
    const log = [entry('a', 0.5, 1), entry('b', 0.9, 2), entry('a', 0.7, 3), entry('a', 0.8, 4)];
    const t = songTrend(log, 'a')!;
    expect(t.sessions).toBe(3);
    expect(t.firstAccuracy).toBe(0.5);
    expect(t.latestAccuracy).toBe(0.8);
    expect(t.bestAccuracy).toBe(0.8);
    expect(t.averageAccuracy).toBeCloseTo((0.5 + 0.7 + 0.8) / 3, 10);
    expect(t.improvement).toBeCloseTo(0.3, 10);
  });
  it('reports zero improvement for a single session', () => {
    const t = songTrend([entry('a', 0.6, 1)], 'a')!;
    expect(t.sessions).toBe(1);
    expect(t.improvement).toBe(0);
  });
  it('can report a negative improvement (regression)', () => {
    const log = [entry('a', 0.9, 1), entry('a', 0.4, 2)];
    expect(songTrend(log, 'a')!.improvement).toBeCloseTo(-0.5, 10);
  });
});

describe('summarizeHistory', () => {
  it('returns zeros for an empty log', () => {
    expect(summarizeHistory([])).toEqual({
      totalSessions: 0,
      songsPracticed: 0,
      averageAccuracy: 0,
      totalHits: 0,
      totalNotes: 0,
      bestAccuracy: 0,
    });
  });
  it('aggregates across songs', () => {
    const log = [entry('a', 0.5, 1), entry('b', 0.9, 2), entry('a', 0.7, 3)];
    const s = summarizeHistory(log);
    expect(s.totalSessions).toBe(3);
    expect(s.songsPracticed).toBe(2);
    expect(s.averageAccuracy).toBeCloseTo((0.5 + 0.9 + 0.7) / 3, 10);
    expect(s.bestAccuracy).toBe(0.9);
    expect(s.totalNotes).toBe(30);
    expect(s.totalHits).toBe(5 + 9 + 7);
  });
});

describe('practicedSongIds', () => {
  it('deduplicates in first-seen order', () => {
    const log = [entry('b', 0.5, 1), entry('a', 0.6, 2), entry('b', 0.7, 3)];
    expect(practicedSongIds(log)).toEqual(['b', 'a']);
  });
  it('returns empty for an empty log', () => {
    expect(practicedSongIds([])).toEqual([]);
  });
});
