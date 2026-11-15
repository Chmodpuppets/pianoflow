import { buildBeamGroups, type SheetLayout, type SheetNote, type BeamGroup, type KeySignature } from '@pianoflow/core';
import { defaultTheme, type Theme } from './theme';
import { withAlpha, drawSheetNote, drawTrebleClef, drawBassClef, drawKeySignature, keySignatureWidth, drawRest, drawTie, drawBeamLines, type BeamPoint, type BeamGeometry } from './sheet-draw';

/**
 * Scrolling grand-staff sheet-music renderer. Draws two staves (treble + bass)
 * with vector clefs, barlines, noteheads / stems / flags / accidentals and a
 * fixed play cursor. Notes are tinted by hand to match the falling-note view.
 *
 * Performance: the backdrop, staff lines, clefs and key signature never move, so
 * they are baked once into an offscreen "frame" canvas and blitted each frame;
 * only the scrolling notation (barlines, notes, beams, rests, ties) and the cursor
 * are redrawn per frame. Beam geometry is position-invariant in its vertical
 * component, so it is cached per layout rather than recomputed every frame. This
 * keeps the live sheet cheap enough to run at 60fps even for dense scores.
 *
 * Pure canvas drawing; the notation math lives in @pianoflow/core/sheet so it can
 * be unit-tested headlessly. When no DOM is available (node tests) the static
 * frame is painted directly onto the main context instead of an offscreen canvas.
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

const STAFF_START = 12;
const CLEF_WIDTH = 64;
const RIGHT_PAD = 24;

/** Position-invariant beam geometry (vertical parts); x is supplied per frame. */
interface CachedBeam {
  dir: 'up' | 'down';
  ends: number[]; // stem-end y for each point (on the primary beam line)
  y0: number; // first stem-end y
  dy: number; // clamped vertical delta across the group
  sy: number; // +1 stems down, -1 stems up
  beamSep: number;
  span: number; // horizontal span at the current pxPerSec
  rel: number[]; // (time_i - time_0) per point, seconds
  ys: number[]; // notehead centre y per point
}

interface StaffGeom {
  lineGap: number;
  staffH: number;
  trebleBottom: number;
  bassBottom: number;
}

export class SheetRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  config: SheetConfig;
  private beamLayout: SheetLayout | null = null;
  private beamOf = new Map<number, BeamGroup>();
  private beamCache = new Map<BeamGroup, CachedBeam>();
  private beamGap = 0;
  private beamPx = 0;

  // Offscreen static-frame cache (background + staves + clefs + key signature).
  private frameCanvas: HTMLCanvasElement | null = null;
  private frameCtx: CanvasRenderingContext2D | null = null;
  private frameKey = '';
  private frameLayout: SheetLayout | null = null;
  private frameTheme: Theme | null = null;
  private frameOk = true;

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
    this.frameKey = ''; // force the static frame to rebuild at the new size
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

    // Staff geometry: two 5-line staves separated by a gap.
    const lineGap = Math.max(7, Math.min(12, cssH / 26));
    const staffH = lineGap * 4;
    const block = staffH * 2 + lineGap * 6;
    const top = Math.max(lineGap * 3, (cssH - block) / 2 + lineGap * 2);
    const trebleBottom = top + staffH; // y of treble bottom line (E4)
    const bassBottom = trebleBottom + staffH + lineGap * 6; // y of bass bottom line (G2)
    const geom: StaffGeom = { lineGap, staffH, trebleBottom, bassBottom };

    const span = this.config.ahead + this.config.behind;
    const keyWidth = keySignatureWidth(state.layout.keySignature, lineGap);
    const leftPad = CLEF_WIDTH + keyWidth;
    const pxPerSec = (cssW - leftPad - RIGHT_PAD) / span;
    const cursorX = leftPad + this.config.behind * pxPerSec;
    const xFor = (t: number) => cursorX + (t - state.position) * pxPerSec;
    const yTreble = (steps: number) => trebleBottom - steps * (lineGap / 2);
    const yBass = (steps: number) => bassBottom - steps * (lineGap / 2);
    const yOf = (n: SheetNote) => (n.staff === 'treble' ? yTreble(n.steps) : yBass(n.steps));

    // Static frame (backdrop + staves + clefs + key signature): blit the cached
    // offscreen canvas when available, else paint directly (headless tests).
    const frame = this.staticFrame(state.layout, theme, geom);
    if (frame) {
      ctx.drawImage(frame, 0, 0, cssW, cssH);
    } else {
      this.paintStatic(ctx, state.layout.keySignature, theme, geom);
    }

    this.drawBarlines(state.layout, xFor, trebleBottom, bassBottom, staffH, theme);

    // Beam groups + their position-invariant geometry (cached per layout/size).
    this.ensureBeamCache(state.layout, lineGap, pxPerSec, yOf);
    const notes = state.layout.notes;
    const drawnGroups = new Set<BeamGroup>();

    // Notes within the visible time window (1s pad; exact pixel cull below).
    const t0 = state.position - this.config.behind - 1;
    const t1 = state.position + this.config.ahead + 1;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.time < t0 || n.time > t1) continue;
      const x = xFor(n.time);
      if (x < leftPad - 20 || x > cssW + 20) continue;
      const y = yOf(n);
      const g = this.beamOf.get(i);
      let beam: { dir: 'up' | 'down'; stemEndY: number } | undefined;
      if (g) {
        const c = this.beamCache.get(g);
        if (c) {
          beam = { dir: g.direction, stemEndY: c.ends[g.indices.indexOf(i)] };
          drawnGroups.add(g);
        }
      }
      this.drawNote(n, x, y, lineGap, theme, state.position, beam);
    }
    for (const g of drawnGroups) {
      const c = this.beamCache.get(g);
      if (!c) continue;
      const x0 = xFor(notes[g.indices[0]].time);
      const beamGeom: BeamGeometry = { dir: c.dir, ends: c.ends, x0, y0: c.y0, x1: x0 + c.span, y1: c.y0 + c.dy, sy: c.sy, beamSep: c.beamSep };
      const pts: BeamPoint[] = g.indices.map((i, k) => ({ x: x0 + c.rel[k] * pxPerSec, y: c.ys[k], value: notes[i].value }));
      const color = notes[g.indices[0]].hand === 'left' ? theme.leftNote : theme.rightNote;
      drawBeamLines(this.ctx, pts, beamGeom, color, lineGap);
    }

    // Rests (per-staff silences) and ties (contiguous same-pitch notes).
    const middleTreble = trebleBottom - 2 * lineGap;
    const middleBass = bassBottom - 2 * lineGap;
    for (const r of state.layout.rests ?? []) {
      const x = xFor(r.measureEnd === undefined ? r.time : (r.time + r.measureEnd) / 2);
      if (x < leftPad - 20 || x > cssW + 20) continue;
      drawRest(this.ctx, r.value, x, r.staff === 'treble' ? middleTreble : middleBass, lineGap, theme);
    }
    for (const tie of state.layout.ties ?? []) {
      const a = notes[tie.from];
      const b = notes[tie.to];
      if (!a || !b) continue;
      const xa = xFor(a.time);
      const xb = xFor(b.time);
      if (xb < leftPad - 20 || xa > cssW + 20) continue;
      const ya = yOf(a);
      const yb = yOf(b);
      const color = a.hand === 'left' ? theme.leftNote : theme.rightNote;
      drawTie(this.ctx, xa, ya, xb, yb, a.steps >= 4 ? 'down' : 'up', lineGap, color);
    }

    this.drawCursor(cursorX, trebleBottom, bassBottom, staffH, theme);
  }

  /** Rebuild the per-layout beam map + invariant geometry when layout/size changes. */
  private ensureBeamCache(layout: SheetLayout, lineGap: number, pxPerSec: number, yOf: (n: SheetNote) => number): void {
    if (this.beamLayout === layout && this.beamGap === lineGap && this.beamPx === pxPerSec) return;
    this.beamLayout = layout;
    this.beamGap = lineGap;
    this.beamPx = pxPerSec;
    this.beamOf = new Map();
    this.beamCache = new Map();
    const notes = layout.notes;
    const stemLen = lineGap * 3.2;
    const maxDy = lineGap * 2;
    for (const g of buildBeamGroups(layout)) {
      for (const i of g.indices) this.beamOf.set(i, g);
      if (g.indices.length < 2) continue;
      const ys = g.indices.map((i) => yOf(notes[i]));
      const times = g.indices.map((i) => notes[i].time);
      const sy = g.direction === 'down' ? 1 : -1;
      const y0 = ys[0] + sy * stemLen;
      const rawDy = ys[ys.length - 1] + sy * stemLen - y0;
      const dy = Math.max(-maxDy, Math.min(maxDy, rawDy));
      const span = (times[times.length - 1] - times[0]) * pxPerSec;
      const ends = times.map((t) => (span > 1e-6 ? y0 + dy * (((t - times[0]) * pxPerSec) / span) : y0));
      const rel = times.map((t) => t - times[0]);
      this.beamCache.set(g, { dir: g.direction, ends, y0, dy, sy, beamSep: lineGap * 0.7, span, rel, ys });
    }
  }

  /**
   * Return the cached offscreen static frame, rebuilding it when size/layout/theme
   * change. Returns null when offscreen canvases are unavailable (node tests), in
   * which case the caller paints the static layer directly onto the main context.
   */
  private staticFrame(layout: SheetLayout, theme: Theme, geom: StaffGeom): HTMLCanvasElement | null {
    if (!this.frameOk || typeof document === 'undefined') return null;
    const { cssW, cssH, dpr } = this;
    const key = `${cssW}x${cssH}x${dpr}|${geom.lineGap}|${geom.trebleBottom}|${geom.bassBottom}`;
    if (this.frameCanvas && this.frameCtx && this.frameKey === key && this.frameLayout === layout && this.frameTheme === theme) {
      return this.frameCanvas;
    }
    if (!this.frameCanvas) {
      this.frameCanvas = document.createElement('canvas');
      this.frameCtx = this.frameCanvas.getContext('2d');
    }
    const fctx = this.frameCtx;
    if (!fctx) {
      this.frameOk = false; // e.g. jsdom without canvas support → paint directly
      return null;
    }
    const fc = this.frameCanvas;
    fc.width = Math.round(cssW * dpr);
    fc.height = Math.round(cssH * dpr);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.paintStatic(fctx, layout.keySignature, theme, geom);
    this.frameKey = key;
    this.frameLayout = layout;
    this.frameTheme = theme;
    return fc;
  }

  /** Paint the non-scrolling layer: backdrop, staff lines, clefs, key signature. */
  private paintStatic(target: CanvasRenderingContext2D, keySig: KeySignature | undefined, theme: Theme, geom: StaffGeom): void {
    const { cssW, cssH } = this;
    const { lineGap, trebleBottom, bassBottom } = geom;
    target.globalAlpha = 1;
    target.textAlign = 'left';
    target.textBaseline = 'alphabetic';
    target.fillStyle = theme.background;
    target.fillRect(0, 0, cssW, cssH);
    this.drawStaves(target, trebleBottom, bassBottom, lineGap, theme);
    drawTrebleClef(target, 28, trebleBottom, lineGap, theme);
    drawBassClef(target, 28, bassBottom, lineGap, theme);
    drawKeySignature(target, keySig, 'treble', 52, trebleBottom, lineGap, theme);
    drawKeySignature(target, keySig, 'bass', 52, bassBottom, lineGap, theme);
  }

  private drawStaves(target: CanvasRenderingContext2D, tb: number, bb: number, gap: number, theme: Theme): void {
    const { cssW } = this;
    target.strokeStyle = withAlpha(theme.text, 0.28);
    target.lineWidth = 1;
    for (const bottom of [tb, bb]) {
      for (let i = 0; i < 5; i++) {
        const y = bottom - i * gap;
        target.beginPath();
        target.moveTo(STAFF_START, y);
        target.lineTo(cssW, y);
        target.stroke();
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
    const topY = tb - staffH - gap0(tb, bb);
    const botY = bb + 6;
    ctx.save();
    // Cheap glow: a wide translucent stroke under a crisp line (no shadowBlur,
    // which is CPU-rasterised and very costly to redraw every frame).
    ctx.strokeStyle = withAlpha(theme.hitLine, 0.28);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, topY);
    ctx.lineTo(x, botY);
    ctx.stroke();
    ctx.strokeStyle = theme.hitLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, topY);
    ctx.lineTo(x, botY);
    ctx.stroke();
    ctx.restore();
  }
}

/** Small helper: extra headroom above the treble staff for the cursor. */
function gap0(tb: number, bb: number): number {
  return Math.max(6, (bb - tb) * 0.06);
}