import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  buildNoteInstances,
  hexToRgb,
  WebGLNoteBackend,
  createNoteBackend,
  INSTANCE_FLOATS,
  NOTE_GLOW_MARGIN,
  type NoteScene,
} from '../src/webgl';
import { Renderer } from '../src/renderer';
import { buildKeyboard } from '../src/keyboard';
import { defaultTheme } from '../src/theme';
import type { MidiNote } from '@pianoflow/core';

function note(time: number, duration: number, midi: number, hand?: 'left' | 'right'): MidiNote {
  return { midi, ticks: 0, durationTicks: 0, time, duration, velocity: 0.8, channel: 0, track: 0, hand };
}

beforeAll(() => {
  (globalThis as unknown as { window: unknown }).window = { devicePixelRatio: 1 };
});
afterAll(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('hexToRgb', () => {
  it('parses #rrggbb into normalized channels', () => {
    expect(hexToRgb('#4ea1ff')).toEqual([0x4e / 255, 0xa1 / 255, 0xff / 255]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb('#ffffff')).toEqual([1, 1, 1]);
  });
  it('falls back to white for malformed input', () => {
    expect(hexToRgb('nope')).toEqual([1, 1, 1]);
  });
});

describe('buildNoteInstances (pure geometry)', () => {
  const layout = buildKeyboard(21, 108, 1040);
  const base: NoteScene = {
    notes: [], layout, pps: 200, position: 10, keyboardTop: 600, cssH: 700, theme: defaultTheme,
  };

  it('returns nothing for an empty scene', () => {
    const { count, data } = buildNoteInstances(base);
    expect(count).toBe(0);
    expect(data.length).toBe(0);
  });

  it('expands glowing notes by the bloom margin and encodes hand color', () => {
    const key = layout.byMidi.get(60)!;
    const scene: NoteScene = { ...base, notes: [note(10, 0.5, 60, 'right')] };
    const { data, count } = buildNoteInstances(scene);
    expect(count).toBe(1);
    const x = key.x + 1;
    const w = key.width - 2;
    const m = NOTE_GLOW_MARGIN;
    expect(data[0]).toBeCloseTo(x - m); // expanded rect
    expect(data[1]).toBeCloseTo(500 - m);
    expect(data[2]).toBeCloseTo(w + 2 * m);
    expect(data[3]).toBeCloseTo(100 + 2 * m);
    const [r, g, b] = hexToRgb(defaultTheme.rightNote);
    expect(data[4]).toBeCloseTo(r);
    expect(data[5]).toBeCloseTo(g);
    expect(data[6]).toBeCloseTo(b);
    expect(data[7]).toBe(1); // alpha
    expect(data[8]).toBeCloseTo(Math.min(4, w / 2)); // radius
    expect(data[9]).toBe(1); // glow on
    expect(data[10]).toBe(600); // keyboardTop
    expect(data[11]).toBe(m); // margin
  });

  it('draws the assisted hand flat, dim and without bloom', () => {
    const scene: NoteScene = { ...base, notes: [note(10, 0.5, 48, 'left')], dimHand: 'left' };
    const { data, count } = buildNoteInstances(scene);
    expect(count).toBe(1);
    expect(data[7]).toBeCloseTo(0.3); // dim alpha
    expect(data[9]).toBe(0); // no glow
    expect(data[11]).toBe(0); // no margin
    const [r, g, b] = hexToRgb(defaultTheme.leftNote);
    expect(data[4]).toBeCloseTo(r);
    expect(data[5]).toBeCloseTo(g);
    expect(data[6]).toBeCloseTo(b);
  });

  it('culls notes fully outside the vertical viewport', () => {
    const scene: NoteScene = {
      ...base,
      notes: [note(10, 0.5, 60, 'right'), note(100, 0.5, 60, 'right'), note(-100, 0.5, 60, 'right')],
    };
    const { count } = buildNoteInstances(scene);
    expect(count).toBe(1); // only the on-screen note survives
  });

  it('produces inner rects identical to the Canvas2D fallback cull', () => {
    // Render the same scene through the Canvas2D path (no WebGL in this mock) and
    // capture its per-note rects, then compare to the GPU instance inner rects.
    const ctx = {
      fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '', textAlign: '',
      textBaseline: 'alphabetic', shadowBlur: 0, shadowColor: '',
      fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, moveTo() {}, arcTo() {},
      closePath() {}, lineTo() {}, arc() {}, fill() {}, stroke() {}, setLineDash() {}, fillText() {},
      setTransform() {}, measureText: () => ({ width: 0 }),
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
      save() {}, restore() {}, drawImage() {},
    } as unknown as CanvasRenderingContext2D;
    const canvas = { getContext: () => ctx, width: 0, height: 0, style: {} } as unknown as HTMLCanvasElement;
    const r = new Renderer(canvas);
    r.resize(1040, 700);
    const notes: MidiNote[] = [];
    for (let i = 0; i < 300; i++) notes.push(note(i * 0.2, 0.3, 21 + (i % 88), i % 2 ? 'left' : 'right'));
    const rects: number[][] = [];
    const proto = Renderer.prototype as unknown as { fillBatch: (b: number[], c: string) => void };
    const orig = proto.fillBatch;
    proto.fillBatch = function (buf: number[]) {
      for (let i = 0; i < buf.length; i += 5) rects.push(buf.slice(i, i + 5));
      return orig.call(this, buf, '');
    };
    try {
      r.render({ position: 30, notes, pressed: new Set<number>() });
    } finally {
      proto.fillBatch = orig;
    }
    const pps = r.keyboardTop / Math.max(0.2, r.config.secondsVisible);
    const { data, count } = buildNoteInstances({
      notes, layout: r.layout, pps, position: 30, keyboardTop: r.keyboardTop, cssH: 700, theme: defaultTheme,
    });
    const inner: number[][] = [];
    for (let i = 0; i < count; i++) {
      const o = i * INSTANCE_FLOATS;
      const m = data[o + 11];
      inner.push([data[o] + m, data[o + 1] + m, data[o + 2] - 2 * m, data[o + 3] - 2 * m, data[o + 8]]);
    }
    const norm = (a: number[][]) => a.map((r2) => r2.map((v) => Math.round(v * 100) / 100))
      .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    expect(norm(inner)).toEqual(norm(rects));
    expect(count).toBe(rects.length);
  });
});

// ---- Mock WebGL command-stream verification ----------------------------------
function mockGL() {
  const calls: Record<string, unknown[][]> = {};
  const rec = (name: string) => (...args: unknown[]) => { (calls[name] ||= []).push(args); };
  let attrib = 0;
  const angle = {
    drawArraysInstancedANGLE: rec('drawArraysInstancedANGLE'),
    vertexAttribDivisorANGLE: rec('vertexAttribDivisorANGLE'),
  };
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, STATIC_DRAW: 6, DYNAMIC_DRAW: 7, FLOAT: 8,
    DEPTH_TEST: 9, BLEND: 10, ONE: 11, ONE_MINUS_SRC_ALPHA: 12, COLOR_BUFFER_BIT: 13, TRIANGLES: 14,
    getExtension: (name: string) => (name === 'ANGLE_instanced_arrays' ? angle : null),
    createShader: () => ({}), shaderSource: rec('shaderSource'), compileShader: rec('compileShader'),
    getShaderParameter: () => true, getShaderInfoLog: () => '', deleteShader: rec('deleteShader'),
    createProgram: () => ({}), attachShader: rec('attachShader'), linkProgram: rec('linkProgram'),
    getProgramParameter: () => true, getProgramInfoLog: () => '', deleteProgram: rec('deleteProgram'),
    getAttribLocation: () => attrib++, getUniformLocation: () => ({}),
    createBuffer: () => ({}), bindBuffer: rec('bindBuffer'), bufferData: rec('bufferData'),
    bufferSubData: rec('bufferSubData'), deleteBuffer: rec('deleteBuffer'),
    enableVertexAttribArray: rec('enableVertexAttribArray'),
    vertexAttribPointer: rec('vertexAttribPointer'), disable: rec('disable'), enable: rec('enable'),
    blendFunc: rec('blendFunc'), clearColor: rec('clearColor'), useProgram: rec('useProgram'),
    uniform2f: rec('uniform2f'), clear: rec('clear'), viewport: rec('viewport'),
  };
  return { gl, calls, angle };
}
function fakeCanvas(gl: unknown): HTMLCanvasElement {
  return {
    width: 0, height: 0, style: {},
    getContext: (t: string) => (t === 'webgl' || t === 'experimental-webgl' ? gl : null),
  } as unknown as HTMLCanvasElement;
}

describe('WebGLNoteBackend (mock GL command stream)', () => {
  const layout = buildKeyboard(21, 108, 1040);
  const scene: NoteScene = {
    notes: [note(10, 0.5, 60, 'right'), note(10, 0.5, 48, 'left')],
    layout, pps: 200, position: 10, keyboardTop: 600, cssH: 700, theme: defaultTheme,
  };

  it('compiles, links, and configures premultiplied blending', () => {
    const { gl, calls } = mockGL();
    const b = new WebGLNoteBackend(fakeCanvas(gl));
    expect(calls.compileShader?.length).toBe(2); // vert + frag
    expect(calls.linkProgram?.length).toBe(1);
    expect(calls.enable).toContainEqual([gl.BLEND]);
    expect(calls.blendFunc).toContainEqual([gl.ONE, gl.ONE_MINUS_SRC_ALPHA]);
    b.dispose();
  });

  it('issues one instanced draw with per-instance divisors for the visible notes', () => {
    const { gl, calls } = mockGL();
    const b = new WebGLNoteBackend(fakeCanvas(gl));
    b.resize(1040, 700, 1);
    b.draw(scene);
    expect(b.lastCount).toBe(2);
    expect(calls.drawArraysInstancedANGLE).toContainEqual([gl.TRIANGLES, 0, 6, 2]);
    // instance attributes (rect/color/misc) use divisor 1; the unit quad uses 0.
    const divisors = calls.vertexAttribDivisorANGLE!.map((a) => a[1]);
    expect(divisors.filter((d) => d === 1).length).toBe(3);
    expect(divisors.filter((d) => d === 0).length).toBe(1);
    expect(calls.bufferSubData?.length).toBeGreaterThan(0);
    expect(calls.viewport).toContainEqual([0, 0, 1040, 700]);
    b.dispose();
  });

  it('clears to transparent and skips the draw when no notes are visible', () => {
    const { gl, calls } = mockGL();
    const b = new WebGLNoteBackend(fakeCanvas(gl));
    b.resize(1040, 700, 1);
    b.draw({ ...scene, notes: [] });
    expect(b.lastCount).toBe(0);
    expect(calls.clear?.length).toBeGreaterThan(0);
    expect(calls.drawArraysInstancedANGLE).toBeUndefined();
    b.dispose();
  });

  it('throws without a WebGL context or without instancing support', () => {
    const noGl = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() => new WebGLNoteBackend(noGl)).toThrow();
    const { gl } = mockGL();
    (gl as { getExtension: (n: string) => unknown }).getExtension = () => null; // no ANGLE
    expect(() => new WebGLNoteBackend(fakeCanvas(gl))).toThrow(/instancing/i);
  });
});

describe('createNoteBackend graceful fallback', () => {
  it('returns null when the canvas has no owning document (headless)', () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    expect(createNoteBackend(canvas)).toBeNull();
  });
  it('returns null when the document canvas cannot create a WebGL context', () => {
    const off = { getContext: () => null, width: 0, height: 0 };
    const canvas = {
      ownerDocument: { createElement: () => off },
    } as unknown as HTMLCanvasElement;
    expect(createNoteBackend(canvas)).toBeNull();
  });
});

// ---- Renderer composite wiring (GPU layer vs Canvas2D fallback) --------------
function ctx2d() {
  const drawImageCalls: unknown[][] = [];
  const noop = () => {};
  const gradient = () => ({ addColorStop: noop });
  const ctx = {
    fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '', textAlign: '',
    textBaseline: 'alphabetic', shadowBlur: 0, shadowColor: '',
    fillRect: noop, strokeRect: noop, clearRect: noop, beginPath: noop, moveTo: noop, arcTo: noop,
    closePath: noop, lineTo: noop, arc: noop, fill: noop, stroke: noop, setLineDash: noop, fillText: noop,
    setTransform: noop, measureText: () => ({ width: 0 }),
    createLinearGradient: gradient, createRadialGradient: gradient, save: noop, restore: noop,
    drawImage: (...args: unknown[]) => { drawImageCalls.push(args); },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, drawImageCalls };
}

describe('Renderer GPU composite wiring', () => {
  it('composites the GPU note layer via drawImage and skips the 2D note batches', () => {
    const { gl } = mockGL();
    const glCanvas = { width: 0, height: 0, getContext: (t: string) => (t === 'webgl' ? gl : null) };
    const { ctx, drawImageCalls } = ctx2d();
    const canvas = {
      width: 0, height: 0, style: {},
      getContext: (t: string) => (t === '2d' ? ctx : null),
      ownerDocument: { createElement: () => glCanvas },
    } as unknown as HTMLCanvasElement;
    const r = new Renderer(canvas);
    r.resize(1040, 700);
    const notes = [note(10, 0.5, 60, 'right'), note(10, 0.5, 48, 'left')];
    let batches = 0;
    const proto = Renderer.prototype as unknown as { fillBatch: (b: number[], c: string) => void };
    const orig = proto.fillBatch;
    proto.fillBatch = function (buf: number[], color: string) { batches++; return orig.call(this, buf, color); };
    try {
      r.render({ position: 10, notes, pressed: new Set<number>() });
      expect(r.usingGpu).toBe(true);
      expect(drawImageCalls.length).toBe(1);
      expect(drawImageCalls[0]).toEqual([glCanvas, 0, 0, 1040, 700]);
      expect(batches).toBe(0); // notes went through the GPU, not fillBatch

      // Turning the GPU off falls back to the batched Canvas2D path.
      r.setGpuEnabled(false);
      r.render({ position: 10, notes, pressed: new Set<number>() });
      expect(r.usingGpu).toBe(false);
      expect(drawImageCalls.length).toBe(1); // no new composite
      expect(batches).toBeGreaterThan(0); // notes now batched in 2D
    } finally {
      proto.fillBatch = orig;
    }
    r.dispose();
  });
});

// ---- Real headless-gl pixel verification (skips when the binary is absent) ----
let glFactory: ((w: number, h: number, o?: Record<string, unknown>) => WebGLRenderingContext | null) | null = null;
try {
  const mod = await import('gl');
  const factory = (mod as { default: typeof glFactory }).default;
  const probe = factory ? factory(8, 8) : null;
  if (probe) glFactory = factory;
} catch {
  glFactory = null;
}

describe('WebGLNoteBackend real rasterization (headless-gl)', () => {
  it.skipIf(!glFactory)('renders visible, correctly-colored note pixels', () => {
    const W = 320, H = 240;
    const gl = glFactory!(W, H, { preserveDrawingBuffer: true, alpha: true, premultipliedAlpha: true });
    expect(gl).toBeTruthy();
    const canvas = { width: W, height: H, getContext: () => gl } as unknown as HTMLCanvasElement;
    const b = new WebGLNoteBackend(canvas);
    b.resize(W, H, 1);
    const layout = buildKeyboard(60, 72, W);
    // One bright right-hand note centered on screen.
    const scene: NoteScene = {
      notes: [note(5, 1, 64, 'right')], layout, pps: 100, position: 5,
      keyboardTop: H, cssH: H, theme: defaultTheme,
    };
    b.draw(scene);
    expect(b.lastCount).toBe(1);
    const px = new Uint8Array(W * H * 4);
    gl!.readPixels(0, 0, W, H, gl!.RGBA, gl!.UNSIGNED_BYTE, px);
    let opaque = 0;
    let blueish = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] > 40) {
        opaque++;
        if (px[i + 2] > px[i] && px[i + 2] > px[i + 1]) blueish++; // blue dominant
      }
    }
    expect(opaque).toBeGreaterThan(100); // the note actually rasterized
    expect(blueish).toBeGreaterThan(100); // and it is the right-hand blue
    b.dispose();
  });
});