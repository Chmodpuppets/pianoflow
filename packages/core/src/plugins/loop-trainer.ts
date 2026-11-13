import type { Plugin, PluginEvent, PluginHost, DrawSurface, FrameInfo } from '../plugin';

export interface LoopTrainerOptions {
  /** automatically step the speed up after clean laps (default false) */
  speedUp?: boolean;
  /** speed increase per successful step when speedUp is on (default 0.05) */
  step?: number;
  /** speed to work up to when speedUp is on (default 1.0) */
  targetSpeed?: number;
  /** consecutive clean laps required before speeding up (default 3) */
  cleanLapsRequired?: number;
  /** minimum accuracy (0..1) for a lap to count as clean (default 0.9) */
  accuracyThreshold?: number;
}

const clampSpeed = (s: number): number => Math.min(4, Math.max(0.1, s));
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Drills an A-B loop region. While you loop a passage, it counts laps and reports
 * the accuracy of each lap (from the notes judged inside the region), so you can
 * see whether a difficult section is becoming reliable. Optionally it steps the
 * speed up after a streak of clean laps, bringing the passage up to tempo.
 *
 * It reads the loop region from the host and reacts to the `loop` event fired on
 * each wrap, so it works alongside the existing A-B loop controls. Accuracy is
 * meaningful in Practice mode (where notes are judged); in Listen mode it still
 * counts laps. Disabled by default; when `speedUp` is on it drives
 * {@link PluginHost.setSpeed}, handing speed control to the trainer.
 */
export class LoopTrainerPlugin implements Plugin {
  readonly id = 'loop-trainer';
  readonly name = 'Loop trainer';
  readonly version = '1.0.0';
  readonly description = 'Drills the A-B loop region, reporting each lap’s accuracy and optionally speeding up after clean laps.';
  readonly defaultEnabled = false;

  private host: PluginHost | null = null;
  private readonly speedUp: boolean;
  private readonly step: number;
  private readonly targetSpeed: number;
  private readonly cleanLapsRequired: number;
  private readonly accuracyThreshold: number;

  private laps = 0;
  private cleanStreak = 0;
  private lastAccuracy: number | null = null;
  private hits = 0;
  private judged = 0;
  private speed = 1;
  private message: string | null = null;
  private messageTimer = 0;

  constructor(opts: LoopTrainerOptions = {}) {
    this.speedUp = opts.speedUp ?? false;
    this.step = Math.max(0.05, opts.step ?? 0.05);
    this.targetSpeed = clampSpeed(opts.targetSpeed ?? 1.0);
    this.cleanLapsRequired = Math.max(1, Math.floor(opts.cleanLapsRequired ?? 3));
    this.accuracyThreshold = Math.min(1, Math.max(0, opts.accuracyThreshold ?? 0.9));
  }

  setup(host: PluginHost): void {
    this.host = host;
  }

  onEvent(event: PluginEvent): void {
    switch (event.type) {
      case 'song-loaded':
        this.laps = 0;
        this.cleanStreak = 0;
        this.lastAccuracy = null;
        this.hits = 0;
        this.judged = 0;
        this.message = null;
        break;
      case 'transport':
        this.speed = event.speed;
        break;
      case 'note-hit':
        if (this.inRegion(event.note.time)) {
          this.hits++;
          this.judged++;
        }
        break;
      case 'note-miss':
        if (this.inRegion(event.note.time)) this.judged++;
        break;
      case 'loop':
        this.onLap();
        break;
      case 'score-reset':
        this.hits = 0;
        this.judged = 0;
        this.cleanStreak = 0;
        break;
    }
  }

  /** Whether a note time falls inside the current A-B loop region. */
  private inRegion(time: number): boolean {
    const s = this.host?.loopStart;
    const e = this.host?.loopEnd;
    if (s == null || e == null) return false;
    return time >= s && time <= e;
  }

  private onLap(): void {
    const accuracy = this.judged > 0 ? this.hits / this.judged : null;
    this.lastAccuracy = accuracy;
    this.laps++;
    if (accuracy != null && accuracy >= this.accuracyThreshold) this.cleanStreak++;
    else this.cleanStreak = 0;
    this.hits = 0;
    this.judged = 0;

    if (this.speedUp && this.cleanStreak >= this.cleanLapsRequired) {
      this.cleanStreak = 0;
      if (this.speed < this.targetSpeed) {
        const next = round2(Math.min(this.targetSpeed, this.speed + this.step));
        this.speed = next;
        this.host?.setSpeed(next);
        this.host?.log('[loop-trainer] speed up to', next);
        this.flash(`Speed up! ${next.toFixed(2)}×`);
      } else {
        this.flash(`Target reached ${this.targetSpeed.toFixed(2)}× 🎉`);
      }
    }
  }

  private flash(text: string): void {
    this.message = text;
    this.messageTimer = 2.5;
  }

  onDraw(surface: DrawSurface, frame: FrameInfo): void {
    if (!this.host?.song) return;
    if (this.host.loopStart == null || this.host.loopEnd == null) return;
    if (this.messageTimer > 0) this.messageTimer = Math.max(0, this.messageTimer - frame.dt);

    const pct = this.lastAccuracy != null ? `${Math.round(this.lastAccuracy * 100)}%` : '–';
    surface.save();
    surface.setTextAlign('center');
    surface.setFont('bold 14px sans-serif');
    surface.setFillStyle('#4ea1ff');
    surface.setGlobalAlpha(0.95);
    surface.fillText(`Loop ${this.laps} · ${pct}`, frame.width / 2, 100);

    if (this.speedUp) {
      surface.setFont('12px sans-serif');
      surface.setFillStyle('#e6e6e6');
      surface.setGlobalAlpha(0.8);
      surface.fillText(
        `clean ${this.cleanStreak}/${this.cleanLapsRequired} · ${this.speed.toFixed(2)}× → ${this.targetSpeed.toFixed(2)}×`,
        frame.width / 2,
        118,
      );
    }

    if (this.message && this.messageTimer > 0) {
      const fade = Math.min(1, this.messageTimer / 0.5);
      surface.setFont('bold 15px sans-serif');
      surface.setFillStyle('#59d98e');
      surface.setGlobalAlpha(0.95 * fade);
      surface.fillText(this.message, frame.width / 2, 136);
    }
    surface.restore();
    surface.setGlobalAlpha(1);
  }

  /** number of completed laps (for tests / UI) */
  get lapCount(): number {
    return this.laps;
  }
  /** current clean-lap streak (for tests / UI) */
  get streak(): number {
    return this.cleanStreak;
  }
  /** accuracy of the most recent lap, or null when nothing was judged */
  get lastLoopAccuracy(): number | null {
    return this.lastAccuracy;
  }
  /** current training speed (for tests / UI) */
  get currentSpeed(): number {
    return this.speed;
  }
}
