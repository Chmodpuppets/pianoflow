import { describe, it, expect } from 'vitest';
import {
  PluginManager,
  SessionStatsPlugin,
  AutoPausePlugin,
  ComboOverlayPlugin,
  PracticeHudPlugin,
  createBuiltinPlugins,
  type Plugin,
  type PluginEvent,
  type PluginHost,
  type DrawSurface,
  type FrameInfo,
} from '../src/index';
import type { MidiNote, MidiSong } from '../src/index';

function note(midi: number, time = 0): MidiNote {
  return { midi, ticks: 0, durationTicks: 0, time, duration: 0.2, velocity: 0.8, channel: 0, track: 0 };
}
function frame(dt: number, width = 800, height = 600): FrameInfo {
  return { position: 0, playing: true, dt, width, height };
}

function makeHost() {
  const calls = { play: 0, pause: 0, seek: [] as number[], logs: [] as unknown[][] };
  const host: PluginHost & { playing: boolean } = {
    song: null,
    position: 0,
    playing: true,
    play() {
      calls.play++;
    },
    pause() {
      calls.pause++;
      host.playing = false;
    },
    seek(t: number) {
      calls.seek.push(t);
    },
    log(...args: unknown[]) {
      calls.logs.push(args);
    },
  };
  return { host, calls };
}

function makeSurface() {
  const ops: string[] = [];
  const texts: { text: string; x: number; y: number }[] = [];
  const surface: DrawSurface = {
    save() {
      ops.push('save');
    },
    restore() {
      ops.push('restore');
    },
    fillRect(x, y, w, h) {
      ops.push(`fillRect:${x},${y},${w},${h}`);
    },
    fillText(text, x, y) {
      texts.push({ text, x, y });
    },
    setFillStyle(c) {
      ops.push(`fillStyle:${c}`);
    },
    setFont(f) {
      ops.push(`font:${f}`);
    },
    setTextAlign(a) {
      ops.push(`align:${a}`);
    },
    setGlobalAlpha(a) {
      ops.push(`alpha:${a}`);
    },
  };
  return { surface, ops, texts };
}

function recorder(id: string): Plugin & { events: PluginEvent[]; draws: number } {
  return {
    id,
    name: id,
    events: [] as PluginEvent[],
    draws: 0,
    onEvent(e: PluginEvent) {
      this.events.push(e);
    },
    onDraw() {
      this.draws++;
    },
  };
}

describe('PluginManager', () => {
  it('registers plugins and lists them as enabled by default', () => {
    const { host } = makeHost();
    const m = new PluginManager(host);
    m.register(recorder('a'));
    const list = m.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'a', name: 'a', enabled: true });
  });

  it('rejects duplicate ids', () => {
    const { host } = makeHost();
    const m = new PluginManager(host);
    m.register(recorder('a'));
    expect(() => m.register(recorder('a'))).toThrow(/already registered/);
  });

  it('honors defaultEnabled=false', () => {
    const { host } = makeHost();
    const m = new PluginManager(host);
    m.register({ id: 'x', name: 'x', defaultEnabled: false });
    expect(m.isEnabled('x')).toBe(false);
  });

  it('dispatches events only to enabled plugins', () => {
    const { host } = makeHost();
    const m = new PluginManager(host);
    const a = recorder('a');
    const b = recorder('b');
    m.register(a);
    m.register(b);
    m.setEnabled('b', false);
    m.emit({ type: 'score-reset' });
    expect(a.events).toHaveLength(1);
    expect(b.events).toHaveLength(0);
    m.setEnabled('b', true);
    m.emit({ type: 'score-reset' });
    expect(b.events).toHaveLength(1);
  });

  it('dispatches draw only to enabled plugins', () => {
    const { host } = makeHost();
    const m = new PluginManager(host);
    const a = recorder('a');
    const b = recorder('b');
    m.register(a);
    m.register(b);
    m.setEnabled('b', false);
    const { surface } = makeSurface();
    m.draw(surface, frame(0.016));
    expect(a.draws).toBe(1);
    expect(b.draws).toBe(0);
  });

  it('isolates a throwing plugin so others still run, and logs the error', () => {
    const { host, calls } = makeHost();
    const m = new PluginManager(host);
    const bad: Plugin = {
      id: 'bad',
      name: 'bad',
      onEvent() {
        throw new Error('boom');
      },
    };
    const good = recorder('good');
    m.register(bad);
    m.register(good);
    expect(() => m.emit({ type: 'score-reset' })).not.toThrow();
    expect(good.events).toHaveLength(1);
    expect(calls.logs.some((l) => String(l[0]).includes('bad'))).toBe(true);
  });

  it('disables a plugin whose setup throws', () => {
    const { host, calls } = makeHost();
    const m = new PluginManager(host);
    m.register({
      id: 'bad',
      name: 'bad',
      setup() {
        throw new Error('init failed');
      },
    });
    expect(m.isEnabled('bad')).toBe(false);
    expect(calls.logs.length).toBeGreaterThan(0);
  });

  it('unregister calls teardown and removes the plugin', () => {
    const { host } = makeHost();
    const m = new PluginManager(host);
    let torn = 0;
    m.register({ id: 'a', name: 'a', teardown: () => torn++ });
    m.unregister('a');
    expect(torn).toBe(1);
    expect(m.list()).toHaveLength(0);
    m.unregister('missing'); // no-op
  });

  it('states() snapshots enabled flags', () => {
    const { host } = makeHost();
    const m = new PluginManager(host);
    m.register(recorder('a'));
    m.register({ id: 'b', name: 'b', defaultEnabled: false });
    expect(m.states()).toEqual({ a: true, b: false });
  });
});

describe('SessionStatsPlugin', () => {
  it('tallies judging events and tracks max combo', () => {
    const { host } = makeHost();
    const p = new SessionStatsPlugin();
    p.setup(host);
    p.onEvent({ type: 'note-hit', note: note(60), judgement: 'perfect', combo: 1 });
    p.onEvent({ type: 'note-hit', note: note(62), judgement: 'good', combo: 2 });
    p.onEvent({ type: 'note-hit', note: note(64), judgement: 'perfect', combo: 3 });
    p.onEvent({ type: 'note-miss', note: note(65) });
    p.onEvent({ type: 'note-wrong', midi: 99 });
    expect(p.stats).toMatchObject({ hits: 3, perfect: 2, good: 1, miss: 1, wrong: 1, maxCombo: 3 });
  });

  it('resets on score-reset', () => {
    const { host } = makeHost();
    const p = new SessionStatsPlugin();
    p.setup(host);
    p.onEvent({ type: 'note-hit', note: note(60), judgement: 'perfect', combo: 1 });
    p.onEvent({ type: 'score-reset' });
    expect(p.stats.hits).toBe(0);
    expect(p.stats.maxCombo).toBe(0);
  });

  it('logs a summary on result', () => {
    const { host, calls } = makeHost();
    const p = new SessionStatsPlugin();
    p.setup(host);
    p.onEvent({
      type: 'result',
      songId: 's',
      result: {
        total: 1, hits: 1, perfect: 1, good: 0, miss: 0, wrong: 0,
        maxCombo: 1, accuracy: 1, grade: 'S',
      },
    });
    expect(calls.logs.some((l) => l[0] === '[session-stats]')).toBe(true);
  });
});

describe('AutoPausePlugin', () => {
  it('is disabled by default', () => {
    expect(new AutoPausePlugin().defaultEnabled).toBe(false);
  });

  it('pauses after the threshold of consecutive mistakes', () => {
    const { host, calls } = makeHost();
    const p = new AutoPausePlugin({ threshold: 2 });
    p.setup(host);
    p.onEvent({ type: 'note-miss', note: note(60) });
    expect(calls.pause).toBe(0);
    p.onEvent({ type: 'note-wrong', midi: 61 });
    expect(calls.pause).toBe(1);
    expect(host.playing).toBe(false);
  });

  it('resets the streak on a hit', () => {
    const { host, calls } = makeHost();
    const p = new AutoPausePlugin({ threshold: 2 });
    p.setup(host);
    p.onEvent({ type: 'note-miss', note: note(60) });
    p.onEvent({ type: 'note-hit', note: note(60), judgement: 'good', combo: 1 });
    p.onEvent({ type: 'note-miss', note: note(62) });
    expect(calls.pause).toBe(0);
    expect(p.mistakes).toBe(1);
  });

  it('does not pause when already stopped', () => {
    const { host, calls } = makeHost();
    host.playing = false;
    const p = new AutoPausePlugin({ threshold: 1 });
    p.setup(host);
    p.onEvent({ type: 'note-miss', note: note(60) });
    expect(calls.pause).toBe(0);
  });
});

describe('ComboOverlayPlugin', () => {
  it('draws nothing when idle', () => {
    const p = new ComboOverlayPlugin();
    const { surface, texts } = makeSurface();
    p.onDraw(surface, frame(0.016));
    expect(texts).toHaveLength(0);
  });

  it('draws a combo counter once combo reaches 2', () => {
    const p = new ComboOverlayPlugin();
    p.onEvent({ type: 'note-hit', note: note(60), judgement: 'perfect', combo: 1 });
    const { surface, texts } = makeSurface();
    p.onDraw(surface, frame(0.016));
    expect(texts.some((t) => t.text === 'PERFECT')).toBe(true);
    expect(texts.some((t) => t.text.includes('COMBO'))).toBe(false); // combo 1 < 2
    p.onEvent({ type: 'note-hit', note: note(62), judgement: 'good', combo: 2 });
    const s2 = makeSurface();
    p.onDraw(s2.surface, frame(0.016));
    expect(s2.texts.some((t) => t.text === '2 COMBO')).toBe(true);
  });

  it('fades the judgement flash over time', () => {
    const p = new ComboOverlayPlugin();
    p.onEvent({ type: 'note-miss', note: note(60) });
    const s = makeSurface();
    p.onDraw(s.surface, frame(0.1));
    expect(s.texts.some((t) => t.text === 'MISS')).toBe(true);
    // After enough time the flash is gone (combo is 0, so nothing draws).
    const s2 = makeSurface();
    p.onDraw(s2.surface, frame(1.0));
    expect(s2.texts).toHaveLength(0);
  });

  it('clears on score-reset', () => {
    const p = new ComboOverlayPlugin();
    p.onEvent({ type: 'note-hit', note: note(60), judgement: 'perfect', combo: 5 });
    p.onEvent({ type: 'score-reset' });
    const { surface, texts } = makeSurface();
    p.onDraw(surface, frame(0.016));
    expect(texts).toHaveLength(0);
  });
});

describe('PracticeHudPlugin', () => {
  function hostWithSong(duration: number) {
    const { host, calls } = makeHost();
    host.song = { duration } as unknown as MidiSong;
    return { host, calls };
  }
  const at = (position: number): FrameInfo => ({ position, playing: true, dt: 0.016, width: 800, height: 600 });

  it('is disabled by default', () => {
    expect(new PracticeHudPlugin().defaultEnabled).toBe(false);
  });

  it('computes accuracy from hits vs judged', () => {
    const { host } = hostWithSong(10);
    const p = new PracticeHudPlugin();
    p.setup(host);
    expect(p.accuracy).toBe(0);
    p.onEvent({ type: 'note-hit', note: note(60), judgement: 'perfect', combo: 1 });
    p.onEvent({ type: 'note-hit', note: note(62), judgement: 'good', combo: 2 });
    p.onEvent({ type: 'note-hit', note: note(64), judgement: 'perfect', combo: 3 });
    p.onEvent({ type: 'note-miss', note: note(65) });
    expect(p.accuracy).toBeCloseTo(0.75);
  });

  it('draws nothing without a song', () => {
    const { host } = makeHost(); // song: null
    const p = new PracticeHudPlugin();
    p.setup(host);
    const { surface, ops, texts } = makeSurface();
    p.onDraw(surface, at(5));
    expect(ops).toHaveLength(0);
    expect(texts).toHaveLength(0);
  });

  it('draws a progress bar proportional to position', () => {
    const { host } = hostWithSong(10);
    const p = new PracticeHudPlugin();
    p.setup(host);
    const { surface, ops } = makeSurface();
    p.onDraw(surface, at(5)); // halfway
    expect(ops).toContain('fillRect:0,0,800,3'); // track
    expect(ops).toContain('fillRect:0,0,400,3'); // 50% fill
  });

  it('clamps progress to [0,1] and shows accuracy once judged', () => {
    const { host } = hostWithSong(10);
    const p = new PracticeHudPlugin();
    p.setup(host);
    p.onEvent({ type: 'note-hit', note: note(60), judgement: 'perfect', combo: 1 });
    p.onEvent({ type: 'note-wrong', midi: 99 });
    const { surface, ops, texts } = makeSurface();
    p.onDraw(surface, at(99)); // beyond duration -> clamped to full width
    expect(ops).toContain('fillRect:0,0,800,3');
    expect(texts.some((t) => t.text === 'Accuracy 50%')).toBe(true);
  });

  it('clears accuracy on score-reset', () => {
    const { host } = hostWithSong(10);
    const p = new PracticeHudPlugin();
    p.setup(host);
    p.onEvent({ type: 'note-hit', note: note(60), judgement: 'perfect', combo: 1 });
    p.onEvent({ type: 'score-reset' });
    expect(p.accuracy).toBe(0);
    const { surface, texts } = makeSurface();
    p.onDraw(surface, at(1));
    expect(texts).toHaveLength(0); // no accuracy readout when nothing judged
  });
});

describe('createBuiltinPlugins', () => {
  it('bundles the four built-ins with unique ids', () => {
    const plugins = createBuiltinPlugins();
    const ids = plugins.map((p) => p.id);
    expect(ids).toEqual(['session-stats', 'auto-pause', 'combo-overlay', 'practice-hud']);
    expect(new Set(ids).size).toBe(4);
  });

  it('registers and runs end-to-end through the manager', () => {
    const { host } = makeHost();
    const m = new PluginManager(host);
    for (const p of createBuiltinPlugins()) m.register(p);
    expect(m.list()).toHaveLength(4);
    expect(m.isEnabled('auto-pause')).toBe(false);
    expect(m.isEnabled('practice-hud')).toBe(false);
    const { surface } = makeSurface();
    m.emit({ type: 'note-hit', note: note(60), judgement: 'perfect', combo: 1 });
    m.draw(surface, frame(0.016));
    const stats = m.get('session-stats') as SessionStatsPlugin;
    expect(stats.stats.hits).toBe(1);
  });
});
