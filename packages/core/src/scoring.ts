export type Judgement = 'perfect' | 'good';

export interface JudgeOptions {
  perfectWindow?: number;
  goodWindow?: number;
}

/**
 * Judge a performed note against an expected onset time.
 * Returns null when outside the good window (i.e. not a match).
 */
export function judgeHit(
  expectedTime: number,
  performedTime: number,
  opts: JudgeOptions = {},
): Judgement | null {
  const p = opts.perfectWindow ?? 0.08;
  const g = opts.goodWindow ?? 0.15;
  const d = Math.abs(performedTime - expectedTime);
  if (d <= p) return 'perfect';
  if (d <= g) return 'good';
  return null;
}

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

/** Fixed combo thresholds that trigger a celebration. */
const COMBO_MILESTONES = [10, 25, 50, 100];

/**
 * Return the milestone value when `combo` lands exactly on a celebration
 * threshold (10 / 25 / 50 / 100, then every 50 above 100), else null. Used to
 * fire a one-off reward (visual burst + chime) rather than feedback on every
 * note, so streaks feel earned without the stage reading as noise.
 */
export function comboMilestone(combo: number): number | null {
  if (!Number.isFinite(combo) || combo <= 0) return null;
  if (COMBO_MILESTONES.includes(combo)) return combo;
  if (combo > 100 && combo % 50 === 0) return combo;
  return null;
}

export class ScoreKeeper {
  total = 0;
  hits = 0;
  perfect = 0;
  good = 0;
  miss = 0;
  wrong = 0;
  combo = 0;
  maxCombo = 0;

  registerHit(j: Judgement): void {
    this.total++;
    this.hits++;
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    if (j === 'perfect') this.perfect++;
    else this.good++;
  }

  registerMiss(): void {
    this.total++;
    this.miss++;
    this.combo = 0;
  }

  registerWrong(): void {
    this.wrong++;
    this.combo = 0;
  }

  get accuracy(): number {
    return this.total ? this.hits / this.total : 1;
  }

  get grade(): Grade {
    const a = this.accuracy;
    if (a >= 0.95) return 'S';
    if (a >= 0.85) return 'A';
    if (a >= 0.7) return 'B';
    if (a >= 0.5) return 'C';
    return 'D';
  }

  reset(): void {
    this.total = this.hits = this.perfect = this.good = this.miss = this.wrong = this.combo = this.maxCombo = 0;
  }
}
