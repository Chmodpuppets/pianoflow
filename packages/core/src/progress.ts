import type { ScoreKeeper, Grade } from './scoring';
import type { MidiSong } from './types';
import { songStats, groupChords } from './song';

/** An immutable snapshot of one completed practice run. */
export interface SessionResult {
  total: number;
  hits: number;
  perfect: number;
  good: number;
  miss: number;
  wrong: number;
  maxCombo: number;
  accuracy: number;
  grade: Grade;
}

export function summarize(score: ScoreKeeper): SessionResult {
  return {
    total: score.total,
    hits: score.hits,
    perfect: score.perfect,
    good: score.good,
    miss: score.miss,
    wrong: score.wrong,
    maxCombo: score.maxCombo,
    accuracy: score.accuracy,
    grade: score.grade,
  };
}

/** Persisted per-song progress. All timestamps are epoch milliseconds. */
export interface SongRecord {
  plays: number;
  bestAccuracy: number;
  bestGrade: Grade;
  bestCombo: number;
  lastAccuracy: number;
  lastPlayedAt: number;
  updatedAt: number;
}

const GRADE_ORDER: Grade[] = ['D', 'C', 'B', 'A', 'S'];

function betterGrade(a: Grade, b: Grade): Grade {
  return GRADE_ORDER.indexOf(a) >= GRADE_ORDER.indexOf(b) ? a : b;
}

/**
 * Fold a finished run into the stored record, keeping the best accuracy /
 * grade / combo while refreshing the "last" fields. Pure: returns a new object.
 */
export function mergeRecord(
  prev: SongRecord | undefined,
  r: SessionResult,
  now: number,
): SongRecord {
  if (!prev) {
    return {
      plays: 1,
      bestAccuracy: r.accuracy,
      bestGrade: r.grade,
      bestCombo: r.maxCombo,
      lastAccuracy: r.accuracy,
      lastPlayedAt: now,
      updatedAt: now,
    };
  }
  return {
    plays: prev.plays + 1,
    bestAccuracy: Math.max(prev.bestAccuracy, r.accuracy),
    bestGrade: betterGrade(prev.bestGrade, r.grade),
    bestCombo: Math.max(prev.bestCombo, r.maxCombo),
    lastAccuracy: r.accuracy,
    lastPlayedAt: now,
    updatedAt: now,
  };
}

export interface Difficulty {
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
}

const DIFF_LABELS = ['Beginner', 'Easy', 'Intermediate', 'Advanced', 'Expert'];

/**
 * Heuristic difficulty from note density, polyphony (largest chord) and pitch
 * span. Deterministic and dependency-free so it can be unit-tested and shown
 * in the library without playing the song.
 */
export function estimateDifficulty(song: MidiSong): Difficulty {
  const stats = songStats(song);
  if (stats.noteCount === 0) return { level: 1, label: DIFF_LABELS[0] };
  let maxChord = 1;
  for (const c of groupChords(song.notes)) {
    if (c.length > maxChord) maxChord = c.length;
  }
  const range = stats.maxMidi - stats.minMidi;
  const points = stats.notesPerSecond + (maxChord - 1) * 0.75 + (range > 48 ? 1 : 0);
  let level: 1 | 2 | 3 | 4 | 5;
  if (points < 2) level = 1;
  else if (points < 4) level = 2;
  else if (points < 6.5) level = 3;
  else if (points < 9) level = 4;
  else level = 5;
  return { level, label: DIFF_LABELS[level - 1] };
}
