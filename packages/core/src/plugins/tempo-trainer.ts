import type { Plugin, PluginEvent, PluginHost, DrawSurface, FrameInfo } from '../plugin';

export interface TempoTrainerOptions {
  /** speed to begin training at (default 0.5) */
  startSpeed?: number;
  /** speed to work up to (default 1.0) */
  targetSpeed?: number;
  /** speed increase per successful step (default 0.1) */
  step?: number;
  /** consecutive clean passes required before speeding up (default 2) */
  passesRequired?: number;
  /** minimum accuracy (0..1) for a pass to count as clean (default 0.9) */
  accuracyThreshold?: number;
}

const clampSpeed = (s: number): number => Math.min(4, Math.max(0.1, s));
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Gradual tempo training: start a song slow, and after a streak of clean passes
 * (accuracy at/above a threshold) step the speed up toward a target. A classic
 * practice aid for bringing a difficult passage up to performance tempo.
 *
 * It drives the host transport via {@link PluginHost.setSpeed}, so it is disabled
 * by default — enabling it hands speed control to the trainer until the target is
 * reached. Speed-ups are triggered by the `result` event, so they only happen in
 * Practice mode.
 */
export class TempoTrainerPlugin implements Plugin {
  readonly id = 'tempo-trainer';
  readonly name = 'Tempo trainer';
  readonly version = '1.0.0';
  readonly description = 'Starts slow and speeds up after consecutive clean passes, up to a target tempo.';
  readonly defaultEnabled = false;

  private host: PluginHost | null = null;
  private readonly startSpeed: number;
  private readonly targetSpeed: number;
  private readonly step: number;
  private readonly passesRequired: number;
  private readonly accuracyThreshold: number;

  private active = false;
  private speed: number;
  private cleanPasses = 0;
  private message: string | null = null;
  private messageTimer = 0;

  constructor(opts: TempoTrainerOptions = {}) {
    this.startSpeed = clampSpeed(opts.startSpeed ?? 0.5);
    this.targetSpeed = Math.max(this.startSpeed, clampSpeed(opts.targetSpeed ?? 1.0));
    this.step = Math.max(0.05, opts.step ?? 0.1);
    this.passesRequired = Math.max(1, Math.floor(opts.passesRequired ?? 2));
    this.accuracyThreshold = Math.min(1, Math.max(0, opts.accuracyThreshold ?? 0.9));
    this.speed = this.startSpeed;
  }

  setup(host: PluginHost): void {
    this.host = host;
  }

  onEvent(event: PluginEvent): void {
    switch (event.type) {
      case 'song-loaded':
        this.active = true;
        this.cleanPasses = 0;
        this.speed = this.startSpeed;
        this.message = null;
        this.host?.setSpeed(this.startSpeed);
        break;
      case 'transport':
        // Respect manual speed changes and our own setSpeed echoes.
        this.speed = event.speed;
        break;
      case 'score-reset':
        this.cleanPasses = 0;
        break;
      case 'result':
        this.onResult(event.result.accuracy);
        break;
    }
  }

  private onResult(accuracy: number): void {
    if (!this.active) return;
    if (accuracy < this.accuracyThreshold) {
      this.cleanPasses = 0;
      return;
    }
    this.cleanPasses++;
    if (this.cleanPasses < this.passesRequired) return;
    this.cleanPasses = 0;
    if (this.speed < this.targetSpeed) {
      const next = round2(Math.min(this.targetSpeed, this.speed + this.step));
      this.speed = next;
      this.host?.setSpeed(next);
      this.host?.log('[tempo-trainer] speed up to', next);
      this.flash(`Speed up! ${next.toFixed(2)}×`);
    } else {
      this.flash(`Target reached ${this.targetSpeed.toFixed(2)}× 🎉`);
    }
  }

  private flash(text: string): void {
    this.message = text;
    this.messageTimer = 2.5;
  }

  onDraw(surface: DrawSurface, frame: FrameInfo): void {
    if (!this.active || !this.host?.song) return;
    if (this.messageTimer > 0) this.messageTimer = Math.max(0, this.messageTimer - frame.dt);

    surface.save();
    surface.setTextAlign('right');
    surface.setFont('bold 13px sans-serif');
    surface.setFillStyle('#ffd166');
    surface.setGlobalAlpha(0.92);
    surface.fillText(`${this.speed.toFixed(2)}× → ${this.targetSpeed.toFixed(2)}×`, frame.width - 12, 24);
    surface.setFont('12px sans-serif');
    surface.setFillStyle('#e6e6e6');
    surface.setGlobalAlpha(0.8);
    surface.fillText(`clean passes ${this.cleanPasses}/${this.passesRequired}`, frame.width - 12, 42);

    if (this.message && this.messageTimer > 0) {
      const fade = Math.min(1, this.messageTimer / 0.5);
      surface.setFont('bold 15px sans-serif');
      surface.setFillStyle('#59d98e');
      surface.setGlobalAlpha(0.95 * fade);
      surface.fillText(this.message, frame.width - 12, 64);
    }
    surface.restore();
    surface.setGlobalAlpha(1);
  }

  /** current training speed (for tests / UI) */
  get currentSpeed(): number {
    return this.speed;
  }
  /** current clean-pass streak (for tests / UI) */
  get passes(): number {
    return this.cleanPasses;
  }
  /** the target speed (for tests / UI) */
  get target(): number {
    return this.targetSpeed;
  }
}
