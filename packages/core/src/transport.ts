/**
 * Pure transport state machine (no audio/DOM dependencies).
 * The audio engine drives `tick(deltaSeconds)` from its clock.
 * Supports an A-B loop region for practising difficult passages.
 */
export class Transport {
  playing = false;
  position = 0;
  speed = 1;
  duration: number;

  loopEnabled = false;
  loopStart: number | null = null;
  loopEnd: number | null = null;

  constructor(duration = 0) {
    this.duration = duration;
  }

  play(): void {
    if (this.position >= this.duration) this.position = 0;
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  stop(): void {
    this.playing = false;
    this.position = 0;
  }

  seek(t: number): void {
    this.position = Math.max(0, Math.min(this.duration, t));
  }

  setSpeed(s: number): void {
    this.speed = Math.max(0.1, Math.min(4, s));
  }

  /** Define and enable an A-B loop region (seconds). Ignored if invalid. */
  setLoop(start: number, end: number): void {
    const a = Math.max(0, Math.min(this.duration, start));
    const b = Math.max(0, Math.min(this.duration, end));
    if (b <= a) return;
    this.loopStart = a;
    this.loopEnd = b;
    this.loopEnabled = true;
  }

  clearLoop(): void {
    this.loopEnabled = false;
    this.loopStart = null;
    this.loopEnd = null;
  }

  setLoopEnabled(on: boolean): void {
    this.loopEnabled = on && this.loopStart != null && this.loopEnd != null;
  }

  tick(delta: number): void {
    if (!this.playing) return;
    this.position += delta * this.speed;
    if (this.loopEnabled && this.loopEnd != null && this.position >= this.loopEnd) {
      this.position = this.loopStart ?? 0;
      return;
    }
    if (this.position >= this.duration) {
      this.position = this.duration;
      this.playing = false;
    }
  }
}
