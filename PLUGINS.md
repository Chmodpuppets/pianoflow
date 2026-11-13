# 🧩 Writing PianoFlow plugins

PianoFlow ships a small, **platform-agnostic** plugin system. A plugin can react to
lifecycle events (a song loading, the transport moving, notes being judged, a run
finishing) and draw overlays on the playfield. The same API works headless in tests and
in the browser, because the core never touches the DOM.

- Source: [`packages/core/src/plugin.ts`](packages/core/src/plugin.ts)
- Built-ins: [`packages/core/src/plugins/`](packages/core/src/plugins/)
- Tests: [`packages/core/test/plugin.test.ts`](packages/core/test/plugin.test.ts)

## Design principles

1. **No DOM in the core.** Plugins receive a `DrawSurface` (a tiny method-based 2D API)
   and a `PluginHost` (callbacks). The web app adapts its canvas to these interfaces.
2. **Error isolation.** Every plugin call is wrapped. A plugin that throws is logged
   (`[plugin:<id>] …`) and skipped — it never crashes the app or blocks other plugins.
   A plugin whose `setup` throws is registered but disabled.
3. **Opt-in.** Plugins are enabled/disabled per id; the state is persisted with the
   user's settings. `defaultEnabled` controls the initial state (defaults to `true`).

## The `Plugin` interface

```ts
import type { Plugin, PluginHost, PluginEvent, DrawSurface, FrameInfo } from '@pianoflow/core';

interface Plugin {
  readonly id: string;                 // unique; duplicate ids throw on register
  readonly name: string;               // shown in the Plugins panel
  readonly version?: string;
  readonly description?: string;       // shown in the Plugins panel
  readonly defaultEnabled?: boolean;   // initial state (default true)

  setup?(host: PluginHost): void;      // once, on register
  teardown?(): void;                   // once, on unregister
  onEvent?(event: PluginEvent): void;  // every lifecycle event (when enabled)
  onDraw?(surface: DrawSurface, frame: FrameInfo): void; // every frame (when enabled)
}
```

All hooks are optional — implement only what you need.

## Events (`PluginEvent`)

| `type` | Payload | When |
| --- | --- | --- |
| `song-loaded` | `song: MidiSong` | a song is parsed and loaded |
| `transport` | `playing: boolean; position: number; speed: number` | play / pause / stop / seek / speed change |
| `note-hit` | `note: MidiNote; judgement: Judgement; combo: number` | a correct key in Practice (`judgement` is `'perfect'` or `'good'`) |
| `note-miss` | `note: MidiNote` | an expected note passed unplayed |
| `note-wrong` | `midi: number` | a key pressed that matches no expected note |
| `score-reset` | — | the score is cleared (new song, stop, mode change) |
| `frame` | `position: number; playing: boolean; dt: number` | every animation frame |
| `result` | `result: SessionResult; songId: string` | a Practice run finishes |
| `loop` | `start: number; end: number` | the A-B loop region wraps around (one lap completed) |

`Judgement` is `'perfect' | 'good' | 'miss' | 'wrong'`. `SessionResult` carries
`total / hits / perfect / good / miss / wrong / maxCombo / accuracy / grade`.

## Host callbacks (`PluginHost`)

```ts
interface PluginHost {
  readonly song: MidiSong | null;  // current song (or null)
  readonly position: number;       // current playback position, seconds
  readonly playing: boolean;
  play(): void;
  pause(): void;
  seek(time: number): void;
  setSpeed(speed: number): void;   // change playback speed (0.1–4)
  readonly loopEnabled: boolean;   // whether an A-B loop is active
  readonly loopStart: number | null;
  readonly loopEnd: number | null;
  setLoopEnabled(on: boolean): void;
  log(...args: unknown[]): void;   // console-backed logging
}
```

## Drawing overlays (`DrawSurface` + `FrameInfo`)

```ts
interface DrawSurface {
  save(): void;
  restore(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  setFillStyle(color: string): void;
  setFont(font: string): void;
  setTextAlign(align: 'left' | 'center' | 'right'): void;
  setGlobalAlpha(alpha: number): void;
}

interface FrameInfo {
  position: number;   // seconds
  playing: boolean;
  dt: number;         // seconds since the previous frame
  width: number;      // playfield size in CSS pixels
  height: number;
}
```

`onDraw` runs **after** the base scene each frame, so overlays sit on top. Coordinates
are CSS pixels with the origin at the top-left of the playfield.

> **Always restore state.** Wrap drawing in `save()` / `restore()` and reset
> `setGlobalAlpha(1)` when done. The renderer also defensively resets canvas state at the
> start of every frame, so a forgetful plugin cannot corrupt the base scene — but
> well-behaved plugins should still clean up after themselves.

## Worked example: a "speed badge" overlay

```ts
import type { Plugin, PluginEvent, DrawSurface, FrameInfo } from '@pianoflow/core';

export class SpeedBadgePlugin implements Plugin {
  readonly id = 'speed-badge';
  readonly name = 'Speed badge';
  readonly version = '1.0.0';
  readonly description = 'Shows the current playback speed in the corner.';

  private speed = 1;

  onEvent(event: PluginEvent): void {
    if (event.type === 'transport') this.speed = event.speed;
    if (event.type === 'song-loaded') this.speed = 1;
  }

  onDraw(surface: DrawSurface, frame: FrameInfo): void {
    if (this.speed === 1) return; // only show when slowed down / sped up
    surface.save();
    surface.setGlobalAlpha(0.9);
    surface.setFillStyle('#ffd166');
    surface.setFont('bold 14px sans-serif');
    surface.setTextAlign('right');
    surface.fillText(`${this.speed.toFixed(2)}×`, frame.width - 12, 24);
    surface.restore();
    surface.setGlobalAlpha(1);
  }
}
```

## Registering a plugin

In the web app, plugins are registered on the app's `PluginManager`
(`app.plugins`). The bundled ones are added in `apps/web/src/app.ts`:

```ts
import { PluginManager, createBuiltinPlugins } from '@pianoflow/core';

this.plugins = new PluginManager(host);
for (const p of createBuiltinPlugins()) this.plugins.register(p);
// add your own:
this.plugins.register(new SpeedBadgePlugin());
```

`createBuiltinPlugins()` returns fresh instances of the six bundled plugins. To ship a
new built-in, add it to that factory in
[`packages/core/src/plugins/index.ts`](packages/core/src/plugins/index.ts).

### `PluginManager` API

```ts
register(plugin: Plugin): void;        // duplicate id throws; setup failure disables
unregister(id: string): void;          // calls teardown
setEnabled(id: string, on: boolean): void;
isEnabled(id: string): boolean;
get(id: string): Plugin | undefined;
list(): PluginInfo[];                  // { id, name, version?, description?, enabled }
states(): Record<string, boolean>;     // enabled snapshot, for persistence
emit(event: PluginEvent): void;        // dispatch to enabled plugins
draw(surface: DrawSurface, frame: FrameInfo): void;
```

The Plugins panel reads `list()` and toggles via `setEnabled()`; the resulting `states()`
are saved with the user's settings and restored on startup.

## Bundled plugins

| id | Class | Default | Behavior |
| --- | --- | --- | --- |
| `combo-overlay` | `ComboOverlayPlugin` | on | live combo counter (color tiers at 20 / 50) + a 0.5 s fading judgement flash; invisible in Listen mode |
| `session-stats` | `SessionStatsPlugin` | on | tallies hits / perfect / good / miss / wrong / max combo; resets on `score-reset`; logs a summary on `result` |
| `auto-pause` | `AutoPausePlugin` | off | pauses after N consecutive misses / wrong notes (constructor `{ threshold }`, default 3) so the player can recover |
| `practice-hud` | `PracticeHudPlugin` | off | live accuracy percentage + a song-progress bar at the top of the playfield; accuracy appears once notes are judged |
| `tempo-trainer` | `TempoTrainerPlugin` | off | starts slow and steps the speed up after consecutive clean passes toward a target (constructor `{ startSpeed, targetSpeed, step, passesRequired, accuracyThreshold }`); drives `host.setSpeed`, speed-ups trigger on `result` (Practice only) |
| `loop-trainer` | `LoopTrainerPlugin` | off | drills the A-B loop region: per-lap accuracy + lap counter, optional speed-up after consecutive clean laps (constructor `{ speedUp, step, targetSpeed, cleanLapsRequired, accuracyThreshold }`); reads `host.loopStart/loopEnd`, reacts to the `loop` event |

## Testing a plugin (headless)

Because the API is DOM-free, plugins are unit-testable with plain objects:

```ts
import { PluginManager, type PluginHost } from '@pianoflow/core';

const host: PluginHost = {
  song: null, position: 0, playing: false,
  loopEnabled: false, loopStart: null, loopEnd: null,
  play() {}, pause() { this.playing = false; }, seek() {}, setSpeed() {}, setLoopEnabled() {}, log() {},
};
const manager = new PluginManager(host);
manager.register(new SpeedBadgePlugin());
manager.emit({ type: 'transport', playing: true, position: 0, speed: 0.5 });

// A recording DrawSurface lets you assert what was drawn:
const texts: string[] = [];
const surface = {
  save() {}, restore() {}, fillRect() {},
  fillText: (t: string) => texts.push(t),
  setFillStyle() {}, setFont() {}, setTextAlign() {}, setGlobalAlpha() {},
};
manager.draw(surface, { position: 0, playing: true, dt: 0.016, width: 800, height: 600 });
// assert texts contains "0.50×"
```

See [`packages/core/test/plugin.test.ts`](packages/core/test/plugin.test.ts) for the full
suite, including error-isolation and enable/disable dispatch tests.

## Guidelines

- Keep `onEvent` / `onDraw` fast — they run on the main thread every frame.
- Don't allocate large objects per frame; reuse buffers where you can.
- Restore drawing state (`save`/`restore`, alpha back to 1).
- Use `host.log` for diagnostics rather than throwing.
- Give every plugin a stable, unique `id` (it is the persistence key).
