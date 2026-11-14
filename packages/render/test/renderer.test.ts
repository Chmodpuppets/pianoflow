import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Renderer } from '../src/index';
import {
  ComboOverlayPlugin,
  type MidiNote,
  type DrawSurface,
  type FrameInfo,
  type PluginEvent,
} from '@pianoflow/core';

// Minimal 2D-context mock so the renderer can run headless (node env).
function mockCtx(): CanvasRenderingContext2D {
  const noop = () => {};
  const gradient = () => ({ addColorStop: noop });
  return {
    fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '', textAlign: '',
    textBaseline: 'alphabetic',
    fillRect: noop, strokeRect: noop, clearRect: noop,
    beginPath: noop, moveTo: noop, arcTo: noop, closePath: noop, lineTo: noop,
    arc: noop,
    fill: noop, stroke: noop, setLineDash: noop, fillText: noop, setTransform: noop,
    measureText: () => ({ width: 0 }),
    createLinearGradient: gradient, createRadialGradient: gradient,
    save: noop, restore: noop,
  } as unknown as CanvasRenderingContext2D;
}
function mockCanvas(ctx: CanvasRenderingContext2D): HTMLCanvasElement {
  return { getContext: () => ctx, width: 0, height: 0, style: {} } as unknown as HTMLCanvasElement;
}
function note(time: number, duration: number, midi: number, hand?: 'left' | 'right'): MidiNote {
  return { midi, ticks: 0, durationTicks: 0, time, duration, velocity: 0.8, channel: 0, track: 0, hand };
}

type Batch = { color: string; rects: number[][] };
const proto = Renderer.prototype as unknown as {
  fillBatch: (buf: number[], color: string) => void;
  getIndex: (notes: MidiNote[]) => { query: (t0: number, t1: number) => MidiNote[] };
};

function captureBatches(r: Renderer, state: Parameters<Renderer['render']>[0]): Batch[] {
  const out: Batch[] = [];
  const orig = proto.fillBatch;
  proto.fillBatch = function (buf: number[], color: string) {
    const rects: number[][] = [];
    for (let i = 0; i < buf.length; i += 5) rects.push(buf.slice(i, i + 5));
    out.push({ color, rects });
    return orig.call(this, buf, color);
  };
  try {
    r.render(state);
  } finally {
    proto.fillBatch = orig;
  }
  // Normalize order (draw order within a same-color batch is visually irrelevant).
  for (const b of out) b.rects.sort((a, c) => a[0] - c[0] || a[1] - c[1] || a[2] - c[2] || a[3] - c[3]);
  return out.sort((a, b) => a.color.localeCompare(b.color));
}

beforeAll(() => {
  (globalThis as unknown as { window: unknown }).window = { devicePixelRatio: 1 };
});
afterAll(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('Renderer viewport culling (NoteIndex integration)', () => {
  it('index path draws exactly the same rects as a full scan', () => {
    const r = new Renderer(mockCanvas(mockCtx()));
    r.resize(1040, 600);
    // A mix of on-screen and far off-screen notes, both hands.
    const notes: MidiNote[] = [];
    for (let i = 0; i < 400; i++) {
      const time = i * 0.25; // 0..100s
      notes.push(note(time, 0.3, 21 + (i % 88), i % 2 ? 'left' : 'right'));
    }
    const state = { position: 50, notes, pressed: new Set<number>() };

    const indexed = captureBatches(r, state);

    // Force a full scan by stubbing the index to return every note.
    const origGetIndex = proto.getIndex;
    proto.getIndex = function (ns: MidiNote[]) {
      return { query: () => ns };
    };
    let full: Batch[];
    try {
      full = captureBatches(r, state);
    } finally {
      proto.getIndex = origGetIndex;
    }

    expect(indexed).toEqual(full);
  });

  it('culls a dense 6000-note scene to a small visible set', () => {
    const r = new Renderer(mockCanvas(mockCtx()));
    r.resize(1040, 600);
    const notes: MidiNote[] = [];
    for (let i = 0; i < 6000; i++) {
      notes.push(note(i * 0.02, 0.05, 21 + (i % 88), i % 2 ? 'left' : 'right'));
    }
    const batches = captureBatches(r, { position: 60, notes, pressed: new Set<number>() });
    const drawn = batches.reduce((s, b) => s + b.rects.length, 0);
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThan(400); // a few seconds' worth, not 6000
  });

  it('reuses the cached index for the same array, rebuilds for a new one', () => {
    const r = new Renderer(mockCanvas(mockCtx()));
    r.resize(1040, 600);
    const notes = [note(10, 0.5, 60, 'right'), note(11, 0.5, 64, 'left')];
    const seen: object[] = [];
    const origGetIndex = proto.getIndex;
    proto.getIndex = function (ns: MidiNote[]) {
      const idx = origGetIndex.call(this, ns);
      seen.push(idx);
      return idx;
    };
    try {
      r.render({ position: 10, notes, pressed: new Set<number>() });
      r.render({ position: 10.5, notes, pressed: new Set<number>() });
      r.render({ position: 11, notes, pressed: new Set<number>() });
      // Same array reference across frames -> one shared NoteIndex instance.
      expect(seen[0]).toBe(seen[1]);
      expect(seen[1]).toBe(seen[2]);
      // A new array reference -> a fresh index.
      r.render({ position: 10, notes: [...notes], pressed: new Set<number>() });
      expect(seen[3]).not.toBe(seen[0]);
    } finally {
      proto.getIndex = origGetIndex;
    }
  });
});

describe('Plugin overlay runtime integration', () => {
  it('resets dirty canvas state so a bad plugin cannot corrupt the base scene', () => {
    const ctx = mockCtx();
    const r = new Renderer(mockCanvas(ctx));
    r.resize(1040, 600);
    // Capture the alpha at the moment the background is first filled.
    let firstFillAlpha = -1;
    ctx.fillRect = () => {
      if (firstFillAlpha < 0) firstFillAlpha = ctx.globalAlpha;
    };
    // Simulate a plugin overlay that forgot to restore its state.
    ctx.globalAlpha = 0;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    r.render({ position: 0, notes: [note(0.5, 0.5, 60, 'right')], pressed: new Set<number>() });
    expect(firstFillAlpha).toBe(1); // base scene drawn at full alpha despite dirty input
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.textBaseline).toBe('alphabetic');
  });

  it('draws the real combo overlay through a DrawSurface adapter and restores state', () => {
    // A stateful 2D-context mock: save/restore snapshot the drawing state.
    const stack: Record<string, unknown>[] = [];
    const texts: { text: string; x: number; y: number }[] = [];
    const ctx = {
      fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '',
      textAlign: 'left', textBaseline: 'alphabetic',
      fillRect: () => {}, strokeRect: () => {}, clearRect: () => {},
      beginPath: () => {}, moveTo: () => {}, arcTo: () => {}, closePath: () => {}, lineTo: () => {},
      fill: () => {}, stroke: () => {}, setLineDash: () => {}, setTransform: () => {},
      fillText: (t: string, x: number, y: number) => texts.push({ text: t, x, y }),
      save() {
        stack.push({
          globalAlpha: this.globalAlpha, fillStyle: this.fillStyle, font: this.font,
          textAlign: this.textAlign, textBaseline: this.textBaseline,
        });
      },
      restore() {
        const s = stack.pop();
        if (s) Object.assign(this, s);
      },
    };
    const surface: DrawSurface = {
      save: () => ctx.save(),
      restore: () => ctx.restore(),
      fillRect: (x, y, w, h) => ctx.fillRect(x, y, w, h),
      fillText: (t, x, y) => ctx.fillText(t, x, y),
      setFillStyle: (c) => { ctx.fillStyle = c; },
      setFont: (f) => { ctx.font = f; },
      setTextAlign: (a) => { ctx.textAlign = a; },
      setGlobalAlpha: (a) => { ctx.globalAlpha = a; },
    };
    const overlay = new ComboOverlayPlugin();
    const frame = (dt: number): FrameInfo => ({ position: 1, playing: true, dt, width: 1040, height: 600 });

    // Idle: nothing drawn, state untouched.
    overlay.onDraw(surface, frame(0.016));
    expect(texts.length).toBe(0);
    expect(ctx.globalAlpha).toBe(1);

    // A perfect hit at combo 3 -> counter + judgement flash, alpha restored.
    const hit: PluginEvent = { type: 'note-hit', note: note(1, 0.5, 60), judgement: 'perfect', combo: 3 };
    overlay.onEvent(hit);
    overlay.onDraw(surface, frame(0.016));
    expect(texts.some((t) => t.text === '3 COMBO')).toBe(true);
    expect(texts.some((t) => t.text === 'PERFECT')).toBe(true);
    expect(ctx.globalAlpha).toBe(1);
    expect(stack.length).toBe(0); // balanced save/restore

    // A miss clears the combo (no new COMBO text) but flashes MISS.
    overlay.onEvent({ type: 'note-miss', note: note(2, 0.5, 60) });
    overlay.onDraw(surface, frame(0.016));
    expect(texts.filter((t) => t.text.endsWith('COMBO')).length).toBe(1);
    expect(texts.some((t) => t.text === 'MISS')).toBe(true);
    expect(ctx.globalAlpha).toBe(1);
    expect(stack.length).toBe(0);
  });
});

describe('Renderer note-name labels', () => {
  function labelCtx() {
    const texts: { text: string; x: number; y: number }[] = [];
    const ctx = mockCtx();
    ctx.textBaseline = 'alphabetic';
    ctx.fillText = (t: string, x: number, y: number) => texts.push({ text: t, x, y });
    return { ctx, texts };
  }

  it('draws note names on visible falling notes when enabled', () => {
    const { ctx, texts } = labelCtx();
    const r = new Renderer(mockCanvas(ctx));
    r.resize(1040, 600);
    r.setConfig({ showNoteLabels: true });
    r.render({ position: 0, notes: [note(0.5, 0.5, 60, 'right')], pressed: new Set<number>() });
    expect(texts.some((t) => t.text === 'C4')).toBe(true);
    // State is cleaned up so later drawing (keyboard, plugins) is unaffected.
    expect(ctx.textBaseline).toBe('alphabetic');
  });

  it('draws no note labels when disabled', () => {
    const { ctx, texts } = labelCtx();
    const r = new Renderer(mockCanvas(ctx));
    r.resize(1040, 600);
    r.render({ position: 0, notes: [note(0.5, 0.5, 60, 'right')], pressed: new Set<number>() });
    expect(texts).toHaveLength(0);
  });

  it('skips labels for blocks too small to hold legible text', () => {
    const { ctx, texts } = labelCtx();
    const r = new Renderer(mockCanvas(ctx));
    r.resize(1040, 600);
    r.setConfig({ showNoteLabels: true });
    r.render({ position: 0, notes: [note(0.5, 0.01, 60, 'right')], pressed: new Set<number>() });
    expect(texts).toHaveLength(0);
  });
});

describe('Renderer stage polish (background, hit-line pulse, key glow)', () => {
  const idle = { position: 0, notes: [] as MidiNote[], pressed: new Set<number>() };

  it('paints a gradient backdrop at full alpha (not a flat fill)', () => {
    const ctx = mockCtx();
    const fills: { style: unknown; alpha: number }[] = [];
    ctx.fillRect = () => fills.push({ style: ctx.fillStyle, alpha: ctx.globalAlpha });
    const r = new Renderer(mockCanvas(ctx));
    r.resize(1040, 600);
    r.render(idle);
    // The very first fill is the cached background gradient object, at alpha 1.
    expect(typeof fills[0].style).toBe('object');
    expect(fills[0].alpha).toBe(1);
    expect(fills.length).toBeGreaterThanOrEqual(3); // gradient + ambient wash + vignette
  });

  it('triggerPulse flashes the strike line then decays back to zero', () => {
    const r = new Renderer(mockCanvas(mockCtx()));
    r.resize(1040, 600);
    expect(r.pulseLevel).toBe(0);
    r.triggerPulse();
    expect(r.pulseLevel).toBe(1);
    r.render(idle);
    expect(r.pulseLevel).toBeGreaterThan(0);
    expect(r.pulseLevel).toBeLessThan(1); // decayed by one frame
    for (let i = 0; i < 40; i++) r.render(idle);
    expect(r.pulseLevel).toBe(0); // fully settled
  });

  it('brightens the strike-line core while pulsing', () => {
    const ctx = mockCtx();
    const hitAlphas: number[] = [];
    ctx.fillRect = (_x: number, _y: number, _w: number, h: number) => {
      if (ctx.fillStyle === '#ffffff' && h === 3) hitAlphas.push(ctx.globalAlpha);
    };
    const r = new Renderer(mockCanvas(ctx));
    r.resize(1040, 600);
    r.render(idle);
    const rest = hitAlphas[hitAlphas.length - 1];
    r.triggerPulse();
    r.render(idle);
    const pulsed = hitAlphas[hitAlphas.length - 1];
    expect(rest).toBeCloseTo(0.55, 5);
    expect(pulsed).toBeCloseTo(1.0, 5);
    expect(pulsed).toBeGreaterThan(rest);
  });

  it('emits one radial glow gradient per pressed key (and none when idle)', () => {
    const ctx = mockCtx();
    let radial = 0;
    const orig = ctx.createRadialGradient.bind(ctx);
    ctx.createRadialGradient = (...args: Parameters<CanvasRenderingContext2D['createRadialGradient']>) => {
      radial++;
      return orig(...args);
    };
    const r = new Renderer(mockCanvas(ctx));
    r.resize(1040, 600); // builds the ambient + vignette radial gradients
    const base = radial;
    r.render(idle);
    expect(radial).toBe(base); // no pressed keys -> no glow
    r.render({ position: 0, notes: [], pressed: new Set<number>([60, 64]) });
    expect(radial).toBe(base + 2); // one glow per pressed key
  });
});

describe('Renderer playfield feedback (anticipation glow + hit sparks)', () => {
  it('glows keys whose notes are about to arrive, and skips already-pressed keys', () => {
    const ctx = mockCtx();
    let radial = 0;
    const orig = ctx.createRadialGradient.bind(ctx);
    ctx.createRadialGradient = (...args: Parameters<CanvasRenderingContext2D['createRadialGradient']>) => {
      radial++;
      return orig(...args);
    };
    const r = new Renderer(mockCanvas(ctx));
    r.resize(1040, 600);
    const base = radial;
    const approaching = [note(0.3, 0.5, 60, 'right')];
    r.render({ position: 0, notes: [], pressed: new Set<number>() });
    expect(radial).toBe(base); // nothing approaching
    r.render({ position: 0, notes: approaching, pressed: new Set<number>() });
    expect(radial).toBe(base + 1); // one anticipation glow
    r.render({ position: 0, notes: approaching, pressed: new Set<number>([60]) });
    expect(radial).toBe(base + 2); // anticipation skipped; pressed key glows via keyboard path (+1)
  });

  it('spawns capped hit sparks that expire over time', () => {
    const r = new Renderer(mockCanvas(mockCtx()));
    r.resize(1040, 600);
    expect(r.particleCount).toBe(0);
    r.notifyHit(60, 'right');
    expect(r.particleCount).toBeGreaterThan(0);
    // Repeated hits never exceed the cap.
    for (let i = 0; i < 60; i++) r.notifyHit(60 + (i % 12), i % 2 ? 'left' : 'right');
    expect(r.particleCount).toBeLessThanOrEqual(240);
    // A large dt expires every spark.
    r.render({ position: 0, notes: [], pressed: new Set<number>(), dt: 1 });
    expect(r.particleCount).toBe(0);
  });
});

describe('Renderer game-feel feedback (combo milestone + miss flash)', () => {
  const idle = { position: 0, notes: [] as MidiNote[], pressed: new Set<number>() };

  it('notifyMilestone spawns an expanding ring + golden sparks that decay away', () => {
    const ctx = mockCtx();
    let arcs = 0;
    ctx.arc = () => { arcs++; };
    const r = new Renderer(mockCanvas(ctx));
    r.resize(1040, 600);
    expect(r.shockwaveCount).toBe(0);
    r.notifyMilestone(10);
    expect(r.shockwaveCount).toBe(1);
    expect(r.particleCount).toBeGreaterThan(0); // radial spark burst
    r.render(idle);
    expect(arcs).toBeGreaterThan(0); // the ring is stroked
    expect(r.shockwaveCount).toBe(1); // still alive after one frame
    // Repeated milestones never exceed the ring cap.
    for (let i = 0; i < 20; i++) r.notifyMilestone(50);
    expect(r.shockwaveCount).toBeLessThanOrEqual(6);
    // A large dt expires every ring and spark.
    r.render({ ...idle, dt: 1 });
    expect(r.shockwaveCount).toBe(0);
    expect(r.particleCount).toBe(0);
  });

  it('notifyMiss flashes the stage edges then decays back to zero', () => {
    const ctx = mockCtx();
    let radial = 0;
    const orig = ctx.createRadialGradient.bind(ctx);
    ctx.createRadialGradient = (...args: Parameters<CanvasRenderingContext2D['createRadialGradient']>) => {
      radial++;
      return orig(...args);
    };
    const r = new Renderer(mockCanvas(ctx));
    r.resize(1040, 600);
    const base = radial;
    r.render(idle);
    expect(radial).toBe(base); // no miss -> no extra wash
    expect(r.missFlashLevel).toBe(0);
    r.notifyMiss();
    expect(r.missFlashLevel).toBe(1);
    r.render(idle);
    expect(radial).toBe(base + 1); // one red edge wash while flashing
    expect(r.missFlashLevel).toBeGreaterThan(0);
    expect(r.missFlashLevel).toBeLessThan(1); // decayed by one frame
    for (let i = 0; i < 60; i++) r.render(idle);
    expect(r.missFlashLevel).toBe(0); // fully settled
  });
});

describe('Renderer hand-assist (dimmed auto-played hand)', () => {
  const notes: MidiNote[] = [note(50, 0.5, 60, 'right'), note(50, 0.5, 48, 'left')];

  it('draws the assisted hand muted and the player hand at full color', () => {
    const r = new Renderer(mockCanvas(mockCtx()));
    r.resize(1040, 600);
    const batches = captureBatches(r, { position: 50, notes, pressed: new Set<number>(), dimHand: 'left' });
    // Left (assisted) note goes to a muted rgba batch, not the full-color one.
    const dim = batches.find((b) => b.color === 'rgba(89,217,142,0.3)');
    expect(dim?.rects.length).toBe(1);
    const fullLeft = batches.find((b) => b.color === '#59d98e');
    expect(fullLeft?.rects.length ?? 0).toBe(0);
    // Right (player) note stays bright.
    const right = batches.find((b) => b.color === '#4ea1ff');
    expect(right?.rects.length).toBe(1);
  });

  it('without dimHand both hands render at full color (no muted batch)', () => {
    const r = new Renderer(mockCanvas(mockCtx()));
    r.resize(1040, 600);
    const batches = captureBatches(r, { position: 50, notes, pressed: new Set<number>() });
    expect(batches.find((b) => b.color === 'rgba(89,217,142,0.3)')).toBeUndefined();
    expect(batches.find((b) => b.color === '#59d98e')?.rects.length).toBe(1);
    expect(batches.find((b) => b.color === '#4ea1ff')?.rects.length).toBe(1);
  });

  it('note-name labels skip the assisted hand', () => {
    const ctx = mockCtx();
    const texts: string[] = [];
    ctx.fillText = (t: string) => { texts.push(t); };
    const r = new Renderer(mockCanvas(ctx), { showNoteLabels: true });
    r.resize(1040, 600);
    r.render({ position: 50, notes, pressed: new Set<number>(), dimHand: 'left' });
    expect(texts).toContain('C4'); // player (right) hand labeled
    expect(texts).not.toContain('C3'); // assisted (left) hand not labeled
  });
});
