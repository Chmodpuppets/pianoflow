import {
  parseMidi,
  assignHands,
  transposeNotes,
  clampSemitones,
  clampSplit,
  clampLatency,
  compensateLatency,
  ScoreKeeper,
  judgeHit,
  summarize,
  songStats,
  estimateDifficulty,
  type MidiSong,
  type MidiNote,
  type SessionResult,
  type Difficulty,
  type SongStats,
  PluginManager,
  createBuiltinPlugins,
  type PluginHost,
  type DrawSurface,
} from '@pianoflow/core';
import { AudioEngine } from '@pianoflow/audio';
import { Renderer, defaultTheme, colorblindTheme } from '@pianoflow/render';
import {
  WebMidiInput,
  ComputerKeyboardInput,
  PointerInput,
  type NoteHandlers,
  type MidiDeviceInfo,
} from '@pianoflow/input';

export type Mode = 'listen' | 'practice';
export type Hands = 'both' | 'right' | 'left';

export interface AppSettings {
  mode: Mode;
  hands: Hands;
  waitMode: boolean;
  speed: number;
  labels: boolean;
  noteLabels: boolean;
  colorblind: boolean;
  metronome: boolean;
  countIn: number;
  muted: boolean;
  volume: number;
  transpose: number;
  splitMidi: number;
  latencyMs: number;
  plugins: Record<string, boolean>;
}

export interface AppState {
  songName: string;
  songId: string;
  mode: Mode;
  hands: Hands;
  waitMode: boolean;
  playing: boolean;
  position: number;
  duration: number;
  speed: number;
  score: ScoreKeeper;
  usingSoundfont: boolean;
  soundfontSource: 'local' | 'cdn' | 'synth';
  midiSupported: boolean;
  midiConnected: boolean;
  midiDevices: MidiDeviceInfo[];
  midiSelected: string | null;
  lastMidiNote: number | null;
  lastJudge: string;
  metronome: boolean;
  countIn: number;
  muted: boolean;
  transpose: number;
  splitMidi: number;
  latencyMs: number;
  loopEnabled: boolean;
  loopStart: number | null;
  loopEnd: number | null;
}

const GOOD_WINDOW = 0.15;
const CHORD_EPSILON = 0.03;

function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'local';
}

/** Adapt a CanvasRenderingContext2D to the platform-agnostic DrawSurface. */
function canvasSurface(ctx: CanvasRenderingContext2D): DrawSurface {
  return {
    save: () => ctx.save(),
    restore: () => ctx.restore(),
    fillRect: (x, y, w, h) => ctx.fillRect(x, y, w, h),
    fillText: (t, x, y) => ctx.fillText(t, x, y),
    setFillStyle: (c) => {
      ctx.fillStyle = c;
    },
    setFont: (f) => {
      ctx.font = f;
    },
    setTextAlign: (a) => {
      ctx.textAlign = a;
    },
    setGlobalAlpha: (a) => {
      ctx.globalAlpha = a;
    },
  };
}

/**
 * Framework-agnostic controller: owns audio, rendering, input and scoring.
 * The DOM layer (main.ts) wires controls to these methods and calls frame()
 * once per requestAnimationFrame.
 */
export class PianoFlowApp {
  readonly engine: AudioEngine;
  readonly renderer: Renderer;
  readonly score = new ScoreKeeper();
  readonly plugins: PluginManager;
  private surface: DrawSurface;
  private lastFrameTs = 0;

  private song: MidiSong | null = null;
  private rawNotes: MidiNote[] = [];
  private notes: MidiNote[] = [];
  private active: MidiNote[] = [];
  private judged: boolean[] = [];
  private missPtr = 0;
  private pressed = new Set<number>();

  private mode: Mode = 'listen';
  private hands: Hands = 'both';
  private waitMode = false;
  private labels = false;
  private noteLabels = false;
  private colorblind = false;
  private muted = false;
  private volume = 0.9;
  private transpose = 0;
  private splitMidi = 60;
  private latencyMs = 0;
  private waiting = false;
  private waitIndex = -1;
  private waitEnd = -1;
  private lastJudge = '';

  private loopA: number | null = null;
  private loopB: number | null = null;

  private songId = '';
  private songTitle = '';
  private resultEmitted = false;

  private webmidi: WebMidiInput;
  private kb: ComputerKeyboardInput;
  private pointer: PointerInput;
  private midiConnected = false;
  private midiDevices: MidiDeviceInfo[] = [];
  private lastMidiNote: number | null = null;

  onState?: () => void;
  onResult?: (result: SessionResult, songId: string) => void;

  constructor(canvas: HTMLCanvasElement) {
    // Prefer the bundled local piano samples so the app works fully offline.
    const soundfontUrl = new URL('soundfont/acoustic_grand_piano-mp3.js', document.baseURI).href;
    this.engine = new AudioEngine({ soundfontUrl });
    this.renderer = new Renderer(canvas);
    const handlers: NoteHandlers = {
      onNoteOn: (m, v) => this.handleNoteOn(m, v),
      onNoteOff: (m) => this.handleNoteOff(m),
    };
    this.webmidi = new WebMidiInput(handlers);
    this.webmidi.onDevicesChange = (devices) => {
      this.midiDevices = devices;
      this.midiConnected = devices.length > 0;
      this.onState?.();
    };
    this.webmidi.onActivity = (midi) => {
      this.lastMidiNote = midi;
      this.onState?.();
    };
    this.kb = new ComputerKeyboardInput(handlers);
    this.pointer = new PointerInput(canvas, handlers, (x, y) => this.renderer.hitTest(x, y));
    this.engine.onEnded = () => {
      this.onState?.();
      this.finishIfPractice();
    };
    this.engine.onLoop = () => {
      this.plugins.emit({
        type: 'loop',
        start: this.engine.loopStart ?? 0,
        end: this.engine.loopEnd ?? 0,
      });
      this.resetJudgingFrom(this.engine.loopStart ?? 0);
    };

    // Plugin system: a platform-agnostic host backed by this app, plus the
    // bundled plugins. Overlays draw through a cached DrawSurface adapter.
    const self = this;
    const host: PluginHost = {
      get song() {
        return self.song;
      },
      get position() {
        return self.engine.position;
      },
      get playing() {
        return self.engine.playing;
      },
      play() {
        void self.play();
      },
      pause() {
        self.pause();
      },
      seek(t: number) {
        self.seek(t);
      },
      setSpeed(s: number) {
        self.setSpeed(s);
      },
      get loopEnabled() {
        return self.engine.loopEnabled;
      },
      get loopStart() {
        return self.engine.loopStart;
      },
      get loopEnd() {
        return self.engine.loopEnd;
      },
      setLoopEnabled(on: boolean) {
        self.setLoopEnabled(on);
      },
      log(...args: unknown[]) {
        console.log(...args);
      },
    };
    this.plugins = new PluginManager(host);
    for (const p of createBuiltinPlugins()) this.plugins.register(p);
    this.surface = canvasSurface(this.renderer.drawingContext);
  }

  async init(): Promise<void> {
    this.kb.attach();
    this.pointer.attach();
    if (this.webmidi.supported) {
      await this.webmidi.init();
      this.midiDevices = this.webmidi.devices();
      this.midiConnected = this.midiDevices.length > 0;
    }
    await this.engine.ready;
    this.onState?.();
  }

  resize(w: number, h: number): void {
    this.renderer.resize(w, h);
  }

  async loadBuffer(buf: ArrayBuffer, name: string, id?: string): Promise<void> {
    const song = parseMidi(buf);
    this.song = song;
    this.rawNotes = song.notes;
    this.rebuildNotes();
    this.songTitle = name;
    this.songId = id ?? slugify(name);
    this.engine.setMeter({
      ppq: song.ppq,
      tempos: song.tempos,
      timeSignatures: song.timeSignatures,
      durationTicks: song.durationTicks,
    });
    this.clearLoop();
    this.applyConfig();
    this.plugins.emit({ type: 'song-loaded', song });
  }

  setMode(m: Mode): void {
    this.mode = m;
    this.applyConfig();
  }
  setHands(h: Hands): void {
    this.hands = h;
    this.applyConfig();
  }
  setWaitMode(w: boolean): void {
    this.waitMode = w;
    if (!w) this.resumeFromWait();
  }
  setSpeed(s: number): void {
    this.engine.setSpeed(s);
    this.onState?.();
    this.emitTransport();
  }
  setLabels(b: boolean): void {
    this.labels = b;
    this.renderer.setConfig({ showLabels: b });
  }
  setNoteLabels(b: boolean): void {
    this.noteLabels = b;
    this.renderer.setConfig({ showNoteLabels: b });
  }
  setColorblind(b: boolean): void {
    this.colorblind = b;
    this.renderer.setConfig({ theme: b ? colorblindTheme : defaultTheme });
  }
  setMetronome(b: boolean): void {
    this.engine.setMetronome(b);
    this.onState?.();
  }
  setCountIn(n: number): void {
    this.engine.setCountIn(n);
    this.onState?.();
  }
  /** Master mute for all audio (piano + metronome). Sound is on by default. */
  setMuted(b: boolean): void {
    this.muted = b;
    this.engine.setMuted(b);
    this.onState?.();
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, isFinite(v) ? v : 0));
    this.engine.setVolume(this.volume);
    this.onState?.();
  }

  /** Shift the whole song by N semitones (±12). Rebuilds notes + hands. */
  setTranspose(n: number): void {
    this.transpose = clampSemitones(n);
    this.rebuildNotes();
    this.applyConfig();
  }
  /** Set the pitch boundary used to split a single track into hands. */
  setSplit(midi: number): void {
    this.splitMidi = clampSplit(midi);
    this.rebuildNotes();
    this.applyConfig();
  }
  /** Input/audio latency compensation in ms (positive = device reports late). */
  setLatency(ms: number): void {
    this.latencyMs = clampLatency(ms);
    this.onState?.();
  }

  /** Re-derive playable notes from the raw parse applying transpose + hand split. */
  private rebuildNotes(): void {
    const shifted = transposeNotes(this.rawNotes, this.transpose);
    assignHands(shifted, { splitMidi: this.splitMidi });
    this.notes = shifted;
  }

  /** Snapshot of user preferences, for persistence. */
  getSettings(): AppSettings {
    return {
      mode: this.mode,
      hands: this.hands,
      waitMode: this.waitMode,
      speed: this.engine.speed,
      labels: this.labels,
      noteLabels: this.noteLabels,
      colorblind: this.colorblind,
      metronome: this.engine.metronome,
      countIn: this.engine.countIn,
      muted: this.muted,
      volume: this.volume,
      transpose: this.transpose,
      splitMidi: this.splitMidi,
      latencyMs: this.latencyMs,
      plugins: this.plugins.states(),
    };
  }

  /** Apply persisted preferences, validating each field defensively. */
  applySettings(s: Partial<AppSettings>): void {
    if (s.mode === 'listen' || s.mode === 'practice') this.setMode(s.mode);
    if (s.hands === 'both' || s.hands === 'right' || s.hands === 'left') this.setHands(s.hands);
    if (typeof s.waitMode === 'boolean') this.setWaitMode(s.waitMode);
    if (typeof s.speed === 'number' && isFinite(s.speed)) this.setSpeed(s.speed);
    if (typeof s.labels === 'boolean') this.setLabels(s.labels);
    if (typeof s.noteLabels === 'boolean') this.setNoteLabels(s.noteLabels);
    if (typeof s.colorblind === 'boolean') this.setColorblind(s.colorblind);
    if (typeof s.metronome === 'boolean') this.setMetronome(s.metronome);
    if (typeof s.countIn === 'number' && isFinite(s.countIn)) this.setCountIn(s.countIn);
    if (typeof s.muted === 'boolean') this.setMuted(s.muted);
    if (typeof s.volume === 'number' && isFinite(s.volume)) this.setVolume(s.volume);
    if (typeof s.transpose === 'number' && isFinite(s.transpose)) this.setTranspose(s.transpose);
    if (typeof s.splitMidi === 'number' && isFinite(s.splitMidi)) this.setSplit(s.splitMidi);
    if (typeof s.latencyMs === 'number' && isFinite(s.latencyMs)) this.setLatency(s.latencyMs);
    if (s.plugins) {
      for (const [id, enabled] of Object.entries(s.plugins)) {
        if (typeof enabled === 'boolean') this.plugins.setEnabled(id, enabled);
      }
    }
  }

  /** Listen to a single MIDI input device by id, or `null` for all devices. */
  selectMidiDevice(id: string | null): void {
    this.webmidi.select(id);
    this.onState?.();
  }

  /** Capture the current position as loop point A. */
  markLoopStart(): void {
    this.loopA = Math.max(0, this.engine.position);
    this.applyLoop();
  }
  /** Capture the current position as loop point B. */
  markLoopEnd(): void {
    this.loopB = Math.max(0, this.engine.position);
    this.applyLoop();
  }
  private applyLoop(): void {
    if (this.loopA != null && this.loopB != null && this.loopB > this.loopA) {
      this.engine.setLoop(this.loopA, this.loopB);
    }
    this.onState?.();
  }
  setLoopEnabled(b: boolean): void {
    this.engine.setLoopEnabled(b);
    this.onState?.();
  }
  clearLoop(): void {
    this.loopA = null;
    this.loopB = null;
    this.engine.clearLoop();
    this.onState?.();
  }

  private applyConfig(): void {
    if (!this.song) return;
    this.resultEmitted = false;
    this.active =
      this.hands === 'both' ? this.notes : this.notes.filter((n) => n.hand === this.hands);
    this.judged = new Array(this.active.length).fill(false);
    this.missPtr = 0;
    this.waiting = false;
    this.waitIndex = -1;
    this.waitEnd = -1;
    this.lastJudge = '';
    this.score.reset();
    this.plugins.emit({ type: 'score-reset' });
    this.engine.stop();
    // In practice mode the engine advances the clock silently; the player
    // produces the sound by hitting keys. In listen mode it auto-plays.
    this.engine.load(this.mode === 'practice' ? [] : this.active, this.song.duration);
    this.onState?.();
  }

  async play(): Promise<void> {
    if (!this.song) return;
    if (this.engine.position >= this.song.duration - 0.05) this.seek(0);
    this.resultEmitted = false;
    await this.engine.play();
    this.onState?.();
    this.emitTransport();
  }
  pause(): void {
    this.engine.pause();
    this.onState?.();
    this.emitTransport();
  }
  async toggle(): Promise<void> {
    if (this.engine.playing) this.pause();
    else await this.play();
  }
  stop(): void {
    this.engine.stop();
    this.resultEmitted = false;
    this.score.reset();
    this.judged.fill(false);
    this.missPtr = 0;
    this.waiting = false;
    this.waitIndex = -1;
    this.waitEnd = -1;
    this.lastJudge = '';
    this.plugins.emit({ type: 'score-reset' });
    this.onState?.();
    this.emitTransport();
  }
  seek(t: number): void {
    this.engine.seek(t);
    this.resetJudgingFrom(t);
    this.onState?.();
    this.emitTransport();
  }

  private emitTransport(): void {
    this.plugins.emit({
      type: 'transport',
      playing: this.engine.playing,
      position: this.engine.position,
      speed: this.engine.speed,
    });
  }

  /** Mark notes before `t` as judged so they are not counted as missed. */
  private resetJudgingFrom(t: number): void {
    this.judged.fill(false);
    this.missPtr = 0;
    while (this.missPtr < this.active.length && this.active[this.missPtr].time < t - GOOD_WINDOW) {
      this.judged[this.missPtr] = true;
      this.missPtr++;
    }
    this.waiting = false;
    this.waitIndex = -1;
    this.waitEnd = -1;
  }

  /** Called once per animation frame. */
  frame(): void {
    const now = performance.now();
    const dt = this.lastFrameTs ? Math.min(0.1, (now - this.lastFrameTs) / 1000) : 0.016;
    this.lastFrameTs = now;
    if (!this.song) {
      this.renderer.render({ position: 0, notes: [], pressed: this.pressed });
      return;
    }
    const pos = this.engine.position;
    if (this.mode === 'practice' && this.engine.playing) {
      this.detectMisses(pos);
      if (this.waitMode) this.maybeWait(pos);
    }
    this.renderer.render({
      position: pos,
      notes: this.active,
      pressed: this.pressed,
      dt,
      loop: {
        enabled: this.engine.loopEnabled,
        start: this.engine.loopStart ?? 0,
        end: this.engine.loopEnd ?? 0,
      },
    });
    const playing = this.engine.playing;
    this.plugins.emit({ type: 'frame', position: pos, playing, dt });
    this.plugins.draw(this.surface, {
      position: pos,
      playing,
      dt,
      width: this.renderer.viewWidth,
      height: this.renderer.viewHeight,
    });
  }

  private detectMisses(pos: number): void {
    while (this.missPtr < this.active.length && this.active[this.missPtr].time < pos - GOOD_WINDOW) {
      const i = this.missPtr++;
      if (!this.judged[i]) {
        this.judged[i] = true;
        this.score.registerMiss();
        this.lastJudge = 'miss';
        this.plugins.emit({ type: 'note-miss', note: this.active[i] });
      }
    }
  }

  /** Exclusive end index of the chord containing note `i` (active is time-sorted). */
  private chordEnd(i: number): number {
    const t0 = this.active[i].time;
    let j = i;
    while (j < this.active.length && this.active[j].time - t0 <= CHORD_EPSILON) j++;
    return j;
  }

  private maybeWait(pos: number): void {
    if (this.waiting) return;
    let i = this.missPtr;
    while (i < this.active.length && this.judged[i]) i++;
    if (i >= this.active.length) return;
    if (pos >= this.active[i].time - 0.02) {
      this.waiting = true;
      this.waitIndex = i;
      this.waitEnd = this.chordEnd(i);
      this.engine.pause();
      this.onState?.();
      this.emitTransport();
    }
  }

  private resumeFromWait(): void {
    if (!this.waiting) return;
    this.waiting = false;
    this.waitIndex = -1;
    this.waitEnd = -1;
    void this.engine.play();
    this.emitTransport();
  }

  private findHit(midi: number, pos: number): number {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.active.length; i++) {
      const n = this.active[i];
      if (n.midi !== midi || this.judged[i]) continue;
      const d = Math.abs(n.time - pos);
      if (d <= GOOD_WINDOW && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private handleNoteOn(midi: number, velocity: number): void {
    this.pressed.add(midi);
    this.engine.noteOn(midi, velocity);
    if (this.mode === 'practice' && this.song) {
      const pos = compensateLatency(this.engine.position, this.latencyMs);
      const idx = this.findHit(midi, pos);
      if (idx >= 0) {
        const grade = judgeHit(this.active[idx].time, pos) ?? 'good';
        this.judged[idx] = true;
        this.score.registerHit(grade);
        this.lastJudge = grade;
        this.renderer.triggerPulse();
        this.renderer.notifyHit(this.active[idx].midi, this.active[idx].hand);
        this.plugins.emit({
          type: 'note-hit',
          note: this.active[idx],
          judgement: grade,
          combo: this.score.combo,
        });
        // Chord-aware wait: resume only once every note of the chord is hit.
        if (this.waiting && idx >= this.waitIndex && idx < this.waitEnd) {
          let all = true;
          for (let k = this.waitIndex; k < this.waitEnd; k++) {
            if (!this.judged[k]) {
              all = false;
              break;
            }
          }
          if (all) this.resumeFromWait();
        }
      } else {
        this.score.registerWrong();
        this.lastJudge = 'wrong';
        this.plugins.emit({ type: 'note-wrong', midi });
      }
    }
    this.onState?.();
  }

  private handleNoteOff(midi: number): void {
    this.pressed.delete(midi);
    this.engine.noteOff(midi);
    this.onState?.();
  }

  private finishIfPractice(): void {
    if (this.mode !== 'practice' || !this.song || this.resultEmitted) return;
    if (this.score.total === 0) return;
    this.resultEmitted = true;
    const result = summarize(this.score);
    this.onResult?.(result, this.songId);
    this.plugins.emit({ type: 'result', result, songId: this.songId });
  }

  currentSongInfo(): {
    id: string;
    title: string;
    stats: SongStats | null;
    difficulty: Difficulty | null;
  } {
    return {
      id: this.songId,
      title: this.songTitle,
      stats: this.song ? songStats(this.song) : null,
      difficulty: this.song ? estimateDifficulty(this.song) : null,
    };
  }

  getState(): AppState {
    return {
      songName: this.song?.name ?? '—',
      songId: this.songId,
      mode: this.mode,
      hands: this.hands,
      waitMode: this.waitMode,
      playing: this.engine.playing,
      position: this.engine.position,
      duration: this.song?.duration ?? 0,
      speed: this.engine.speed,
      score: this.score,
      usingSoundfont: this.engine.usingSoundfont,
      soundfontSource: this.engine.soundfontSource,
      midiSupported: this.webmidi.supported,
      midiConnected: this.midiConnected,
      midiDevices: this.midiDevices,
      midiSelected: this.webmidi.selected,
      lastMidiNote: this.lastMidiNote,
      lastJudge: this.lastJudge,
      metronome: this.engine.metronome,
      countIn: this.engine.countIn,
      muted: this.muted,
      transpose: this.transpose,
      splitMidi: this.splitMidi,
      latencyMs: this.latencyMs,
      loopEnabled: this.engine.loopEnabled,
      loopStart: this.engine.loopStart,
      loopEnd: this.engine.loopEnd,
    };
  }

  dispose(): void {
    this.kb.detach();
    this.pointer.detach();
    this.webmidi.dispose();
    this.engine.dispose();
  }
}
