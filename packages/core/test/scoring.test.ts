import { describe, it, expect } from 'vitest';
import { judgeHit, ScoreKeeper, comboMilestone } from '../src/scoring';

describe('judgeHit', () => {
  it('classifies perfect / good / null', () => {
    expect(judgeHit(1.0, 1.05)).toBe('perfect');
    expect(judgeHit(1.0, 1.12)).toBe('good');
    expect(judgeHit(1.0, 1.3)).toBeNull();
  });
  it('respects custom windows', () => {
    expect(judgeHit(1.0, 1.09, { perfectWindow: 0.1, goodWindow: 0.2 })).toBe('perfect');
  });
});

describe('ScoreKeeper', () => {
  it('tracks combo, accuracy and grade', () => {
    const s = new ScoreKeeper();
    s.registerHit('perfect');
    s.registerHit('good');
    expect(s.combo).toBe(2);
    expect(s.maxCombo).toBe(2);
    expect(s.accuracy).toBe(1);
    expect(s.grade).toBe('S');
    s.registerMiss();
    expect(s.combo).toBe(0);
    expect(s.accuracy).toBeCloseTo(2 / 3);
    expect(s.total).toBe(3);
  });
  it('resets', () => {
    const s = new ScoreKeeper();
    s.registerHit('perfect');
    s.reset();
    expect(s.total).toBe(0);
    expect(s.accuracy).toBe(1);
  });
});

describe('comboMilestone', () => {
  it('fires on the fixed thresholds', () => {
    expect(comboMilestone(10)).toBe(10);
    expect(comboMilestone(25)).toBe(25);
    expect(comboMilestone(50)).toBe(50);
    expect(comboMilestone(100)).toBe(100);
  });
  it('fires every 50 above 100', () => {
    expect(comboMilestone(150)).toBe(150);
    expect(comboMilestone(200)).toBe(200);
    expect(comboMilestone(1000)).toBe(1000);
  });
  it('is silent between milestones', () => {
    expect(comboMilestone(9)).toBeNull();
    expect(comboMilestone(11)).toBeNull();
    expect(comboMilestone(26)).toBeNull();
    expect(comboMilestone(101)).toBeNull();
    expect(comboMilestone(149)).toBeNull();
  });
  it('ignores non-positive / non-finite combos', () => {
    expect(comboMilestone(0)).toBeNull();
    expect(comboMilestone(-10)).toBeNull();
    expect(comboMilestone(NaN)).toBeNull();
    expect(comboMilestone(Infinity)).toBeNull();
  });
});
