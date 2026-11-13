import type { SheetLayout, SheetNote } from '@pianoflow/core';
import { defaultTheme, type Theme } from './theme';

/**
 * Scrolling grand-staff sheet-music renderer. Draws two staves (treble + bass)
 * with vector clefs, barlines, noteheads / stems / flags / accidentals and a
 * fixed play cursor. Notes are tinted by hand to match the falling-note view.
 *
 * Pure canvas drawing; the notation math lives in @pianoflow/core/sheet so it can
 * be unit-tested headlessly.
 */

export interface SheetRenderState {
  layout: SheetLayout;
  position: number; // seconds
  theme?: Theme;
}

export interface SheetConfig {
  /** seconds of upcoming music shown to the right of the cursor */
  ahead: number;
  /** seconds of recent music shown to the left of the cursor */
  behind: number;
  theme: Theme;
}

export const defaultSheetConfig: SheetConfig = { ahead: 6, behind: 2, theme: defaultTheme };

const CLEF_WIDTH = 64;
const RIGHT_PAD = 24;

export class SheetRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  config: SheetConfig;

  constructor(canvas: HTMLCanvasElement, config: Partial<SheetConfig> = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('SheetRenderer: 2D context unavailable');
    this.ctx = ctx;
    this.config = { ...defaultSheetConfig, ...config };
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
  }

  get drawingContext(): CanvasRenderingContext2D {
    return this.ctx;
  }
  get viewWidth(): number {
    return this.cssW;
  }
  get viewHeight(): number {
    return this.cssH;
  }

  render(state: SheetRenderState): void {
    const { ctx, cssW, cssH } = this;
    const theme = state.theme ?? this.config.theme;
    if (cssW <= 0 || cssH <= 0) return;

    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Backdrop.
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, cssW, cssH);

    // Staff geometry: two 5-line staves separated by a gap.
    const lineGap = Math.max(7, Math.min(12, cssH / 26));
    const staffH = lineGap * 4;
    const block = staffH * 2 + lineGap * 6;
    const top = Math.max(lineGap * 3, (cssH - block) / 2 + lineGap * 2);
    const trebleBottom = top + staffH; // y of treble bottom line (E4)
    const bassBottom = trebleBottom + staffH + lineGap * 6; // y of bass bottom line (G2)

    const span = this.config.ahead + this.config.behind;
    const pxPerSec = (cssW - CLEF_WIDTH - RIGHT_PAD) / span;
    const cursorX = CLEF_WIDTH + this.config.behind * pxPerSec;
    const xFor = (t: number) => cursorX + (t - state.position) * pxPerSec;
    const yTreble = (steps: number) => trebleBottom - steps * (lineGap / 2);
    const yBass = (steps: number) => bassBottom - steps * (lineGap / 2);

    this.drawStaves(trebleBottom, bassBottom, lineGap, theme);
    this.drawBarlines(state.layout, xFor, trebleBottom, bassBottom, staffH, theme);
    this.drawTrebleClef(trebleBottom, lineGap, theme);
    this.drawBassClef(bassBottom, lineGap, theme);

    // Notes within the visible time window (1s pad; exact pixel cull below).
    const t0 = state.position - this.config.behind - 1;
    const t1 = state.position + this.config.ahead + 1;
    for (const n of state.layout.notes) {
      if (n.time < t0 || n.time > t1) continue;
      const x = xFor(n.time);
      if (x < CLEF_WIDTH - 20 || x > cssW + 20) continue;
      const y = n.staff === 'treble' ? yTreble(n.steps) : yBass(n.steps);
      this.drawNote(n, x, y, lineGap, theme, state.position);
    }

    this.drawCursor(cursorX, trebleBottom, bassBottom, staffH, theme);
  }

  private drawStaves(tb: number, bb: number, gap: number, theme: Theme): void {
    const { ctx, cssW } = this;
    ctx.strokeStyle = withAlpha(theme.text, 0.28);
    ctx.lineWidth = 1;
    for (const bottom of [tb, bb]) {
      for (let i = 0; i < 5; i++) {
        const y = bottom - i * gap;
        ctx.beginPath();
        ctx.moveTo(CLEF_WIDTH - 12, y);
        ctx.lineTo(cssW, y);
        ctx.stroke();
      }
    }
  }

  private drawBarlines(
    layout: SheetLayout,
    xFor: (t: number) => number,
    tb: number,
    bb: number,
    staffH: number,
    theme: Theme,
  ): void {
    const { ctx, cssW } = this;
    ctx.strokeStyle = withAlpha(theme.text, 0.22);
    ctx.lineWidth = 1;
    for (const t of layout.barTimes) {
      const x = xFor(t);
      if (x < CLEF_WIDTH - 12 || x > cssW) continue;
      ctx.beginPath();
      ctx.moveTo(x, tb - staffH);
      ctx.lineTo(x, bb);
      ctx.stroke();
    }
  }

  private drawNote(n: SheetNote, x: number, y: number, gap: number, theme: Theme, pos: number): void {
    const { ctx } = this;
    const color = n.hand === 'left' ? theme.leftNote : theme.rightNote;
    const rx = gap * 0.62;
    const ry = gap * 0.46;
    const filled = n.value === 'quarter' || n.value === 'eighth' || n.value === 'sixteenth';
    const near = Math.abs(n.time - pos) < 0.12;

    // Ledger lines for notes beyond the staff (steps 0..8 are the five lines).
    ctx.strokeStyle = withAlpha(theme.text, 0.4);
    ctx.lineWidth = 1;
    for (let s = -2; s >= n.steps; s -= 2) this.ledger(x, y, gap, s, n.steps);
    for (let s = 10; s <= n.steps; s += 2) this.ledger(x, y, gap, s, n.steps);

    // Accidental.
    if (n.accidental !== 0) {
      ctx.fillStyle = withAlpha(theme.text, 0.85);
      ctx.font = `${Math.round(gap * 1.7)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.accidental > 0 ? '♯' : '♭', x - rx * 2.1, y);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // Stem (whole notes have none). Direction: down when high on the staff.
    if (n.value !== 'whole') {
      const down = n.steps >= 4;
      const sx = down ? x - rx * 0.9 : x + rx * 0.9;
      const len = gap * 3.2;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.2, gap * 0.16);
      ctx.beginPath();
      ctx.moveTo(sx, y);
      ctx.lineTo(sx, down ? y + len : y - len);
      ctx.stroke();
      // Flags.
      const flags = n.value === 'eighth' ? 1 : n.value === 'sixteenth' ? 2 : 0;
      for (let f = 0; f < flags; f++) {
        const fy = (down ? y + len : y - len) + (down ? -1 : 1) * f * gap * 0.7;
        ctx.beginPath();
        ctx.moveTo(sx, fy);
        ctx.quadraticCurveTo(sx + gap * 1.1, fy + (down ? -1 : 1) * gap * 0.5, sx + gap * 0.7, fy + (down ? -1 : 1) * gap * 1.2);
        ctx.stroke();
      }
    }

    // Notehead.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.32);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    if (filled) {
      ctx.fillStyle = color;
      if (near) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
      }
      ctx.fill();
    } else {
      ctx.lineWidth = Math.max(1.4, gap * 0.2);
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  private ledger(x: number, y: number, gap: number, s: number, steps: number): void {
    // y already corresponds to `steps`; recompute the ledger line y for step s.
    const ly = y + (steps - s) * (gap / 2);
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x - gap * 0.95, ly);
    ctx.lineTo(x + gap * 0.95, ly);
    ctx.stroke();
  }

  private drawCursor(x: number, tb: number, bb: number, staffH: number, theme: Theme): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = theme.hitLine;
    ctx.lineWidth = 2;
    ctx.shadowColor = theme.hitLine;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(x, tb - staffH - gap0(tb, bb));
    ctx.lineTo(x, bb + 6);
    ctx.stroke();
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  private drawTrebleClef(bottom: number, gap: number, theme: Theme): void {
    const { ctx } = this;
    const x = CLEF_WIDTH * 0.42;
    const u = gap; // unit
    ctx.save();
    ctx.strokeStyle = withAlpha(theme.text, 0.8);
    ctx.fillStyle = withAlpha(theme.text, 0.8);
    ctx.lineWidth = Math.max(1.6, u * 0.28);
    ctx.lineCap = 'round';
    // Stylised treble clef: a vertical spiral centred on the G line (steps 2).
    const gY = bottom - u; // G4 line = bottom - gap
    ctx.beginPath();
    ctx.moveTo(x + u * 0.2, bottom + u * 1.6);
    ctx.bezierCurveTo(x - u * 1.3, bottom + u * 0.4, x - u * 0.9, gY - u * 1.6, x + u * 0.1, gY - u * 1.7);
    ctx.bezierCurveTo(x + u * 1.2, gY - u * 1.6, x + u * 1.2, gY - u * 0.2, x + u * 0.1, gY);
    ctx.bezierCurveTo(x - u * 0.9, gY + u * 0.2, x - u * 0.9, gY + u * 1.2, x + u * 0.1, gY + u * 1.2);
    ctx.bezierCurveTo(x + u * 0.8, gY + u * 1.2, x + u * 0.8, gY + u * 0.4, x + u * 0.1, gY + u * 0.4);
    ctx.stroke();
    // Tail dot.
    ctx.beginPath();
    ctx.arc(x + u * 0.2, bottom + u * 1.6, u * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawBassClef(bottom: number, gap: number, theme: Theme): void {
    const { ctx } = this;
    const x = CLEF_WIDTH * 0.4;
    const u = gap;
    const fY = bottom - 3 * u; // F3 line = bottom - 3*gap (steps 6)
    ctx.save();
    ctx.strokeStyle = withAlpha(theme.text, 0.8);
    ctx.fillStyle = withAlpha(theme.text, 0.8);
    ctx.lineWidth = Math.max(1.6, u * 0.28);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - u * 0.6, fY + u * 0.2);
    ctx.bezierCurveTo(x + u * 0.2, fY - u * 1.4, x + u * 1.5, fY - u * 0.6, x + u * 1.1, fY + u * 0.6);
    ctx.bezierCurveTo(x + u * 0.8, fY + u * 1.6, x - u * 0.2, fY + u * 2.2, x - u * 0.7, fY + u * 2.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - u * 0.5, fY + u * 0.1, u * 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Two dots framing the F line.
    for (const dy of [-0.5, 0.5]) {
      ctx.beginPath();
      ctx.arc(x + u * 1.7, fY + dy * u, u * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Small helper: extra headroom above the treble staff for the cursor. */
function gap0(tb: number, bb: number): number {
  return Math.max(6, (bb - tb) * 0.06);
}

function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
