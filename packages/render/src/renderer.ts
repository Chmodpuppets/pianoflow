import type { MidiNote, GridLine } from '@pianoflow/core';
import { NoteIndex, noteName } from '@pianoflow/core';
import { buildKeyboard, keyAt, type KeyboardLayout } from './keyboard';
import { defaultTheme, type Theme } from './theme';
import { createNoteBackend, type WebGLNoteBackend } from './webgl';

/** Convert a #rrggbb color to an rgba() string with the given alpha. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export interface RenderConfig {
  startMidi: number;
  endMidi: number;
  /** how many seconds of upcoming notes are visible above the keyboard */
  secondsVisible: number;
  keyboardHeightRatio: number;
  showLabels: boolean;
  /** draw note names (C4, D4, …) on the falling note blocks */
  showNoteLabels: boolean;
  /** draw the scrolling measure/beat rhythm grid behind the falling notes */
  showBeatGrid: boolean;
  theme: Theme;
}

export interface RenderState {
  position: number;
  notes: MidiNote[];
  pressed: Set<number>;
  loop?: { enabled: boolean; start: number; end: number };
  /** seconds since last frame, for particle integration (default 1/60) */
  dt?: number;
  /**
   * When set, notes belonging to this hand are drawn muted (the app auto-plays
   * them while the player practices the other hand). They get no name labels.
   */
  dimHand?: 'left' | 'right';
  /** measure/beat rhythm grid lines (seconds) to scroll behind the notes */
  grid?: GridLine[];
}

interface Spark {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string;
}

/** An expanding ring radiating from the strike line on a combo milestone. */
interface Shockwave {
  r: number; maxR: number; life: number; maxLife: number; color: string;
}

export const defaultRenderConfig: RenderConfig = {
  startMidi: 21,
  endMidi: 108,
  secondsVisible: 3,
  keyboardHeightRatio: 0.18,
  showLabels: false,
  showNoteLabels: false,
  showBeatGrid: false,
  theme: defaultTheme,
};

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  layout: KeyboardLayout;
  config: RenderConfig;
  keyboardHeight = 0;
  keyboardTop = 0;

  // Viewport-culling index, rebuilt only when the note array reference changes.
  private indexedNotes: MidiNote[] | null = null;
  private noteIndex: NoteIndex | null = null;
  // Reused flat rect buffers ([x,y,w,h,r] per note) to avoid per-frame GC churn.
  private rightBuf: number[] = [];
  private leftBuf: number[] = [];
  // Muted notes for the auto-played (assisted) hand, drawn without bloom/labels.
  private dimBuf: number[] = [];
  // Reused [x,y,w,h,midi] tuples for note-name labels (only when enabled).
  private labelBuf: number[] = [];

  // Cached stage gradients, rebuilt on resize / config change (theme-aware).
  private bgGrad: CanvasGradient | null = null;
  private stageGrad: CanvasGradient | null = null;
  private vignetteGrad: CanvasGradient | null = null;
  private whiteGrad: CanvasGradient | null = null;
  private blackGrad: CanvasGradient | null = null;
  private hitGlowGrad: CanvasGradient | null = null;
  private noteGradRight: CanvasGradient | null = null;
  private noteGradLeft: CanvasGradient | null = null;
  // Strike-line pulse (0..1), triggered on a successful hit and decayed per frame.
  private hitPulse = 0;
  // Hit spark particles (capped so repeated hits never leak / unbounded growth).
  private sparks: Spark[] = [];
  private static readonly SPARK_CAP = 240;
  // Combo-milestone shockwaves (capped) + a decaying red flash on a miss.
  private shockwaves: Shockwave[] = [];
  private static readonly SHOCKWAVE_CAP = 6;
  private missFlash = 0;

  // GPU note backend (instanced WebGL). Created lazily on first render when a
  // WebGL context is available; null means the batched Canvas2D path is used.
  private noteBackend: WebGLNoteBackend | null = null;
  private gpuTried = false;
  private gpuEnabled = true;

  constructor(canvas: HTMLCanvasElement, config: Partial<RenderConfig> = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not supported');
    this.ctx = ctx;
    this.config = { ...defaultRenderConfig, ...config };
    this.layout = buildKeyboard(this.config.startMidi, this.config.endMidi, 1);
  }

  resize(w: number, h: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.relayout();
  }

  setConfig(partial: Partial<RenderConfig>): void {
    this.config = { ...this.config, ...partial };
    this.relayout();
  }

  private relayout(): void {
    this.layout = buildKeyboard(this.config.startMidi, this.config.endMidi, this.cssW || 1);
    this.keyboardHeight = Math.round((this.cssH || 1) * this.config.keyboardHeightRatio);
    this.keyboardTop = (this.cssH || 0) - this.keyboardHeight;
    this.buildGradients();
  }

  /** Flash the strike line (called by the app when the player hits a note). */
  triggerPulse(): void {
    this.hitPulse = 1;
  }
  /** Current strike-line pulse level (0..1); exposed for tests/overlays. */
  get pulseLevel(): number {
    return this.hitPulse;
  }

  /** Enable/disable GPU (WebGL) note rendering; falls back to Canvas2D when off
   *  or unavailable. Re-enabling retries context creation if it previously failed. */
  setGpuEnabled(on: boolean): void {
    this.gpuEnabled = on;
    if (on) this.gpuTried = false;
  }
  /** Whether notes are currently drawn by the GPU backend (for UI badges/tests). */
  get usingGpu(): boolean {
    return this.gpuEnabled && this.noteBackend != null;
  }
  private ensureGpu(): boolean {
    if (!this.gpuEnabled) return false;
    if (!this.gpuTried) {
      this.gpuTried = true;
      this.noteBackend = createNoteBackend(this.canvas);
    }
    return this.noteBackend != null;
  }
  /** Release GPU resources (called when the renderer is torn down). */
  dispose(): void {
    this.noteBackend?.dispose();
    this.noteBackend = null;
    this.gpuTried = false;
  }

  /** Spawn a burst of hand-colored sparks at the strike line on a successful hit. */
  notifyHit(midi: number, hand?: 'left' | 'right'): void {
    const key = this.layout.byMidi.get(midi);
    if (!key) return;
    const color = hand === 'left' ? this.config.theme.leftNote : this.config.theme.rightNote;
    const cx = key.x + key.width / 2;
    const cy = this.keyboardTop;
    const count = 10;
    for (let i = 0; i < count; i++) {
      if (this.sparks.length >= Renderer.SPARK_CAP) this.sparks.shift();
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6; // upward fan
      const speed = 60 + Math.random() * 120;
      const maxLife = 0.35 + Math.random() * 0.3;
      this.sparks.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life: maxLife, maxLife,
        size: 1.5 + Math.random() * 2,
        color,
      });
    }
  }
  /** Live spark count (for tests / diagnostics). */
  get particleCount(): number {
    return this.sparks.length;
  }

  /**
   * Celebrate a combo milestone: an expanding golden ring from the strike-line
   * center plus a radial burst of golden sparks. Higher combos glow warmer.
   */
  notifyMilestone(combo: number): void {
    const color = combo >= 100 ? '#ff5db1' : combo >= 50 ? '#ffd166' : '#ffe9a8';
    if (this.shockwaves.length >= Renderer.SHOCKWAVE_CAP) this.shockwaves.shift();
    const maxR = Math.max(this.cssW, this.cssH) * 0.62;
    this.shockwaves.push({ r: 0, maxR, life: 0.6, maxLife: 0.6, color });
    const cx = this.cssW / 2;
    const cy = this.keyboardTop;
    const count = 26;
    for (let i = 0; i < count; i++) {
      if (this.sparks.length >= Renderer.SPARK_CAP) this.sparks.shift();
      const ang = (i / count) * Math.PI * 2; // full radial burst
      const speed = 120 + Math.random() * 160;
      const maxLife = 0.5 + Math.random() * 0.35;
      this.sparks.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - 40,
        life: maxLife, maxLife,
        size: 2 + Math.random() * 2.5,
        color,
      });
    }
  }
  /** Live shockwave count (for tests / diagnostics). */
  get shockwaveCount(): number {
    return this.shockwaves.length;
  }

  /** Flash the stage edges red when a note is missed (decays per frame). */
  notifyMiss(): void {
    this.missFlash = 1;
  }
  /** Current miss-flash level (0..1); exposed for tests. */
  get missFlashLevel(): number {
    return this.missFlash;
  }

  private buildGradients(): void {
    const { ctx, cssW, cssH, keyboardTop, keyboardHeight } = this;
    const t = this.config.theme;
    if (cssW <= 0 || cssH <= 0) {
      this.bgGrad = this.stageGrad = this.vignetteGrad = null;
      this.whiteGrad = this.blackGrad = this.hitGlowGrad = null;
      this.noteGradRight = this.noteGradLeft = null;
      return;
    }
    const bg = ctx.createLinearGradient(0, 0, 0, cssH);
    bg.addColorStop(0, t.bgTop);
    bg.addColorStop(1, t.bgBottom);
    this.bgGrad = bg;

    const stage = ctx.createRadialGradient(
      cssW / 2, keyboardTop, 0,
      cssW / 2, keyboardTop, Math.max(cssW, cssH) * 0.7,
    );
    stage.addColorStop(0, withAlpha(t.stageGlow, 0.16));
    stage.addColorStop(1, withAlpha(t.stageGlow, 0));
    this.stageGrad = stage;

    const vig = ctx.createRadialGradient(
      cssW / 2, cssH * 0.45, Math.min(cssW, cssH) * 0.25,
      cssW / 2, cssH * 0.5, Math.max(cssW, cssH) * 0.78,
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.38)');
    this.vignetteGrad = vig;

    const wg = ctx.createLinearGradient(0, keyboardTop, 0, keyboardTop + keyboardHeight);
    wg.addColorStop(0, t.whiteKey);
    wg.addColorStop(1, t.whiteKeyBottom);
    this.whiteGrad = wg;

    const bh = keyboardHeight * 0.62;
    const bk = ctx.createLinearGradient(0, keyboardTop, 0, keyboardTop + bh);
    bk.addColorStop(0, t.blackKeyTop);
    bk.addColorStop(1, t.blackKey);
    this.blackGrad = bk;

    const hg = ctx.createLinearGradient(0, keyboardTop - 12, 0, keyboardTop + 12);
    hg.addColorStop(0, withAlpha(t.hitLine, 0));
    hg.addColorStop(0.5, withAlpha(t.hitLine, 0.5));
    hg.addColorStop(1, withAlpha(t.hitLine, 0));
    this.hitGlowGrad = hg;

    // Falling-note vertical gradients: dimmer at the top, full-chroma near the
    // strike line, echoing the reference playfield's luminous blocks.
    const nr = ctx.createLinearGradient(0, 0, 0, keyboardTop);
    nr.addColorStop(0, withAlpha(t.rightNote, 0.62));
    nr.addColorStop(0.75, t.rightNote);
    nr.addColorStop(1, t.rightNote);
    this.noteGradRight = nr;
    const nl = ctx.createLinearGradient(0, 0, 0, keyboardTop);
    nl.addColorStop(0, withAlpha(t.leftNote, 0.62));
    nl.addColorStop(0.75, t.leftNote);
    nl.addColorStop(1, t.leftNote);
    this.noteGradLeft = nl;
  }

  hitTest(x: number, y: number): number | null {
    if (y < this.keyboardTop) return null;
    return keyAt(this.layout, x, y - this.keyboardTop, this.keyboardHeight);
  }

  /** The 2D context, exposed so plugin overlays can draw on top of the scene. */
  get drawingContext(): CanvasRenderingContext2D {
    return this.ctx;
  }
  get viewWidth(): number {
    return this.cssW;
  }
  get viewHeight(): number {
    return this.cssH;
  }

  render(state: RenderState): void {
    const { ctx, cssW, cssH, config } = this;
    const theme = config.theme;
    // Guarantee a clean canvas state each frame so a plugin overlay that forgets
    // to restore cannot corrupt the base scene on the next frame.
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    this.drawBackground(theme);

    const pps = this.keyboardTop / Math.max(0.2, config.secondsVisible);
    const pos = state.position;

    // Rhythm grid sits behind the falling notes so blocks read on top of it.
    if (config.showBeatGrid && state.grid) this.drawGrid(state.grid, pos, pps, theme);

    // Only iterate notes that can overlap the visible time window, not the
    // whole song. The window is padded by 1s; the exact pixel cull below still
    // applies, so output is identical to a full scan but far cheaper for dense
    // "black MIDI" files.
    const index = this.getIndex(state.notes);
    const t0 = pos - this.keyboardHeight / pps - 1;
    const t1 = pos + config.secondsVisible + 1;
    const visible = index.query(t0, t1);

    const gpu = this.ensureGpu();
    this.rightBuf.length = 0;
    this.leftBuf.length = 0;
    this.dimBuf.length = 0;
    this.labelBuf.length = 0;
    for (const n of visible) {
      const bottom = this.keyboardTop - (n.time - pos) * pps;
      const top = bottom - n.duration * pps;
      if (top > cssH || bottom < 0) continue;
      const key = this.layout.byMidi.get(n.midi);
      if (!key) continue;
      const x = key.x + 1;
      const w = key.width - 2;
      const y = Math.max(top, -10);
      const h = Math.min(bottom, this.keyboardTop) - y;
      if (h <= 0 || w <= 0) continue;
      const dim = state.dimHand != null && n.hand === state.dimHand;
      // The GPU backend builds its own instance buffer from `visible`; only the
      // Canvas2D fallback needs the per-hand rect buffers here.
      if (!gpu) {
        const buf = dim ? this.dimBuf : n.hand === 'left' ? this.leftBuf : this.rightBuf;
        buf.push(x, y, w, h, Math.min(4, w / 2));
      }
      // Only label blocks big enough to hold legible text (never the muted hand).
      if (!dim && config.showNoteLabels && h >= 12 && w >= 12) {
        this.labelBuf.push(x, y, w, h, n.midi);
      }
    }
    if (gpu && this.noteBackend) {
      const b = this.noteBackend;
      if (b.cssW !== cssW || b.cssH !== cssH || b.dpr !== this.dpr) b.resize(cssW, cssH, this.dpr);
      b.draw({
        notes: visible, layout: this.layout, pps, position: pos,
        keyboardTop: this.keyboardTop, cssH, theme, dimHand: state.dimHand,
      });
      // Composite the transparent GPU note layer at the exact note depth.
      ctx.drawImage(b.canvas, 0, 0, cssW, cssH);
    } else {
      // Auto-played (assisted) hand first: muted flat color, no bloom, so the
      // player's own hand reads as the bright, actionable layer on top.
      if (state.dimHand != null && this.dimBuf.length > 0) {
        const dimColor =
          state.dimHand === 'left' ? withAlpha(theme.leftNote, 0.3) : withAlpha(theme.rightNote, 0.3);
        this.fillBatch(this.dimBuf, dimColor);
      }
      // One fill per hand instead of one per note, with a soft luminous bloom.
      ctx.shadowBlur = 12;
      ctx.shadowColor = withAlpha(theme.rightNote, 0.7);
      this.fillBatch(this.rightBuf, theme.rightNote, this.noteGradRight);
      ctx.shadowColor = withAlpha(theme.leftNote, 0.7);
      this.fillBatch(this.leftBuf, theme.leftNote, this.noteGradLeft);
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'rgba(0,0,0,0)';
    }
    if (config.showNoteLabels) this.drawNoteLabels(theme);

    this.drawHitLine(theme);
    this.hitPulse *= 0.86;
    if (this.hitPulse < 0.02) this.hitPulse = 0;

    if (state.loop?.enabled) this.drawLoop(state.loop, pos, pps, theme);

    this.drawAnticipation(state.notes, pos, state.pressed, theme);
    this.drawKeyboard(state.pressed);
    const dt = state.dt ?? 1 / 60;
    this.drawSparks(dt);
    this.drawShockwaves(dt);
    this.drawMissFlash();
    this.missFlash *= 0.88;
    if (this.missFlash < 0.02) this.missFlash = 0;
  }

  /** Soft hand-colored glow on keys whose notes are about to arrive, so the
   *  player can anticipate finger placement before the note reaches the line. */
  private drawAnticipation(notes: MidiNote[], pos: number, pressed: Set<number>, theme: Theme): void {
    const { ctx } = this;
    const seen = new Map<number, string>();
    for (const n of notes) {
      const delta = n.time - pos;
      if (delta < -0.05 || delta > 0.5) continue;
      if (pressed.has(n.midi)) continue;
      if (!seen.has(n.midi)) {
        seen.set(n.midi, n.hand === 'left' ? theme.leftNote : theme.rightNote);
      }
    }
    for (const [midi, color] of seen) {
      const k = this.layout.byMidi.get(midi);
      if (!k) continue;
      const gx = k.x + k.width / 2;
      const radius = Math.max(14, k.width * 1.5);
      const g = ctx.createRadialGradient(gx, this.keyboardTop, 0, gx, this.keyboardTop, radius);
      g.addColorStop(0, withAlpha(color, 0.28));
      g.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(gx - radius, this.keyboardTop - radius, radius * 2, radius);
    }
  }

  /** Integrate + draw hit sparks; expired particles are removed each frame. */
  private drawSparks(dt: number): void {
    const { ctx } = this;
    if (this.sparks.length === 0) return;
    ctx.save();
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life -= dt;
      if (p.life <= 0) { this.sparks.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 140 * dt; // gravity
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'rgba(0,0,0,0)';
  }

  /** Expand + fade milestone rings; expired rings are removed each frame. */
  private drawShockwaves(dt: number): void {
    const { ctx, cssW } = this;
    if (this.shockwaves.length === 0) return;
    const cy = this.keyboardTop;
    ctx.save();
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const w = this.shockwaves[i];
      w.life -= dt;
      if (w.life <= 0) { this.shockwaves.splice(i, 1); continue; }
      const t = 1 - w.life / w.maxLife; // 0..1 progress
      w.r = w.maxR * (1 - Math.pow(1 - t, 2)); // ease-out expansion
      const a = Math.max(0, w.life / w.maxLife);
      ctx.globalAlpha = a * 0.7;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 2 + a * 4;
      ctx.shadowColor = w.color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(cssW / 2, cy, Math.max(1, w.r), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'rgba(0,0,0,0)';
  }

  /** A brief red wash over the stage edges so a miss is felt, not just read. */
  private drawMissFlash(): void {
    if (this.missFlash <= 0) return;
    const { ctx, cssW, cssH } = this;
    const g = ctx.createRadialGradient(
      cssW / 2, cssH * 0.5, Math.min(cssW, cssH) * 0.3,
      cssW / 2, cssH * 0.5, Math.max(cssW, cssH) * 0.72,
    );
    g.addColorStop(0, 'rgba(255,80,80,0)');
    g.addColorStop(1, `rgba(255,80,80,${(0.34 * this.missFlash).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  /** Layered stage backdrop: vertical gradient + ambient strike-line wash + vignette. */
  private drawBackground(theme: Theme): void {
    const { ctx, cssW, cssH } = this;
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.bgGrad ?? theme.background;
    ctx.fillRect(0, 0, cssW, cssH);
    if (this.stageGrad) {
      ctx.fillStyle = this.stageGrad;
      ctx.fillRect(0, 0, cssW, cssH);
    }
    if (this.vignetteGrad) {
      ctx.fillStyle = this.vignetteGrad;
      ctx.fillRect(0, 0, cssW, cssH);
    }
  }

  /**
   * Scrolling measure/beat rhythm grid behind the notes. Measure (downbeat)
   * lines are stronger and carry a 1-based measure number at the left edge;
   * beat lines are faint. Lines fade with distance from the strike line so the
   * grid adds depth without competing with the falling blocks.
   */
  private drawGrid(grid: GridLine[], pos: number, pps: number, theme: Theme): void {
    const { ctx, cssW, keyboardTop } = this;
    if (keyboardTop <= 0) return;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (const line of grid) {
      const y = keyboardTop - (line.time - pos) * pps;
      if (y < 0 || y > keyboardTop) continue;
      const depth = 0.35 + 0.65 * (y / keyboardTop); // nearer the line = clearer
      const measure = line.kind === 'measure';
      ctx.globalAlpha = (measure ? 0.22 : 0.08) * depth;
      ctx.fillStyle = theme.grid;
      ctx.fillRect(0, y - (measure ? 1 : 0.5), cssW, measure ? 2 : 1);
      if (measure) {
        ctx.globalAlpha = 0.5 * depth;
        ctx.fillStyle = theme.grid;
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(String(line.measure), 6, y - 4);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /** Luminous strike line with a soft bloom that pulses when a note is hit. */
  private drawHitLine(theme: Theme): void {
    const { ctx, cssW } = this;
    const y = this.keyboardTop;
    const pulse = this.hitPulse;
    const glowH = 10 + pulse * 16;
    ctx.fillStyle = this.hitGlowGrad ?? theme.hitLine;
    ctx.globalAlpha = 0.3 + pulse * 0.45;
    ctx.fillRect(0, y - glowH, cssW, glowH * 2);
    ctx.fillStyle = theme.hitLine;
    ctx.globalAlpha = 0.55 + pulse * 0.45;
    ctx.fillRect(0, y - 1.5, cssW, 3);
    ctx.globalAlpha = 1;
  }

  /** Draw note names centered on each visible falling-note block. */
  private drawNoteLabels(theme: Theme): void {
    const buf = this.labelBuf;
    if (buf.length === 0) return;
    const ctx = this.ctx;
    ctx.fillStyle = theme.noteLabel;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < buf.length; i += 5) {
      const x = buf[i];
      const y = buf[i + 1];
      const w = buf[i + 2];
      const h = buf[i + 3];
      const midi = buf[i + 4];
      const cy = y + h / 2;
      if (cy < 0 || cy > this.keyboardTop) continue;
      const size = Math.max(8, Math.min(11, w * 0.45, h * 0.6));
      ctx.font = `bold ${size}px sans-serif`;
      const name = noteName(midi);
      // Never let a label overflow its (possibly narrow black-key) block.
      if (ctx.measureText(name).width > w - 2) continue;
      ctx.fillText(name, x + w / 2, cy);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  private drawLoop(
    loop: { start: number; end: number },
    pos: number,
    pps: number,
    theme: Theme,
  ): void {
    const { ctx, cssW } = this;
    const yA = this.keyboardTop - (loop.start - pos) * pps;
    const yB = this.keyboardTop - (loop.end - pos) * pps;
    const top = Math.max(0, Math.min(yA, yB));
    const bot = Math.min(this.keyboardTop, Math.max(yA, yB));
    if (bot > top) {
      ctx.fillStyle = theme.loopMarker;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(0, top, cssW, bot - top);
      ctx.globalAlpha = 1;
    }
    this.drawLoopLine(yA, 'A', theme);
    this.drawLoopLine(yB, 'B', theme);
  }

  private drawLoopLine(y: number, label: string, theme: Theme): void {
    if (y < 0 || y > this.keyboardTop) return;
    const ctx = this.ctx;
    ctx.strokeStyle = theme.loopMarker;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(this.cssW, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.fillStyle = theme.loopMarker;
    ctx.fillRect(4, y - 9, 16, 14);
    ctx.fillStyle = '#06121f';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 12, y + 1);
  }

  private drawKeyboard(pressed: Set<number>): void {
    const { ctx, config } = this;
    const theme = config.theme;
    const top = this.keyboardTop;
    const kh = this.keyboardHeight;

    // Soft light rising from each pressed key into the playfield.
    for (const k of this.layout.keys) {
      if (!pressed.has(k.midi)) continue;
      const gx = k.x + k.width / 2;
      const radius = Math.max(18, k.width * 1.8);
      const g = ctx.createRadialGradient(gx, top, 0, gx, top, radius);
      g.addColorStop(0, withAlpha(theme.keyPressed, 0.5));
      g.addColorStop(1, withAlpha(theme.keyPressed, 0));
      ctx.fillStyle = g;
      ctx.fillRect(gx - radius, top - radius, radius * 2, radius);
    }

    for (const k of this.layout.keys) {
      if (k.isBlack) continue;
      ctx.fillStyle = pressed.has(k.midi) ? theme.keyPressed : (this.whiteGrad ?? theme.whiteKey);
      ctx.fillRect(k.x, top, k.width - 1, kh);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(k.x + 0.5, top + 0.5, k.width - 1, kh - 1);
      if (config.showLabels && k.midi % 12 === 0) {
        ctx.fillStyle = '#333';
        ctx.font = `${Math.max(9, kh * 0.18)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(noteName(k.midi), k.x + k.width / 2, top + kh - 6);
      }
    }
    const bh = kh * 0.62;
    for (const k of this.layout.keys) {
      if (!k.isBlack) continue;
      ctx.fillStyle = pressed.has(k.midi) ? theme.keyPressed : (this.blackGrad ?? theme.blackKey);
      ctx.fillRect(k.x, top, k.width, bh);
      // Glossy highlight along the top edge of each black key.
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(k.x, top, k.width, Math.max(2, bh * 0.14));
    }
    ctx.textAlign = 'left';
  }

  private getIndex(notes: MidiNote[]): NoteIndex {
    if (notes !== this.indexedNotes || !this.noteIndex) {
      this.indexedNotes = notes;
      this.noteIndex = new NoteIndex(notes);
    }
    return this.noteIndex;
  }

  private fillBatch(buf: number[], color: string, gradient?: CanvasGradient | null): void {
    if (buf.length === 0) return;
    const ctx = this.ctx;
    ctx.fillStyle = gradient ?? color;
    ctx.beginPath();
    for (let i = 0; i < buf.length; i += 5) {
      this.roundRectPath(buf[i], buf[i + 1], buf[i + 2], buf[i + 3], buf[i + 4]);
    }
    ctx.fill();
  }

  private roundRectPath(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
