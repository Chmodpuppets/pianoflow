import { describe, it, expect, beforeAll } from 'vitest';
import { SheetRenderer } from '../src/sheet';
import { drawKeySignature, keySignatureWidth } from '../src/sheet-draw';
import { signatureFor, type SheetLayout, type SheetNote } from '@pianoflow/core';

function mockCtx() {
  const rec = { ellipses: 0, strokes: 0, fillRects: 0, texts: [] as string[], saves: 0, restores: 0, quads: 0 };
  const noop = () => {};
  const ctx = {
    fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, lineCap: 'butt',
    font: '', textAlign: 'left', textBaseline: 'alphabetic', shadowColor: '', shadowBlur: 0,
    fillRect: () => { rec.fillRects++; },
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    stroke: () => { rec.strokes++; },
    fill: noop,
    arc: noop,
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

function layout(notes: SheetNote[]): SheetLayout {
  return { notes, barTimes: [0, 2, 4], beatsPerMeasure: 4 };
}

beforeAll(() => {
  (globalThis as Record<string, unknown>).window = { devicePixelRatio: 1 };
});

describe('SheetRenderer', () => {
  it('draws a backdrop, staves and cursor even with no notes', () => {
    const { ctx, rec } = mockCtx();
    const r = new SheetRenderer(mockCanvas(ctx));
    r.resize(800, 400);
    r.render({ layout: layout([]), position: 0 });
    expect(rec.fillRects).toBeGreaterThanOrEqual(1);
    expect(rec.ellipses).toBe(0);
    expect(rec.strokes).toBeGreaterThan(0); // staff lines + clefs + cursor
    expect(rec.saves).toBe(rec.restores); // balanced state
  });

  it('draws noteheads for visible notes and culls far-away ones', () => {
    const { ctx, rec } = mockCtx();
    const r = new SheetRenderer(mockCanvas(ctx));
    r.resize(800, 400);
    r.render({ layout: layout([note(0, 64), note(1, 67), note(100, 60)]), position: 0 });
    expect(rec.ellipses).toBe(2); // the note at t=100 is outside the window
  });

  it('shifts the visible window with the play position', () => {
    const { ctx, rec } = mockCtx();
    const r = new SheetRenderer(mockCanvas(ctx));
    r.resize(800, 400);
    r.render({ layout: layout([note(0, 64), note(10, 67)]), position: 10 });
    expect(rec.ellipses).toBe(1); // only the note at t=10 is near the cursor now
  });

  it('renders an accidental glyph for a sharpened note', () => {
    const { ctx, rec } = mockCtx();
    const r = new SheetRenderer(mockCanvas(ctx));
    r.resize(800, 400);
    r.render({ layout: layout([note(0, 66, { accidental: 1 })]), position: 0 });
    expect(rec.texts).toContain('♯');
  });

  it('draws open noteheads (stroke, not fill) for half notes', () => {
    const { ctx, rec } = mockCtx();
    const r = new SheetRenderer(mockCanvas(ctx));
    r.resize(800, 400);
    r.render({ layout: layout([note(0, 64, { value: 'half' })]), position: 0 });
    expect(rec.ellipses).toBe(1);
    expect(rec.strokes).toBeGreaterThan(0);
  });

  it('is a no-op before resize (zero size)', () => {
    const { ctx, rec } = mockCtx();
    const r = new SheetRenderer(mockCanvas(ctx));
    r.render({ layout: layout([note(0, 64)]), position: 0 });
    expect(rec.fillRects).toBe(0);
    expect(rec.ellipses).toBe(0);
  });

  it('suppresses individual flags when eighths are beamed together', () => {
    const { ctx, rec } = mockCtx();
    const r = new SheetRenderer(mockCanvas(ctx));
    r.resize(800, 400);
    // Two eighths in the same beat (beatDur 0.5s) → one beam, no flags.
    r.render({ layout: layout([note(0, 64, { value: 'eighth' }), note(0.25, 67, { value: 'eighth' })]), position: 0 });
    expect(rec.ellipses).toBe(2);
    expect(rec.quads).toBe(0); // flags are quadratic curves; beamed notes have none
    expect(rec.strokes).toBeGreaterThan(0); // the beam itself is stroked
  });

  it('keeps flags for eighths in different beats (not beamed)', () => {
    const { ctx, rec } = mockCtx();
    const r = new SheetRenderer(mockCanvas(ctx));
    r.resize(800, 400);
    r.render({ layout: layout([note(0, 64, { value: 'eighth' }), note(0.5, 67, { value: 'eighth' })]), position: 0 });
    expect(rec.quads).toBe(2); // one flag per un-beamed eighth
  });

  it('draws the key signature on both staves (sharp key)', () => {
    const { ctx, rec } = mockCtx();
    const r = new SheetRenderer(mockCanvas(ctx));
    r.resize(800, 400);
    const lay = layout([]);
    lay.keySignature = signatureFor(1); // G major: one sharp
    r.render({ layout: lay, position: 0 });
    expect(rec.texts.filter((t) => t === '♯')).toHaveLength(2); // treble + bass
    expect(rec.saves).toBe(rec.restores);
  });

  it('draws flat glyphs for a flat key signature', () => {
    const { ctx, rec } = mockCtx();
    const r = new SheetRenderer(mockCanvas(ctx));
    r.resize(800, 400);
    const lay = layout([]);
    lay.keySignature = signatureFor(-2); // B♭ major: two flats
    r.render({ layout: lay, position: 0 });
    expect(rec.texts.filter((t) => t === '♭')).toHaveLength(4); // two per staff
  });

  it('draws no signature glyphs when the layout has no key signature', () => {
    const { ctx, rec } = mockCtx();
    const r = new SheetRenderer(mockCanvas(ctx));
    r.resize(800, 400);
    r.render({ layout: layout([]), position: 0 });
    expect(rec.texts).not.toContain('♯');
    expect(rec.texts).not.toContain('♭');
  });
});

describe('keySignatureWidth / drawKeySignature', () => {
  it('width is zero without a signature and grows with the mark count', () => {
    expect(keySignatureWidth(undefined, 9)).toBe(0);
    expect(keySignatureWidth(signatureFor(0), 9)).toBe(0);
    expect(keySignatureWidth(signatureFor(2), 9)).toBeCloseTo(2 * 9 * 0.95 + 9 * 0.6);
    expect(keySignatureWidth(signatureFor(3), 9)).toBeGreaterThan(keySignatureWidth(signatureFor(1), 9));
  });

  it('draws one glyph per mark and balances save/restore', () => {
    const { ctx, rec } = mockCtx();
    drawKeySignature(ctx as unknown as CanvasRenderingContext2D, signatureFor(3), 'treble', 50, 200, 9, { text: '#000' } as never);
    expect(rec.texts.filter((t) => t === '♯')).toHaveLength(3);
    expect(rec.saves).toBe(rec.restores);
  });

  it('is a no-op for an empty signature', () => {
    const { ctx, rec } = mockCtx();
    drawKeySignature(ctx as unknown as CanvasRenderingContext2D, signatureFor(0), 'bass', 50, 200, 9, { text: '#000' } as never);
    expect(rec.texts).toHaveLength(0);
  });
});
