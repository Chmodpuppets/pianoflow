import { Soundfont } from 'smplr';
import { buildBeatGrid, type Beat, type MeterInput, type MidiNote } from '@pianoflow/core';
import { PianoSynth } from './synth';
import { masterGainValue } from './volume';

export interface AudioEngineOptions {
  lookahead?: number;
  tickMs?: number;
  instrument?: string;
  /**
   * Optional URL of a locally bundled midi-js-soundfonts file (e.g.
   * `soundfont/acoustic_grand_piano-mp3.js`). When provided it is tried first
   * so the app works fully offline; the CDN instrument is the fallback.
   */
  soundfontUrl?: string;
  /**
   * Optional resolver returning a bundled local URL for any instrument id,
   * enabling offline switching between several bundled timbres.
   */
  soundfontUrlFor?: (instrument: string) => string | null;
}

/**
 * Web Audio playback engine with a look-ahead scheduler.
 * Primary voice: smplr SoundFont (real piano samples).
 * Fallback voice: built-in PianoSynth when the SoundFont cannot load.
 * Also drives a metronome (with optional count-in) and an A-B loop region.
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  /** Master output gain — the single mute point for synth + soundfont + metronome. */
  private masterGain: GainNode;
  private _muted = false;
  private _volume = 0.9;
  private sf: Soundfont | null = null;
  private synth: PianoSynth;
  private notes: MidiNote[] = [];
  private nextIndex = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private _playing = false;
  private anchorPos = 0;
  private anchorTime = 0;
  private _speed = 1;
  private duration = 0;
  private lookahead: number;
  private tickMs: number;
  private instrument: string;
  private soundfontUrl: string | null;
  private soundfontUrlFor: ((id: string) => string | null) | null;
  private _soundfontSource: 'local' | 'cdn' | 'synth' = 'synth';
  private live = new Map<number, () => void>();
  readonly ready: Promise<void>;
  onEnded?: () => void;
  /** Fired when playback wraps around the A-B loop region. */
  onLoop?: () => void;

  // Metronome / count-in
  private metroGain: GainNode;
  private metroEnabled = false;
  private countInBeats = 0;
  private beats: Beat[] = [];
  private beatIndex = 0;
  private beatDur0 = 0.5;

  // A-B loop
  loopEnabled = false;
  loopStart: number | null = null;
  loopEnd: number | null = null;

  constructor(opts: AudioEngineOptions = {}) {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = masterGainValue(this._muted, this._volume);
    this.masterGain.connect(this.ctx.destination);
    this.synth = new PianoSynth(this.ctx, this.masterGain);
    this.lookahead = opts.lookahead ?? 0.2;
    this.tickMs = opts.tickMs ?? 25;
    this.instrument = opts.instrument ?? 'acoustic_grand_piano';
    this.soundfontUrl = opts.soundfontUrl ?? null;
    this.soundfontUrlFor = opts.soundfontUrlFor ?? null;
    this.metroGain = this.ctx.createGain();
    this.metroGain.gain.value = 0.6;
    this.metroGain.connect(this.masterGain);
    this.ready = this.loadInstrument();
  }

  private localUrlFor(id: string): string | null {
    if (this.soundfontUrlFor) return this.soundfontUrlFor(id);
    if (id === 'acoustic_grand_piano') return this.soundfontUrl;
    return null;
  }

  private async loadInstrument(): Promise<void> {
    // Try the bundled local samples first (offline), then the CDN instrument,
    // and finally fall back to the built-in synth if neither can load.
    const attempts: { options: { instrumentUrl?: string; instrument?: string; destination?: AudioNode }; source: 'local' | 'cdn' }[] = [];
    const local = this.localUrlFor(this.instrument);
    if (local) attempts.push({ options: { instrumentUrl: local, destination: this.masterGain }, source: 'local' });
    attempts.push({ options: { instrument: this.instrument, destination: this.masterGain }, source: 'cdn' });
    for (const { options, source } of attempts) {
      try {
        const sf = new Soundfont(this.ctx, options);
        await sf.ready;
        this.sf = sf;
        this._soundfontSource = source;
        return;
      } catch (e) {
        console.warn(`[pianoflow] SoundFont (${source}) unavailable, trying next source.`, e);
      }
    }
    this.sf = null;
    this._soundfontSource = 'synth';
  }

  /** Switch timbre at runtime; reloads samples (local first, then CDN). */
  async setInstrument(id: string): Promise<void> {
    if (id === this.instrument) return;
    this.instrument = id;
    this.stopScheduled();
    this.live.clear();
    this.sf = null;
    this._soundfontSource = 'synth';
    await this.loadInstrument();
  }

  get instrumentId(): string {
    return this.instrument;
  }

  get playing(): boolean {
    return this._playing;
  }
  get speed(): number {
    return this._speed;
  }
  get position(): number {
    if (!this._playing) return this.anchorPos;
    return this.anchorPos + (this.ctx.currentTime - this.anchorTime) * this._speed;
  }
  get usingSoundfont(): boolean {
    return this.sf !== null;
  }
  /** Where the piano voice came from: bundled local samples, CDN, or synth. */
  get soundfontSource(): 'local' | 'cdn' | 'synth' {
    return this._soundfontSource;
  }
  get metronome(): boolean {
    return this.metroEnabled;
  }
  get countIn(): number {
    return this.countInBeats;
  }
  /** Mute/unmute all audio (synth, soundfont, metronome) via the master gain. */
  setMuted(muted: boolean): void {
    this._muted = muted;
    this.masterGain.gain.value = masterGainValue(this._muted, this._volume);
  }
  get muted(): boolean {
    return this._muted;
  }
  setVolume(volume: number): void {
    this._volume = Math.min(1, Math.max(0, isFinite(volume) ? volume : 0));
    this.masterGain.gain.value = masterGainValue(this._muted, this._volume);
  }
  get volume(): number {
    return this._volume;
  }

  load(notes: MidiNote[], duration: number): void {
    this.stop();
    this.notes = [...notes].sort((a, b) => a.time - b.time);
    this.duration = duration;
    this.anchorPos = 0;
    this.reindex();
    this.reindexBeats();
  }

  /** Provide tempo/time-signature info so the metronome can build its grid. */
  setMeter(input: MeterInput): void {
    this.beats = buildBeatGrid(input);
    this.beatDur0 = this.beats.length > 1 ? this.beats[1].time - this.beats[0].time : 0.5;
    this.reindexBeats();
  }

  setMetronome(on: boolean): void {
    this.metroEnabled = on;
  }
  setCountIn(beats: number): void {
    this.countInBeats = Math.max(0, Math.min(8, Math.round(beats)));
  }

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

  private reindex(): void {
    let i = 0;
    while (i < this.notes.length && this.notes[i].time < this.anchorPos) i++;
    this.nextIndex = i;
  }

  private reindexBeats(): void {
    let i = 0;
    while (i < this.beats.length && this.beats[i].time < this.anchorPos) i++;
    this.beatIndex = i;
  }

  async play(): Promise<void> {
    await this.ctx.resume();
    if (this._playing) return;
    if (this.anchorPos >= this.duration) this.anchorPos = 0;

    // Count-in: schedule lead-in clicks and delay the clock so position 0 is
    // reached after the lead-in. Notes (time >= 0) stay silent during it.
    let startDelay = 0;
    if (this.countInBeats > 0 && this.anchorPos <= 0 && this.beats.length) {
      const beatDur = this.beatDur0 / this._speed;
      startDelay = this.countInBeats * beatDur;
      for (let i = 0; i < this.countInBeats; i++) {
        this.click(this.ctx.currentTime + i * beatDur, i === 0);
      }
    }

    this.anchorTime = this.ctx.currentTime + startDelay;
    this._playing = true;
    this.reindex();
    this.reindexBeats();
    this.timer = setInterval(() => this.schedule(), this.tickMs);
    this.schedule();
  }

  pause(): void {
    if (!this._playing) return;
    this.anchorPos = this.position;
    this._playing = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.stopScheduled();
  }

  stop(): void {
    this.pause();
    this.anchorPos = 0;
    this.reindex();
    this.reindexBeats();
  }

  seek(t: number): void {
    this.anchorPos = Math.max(0, Math.min(this.duration, t));
    this.anchorTime = this.ctx.currentTime;
    this.stopScheduled();
    this.reindex();
    this.reindexBeats();
    if (this._playing) this.schedule();
  }

  setSpeed(s: number): void {
    const pos = this.position;
    this._speed = Math.max(0.1, Math.min(4, s));
    this.anchorPos = pos;
    this.anchorTime = this.ctx.currentTime;
    this.reindex();
    this.reindexBeats();
  }

  private schedule(): void {
    if (!this._playing) return;
    const now = this.ctx.currentTime;
    let pos = this.anchorPos + (now - this.anchorTime) * this._speed;

    // A-B loop wrap: re-anchor at loopStart so scheduling stays sample-accurate.
    if (this.loopEnabled && this.loopEnd != null && pos >= this.loopEnd) {
      const start = this.loopStart ?? 0;
      this.stopScheduled();
      this.anchorPos = start;
      this.anchorTime = now;
      this.reindex();
      this.reindexBeats();
      this.onLoop?.();
      pos = start;
    }

    const horizon = pos + this.lookahead * this._speed;

    while (this.nextIndex < this.notes.length && this.notes[this.nextIndex].time < horizon) {
      const n = this.notes[this.nextIndex++];
      if (n.time < pos - 0.05) continue;
      const when = Math.max(now, now + (n.time - pos) / this._speed);
      this.trigger(n.midi, when, n.duration / this._speed, n.velocity);
    }

    if (this.metroEnabled) {
      while (this.beatIndex < this.beats.length && this.beats[this.beatIndex].time < horizon) {
        const b = this.beats[this.beatIndex++];
        if (b.time < pos - 0.05) continue;
        const when = Math.max(now, now + (b.time - pos) / this._speed);
        this.click(when, b.accent);
      }
    }

    if (pos >= this.duration) {
      this.pause();
      this.anchorPos = this.duration;
      this.onEnded?.();
    }
  }

  private trigger(midi: number, when: number, duration: number, velocity: number): void {
    if (this.sf) {
      this.sf.start({
        note: midi,
        time: when,
        duration: Math.max(0.05, duration),
        velocity: Math.round(velocity * 127),
      });
    } else {
      this.synth.play(midi, when, duration, velocity);
    }
  }

  private click(when: number, accent: boolean): void {
    const t = Math.max(when, this.ctx.currentTime);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1600 : 1100;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.28, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g);
    g.connect(this.metroGain);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  private stopScheduled(): void {
    if (this.sf) {
      try {
        this.sf.stop();
      } catch {
        /* noop */
      }
    }
    this.synth.stopAll();
  }

  noteOn(midi: number, velocity = 0.8): void {
    void this.ctx.resume();
    if (this.sf) {
      const handle = this.sf.start({
        note: midi,
        time: this.ctx.currentTime,
        velocity: Math.round(velocity * 127),
      }) as unknown;
      if (typeof handle === 'function') this.live.set(midi, handle as () => void);
    } else {
      this.synth.play(midi, this.ctx.currentTime, 0.8, velocity);
    }
  }

  noteOff(midi: number): void {
    const h = this.live.get(midi);
    if (h) {
      h();
      this.live.delete(midi);
    }
  }

  dispose(): void {
    this.pause();
    void this.ctx.close();
  }
}
