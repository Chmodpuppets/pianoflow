import type { MidiNote } from '@pianoflow/core';
import { NoteIndex, noteName } from '@pianoflow/core';
import { buildKeyboard, keyAt, type KeyboardLayout } from './keyboard';
import { defaultTheme, type Theme } from './theme';

export interface RenderConfig {
  startMidi: number;
  endMidi: number;
  /** how many seconds of upcoming notes are visible above the keyboard */
  secondsVisible: number;
  keyboardHeightRatio: number;
  showLabels: boolean;
  /** draw note names (C4, D4, …) on the falling note blocks */
  showNoteLabels: boolean;
  theme: Theme;
}

export interface RenderState {
  position: number;
  notes: MidiNote[];
  pressed: Set<number>;
  loop?: { enabled: boolean; start: number; end: number };
}

export const defaultRenderConfig: RenderConfig = {
  startMidi: 21,
  endMidi: 108,
  secondsVisible: 3,
  keyboardHeightRatio: 0.18,
  showLabels: false,
  showNoteLabels: false,
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
  // Reused [x,y,w,h,midi] tuples for note-name labels (only when enabled).
  private labelBuf: number[] = [];

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
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, cssW, cssH);

    const pps = this.keyboardTop / Math.max(0.2, config.secondsVisible);
    const pos = state.position;

    // Only iterate notes that can overlap the visible time window, not the
    // whole song. The window is padded by 1s; the exact pixel cull below still
    // applies, so output is identical to a full scan but far cheaper for dense
    // "black MIDI" files.
    const index = this.getIndex(state.notes);
    const t0 = pos - this.keyboardHeight / pps - 1;
    const t1 = pos + config.secondsVisible + 1;
    const visible = index.query(t0, t1);

    this.rightBuf.length = 0;
    this.leftBuf.length = 0;
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
      const buf = n.hand === 'left' ? this.leftBuf : this.rightBuf;
      buf.push(x, y, w, h, Math.min(4, w / 2));
      // Only label blocks big enough to hold legible text.
      if (config.showNoteLabels && h >= 12 && w >= 12) {
        this.labelBuf.push(x, y, w, h, n.midi);
      }
    }
    // One fill per hand instead of one per note.
    this.fillBatch(this.rightBuf, theme.rightNote);
    this.fillBatch(this.leftBuf, theme.leftNote);
    if (config.showNoteLabels) this.drawNoteLabels(theme);

    ctx.fillStyle = theme.hitLine;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(0, this.keyboardTop - 2, cssW, 2);
    ctx.globalAlpha = 1;

    if (state.loop?.enabled) this.drawLoop(state.loop, pos, pps, theme);

    this.drawKeyboard(state.pressed);
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
    for (const k of this.layout.keys) {
      if (k.isBlack) continue;
      ctx.fillStyle = pressed.has(k.midi) ? theme.keyPressed : theme.whiteKey;
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
      ctx.fillStyle = pressed.has(k.midi) ? theme.keyPressed : theme.blackKey;
      ctx.fillRect(k.x, top, k.width, bh);
    }
  }

  private getIndex(notes: MidiNote[]): NoteIndex {
    if (notes !== this.indexedNotes || !this.noteIndex) {
      this.indexedNotes = notes;
      this.noteIndex = new NoteIndex(notes);
    }
    return this.noteIndex;
  }

  private fillBatch(buf: number[], color: string): void {
    if (buf.length === 0) return;
    const ctx = this.ctx;
    ctx.fillStyle = color;
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
