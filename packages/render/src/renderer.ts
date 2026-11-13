import type { MidiNote } from '@pianoflow/core';
import { noteName } from '@pianoflow/core';
import { buildKeyboard, keyAt, type KeyboardLayout } from './keyboard';
import { defaultTheme, type Theme } from './theme';

export interface RenderConfig {
  startMidi: number;
  endMidi: number;
  /** how many seconds of upcoming notes are visible above the keyboard */
  secondsVisible: number;
  keyboardHeightRatio: number;
  showLabels: boolean;
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

  render(state: RenderState): void {
    const { ctx, cssW, cssH, config } = this;
    const theme = config.theme;
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, cssW, cssH);

    const pps = this.keyboardTop / Math.max(0.2, config.secondsVisible);
    const pos = state.position;

    for (const n of state.notes) {
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
      ctx.fillStyle = n.hand === 'left' ? theme.leftNote : theme.rightNote;
      this.roundRect(x, y, w, h, Math.min(4, w / 2));
      ctx.fill();
    }

    ctx.fillStyle = theme.hitLine;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(0, this.keyboardTop - 2, cssW, 2);
    ctx.globalAlpha = 1;

    if (state.loop?.enabled) this.drawLoop(state.loop, pos, pps, theme);

    this.drawKeyboard(state.pressed);
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

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
