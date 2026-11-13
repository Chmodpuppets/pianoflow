/**
 * Built-in Web Audio piano fallback (additive synthesis + percussive envelope).
 * Used when a SoundFont cannot be loaded (e.g. offline). No external assets.
 */
export class PianoSynth {
  private ctx: AudioContext;
  private master: GainNode;
  private active: { osc: OscillatorNode[]; gain: GainNode }[] = [];

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);
  }

  private freq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  play(midi: number, when: number, duration: number, velocity = 0.8): void {
    const f = this.freq(midi);
    const gain = this.ctx.createGain();
    gain.connect(this.master);
    const partials = [1, 2, 3, 4, 5, 6];
    const amps = [1, 0.45, 0.22, 0.12, 0.06, 0.03];
    const oscs = partials.map((p, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * p;
      const g = this.ctx.createGain();
      g.gain.value = amps[i] * velocity * 0.28;
      o.connect(g);
      g.connect(gain);
      o.start(when);
      return o;
    });
    const dur = Math.max(0.15, duration);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(1, when + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.5);
    const end = when + dur + 0.6;
    oscs.forEach((o) => o.stop(end));
    const entry = { osc: oscs, gain };
    this.active.push(entry);
    oscs[0].onended = () => {
      gain.disconnect();
      this.active = this.active.filter((a) => a !== entry);
    };
  }

  stopAll(): void {
    const now = this.ctx.currentTime;
    for (const a of this.active) {
      try {
        a.gain.gain.cancelScheduledValues(now);
        a.gain.gain.setTargetAtTime(0.0001, now, 0.02);
        a.osc.forEach((o) => o.stop(now + 0.05));
      } catch {
        /* already stopped */
      }
    }
    this.active = [];
  }
}
