import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Renderer } from '../src/index';
import type { MidiNote } from '@pianoflow/core';

// Minimal 2D-context mock so the renderer can run headless (node env).
function mockCtx(): CanvasRenderingContext2D {
  const noop = () => {};
  return {
    fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '', textAlign: '',
    fillRect: noop, strokeRect: noop, clearRect: noop,
    beginPath: noop, moveTo: noop, arcTo: noop, closePath: noop, lineTo: noop,
    fill: noop, stroke: noop, setLineDash: noop, fillText: noop, setTransform: noop,
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
