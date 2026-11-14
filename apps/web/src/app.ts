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
  comboMilestone,
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
  PerformanceRecorder,
  writeMidi,
  type RecordedNote,
  isInstrument,
  DEFAULT_INSTRUMENT,
  instrumentFile,
  buildSheet,
  type SheetLayout,
  fitKeyboardRange,
  FULL_KEYBOARD,
  buildTimeGrid,
  type GridLine,
  buildReviewNotes,
  summarizeReview,
  type NoteJudgement,
  type ReviewSummary,
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
  instrument: string;
  fitKeyboard: boolean;
  handAssist: boolean;
  gpu: boolean;
  beatGrid: boolean;
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
  instrument: string;
  fitKeyboard: boolean;
  handAssist: boolean;
  loopEnabled: boolean;
  loopStart: number | null;
  loopEnd: number | null;
  recording: boolean;
  recordedNotes: number;
  gpu: boolean;
  gpuActive: boolean;
  beatGrid: boolean;
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
  private sheetCache: SheetLayout | null = null;
  private sheetCacheNotes: MidiNote[] | null = null;
  private timeGrid: GridLine[] = [];
  private active: MidiNote[] = [];
  private judged: boolean[] = [];
  private noteJudgements: (NoteJudgement | null)[] = [];
  private missPtr = 0;
  private pressed = new Set<number>();
  // Keys the app auto-plays (listen mode, or the assisted hand in practice):
  // midi -> {start,end} in song-position seconds, so the key lights while sounding.
  private autoPressed = new Map<number, { start: number; end: number }>();

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
  private instrument = DEFAULT_INSTRUMENT;
  private fitKeyboard = true;
  private handAssist = true;
  private gpu = true;
  private beatGrid = true;
  private waiting = false;
  private waitIndex = -1;
  private waitEnd = -1;
  private lastJudge = '';

  private loopA: number | null = null;
  private loopB: number | null = null;

  private songId = '';
  private songTitle = '';
  private resultEmitted = false;

  private recorder = new PerformanceRecorder(() =>
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000,
  );
  private recording = false;
  private lastRecording: RecordedNote[] = [];

  private webmidi: WebMidiInput;
  private kb: ComputerKeyboardInput;
  private pointer: PointerInput;
  private midiConnected = false;
  private midiDevices: MidiDeviceInfo[] = [];
  private lastMidiNote: number | null = null;

  onState?: () => void;
  onResult?: (result: SessionResult, songId: string) => void;

  constructor(canvas: HTMLCanvasElement) {
    // Prefer the bundled local samples so the app works fully offline; the
    // resolver lets the engine switch between several bundled timbres offline.
    const soundfontUrl = new URL('soundfont/acoustic_grand_piano-mp3.js', document.baseURI).href;
    const soundfontUrlFor = (id: string) => new URL(`soundfont/${instrumentFile(id)}`, document.baseURI).href;
    this.engine = new AudioEngine({ soundfontUrl, soundfontUrlFor });
    this.renderer = new Renderer(canvas);
    this.renderer.setConfig({ showBeatGrid: this.beatGrid });
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
    this.engine.onScheduledNote = (n) => {
      this.autoPressed.set(n.midi, { start: n.time, end: n.time + n.duration });
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
    this.timeGrid = buildTimeGrid({
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
  setHandAssist(b: boolean): void {
    this.handAssist = b;
    this.applyConfig();
  }
  setGpu(b: boolean): void {
    this.gpu = b;
    this.renderer.setGpuEnabled(b);
    this.onState?.();
  }
  setBeatGrid(b: boolean): void {
    this.beatGrid = b;
    this.renderer.setConfig({ showBeatGrid: b });
    this.onState?.();
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

  /** Switch the playback timbre (bundled SoundFont, offline-first). */
  setInstrument(id: string): void {
    if (!isInstrument(id)) return;
    this.instrument = id;
    void this.engine.setInstrument(id).then(() => this.onState?.());
    this.onState?.();
  }

  /** Auto-zoom the keyboard to the song's pitch span (Synthesia-style), or show all 88 keys. */
  setFitKeyboard(b: boolean): void {
    this.fitKeyboard = b;
    this.applyKeyboardRange();
    this.onState?.();
  }

  /** Fit the visible keyboard to the current notes, or fall back to the full piano. */
  private applyKeyboardRange(): void {
    const range =
      this.fitKeyboard && this.notes.length ? fitKeyboardRange(this.notes) : FULL_KEYBOARD;
    this.renderer.setConfig({ startMidi: range.startMidi, endMidi: range.endMidi });
  }

  /** Re-derive playable notes from the raw parse applying transpose + hand split. */
  private rebuildNotes(): void {
    const shifted = transposeNotes(this.rawNotes, this.transpose);
    assignHands(shifted, { splitMidi: this.splitMidi });
    this.notes = shifted;
    this.applyKeyboardRange();
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
      instrument: this.instrument,
      fitKeyboard: this.fitKeyboard,
      handAssist: this.handAssist,
      gpu: this.gpu,
      beatGrid: this.beatGrid,
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
    if (typeof s.instrument === 'string' && isInstrument(s.instrument)) this.setInstrument(s.instrument);
    if (typeof s.fitKeyboard === 'boolean') this.setFitKeyboard(s.fitKeyboard);
    if (typeof s.handAssist === 'boolean') this.setHandAssist(s.handAssist);
    if (typeof s.gpu === 'boolean') this.setGpu(s.gpu);
    if (typeof s.beatGrid === 'boolean') this.setBeatGrid(s.beatGrid);
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
    this.noteJudgements = new Array(this.active.length).fill(null);
    this.missPtr = 0;
    this.waiting = false;
    this.waitIndex = -1;
    this.waitEnd = -1;
    this.lastJudge = '';
    this.score.reset();
    this.plugins.emit({ type: 'score-reset' });
    this.engine.stop();
    this.autoPressed.clear();
    // In listen mode the engine auto-plays the active hand. In practice mode the
    // player produces the sound by hitting keys; when a single hand is selected
    // and hand-assist is on, the engine auto-plays the OTHER hand so the player
    // can focus on one hand at a time (the classic play-along workflow).
    this.engine.load(this.engineNotes(), this.song.duration);
    this.onState?.();
  }

  /** Notes the engine should auto-play given the current mode / hands / assist. */
  private engineNotes(): MidiNote[] {
    if (this.mode !== 'practice') return this.active;
    if (this.handAssist && this.hands !== 'both') {
      const other = this.hands === 'right' ? 'left' : 'right';
      return this.notes.filter((n) => n.hand === other);
    }
    return [];
  }

  /** True when the app is auto-playing the complementary hand in practice. */
  private get assistActive(): boolean {
    return this.mode === 'practice' && this.handAssist && this.hands !== 'both';
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
    this.autoPressed.clear();
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
    this.autoPressed.clear();
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
    this.noteJudgements.fill(null);
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
    // Light up keys the app is auto-playing (listen mode / assisted hand) so the
    // sound is tied to a visible event, merged with the player's own pressed keys.
    let pressed = this.pressed;
    if (this.autoPressed.size > 0) {
      const merged = new Set(this.pressed);
      for (const [midi, span] of this.autoPressed) {
        if (span.end <= pos) {
          this.autoPressed.delete(midi);
          continue;
        }
        if (span.start <= pos) merged.add(midi);
      }
      pressed = merged;
    }
    // With hand-assist, show BOTH hands falling: the player's hand bright, the
    // auto-played hand muted. Otherwise only the active hand is shown.
    const assist = this.assistActive;
    this.renderer.render({
      position: pos,
      notes: assist ? this.notes : this.active,
      pressed,
      dt,
      dimHand: assist ? (this.hands === 'right' ? 'left' : 'right') : undefined,
      grid: this.timeGrid,
      countIn:
        this.engine.countIn > 0 && pos < 0
          ? { beats: this.engine.countIn, beatDur: this.engine.beatDuration }
          : undefined,
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
        this.noteJudgements[i] = 'miss';
        this.score.registerMiss();
        this.lastJudge = 'miss';
        this.renderer.notifyMiss();
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
    if (this.recording) this.recorder.noteOn(midi, velocity);
    this.engine.noteOn(midi, velocity);
    if (this.mode === 'practice' && this.song) {
      const pos = compensateLatency(this.engine.position, this.latencyMs);
      const idx = this.findHit(midi, pos);
      if (idx >= 0) {
        const grade = judgeHit(this.active[idx].time, pos) ?? 'good';
        this.judged[idx] = true;
        this.noteJudgements[idx] = grade;
        this.score.registerHit(grade);
        this.lastJudge = grade;
        this.renderer.triggerPulse();
        this.renderer.notifyHit(this.active[idx].midi, this.active[idx].hand);
        const milestone = comboMilestone(this.score.combo);
        if (milestone != null) {
          this.renderer.notifyMilestone(milestone);
          this.engine.playMilestone(milestone);
        }
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
    if (this.recording) this.recorder.noteOff(midi);
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

  /** Grand-staff layout for the current song (transposed + hand-assigned), cached by note array. */
  getSheetLayout(): SheetLayout | null {
    if (!this.song) return null;
    if (this.sheetCacheNotes !== this.notes) {
      this.sheetCache = buildSheet({ ...this.song, notes: this.notes }, this.splitMidi);
      this.sheetCacheNotes = this.notes;
    }
    return this.sheetCache;
  }

  /**
   * Spatial review of the current/last practice run: per-measure accuracy and the
   * weakest measures to focus on. Null outside practice or before any note is judged.
   */
  getReview(): ReviewSummary | null {
    if (this.mode !== 'practice' || this.active.length === 0) return null;
    const reviewNotes = buildReviewNotes(this.active, this.noteJudgements);
    if (reviewNotes.length === 0) return null;
    const measureStarts = this.timeGrid.filter((l) => l.kind === 'measure').map((l) => l.time);
    return summarizeReview(reviewNotes, measureStarts);
  }

  // ---------- performance recording ----------
  startRecording(): void {
    this.recorder.start();
    this.recording = true;
    this.onState?.();
  }

  stopRecording(): RecordedNote[] {
    this.lastRecording = this.recorder.stop();
    this.recording = false;
    this.onState?.();
    return this.lastRecording;
  }

  toggleRecording(): void {
    if (this.recording) this.stopRecording();
    else this.startRecording();
  }

  get hasRecording(): boolean {
    return this.recording || this.lastRecording.length > 0;
  }

  /** Stop (if needed) and serialize the captured performance to a MIDI file. */
  buildRecordingMidi(): Uint8Array | null {
    if (this.recording) this.stopRecording();
    if (!this.lastRecording.length) return null;
    return writeMidi(this.lastRecording, { trackName: this.songTitle || 'PianoFlow performance' });
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
      instrument: this.instrument,
      fitKeyboard: this.fitKeyboard,
      handAssist: this.handAssist,
      loopEnabled: this.engine.loopEnabled,
      loopStart: this.engine.loopStart,
      loopEnd: this.engine.loopEnd,
      recording: this.recording,
      recordedNotes: this.recording ? this.recorder.noteCount : this.lastRecording.length,
      gpu: this.gpu,
      gpuActive: this.renderer.usingGpu,
      beatGrid: this.beatGrid,
    };
  }

  dispose(): void {
    this.kb.detach();
    this.pointer.detach();
    this.webmidi.dispose();
    this.engine.dispose();
    this.renderer.dispose();
  }
}
