import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startWelcome } from '../src/welcome';

// Controllable rAF + window + canvas mocks so the attract animation runs headless.
type FrameCb = (t: number) => void;
let pending: Map<number, FrameCb>;
let nextId: number;
let listeners: Record<string, FrameCb | (() => void)>;
let now: number;

function mockCtx() {
  const noop = () => {};
  const gradient = () => ({ addColorStop: noop });
  const ctx = {
    fillStyle: '', globalAlpha: 1, shadowColor: '', shadowBlur: 0,
    fillRect: noop, setTransform: noop, save: noop, restore: noop,
    beginPath: noop, moveTo: noop, arcTo: noop, closePath: noop, fill: noop,
    createLinearGradient: gradient, createRadialGradient: gradient,
    fills: 0,
  };
  ctx.fillRect = () => { ctx.fills++; };
  return ctx;
}
function mockCanvas(ctx: ReturnType<typeof mockCtx>) {
  return {
    clientWidth: 1000, clientHeight: 600, width: 0, height: 0,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement & { clientWidth: number; clientHeight: number };
}
function pump(t: number): void {
  now = t;
  const cbs = [...pending.values()];
  pending.clear();
  cbs.forEach((cb) => cb(t));
}

beforeEach(() => {
  pending = new Map();
  nextId = 1;
  listeners = {};
  now = 0;
  (globalThis as unknown as Record<string, unknown>).window = {
    devicePixelRatio: 1,
    addEventListener: (ev: string, fn: () => void) => { listeners[ev] = fn; },
    removeEventListener: (ev: string, fn: () => void) => { if (listeners[ev] === fn) delete listeners[ev]; },
  };
  (globalThis as unknown as Record<string, unknown>).performance = { now: () => now };
  (globalThis as unknown as Record<string, unknown>).requestAnimationFrame = (cb: FrameCb) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  };
  (globalThis as unknown as Record<string, unknown>).cancelAnimationFrame = (id: number) => { pending.delete(id); };
});
afterEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.window; delete g.performance; delete g.requestAnimationFrame; delete g.cancelAnimationFrame;
});

describe('welcome attract animation (headless runtime)', () => {
  it('sizes the canvas to the element and draws on the first frame', () => {
    const ctx = mockCtx();
    const canvas = mockCanvas(ctx);
    const stop = startWelcome(canvas);
    expect(canvas.width).toBe(1000); // dpr 1
    expect(canvas.height).toBe(600);
    expect(pending.size).toBe(1); // one frame scheduled
    pump(16);
    expect(ctx.fills).toBeGreaterThan(0); // background + keys + notes drawn
    expect(pending.size).toBe(1); // re-scheduled exactly one next frame
    stop();
  });

  it('responds to resize by re-sizing the backing store', () => {
    const ctx = mockCtx();
    const canvas = mockCanvas(ctx);
    const stop = startWelcome(canvas);
    canvas.clientWidth = 500;
    canvas.clientHeight = 300;
    (listeners.resize as () => void)();
    expect(canvas.width).toBe(500);
    expect(canvas.height).toBe(300);
    stop();
  });

  it('stop() cancels the loop and removes the resize listener (no leak, no duplicate loops)', () => {
    const ctx = mockCtx();
    const canvas = mockCanvas(ctx);
    const stop = startWelcome(canvas);
    pump(16);
    const fillsBefore = ctx.fills;
    stop();
    expect(pending.size).toBe(0); // cancelled
    expect(listeners.resize).toBeUndefined(); // removed
    pump(32); // a stray frame must not draw or re-schedule
    expect(ctx.fills).toBe(fillsBefore);
    expect(pending.size).toBe(0);
    // Starting again after stop creates exactly one loop, not two.
    const stop2 = startWelcome(canvas);
    expect(pending.size).toBe(1);
    pump(48);
    expect(pending.size).toBe(1);
    stop2();
    expect(pending.size).toBe(0);
  });
});
