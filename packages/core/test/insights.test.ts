import { describe, it, expect } from 'vitest';
import { dayKey, addDays, computeStreaks, recentActivity, computeAchievements } from '../src/insights';
import type { SessionEntry } from '../src/history';

// Fixed local-noon timestamps so day boundaries are stable across timezones.
const at = (day: number) => new Date(2026, 0, day, 12).getTime();
const NOW = at(8); // Jan 8 2026, local noon

function entry(day: number, over: Partial<SessionEntry> = {}): SessionEntry {
  return {
    songId: 's',
    songTitle: 'Song',
    at: at(day),
    accuracy: 0.8,
    grade: 'B',
    maxCombo: 5,
    hits: 8,
    total: 10,
    ...over,
  };
}

describe('dayKey / addDays', () => {
  it('formats a local calendar day', () => {
    expect(dayKey(at(8))).toBe('2026-01-08');
  });
  it('addDays crosses month boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('computeStreaks', () => {
  it('returns zeros for an empty log', () => {
    expect(computeStreaks([], NOW)).toEqual({ current: 0, longest: 0, activeDays: 0 });
  });
  it('counts a current run ending today and the longest run', () => {
    const log = [entry(1), entry(2), entry(3), entry(6), entry(7), entry(8)];
    const s = computeStreaks(log, NOW);
    expect(s.current).toBe(3); // 6,7,8
    expect(s.longest).toBe(3);
    expect(s.activeDays).toBe(6);
  });
  it('anchors at yesterday when today has no session yet', () => {
    const log = [entry(6), entry(7)];
    expect(computeStreaks(log, NOW).current).toBe(2);
  });
  it('current is zero when the last practice is older than yesterday', () => {
    const log = [entry(1), entry(2)];
    expect(computeStreaks(log, NOW).current).toBe(0);
  });
  it('longest can exceed current', () => {
    const log = [entry(1), entry(2), entry(3), entry(4), entry(8)];
    const s = computeStreaks(log, NOW);
    expect(s.longest).toBe(4);
    expect(s.current).toBe(1);
  });
});

describe('recentActivity', () => {
  it('returns one bucket per day, oldest first, with today flagged', () => {
    const log = [entry(8), entry(8), entry(7)];
    const act = recentActivity(log, NOW, 7);
    expect(act).toHaveLength(7);
    expect(act[6].isToday).toBe(true);
    expect(act[6].count).toBe(2);
    expect(act[5].count).toBe(1);
    expect(act[0].count).toBe(0);
    expect(act[0].key).toBe('2026-01-02');
  });
});

describe('computeAchievements', () => {
  it('earns nothing on an empty log', () => {
    const a = computeAchievements([], NOW);
    expect(a.length).toBeGreaterThanOrEqual(12);
    expect(a.every((x) => !x.earned)).toBe(true);
  });
  it('earns session / grade / combo / streak achievements', () => {
    const log = [
      entry(6, { grade: 'S', accuracy: 1, maxCombo: 120 }),
      entry(7, { grade: 'S', accuracy: 1, maxCombo: 60 }),
      entry(8, { grade: 'A', maxCombo: 30 }),
    ];
    const a = computeAchievements(log, NOW);
    const by = Object.fromEntries(a.map((x) => [x.id, x]));
    expect(by['first-steps'].earned).toBe(true);
    expect(by['first-s'].earned).toBe(true);
    expect(by['flawless'].earned).toBe(true);
    expect(by['combo-100'].earned).toBe(true);
    expect(by['combo-50'].earned).toBe(true);
    expect(by['getting-serious'].earned).toBe(false);
    expect(by['week-streak'].earned).toBe(false);
    // value is clamped to target for display
    expect(by['combo-100'].value).toBe(100);
  });
  it('earns the week streak after 7 consecutive days', () => {
    const log = [2, 3, 4, 5, 6, 7, 8].map((d) => entry(d));
    const by = Object.fromEntries(computeAchievements(log, NOW).map((x) => [x.id, x]));
    expect(by['week-streak'].earned).toBe(true);
    expect(by['month-streak'].earned).toBe(false);
  });
});
