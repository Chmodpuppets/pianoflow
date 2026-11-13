/** A captured performed note, times in seconds relative to record start. */
export interface RecordedNote {
  midi: number;
  start: number;
  end: number;
  velocity: number;
}

/**
 * Captures live note on/off events into a timed performance. Pure and
 * clock-injected so it can be unit-tested deterministically.
 */
export class PerformanceRecorder {
  private now: () => number;
  private t0 = 0;
  private active = false;
  private open = new Map<number, { start: number; velocity: number }>();
  private done: RecordedNote[] = [];

  constructor(now: () => number = () => Date.now() / 1000) {
    this.now = now;
  }

  get recording(): boolean {
    return this.active;
  }

  get noteCount(): number {
    return this.done.length + this.open.size;
  }

  start(): void {
    this.active = true;
    this.t0 = this.now();
    this.open.clear();
    this.done = [];
  }

  noteOn(midi: number, velocity: number): void {
    if (!this.active) return;
    const at = this.now() - this.t0;
    if (this.open.has(midi)) this.close(midi, at);
    this.open.set(midi, { start: at, velocity });
  }

  noteOff(midi: number): void {
    if (!this.active) return;
    this.close(midi, this.now() - this.t0);
  }

  private close(midi: number, at: number): void {
    const o = this.open.get(midi);
    if (!o) return;
    this.open.delete(midi);
    this.done.push({ midi, start: o.start, end: Math.max(at, o.start + 0.02), velocity: o.velocity });
  }

  /** Stop and return the captured notes (closing any still-held keys). */
  stop(): RecordedNote[] {
    if (this.active) {
      const at = this.now() - this.t0;
      for (const m of [...this.open.keys()]) this.close(m, at);
      this.active = false;
    }
    return this.done.slice();
  }

  /** Notes captured so far without stopping. */
  peek(): RecordedNote[] {
    return this.done.slice();
  }
}
