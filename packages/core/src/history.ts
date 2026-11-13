import type { Grade } from './scoring';
import type { SessionResult } from './progress';

/**
 * Practice session history.
 *
 * A log is an append-ordered (chronological, oldest → newest) array of
 * {@link SessionEntry}. All functions here are pure so they can be unit-tested
 * headlessly and reused by any shell (web / desktop).
 */

/** One recorded practice session (a completed run). Timestamps are epoch ms. */
export interface SessionEntry {
  songId: string;
  songTitle: string;
  at: number;
  accuracy: number; // 0..1
  grade: Grade;
  maxCombo: number;
  hits: number;
  total: number;
}

const GRADES: readonly string[] = ['S', 'A', 'B', 'C', 'D'];

/** Runtime guard for a persisted entry (corrupt payloads are dropped). */
export function isSessionEntry(x: unknown): x is SessionEntry {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.songId === 'string' &&
    typeof e.songTitle === 'string' &&
    typeof e.at === 'number' &&
    typeof e.accuracy === 'number' &&
    typeof e.grade === 'string' &&
    GRADES.includes(e.grade) &&
    typeof e.maxCombo === 'number' &&
    typeof e.hits === 'number' &&
    typeof e.total === 'number'
  );
}

/** Build a session entry from a finished run. Pure. */
export function makeSession(
  songId: string,
  songTitle: string,
  result: SessionResult,
  at: number,
): SessionEntry {
  return {
    songId,
    songTitle,
    at,
    accuracy: result.accuracy,
    grade: result.grade,
    maxCombo: result.maxCombo,
    hits: result.hits,
    total: result.total,
  };
}

/**
 * Append a session, keeping at most `maxEntries` (dropping the oldest).
 * Pure: returns a new array; the input is not mutated.
 */
export function appendSession(
  log: SessionEntry[],
  entry: SessionEntry,
  maxEntries = 500,
): SessionEntry[] {
  const cap = Math.max(1, Math.floor(maxEntries));
  const next = [...log, entry];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** The most recent `n` sessions, newest first. Pure. */
export function recentSessions(log: SessionEntry[], n = 20): SessionEntry[] {
  const count = Math.max(0, Math.floor(n));
  if (count === 0) return [];
  return log.slice(-count).reverse();
}

export interface SongTrend {
  songId: string;
  sessions: number;
  firstAccuracy: number;
  latestAccuracy: number;
  bestAccuracy: number;
  averageAccuracy: number;
  /** latest − first; positive means improvement */
  improvement: number;
}

/**
 * Aggregate one song's sessions into a trend. Returns null when the song has no
 * sessions. Assumes the log is chronological (oldest → newest). Pure.
 */
export function songTrend(log: SessionEntry[], songId: string): SongTrend | null {
  const entries = log.filter((e) => e.songId === songId);
  if (entries.length === 0) return null;
  const first = entries[0];
  const latest = entries[entries.length - 1];
  let best = 0;
  let sum = 0;
  for (const e of entries) {
    if (e.accuracy > best) best = e.accuracy;
    sum += e.accuracy;
  }
  return {
    songId,
    sessions: entries.length,
    firstAccuracy: first.accuracy,
    latestAccuracy: latest.accuracy,
    bestAccuracy: best,
    averageAccuracy: sum / entries.length,
    improvement: latest.accuracy - first.accuracy,
  };
}

export interface HistorySummary {
  totalSessions: number;
  songsPracticed: number;
  averageAccuracy: number;
  totalHits: number;
  totalNotes: number;
  bestAccuracy: number;
}

/** Overall summary across the whole log. Pure. */
export function summarizeHistory(log: SessionEntry[]): HistorySummary {
  if (log.length === 0) {
    return {
      totalSessions: 0,
      songsPracticed: 0,
      averageAccuracy: 0,
      totalHits: 0,
      totalNotes: 0,
      bestAccuracy: 0,
    };
  }
  const songs = new Set<string>();
  let sum = 0;
  let hits = 0;
  let notes = 0;
  let best = 0;
  for (const e of log) {
    songs.add(e.songId);
    sum += e.accuracy;
    hits += e.hits;
    notes += e.total;
    if (e.accuracy > best) best = e.accuracy;
  }
  return {
    totalSessions: log.length,
    songsPracticed: songs.size,
    averageAccuracy: sum / log.length,
    totalHits: hits,
    totalNotes: notes,
    bestAccuracy: best,
  };
}

/** Distinct song ids that have at least one session, in first-seen order. Pure. */
export function practicedSongIds(log: SessionEntry[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of log) {
    if (!seen.has(e.songId)) {
      seen.add(e.songId);
      out.push(e.songId);
    }
  }
  return out;
}
