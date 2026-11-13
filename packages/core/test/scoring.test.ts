import { describe, it, expect } from 'vitest';
import { judgeHit, ScoreKeeper } from '../src/scoring';

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
