import { describe, it, expect, beforeAll } from 'vitest';
import { SheetPageRenderer } from '../src/sheet-page';
import { paperTheme } from '../src/theme';
import { signatureFor, type SheetLayout, type SheetNote } from '@pianoflow/core';

function mockCtx() {
  const rec = {
    ellipses: 0, strokes: 0, fillRects: 0, texts: [] as string[],
    saves: 0, restores: 0, fillStyles: [] as string[], quads: 0,
  };
  const noop = () => {};
  const ctx = {
    fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, lineCap: 'butt',
    font: '', textAlign: 'left', textBaseline: 'alphabetic', shadowColor: '', shadowBlur: 0,
    fillRect: () => { rec.fillRects++; rec.fillStyles.push(ctx.fillStyle); },
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    stroke: () => { rec.strokes++; },
    fill: noop, arc: noop,
    ellipse: () => { rec.ellipses++; },
    rotate: noop, translate: noop,
    save: () => { rec.saves++; }, restore: () => { rec.restores++; },
    bezierCurveTo: noop, quadraticCurveTo: () => { rec.quads++; },
    setTransform: noop,
    measureText: () => ({ width: 0 }),
    fillText: (t: string) => { rec.texts.push(t); },
  };
  return { ctx, rec };
}

function mockCanvas(ctx: unknown) {
  return { width: 0, height: 0, style: {}, getContext: () => ctx } as unknown as HTMLCanvasElement;
}

function note(time: number, midi: number, over: Partial<SheetNote> = {}): SheetNote {
  return {
    midi, time, duration: 0.5, hand: 'right', staff: 'treble',
    steps: 0, accidental: 0, value: 'quarter', ...over,
  };
}

/** 5 measures of 4/4 at 120bpm (barline every 2s). */
function layout(notes: SheetNote[]): SheetLayout {
  return { notes, barTimes: [0, 2, 4, 6, 8], beatsPerMeasure: 4 };
}

/** A note in each of the 5 measures so none are trimmed as empty. */
function fiveMeasures(): SheetLayout {
  return layout([note(0, 64), note(2, 65), note(4, 67), note(6, 69), note(8, 71)]);
}

beforeAll(() => {
  (globalThis as Record<string, unknown>).window = { devicePixelRatio: 1 };
});

describe('SheetPageRenderer', () => {
  it('paints a white paper backdrop, title, composer and footer', () => {
    const { ctx, rec } = mockCtx();
    const canvas = mockCanvas(ctx);
    const r = new SheetPageRenderer(canvas, { width: 900 });
    r.render({ layout: layout([note(0, 64)]), title: 'Für Elise', composer: 'Beethoven' });
    expect(rec.fillRects).toBeGreaterThanOrEqual(1);
    expect(rec.fillStyles[0]).toBe(paperTheme.background); // white paper
    expect(rec.texts).toContain('Für Elise');
    expect(rec.texts).toContain('Beethoven');
    expect(rec.texts).toContain('PianoFlow');
    expect(canvas.width).toBe(900);
    expect(canvas.height).toBeGreaterThan(0);
  });

  it('draws every note on the page (no time-window culling)', () => {
    const { ctx, rec } = mockCtx();
    const r = new SheetPageRenderer(mockCanvas(ctx));
    r.render({ layout: layout([note(0, 64), note(5, 67), note(9, 60, { staff: 'bass', hand: 'left' })]) });
    expect(rec.ellipses).toBe(3);
  });

  it('numbers the first measure of each system', () => {
    const { ctx, rec } = mockCtx();
    const r = new SheetPageRenderer(mockCanvas(ctx), { measuresPerSystem: 2 });
    r.render({ layout: fiveMeasures(), title: 'T' });
    // 5 measures / 2 per system → systems starting at measures 1, 3, 5
    expect(rec.texts).toContain('1');
    expect(rec.texts).toContain('3');
    expect(rec.texts).toContain('5');
  });

  it('grows taller when fewer measures fit per system', () => {
    const a = mockCtx();
    const ra = new SheetPageRenderer(mockCanvas(a.ctx), { measuresPerSystem: 1 });
    ra.render({ layout: fiveMeasures() });
    const b = mockCtx();
    const rb = new SheetPageRenderer(mockCanvas(b.ctx), { measuresPerSystem: 5 });
    rb.render({ layout: fiveMeasures() });
    expect(ra.viewHeight).toBeGreaterThan(rb.viewHeight);
    expect(ra.viewWidth).toBe(rb.viewWidth);
  });

  it('renders accidentals and keeps canvas state balanced', () => {
    const { ctx, rec } = mockCtx();
    const r = new SheetPageRenderer(mockCanvas(ctx));
    r.render({ layout: layout([note(0, 66, { accidental: 1 }), note(2, 64, { value: 'half' })]) });
    expect(rec.texts).toContain('♯');
    expect(rec.ellipses).toBe(2);
    expect(rec.saves).toBe(rec.restores);
  });

  it('scale multiplies the export resolution', () => {
    const { ctx } = mockCtx();
    const canvas = mockCanvas(ctx);
    const r = new SheetPageRenderer(canvas, { width: 800, scale: 2 });
    r.render({ layout: layout([note(0, 64)]) });
    expect(canvas.width).toBe(1600);
    expect(r.viewWidth).toBe(800); // css size unchanged
  });

  it('measure() predicts the rendered page height', () => {
    const { ctx } = mockCtx();
    const canvas = mockCanvas(ctx);
    const r = new SheetPageRenderer(canvas, { measuresPerSystem: 2 });
    const predicted = r.measure(layout([note(0, 64)]), true);
    r.render({ layout: layout([note(0, 64)]), title: 'T' });
    expect(predicted).toBe(r.viewHeight);
    expect(predicted).toBeGreaterThan(0);
  });

  it('beams same-beat eighths on the printed page (no individual flags)', () => {
    const { ctx, rec } = mockCtx();
    const r = new SheetPageRenderer(mockCanvas(ctx));
    r.render({ layout: layout([note(0, 64, { value: 'eighth' }), note(0.25, 67, { value: 'eighth' })]) });
    expect(rec.ellipses).toBe(2);
    expect(rec.quads).toBe(0); // beamed → flags suppressed
    expect(rec.strokes).toBeGreaterThan(0);
  });

  it('draws the key signature on every system (both staves)', () => {
    const { ctx, rec } = mockCtx();
    const r = new SheetPageRenderer(mockCanvas(ctx), { measuresPerSystem: 2 });
    const lay = fiveMeasures(); // 5 measures / 2 per system → 3 systems
    lay.keySignature = signatureFor(1); // G major: one sharp
    r.render({ layout: lay, title: 'T' });
    expect(rec.texts.filter((t) => t === '♯')).toHaveLength(6); // 3 systems × 2 staves
    expect(rec.saves).toBe(rec.restores);
  });

  it('draws no signature glyphs without a key signature', () => {
    const { ctx, rec } = mockCtx();
    const r = new SheetPageRenderer(mockCanvas(ctx));
    r.render({ layout: fiveMeasures() });
    expect(rec.texts).not.toContain('♯');
    expect(rec.texts).not.toContain('♭');
  });

  it('engraves a whole rest as a filled block on the page', () => {
    const base = layout([note(0, 64)]);
    const a = mockCtx();
    new SheetPageRenderer(mockCanvas(a.ctx)).render({ layout: base });
    const withRest = layout([note(0, 64)]);
    withRest.rests = [{ time: 0.5, staff: 'treble', value: 'whole' }];
    const b = mockCtx();
    new SheetPageRenderer(mockCanvas(b.ctx)).render({ layout: withRest });
    expect(b.rec.fillRects).toBeGreaterThan(a.rec.fillRects);
  });

  it('engraves a tie between contiguous same-pitch notes on the page', () => {
    const notes = [note(0, 60, { duration: 1 }), note(1, 60, { duration: 0.5 })];
    const a = mockCtx();
    new SheetPageRenderer(mockCanvas(a.ctx)).render({ layout: layout(notes) });
    const withTie = layout(notes);
    withTie.ties = [{ from: 0, to: 1, staff: 'treble' }];
    const b = mockCtx();
    new SheetPageRenderer(mockCanvas(b.ctx)).render({ layout: withTie });
    expect(b.rec.strokes).toBeGreaterThan(a.rec.strokes);
    expect(b.rec.ellipses).toBe(a.rec.ellipses); // tie adds no noteheads
  });
});
