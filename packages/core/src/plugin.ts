import type { MidiSong, MidiNote } from './types';
import type { Judgement } from './scoring';
import type { SessionResult } from './progress';

/**
 * Platform-agnostic plugin system.
 *
 * Plugins observe lifecycle events (song load, transport, note judging, results)
 * and may draw overlays through a minimal {@link DrawSurface}. The core never
 * touches the DOM: the host application adapts its canvas to a DrawSurface and
 * supplies a {@link PluginHost} for callbacks. Every plugin call is isolated so
 * one misbehaving plugin cannot crash the app or block the others.
 */

/** Events emitted by the host application. */
export type PluginEvent =
  | { type: 'song-loaded'; song: MidiSong }
  | { type: 'transport'; playing: boolean; position: number; speed: number }
  | { type: 'note-hit'; note: MidiNote; judgement: Judgement; combo: number }
  | { type: 'note-miss'; note: MidiNote }
  | { type: 'note-wrong'; midi: number }
  | { type: 'score-reset' }
  | { type: 'frame'; position: number; playing: boolean; dt: number }
  | { type: 'result'; result: SessionResult; songId: string };

/** Per-frame information passed to overlay drawing. */
export interface FrameInfo {
  position: number;
  playing: boolean;
  /** seconds since the previous frame */
  dt: number;
  width: number;
  height: number;
}

/**
 * A minimal 2D drawing surface. Method-based (rather than property-based) so it
 * stays free of DOM types and is trivial to mock in tests. The web app adapts a
 * CanvasRenderingContext2D to this interface.
 */
export interface DrawSurface {
  save(): void;
  restore(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  setFillStyle(color: string): void;
  setFont(font: string): void;
  setTextAlign(align: 'left' | 'center' | 'right'): void;
  setGlobalAlpha(alpha: number): void;
}

/** Callbacks a plugin can use to interact with the host application. */
export interface PluginHost {
  readonly song: MidiSong | null;
  readonly position: number;
  readonly playing: boolean;
  play(): void;
  pause(): void;
  seek(time: number): void;
  log(...args: unknown[]): void;
}

/** A PianoFlow plugin. All hooks are optional. */
export interface Plugin {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  /** Initial enabled state when registered (defaults to true). */
  readonly defaultEnabled?: boolean;
  /** Called once when registered. */
  setup?(host: PluginHost): void;
  /** Called once when unregistered. */
  teardown?(): void;
  /** Called for every lifecycle event (when enabled). */
  onEvent?(event: PluginEvent): void;
  /** Called every frame to draw an overlay (when enabled). */
  onDraw?(surface: DrawSurface, frame: FrameInfo): void;
}

export interface PluginInfo {
  id: string;
  name: string;
  version?: string;
  description?: string;
  enabled: boolean;
}

interface Entry {
  plugin: Plugin;
  enabled: boolean;
}

/**
 * Registers plugins and dispatches events / draw calls to the enabled ones.
 * Each plugin invocation is wrapped so a thrown error is logged and isolated.
 */
export class PluginManager {
  private entries = new Map<string, Entry>();

  constructor(private host: PluginHost) {}

  register(plugin: Plugin): void {
    if (this.entries.has(plugin.id)) {
      throw new Error(`Plugin "${plugin.id}" is already registered`);
    }
    const entry: Entry = { plugin, enabled: plugin.defaultEnabled ?? true };
    this.entries.set(plugin.id, entry);
    try {
      plugin.setup?.(this.host);
    } catch (err) {
      // A plugin that fails to initialize is disabled rather than crashing us.
      entry.enabled = false;
      this.host.log(`[plugin:${plugin.id}] setup failed`, err);
    }
  }

  unregister(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.safe(entry, () => entry.plugin.teardown?.());
    this.entries.delete(id);
  }

  setEnabled(id: string, enabled: boolean): void {
    const entry = this.entries.get(id);
    if (entry) entry.enabled = enabled;
  }

  isEnabled(id: string): boolean {
    return this.entries.get(id)?.enabled ?? false;
  }

  get(id: string): Plugin | undefined {
    return this.entries.get(id)?.plugin;
  }

  list(): PluginInfo[] {
    return [...this.entries.values()].map(({ plugin, enabled }) => ({
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      enabled,
    }));
  }

  /** Snapshot of enabled states, for persistence. */
  states(): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const [id, entry] of this.entries) out[id] = entry.enabled;
    return out;
  }

  emit(event: PluginEvent): void {
    for (const entry of this.entries.values()) {
      if (!entry.enabled) continue;
      this.safe(entry, () => entry.plugin.onEvent?.(event));
    }
  }

  draw(surface: DrawSurface, frame: FrameInfo): void {
    for (const entry of this.entries.values()) {
      if (!entry.enabled) continue;
      this.safe(entry, () => entry.plugin.onDraw?.(surface, frame));
    }
  }

  private safe(entry: Entry, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      this.host.log(`[plugin:${entry.plugin.id}]`, err);
    }
  }
}
