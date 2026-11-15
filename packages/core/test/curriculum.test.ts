import { describe, it, expect } from 'vitest';
import {
  CURRICULUM,
  goalMet,
  flattenLessons,
  buildCurriculumProgress,
  buildStageProgress,
  curriculumSummary,
  type CurriculumRecord,
} from '../src/curriculum';
import type { Grade } from '../src/scoring';

const rec = (bestGrade: Grade, bestAccuracy = 0.8, plays = 1): CurriculumRecord => ({ bestGrade, bestAccuracy, plays });

const BUNDLED_IDS = [
  'twinkle', 'ode-to-joy', 'london-bridge', 'happy-birthday', 'minuet-in-g', 'greensleeves',
  'fur-elise', 'canon-in-d', 'prelude-in-c', 'amazing-grace', 'when-the-saints', 'scarborough-fair',
];

describe('curriculum content', () => {
  it('has four stages and twelve lessons covering every bundled song once', () => {
    expect(CURRICULUM).toHaveLength(4);
    const lessons = flattenLessons(CURRICULUM);
    expect(lessons).toHaveLength(12);
    const songIds = lessons.map((l) => l.songId);
    expect(new Set(songIds).size).toBe(12);
    expect([...songIds].sort()).toEqual([...BUNDLED_IDS].sort());
  });

  it('lessons have unique ids, valid hands, positive speed and a grade goal', () => {
    const lessons = flattenLessons(CURRICULUM);
    expect(new Set(lessons.map((l) => l.id)).size).toBe(12);
    for (const l of lessons) {
      expect(['left', 'right', 'both']).toContain(l.hands);
      expect(l.speed).toBeGreaterThan(0);
      expect(['S', 'A', 'B', 'C', 'D']).toContain(l.goal.grade);
      expect(l.tipKey).toMatch(/^learn\.tip\./);
    }
  });
});

describe('goalMet', () => {
  it('is false when never played or zero plays', () => {
    expect(goalMet({ kind: 'grade', grade: 'C' }, undefined)).toBe(false);
    expect(goalMet({ kind: 'grade', grade: 'C' }, rec('S', 1, 0))).toBe(false);
  });
  it('compares grade rank inclusively', () => {
    const goal = { kind: 'grade' as const, grade: 'B' as Grade };
    expect(goalMet(goal, rec('C'))).toBe(false);
    expect(goalMet(goal, rec('B'))).toBe(true);
    expect(goalMet(goal, rec('A'))).toBe(true);
    expect(goalMet(goal, rec('S'))).toBe(true);
  });
});

describe('buildCurriculumProgress', () => {
  it('with no records: first lesson available, the rest locked, none completed', () => {
    const p = buildCurriculumProgress(CURRICULUM, {});
    expect(p[0].status).toBe('available');
    expect(p.slice(1).every((x) => x.status === 'locked')).toBe(true);
    expect(p.every((x) => x.bestGrade === null && x.bestAccuracy === -1)).toBe(true);
  });

  it('completing the first lesson unlocks the second', () => {
    const p = buildCurriculumProgress(CURRICULUM, { twinkle: rec('C', 0.6) });
    expect(p[0].status).toBe('completed');
    expect(p[0].bestGrade).toBe('C');
    expect(p[1].status).toBe('available');
    expect(p[2].status).toBe('locked');
  });

  it('a goal met out of order still credits completion', () => {
    const p = buildCurriculumProgress(CURRICULUM, { 'happy-birthday': rec('B', 0.8) });
    const l3 = p.find((x) => x.lesson.id === 'l3')!;
    expect(l3.status).toBe('completed');
  });

  it('mastering every song completes the whole path', () => {
    const records: Record<string, CurriculumRecord> = {};
    for (const id of BUNDLED_IDS) records[id] = rec('S', 1);
    const p = buildCurriculumProgress(CURRICULUM, records);
    expect(p.every((x) => x.status === 'completed')).toBe(true);
  });

  it('accepts a Map as the record source', () => {
    const m = new Map<string, CurriculumRecord>([['twinkle', rec('C')]]);
    const p = buildCurriculumProgress(CURRICULUM, m);
    expect(p[0].status).toBe('completed');
    expect(p[1].status).toBe('available');
  });
});

describe('buildStageProgress', () => {
  it('with no records: first stage active, later stages locked', () => {
    const s = buildStageProgress(CURRICULUM, {});
    expect(s[0].status).toBe('active');
    expect(s.slice(1).every((x) => x.status === 'locked')).toBe(true);
    expect(s[0].completed).toBe(0);
    expect(s[0].total).toBe(3);
  });
  it('marks a stage complete when all its lessons are done', () => {
    const records: Record<string, CurriculumRecord> = {
      twinkle: rec('C'), 'london-bridge': rec('C'), 'happy-birthday': rec('C'),
    };
    const s = buildStageProgress(CURRICULUM, records);
    expect(s[0].status).toBe('complete');
    expect(s[0].completed).toBe(3);
    expect(s[1].status).toBe('active');
  });
});

describe('curriculumSummary', () => {
  it('reports zero progress and the first lesson as current when empty', () => {
    const sum = curriculumSummary(CURRICULUM, {});
    expect(sum).toEqual({ total: 12, completed: 0, currentId: 'l1', pct: 0 });
  });
  it('reports full progress and no current lesson when mastered', () => {
    const records: Record<string, CurriculumRecord> = {};
    for (const id of BUNDLED_IDS) records[id] = rec('S', 1);
    const sum = curriculumSummary(CURRICULUM, records);
    expect(sum.completed).toBe(12);
    expect(sum.currentId).toBeNull();
    expect(sum.pct).toBe(1);
  });
  it('current is the first available lesson', () => {
    const sum = curriculumSummary(CURRICULUM, { twinkle: rec('C') });
    expect(sum.completed).toBe(1);
    expect(sum.currentId).toBe('l2');
    expect(sum.pct).toBeCloseTo(1 / 12);
  });
});
