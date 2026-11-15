import { buildBeamGroups, type SheetLayout, type SheetNote, type BeamGroup } from '@pianoflow/core';
import { defaultTheme, type Theme } from './theme';
import { withAlpha, drawSheetNote, drawTrebleClef, drawBassClef, drawKeySignature, keySignatureWidth, beamGeometry, drawBeamLines, type BeamPoint } from './sheet-draw';

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
  private beamLayout: SheetLayout | null = null;
  private beamOf = new Map<number, BeamGroup>();

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
    const keyWidth = keySignatureWidth(state.layout.keySignature, lineGap);
    const leftPad = CLEF_WIDTH + keyWidth;
    const pxPerSec = (cssW - leftPad - RIGHT_PAD) / span;
    const cursorX = leftPad + this.config.behind * pxPerSec;
    const xFor = (t: number) => cursorX + (t - state.position) * pxPerSec;
    const yTreble = (steps: number) => trebleBottom - steps * (lineGap / 2);
    const yBass = (steps: number) => bassBottom - steps * (lineGap / 2);

    this.drawStaves(trebleBottom, bassBottom, lineGap, theme);
    this.drawBarlines(state.layout, xFor, trebleBottom, bassBottom, staffH, theme);
    this.drawTrebleClef(trebleBottom, lineGap, theme);
    this.drawBassClef(bassBottom, lineGap, theme);
    drawKeySignature(this.ctx, state.layout.keySignature, 'treble', CLEF_WIDTH * 0.72, trebleBottom, lineGap, theme);
    drawKeySignature(this.ctx, state.layout.keySignature, 'bass', CLEF_WIDTH * 0.72, bassBottom, lineGap, theme);

    // Beam groups (cached per layout): consecutive eighths/sixteenths share a beam.
    if (this.beamLayout !== state.layout) {
      this.beamLayout = state.layout;
      this.beamOf = new Map();
      for (const g of buildBeamGroups(state.layout)) for (const i of g.indices) this.beamOf.set(i, g);
    }
    const notes = state.layout.notes;
    const geomCache = new Map<BeamGroup, { pts: BeamPoint[]; geom: ReturnType<typeof beamGeometry> }>();
    const ensureGeom = (g: BeamGroup) => {
      let e = geomCache.get(g);
      if (!e) {
        const pts: BeamPoint[] = g.indices.map((i) => {
          const nn = notes[i];
          return { x: xFor(nn.time), y: nn.staff === 'treble' ? yTreble(nn.steps) : yBass(nn.steps), value: nn.value };
        });
        e = { pts, geom: beamGeometry(pts, lineGap, g.direction) };
        geomCache.set(g, e);
      }
      return e;
    };
    const drawnGroups = new Set<BeamGroup>();

    // Notes within the visible time window (1s pad; exact pixel cull below).
    const t0 = state.position - this.config.behind - 1;
    const t1 = state.position + this.config.ahead + 1;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.time < t0 || n.time > t1) continue;
      const x = xFor(n.time);
      if (x < leftPad - 20 || x > cssW + 20) continue;
      const y = n.staff === 'treble' ? yTreble(n.steps) : yBass(n.steps);
      const g = this.beamOf.get(i);
      let beam: { dir: 'up' | 'down'; stemEndY: number } | undefined;
      if (g) {
        const { geom } = ensureGeom(g);
        if (geom) {
          beam = { dir: g.direction, stemEndY: geom.ends[g.indices.indexOf(i)] };
          drawnGroups.add(g);
        }
      }
      this.drawNote(n, x, y, lineGap, theme, state.position, beam);
    }
    for (const g of drawnGroups) {
      const { pts, geom } = ensureGeom(g);
      if (!geom) continue;
      const color = notes[g.indices[0]].hand === 'left' ? theme.leftNote : theme.rightNote;
      drawBeamLines(this.ctx, pts, geom, color, lineGap);
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

  private drawNote(n: SheetNote, x: number, y: number, gap: number, theme: Theme, pos: number, beam?: { dir: 'up' | 'down'; stemEndY: number }): void {
    drawSheetNote(this.ctx, n, x, y, gap, theme, Math.abs(n.time - pos) < 0.12, beam);
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
    drawTrebleClef(this.ctx, CLEF_WIDTH * 0.42, bottom, gap, theme);
  }

  private drawBassClef(bottom: number, gap: number, theme: Theme): void {
    drawBassClef(this.ctx, CLEF_WIDTH * 0.4, bottom, gap, theme);
  }
}

/** Small helper: extra headroom above the treble staff for the cursor. */
function gap0(tb: number, bb: number): number {
  return Math.max(6, (bb - tb) * 0.06);
}
