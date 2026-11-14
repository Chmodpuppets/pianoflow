import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';

import { PianoFlowApp } from '../src/app';
import { parseMidi, type MidiNote } from '@pianoflow/core';

// ---- controllable Web Audio clock -------------------------------------------
let mockTime = 0;
class MockParam {
  value = 0;
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
  linearRampToValueAtTime() {}
  cancelScheduledValues() {}
  setTargetAtTime() {}
}
class MockGain {
  gain = new MockParam();
  connect() {}
  disconnect() {}
}
class MockOsc {
  type = 'sine';
  frequency = new MockParam();
  onended: (() => void) | null = null;
  connect() {}
  start() {}
  stop() {}
}
class MockAudioContext {
  destination = {};
  state = 'running';
  get currentTime() {
    return mockTime;
  }
  createGain() {
    return new MockGain();
  }
  createOscillator() {
    return new MockOsc();
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

const winListeners = new Map<string, Set<(e: unknown) => void>>();
function makeCanvas() {
  const c = createCanvas(1280, 800) as unknown as Record<string, unknown>;
  c.style = { width: '', height: '', touchAction: '' };
  c.addEventListener = () => {};
  c.removeEventListener = () => {};
  c.setPointerCapture = () => {};
  c.releasePointerCapture = () => {};
  c.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 800 });
  return c as unknown as HTMLCanvasElement;
}

const twinkleBytes = readFileSync(
  fileURLToPath(new URL('../public/songs/twinkle.mid', import.meta.url)),
);
const twinkleBuf = twinkleBytes.buffer.slice(
  twinkleBytes.byteOffset,
  twinkleBytes.byteOffset + twinkleBytes.byteLength,
) as ArrayBuffer;

let app: PianoFlowApp;
let results: { result: import('@pianoflow/core').SessionResult; songId: string }[] = [];

beforeAll(() => {
  // The mock AudioContext lacks the full node graph smplr wants, so the engine
  // logs a fallback warning and uses its built-in synth — silence that noise.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  (globalThis as Record<string, unknown>).AudioContext = MockAudioContext;
  (globalThis as Record<string, unknown>).window = {
    devicePixelRatio: 1,
    addEventListener: (t: string, fn: (e: unknown) => void) => {
      if (!winListeners.has(t)) winListeners.set(t, new Set());
      winListeners.get(t)!.add(fn);
    },
    removeEventListener: (t: string, fn: (e: unknown) => void) => {
      winListeners.get(t)?.delete(fn);
    },
  };
  (globalThis as Record<string, unknown>).document = { baseURI: 'http://localhost:5173/' };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
});

afterAll(() => {
  delete (globalThis as Record<string, unknown>).AudioContext;
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).document;
  Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true, writable: true });
});

beforeEach(() => {
  vi.useFakeTimers();
  mockTime = 0;
  results = [];
  app = new PianoFlowApp(makeCanvas());
  app.resize(1280, 800);
  // Rendering is verified separately (renderer tests + render-preview harness);
  // here we isolate the controller logic so the loop runs fast without software
  // rasterizing hundreds of shadow-blurred frames.
  vi.spyOn(app.renderer, 'render').mockImplementation(() => {});
  vi.spyOn(app.plugins, 'draw').mockImplementation(() => {});
  app.onResult = (result, songId) => results.push({ result, songId });
});

afterEach(() => {
  app.dispose();
  vi.useRealTimers();
});

/** Advance the audio clock by dt seconds, fire one scheduler tick, render a frame. */
function step(dt = 0.02): void {
  mockTime += dt;
  vi.advanceTimersByTime(25);
  app.frame();
}

function activeNotes(): MidiNote[] {
  return (app as unknown as { active: MidiNote[] }).active;
}
function judgedFlags(): boolean[] {
  return (app as unknown as { judged: boolean[] }).judged;
}
function hit(midi: number): void {
  (app as unknown as { handleNoteOn: (m: number, v: number) => void }).handleNoteOn(midi, 0.8);
  (app as unknown as { handleNoteOff: (m: number) => void }).handleNoteOff(midi);
}

async function load(): Promise<void> {
  await app.loadBuffer(twinkleBuf, 'Twinkle Twinkle', 'twinkle');
}

describe('PianoFlowApp full playable loop (headless integration)', () => {
  it('loads a song and derives playable, hand-assigned, keyboard-fitted notes', async () => {
    await load();
    const st = app.getState();
    expect(st.songId).toBe('twinkle');
    expect(st.duration).toBeGreaterThan(0);
    const notes = activeNotes();
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((n) => n.hand === 'left' || n.hand === 'right')).toBe(true);
    // Auto-fit keyboard narrowed the full 88-key range to the song span.
    const cfg = (app.renderer as unknown as { config: { startMidi: number; endMidi: number } }).config;
    expect(cfg.endMidi - cfg.startMidi).toBeLessThan(87);
  });

  it('perfect practice run scores every note and emits an S-grade result once', async () => {
    await load();
    app.setMode('practice');
    const notes = activeNotes();
    const judged = judgedFlags();
    const total = notes.length;
    await app.play();
    let ptr = 0;
    let guard = 0;
    while (app.engine.position < app.getState().duration && guard++ < 20000) {
      const pos = app.engine.position;
      while (ptr < total && notes[ptr].time <= pos + 0.03) {
        if (!judged[ptr]) hit(notes[ptr].midi);
        ptr++;
      }
      step(0.02);
    }
    step(0.05);
    expect(results.length).toBe(1);
    const r = results[0].result;
    expect(results[0].songId).toBe('twinkle');
    expect(r.hits).toBe(total);
    expect(r.miss).toBe(0);
    expect(r.wrong).toBe(0);
    expect(r.accuracy).toBeCloseTo(1, 5);
    expect(r.grade).toBe('S');
    expect(r.maxCombo).toBe(total);
  });

  it('fires a combo-milestone celebration at 10 hits and a miss flash on a miss', async () => {
    await load();
    app.setMode('practice');
    const notes = activeNotes();
    const judged = judgedFlags();
    const milestoneSpy = vi.spyOn(app.renderer, 'notifyMilestone');
    const chimeSpy = vi.spyOn(app.engine, 'playMilestone');
    const missSpy = vi.spyOn(app.renderer, 'notifyMiss');
    await app.play();
    let ptr = 0;
    let hits = 0;
    let guard = 0;
    while (hits < 10 && guard++ < 20000) {
      const pos = app.engine.position;
      while (ptr < notes.length && notes[ptr].time <= pos + 0.03) {
        if (!judged[ptr]) {
          hit(notes[ptr].midi);
          hits++;
        }
        ptr++;
        if (hits >= 10) break;
      }
      step(0.02);
    }
    expect(hits).toBe(10);
    expect(milestoneSpy).toHaveBeenCalledWith(10);
    expect(chimeSpy).toHaveBeenCalledWith(10);
    // Stop hitting: the next note passes unplayed -> a miss flashes the stage.
    let g2 = 0;
    while (missSpy.mock.calls.length === 0 && g2++ < 2000) step(0.05);
    expect(missSpy).toHaveBeenCalled();
  });

  it('a silent practice run misses every note and emits a D-grade result', async () => {
    await load();
    app.setMode('practice');
    const total = activeNotes().length;
    await app.play();
    let guard = 0;
    while (app.engine.position < app.getState().duration && guard++ < 20000) step(0.05);
    step(0.05);
    expect(results.length).toBe(1);
    const r = results[0].result;
    expect(r.miss).toBe(total);
    expect(r.hits).toBe(0);
    expect(r.accuracy).toBe(0);
    expect(r.grade).toBe('D');
  });

  it('a wrong key registers a wrong note and breaks the combo', async () => {
    await load();
    app.setMode('practice');
    await app.play();
    step(0.02);
    hit(21); // A0 — never in Twinkle
    const st = app.getState();
    expect(st.score.wrong).toBe(1);
    expect(st.lastJudge).toBe('wrong');
    expect(st.score.combo).toBe(0);
  });

  it('wait mode pauses at the first chord and resumes only once all its notes are hit', async () => {
    await load();
    app.setMode('practice');
    app.setWaitMode(true);
    await app.play();
    step(0.02);
    expect(app.getState().playing).toBe(false); // paused waiting for input
    const internals = app as unknown as { waitIndex: number; waitEnd: number };
    const { waitIndex, waitEnd } = internals;
    expect(waitIndex).toBeGreaterThanOrEqual(0);
    expect(waitEnd).toBeGreaterThan(waitIndex);
    const notes = activeNotes();
    // Hit all but the last note of the chord — must stay paused.
    for (let i = waitIndex; i < waitEnd - 1; i++) hit(notes[i].midi);
    if (waitEnd - waitIndex > 1) expect(app.getState().playing).toBe(false);
    hit(notes[waitEnd - 1].midi);
    // resumeFromWait() calls the async engine.play(); flush its microtask.
    await Promise.resolve();
    await Promise.resolve();
    expect(app.getState().playing).toBe(true); // chord complete -> resumed
  });

  it('listen mode advances the clock and never emits a practice result', async () => {
    await load();
    app.setMode('listen');
    await app.play();
    expect(app.getState().playing).toBe(true);
    for (let i = 0; i < 20; i++) step(0.05);
    expect(app.engine.position).toBeGreaterThan(0.5);
    expect(results.length).toBe(0);
  });

  it('transpose shifts the playable notes and re-fits the keyboard', async () => {
    await load();
    const before = activeNotes()[0].midi;
    const cfgBefore = (app.renderer as unknown as { config: { startMidi: number } }).config.startMidi;
    app.setTranspose(3);
    expect(app.getState().transpose).toBe(3);
    expect(activeNotes()[0].midi).toBe(before + 3);
    const cfgAfter = (app.renderer as unknown as { config: { startMidi: number } }).config.startMidi;
    expect(cfgAfter).not.toBe(cfgBefore);
  });

  it('records a performance and exports a MIDI file that round-trips through the parser', async () => {
    await load();
    app.startRecording();
    expect(app.getState().recording).toBe(true);
    hit(60);
    hit(64);
    hit(67);
    const bytes = app.buildRecordingMidi();
    expect(bytes).not.toBeNull();
    expect(app.getState().recording).toBe(false);
    const parsed = parseMidi(bytes!.buffer as ArrayBuffer);
    expect(parsed.notes.length).toBe(3);
    expect(parsed.notes.map((n) => n.midi).sort((a, b) => a - b)).toEqual([60, 64, 67]);
  });
});
