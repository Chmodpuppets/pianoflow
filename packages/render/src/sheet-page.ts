import { buildSheetSystems, buildBeamGroups, type SheetLayout, type SheetNote, type BeamGroup } from '@pianoflow/core';
import { paperTheme, type Theme } from './theme';
import { withAlpha, drawSheetNote, drawTrebleClef, drawBassClef, drawKeySignature, keySignatureWidth, beamGeometry, drawBeamLines, type BeamPoint } from './sheet-draw';

/**
 * Static, printable full-score renderer. Unlike the scrolling SheetRenderer (a
 * live play window), this lays the ENTIRE piece out as systems of measures on a
 * tall "paper" page — title, composer, grand staff per system, barlines, measure
 * numbers, clefs and hand-tinted notes — suitable for exporting to PNG / printing.
 *
 * The notation math (pagination) lives in @pianoflow/core/sheet; the note/clef
 * drawing primitives are shared with the live view via ./sheet-draw.
 */

export interface SheetPageConfig {
  /** css width of the page */
  width: number;
  measuresPerSystem: number;
  /** staff line spacing in px */
  lineGap: number;
  /** extra resolution multiplier for export (1 = screen, 2 = crisp print) */
  scale: number;
  theme: Theme;
}

export const defaultSheetPageConfig: SheetPageConfig = {
  width: 1000,
  measuresPerSystem: 4,
  lineGap: 9,
  scale: 1,
  theme: paperTheme,
};

export interface SheetPageState {
  layout: SheetLayout;
  title?: string;
  composer?: string;
  theme?: Theme;
}

const CLEF_WIDTH = 56;
const RIGHT_PAD = 28;
const PAD_X = 28;
const PAD_BOTTOM = 30;

export class SheetPageRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  config: SheetPageConfig;

  constructor(canvas: HTMLCanvasElement, config: Partial<SheetPageConfig> = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('SheetPageRenderer: 2D context unavailable');
    this.ctx = ctx;
    this.config = { ...defaultSheetPageConfig, ...config };
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

  /** Compute the page height for a layout without drawing (for sizing containers). */
  measure(layout: SheetLayout, hasTitle: boolean): number {
    const systems = buildSheetSystems(layout, this.config.measuresPerSystem);
    return this.pageHeight(Math.max(1, systems.length), hasTitle);
  }

  private pageHeight(systemCount: number, hasTitle: boolean): number {
    const gap = this.config.lineGap;
    const staffH = gap * 4;
    const systemBlock = staffH * 2 + gap * 6;
    const systemGap = gap * 5;
    const titleH = hasTitle ? 64 : 16;
    return PAD_X + titleH + systemCount * systemBlock + Math.max(0, systemCount - 1) * systemGap + PAD_BOTTOM;
  }

  render(state: SheetPageState): void {
    const { ctx } = this;
    const theme = state.theme ?? this.config.theme;
    const gap = this.config.lineGap;
    const staffH = gap * 4;
    const systemBlock = staffH * 2 + gap * 6;
    const systemGap = gap * 5;
    const width = this.config.width;
    const hasTitle = !!(state.title || state.composer);
    const systems = buildSheetSystems(state.layout, this.config.measuresPerSystem);
    const height = this.pageHeight(Math.max(1, systems.length), hasTitle);
    const beamOf = new Map<number, BeamGroup>();
    for (const g of buildBeamGroups(state.layout)) for (const i of g.indices) beamOf.set(i, g);

    // Size the canvas to the full page (high-res for export).
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.config.scale;
    this.cssW = width;
    this.cssH = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    if (this.canvas.style) {
      this.canvas.style.width = width + 'px';
      this.canvas.style.height = height + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, width, height);

    const titleH = hasTitle ? 64 : 16;
    if (state.title) {
      ctx.fillStyle = theme.text;
      ctx.font = '600 26px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.title, width / 2, PAD_X + 26);
    }
    if (state.composer) {
      ctx.fillStyle = withAlpha(theme.text, 0.7);
      ctx.font = 'italic 14px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.composer, width / 2, PAD_X + (state.title ? 48 : 22));
    }
    ctx.textAlign = 'left';

    const keyWidth = keySignatureWidth(state.layout.keySignature, gap);
    const leftPad = CLEF_WIDTH + keyWidth;
    const contentW = width - leftPad - RIGHT_PAD;
    const last = systems.length - 1;
    systems.forEach((sys, si) => {
      const topY = PAD_X + titleH + si * (systemBlock + systemGap);
      const trebleBottom = topY + staffH;
      const bassBottom = trebleBottom + staffH + gap * 6;
      const trebleTop = trebleBottom - staffH;
      const span = Math.max(0.001, sys.endTime - sys.startTime);
      const xFor = (t: number) => leftPad + ((t - sys.startTime) / span) * contentW;
      const yTreble = (steps: number) => trebleBottom - steps * (gap / 2);
      const yBass = (steps: number) => bassBottom - steps * (gap / 2);

      this.drawSystemStaves(trebleBottom, bassBottom, width, theme);
      this.drawSystemBarlines(state.layout, sys.startTime, sys.endTime, xFor, trebleTop, bassBottom, width, theme);

      // Grand-staff brace: a vertical line joining the two staves at the left.
      ctx.strokeStyle = withAlpha(theme.text, 0.5);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(CLEF_WIDTH - 12, trebleTop);
      ctx.lineTo(CLEF_WIDTH - 12, bassBottom);
      ctx.stroke();

      drawTrebleClef(ctx, CLEF_WIDTH * 0.42, trebleBottom, gap, theme);
      drawBassClef(ctx, CLEF_WIDTH * 0.4, bassBottom, gap, theme);
      drawKeySignature(ctx, state.layout.keySignature, 'treble', CLEF_WIDTH * 0.72, trebleBottom, gap, theme);
      drawKeySignature(ctx, state.layout.keySignature, 'bass', CLEF_WIDTH * 0.72, bassBottom, gap, theme);

      // Measure number at the start of the system.
      ctx.fillStyle = withAlpha(theme.text, 0.55);
      ctx.font = `600 ${Math.round(gap * 1.2)}px Georgia, serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(sys.startMeasure), CLEF_WIDTH - 10, trebleTop - gap * 0.6);

      // Notes belonging to this system (beamed runs share a beam instead of flags).
      const notes = state.layout.notes;
      const geomCache = new Map<BeamGroup, { pts: BeamPoint[]; geom: ReturnType<typeof beamGeometry> }>();
      const ensureGeom = (g: BeamGroup) => {
        let e = geomCache.get(g);
        if (!e) {
          const pts: BeamPoint[] = g.indices.map((i) => {
            const nn = notes[i];
            return { x: xFor(nn.time), y: nn.staff === 'treble' ? yTreble(nn.steps) : yBass(nn.steps), value: nn.value };
          });
          e = { pts, geom: beamGeometry(pts, gap, g.direction) };
          geomCache.set(g, e);
        }
        return e;
      };
      const drawnGroups = new Set<BeamGroup>();
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (n.time < sys.startTime) continue;
        if (n.time >= sys.endTime && si !== last) continue;
        const x = xFor(n.time);
        if (x < leftPad - 6 || x > width - RIGHT_PAD + 6) continue;
        const y = n.staff === 'treble' ? yTreble(n.steps) : yBass(n.steps);
        const g = beamOf.get(i);
        let beam: { dir: 'up' | 'down'; stemEndY: number } | undefined;
        if (g) {
          const { geom } = ensureGeom(g);
          if (geom) {
            beam = { dir: g.direction, stemEndY: geom.ends[g.indices.indexOf(i)] };
            drawnGroups.add(g);
          }
        }
        drawSheetNote(ctx, n, x, y, gap, theme, false, beam);
      }
      for (const g of drawnGroups) {
        const { pts, geom } = ensureGeom(g);
        if (!geom) continue;
        const color = notes[g.indices[0]].hand === 'left' ? theme.leftNote : theme.rightNote;
        drawBeamLines(ctx, pts, geom, color, gap);
      }
    });

    // Footer credit.
    ctx.fillStyle = withAlpha(theme.text, 0.4);
    ctx.font = '11px Georgia, serif';
    ctx.textAlign = 'right';
    ctx.fillText('PianoFlow', width - RIGHT_PAD, height - 10);
    ctx.textAlign = 'left';
  }

  private drawSystemStaves(tb: number, bb: number, width: number, theme: Theme): void {
    const { ctx } = this;
    const gap = this.config.lineGap;
    ctx.strokeStyle = withAlpha(theme.text, 0.32);
    ctx.lineWidth = 1;
    for (const bottom of [tb, bb]) {
      for (let i = 0; i < 5; i++) {
        const y = bottom - i * gap;
        ctx.beginPath();
        ctx.moveTo(CLEF_WIDTH - 12, y);
        ctx.lineTo(width - RIGHT_PAD, y);
        ctx.stroke();
      }
    }
  }

  private drawSystemBarlines(
    layout: SheetLayout,
    startTime: number,
    endTime: number,
    xFor: (t: number) => number,
    top: number,
    bottom: number,
    width: number,
    theme: Theme,
  ): void {
    const { ctx } = this;
    ctx.strokeStyle = withAlpha(theme.text, 0.3);
    ctx.lineWidth = 1;
    for (const t of layout.barTimes) {
      if (t <= startTime + 1e-6 || t >= endTime - 1e-6) continue;
      const x = xFor(t);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }
    // Closing barline at the right edge of the system.
    ctx.beginPath();
    ctx.moveTo(width - RIGHT_PAD, top);
    ctx.lineTo(width - RIGHT_PAD, bottom);
    ctx.stroke();
  }
}
