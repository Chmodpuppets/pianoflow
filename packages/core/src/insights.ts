import type { SessionEntry } from './history';
import { summarizeHistory } from './history';

/**
 * Practice insights: streaks, lifetime stats, achievements and a recent-activity
 * series. All pure so they can be unit-tested headlessly and reused by any shell.
 * Day boundaries use the viewer's local calendar day.
 */

/** Local calendar day key (YYYY-MM-DD) for an epoch-ms timestamp. */
export function dayKey(at: number): string {
  const d = new Date(at);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Shift a day key by n calendar days (local). */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n, 12).getTime());
}

export interface Streaks {
  /** Consecutive days up to today (or yesterday if today not yet practiced). */
  current: number;
  /** Longest consecutive-day run ever. */
  longest: number;
  /** Number of distinct days with at least one session. */
  activeDays: number;
}

export function computeStreaks(log: SessionEntry[], now: number): Streaks {
  const days = new Set(log.map((e) => dayKey(e.at)));
  if (days.size === 0) return { current: 0, longest: 0, activeDays: 0 };

  // Longest run: walk sorted keys, extend while the next calendar day is present.
  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (addDays(sorted[i - 1], 1) === sorted[i]) run++;
    else run = 1;
    if (run > longest) longest = run;
  }

  // Current run: anchor at today, else yesterday; count backwards.
  const today = dayKey(now);
  let anchor = days.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (days.has(anchor)) {
    current++;
    anchor = addDays(anchor, -1);
  }
  return { current, longest, activeDays: days.size };
}

export interface ActivityDay {
  key: string;
  /** Short weekday label (Mon…Sun). */
  label: string;
  count: number;
  isToday: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Session counts for the last `days` calendar days, oldest → newest. */
export function recentActivity(log: SessionEntry[], now: number, days = 7): ActivityDay[] {
  const counts = new Map<string, number>();
  for (const e of log) {
    const k = dayKey(e.at);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const today = dayKey(now);
  const out: ActivityDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = addDays(today, -i);
    const [y, m, d] = key.split('-').map(Number);
    out.push({
      key,
      label: WEEKDAYS[new Date(y, m - 1, d, 12).getDay()],
      count: counts.get(key) ?? 0,
      isToday: key === today,
    });
  }
  return out;
}

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  icon: string;
  target: number;
  value: number;
  earned: boolean;
}

/** Derive the achievement board from the session log. Pure. */
export function computeAchievements(log: SessionEntry[], now: number): Achievement[] {
  const sum = summarizeHistory(log);
  const streaks = computeStreaks(log, now);
  const sCount = log.filter((e) => e.grade === 'S').length;
  const perfect = log.filter((e) => e.accuracy >= 0.999).length;
  const bestCombo = log.reduce((m, e) => Math.max(m, e.maxCombo), 0);

  const def = (id: string, title: string, desc: string, icon: string, target: number, value: number): Achievement => ({
    id,
    title,
    desc,
    icon,
    target,
    value: Math.min(value, target),
    earned: value >= target,
  });

  return [
    def('first-steps', 'First Steps', 'Finish your first practice session.', '🌱', 1, sum.totalSessions),
    def('getting-serious', 'Getting Serious', 'Complete 10 sessions.', '🔥', 10, sum.totalSessions),
    def('dedicated', 'Dedicated', 'Complete 50 sessions.', '🏅', 50, sum.totalSessions),
    def('century', 'Century Club', 'Complete 100 sessions.', '💯', 100, sum.totalSessions),
    def('explorer', 'Explorer', 'Practice 5 different songs.', '🧭', 5, sum.songsPracticed),
    def('first-s', 'Top Marks', 'Earn an S grade.', '⭐', 1, sCount),
    def('perfectionist', 'Perfectionist', 'Earn 5 S grades.', '🌟', 5, sCount),
    def('flawless', 'Flawless', 'Finish a run at 100% accuracy.', '💎', 1, perfect),
    def('combo-50', 'Combo 50', 'Reach a 50-note combo.', '⚡', 50, bestCombo),
    def('combo-100', 'Combo 100', 'Reach a 100-note combo.', '🌠', 100, bestCombo),
    def('week-streak', 'Week Warrior', 'Practice 7 days in a row.', '📅', 7, streaks.longest),
    def('month-streak', 'Month Master', 'Practice 30 days in a row.', '🗓️', 30, streaks.longest),
  ];
}
