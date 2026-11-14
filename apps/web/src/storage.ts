import {
  mergeRecord,
  appendSession,
  isSessionEntry,
  DEFAULT_INSTRUMENT,
  type SessionResult,
  type SongRecord,
  type SessionEntry,
} from '@pianoflow/core';
import type { AppSettings } from './app';

const KEY = 'pianoflow.progress.v1';

function safeStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__pianoflow_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/**
 * localStorage-backed per-song progress. Degrades to an in-memory store when
 * storage is unavailable (private browsing, quota, SSR). All reads/writes are
 * guarded so a corrupt payload never crashes the app.
 */
export class ProgressStore {
  private cache: Record<string, SongRecord>;

  constructor(private storage: Storage | null = safeStorage()) {
    this.cache = this.read();
  }

  private read(): Record<string, SongRecord> {
    if (!this.storage) return {};
    try {
      const raw = this.storage.getItem(KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, SongRecord>) : {};
    } catch {
      return {};
    }
  }

  private write(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(KEY, JSON.stringify(this.cache));
    } catch {
      /* quota exceeded or private mode — keep the in-memory cache */
    }
  }

  getAll(): Record<string, SongRecord> {
    return this.cache;
  }

  get(id: string): SongRecord | undefined {
    return this.cache[id];
  }

  /** Fold a finished run into the record, persist, and return the merged record. */
  recordResult(id: string, result: SessionResult, now: number = Date.now()): SongRecord {
    const merged = mergeRecord(this.cache[id], result, now);
    this.cache[id] = merged;
    this.write();
    return merged;
  }

  clear(): void {
    this.cache = {};
    this.write();
  }
}

const SETTINGS_KEY = 'pianoflow.settings.v1';

export const DEFAULT_SETTINGS: AppSettings = {
  mode: 'listen',
  hands: 'both',
  waitMode: false,
  speed: 1,
  labels: false,
  noteLabels: false,
  colorblind: false,
  metronome: false,
  countIn: 0,
  muted: false,
  volume: 0.9,
  transpose: 0,
  splitMidi: 60,
  latencyMs: 0,
  instrument: DEFAULT_INSTRUMENT,
  fitKeyboard: true,
  handAssist: true,
  gpu: true,
  plugins: {},
};

/**
 * localStorage-backed user preferences. Merges over defaults so an older or
 * partial payload never crashes the app; degrades to in-memory when storage
 * is unavailable.
 */
export class SettingsStore {
  private cache: AppSettings;

  constructor(private storage: Storage | null = safeStorage()) {
    this.cache = this.read();
  }

  private read(): AppSettings {
    if (!this.storage) return { ...DEFAULT_SETTINGS };
    try {
      const raw = this.storage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed: unknown = JSON.parse(raw);
      const obj = parsed && typeof parsed === 'object' ? (parsed as Partial<AppSettings>) : {};
      return { ...DEFAULT_SETTINGS, ...obj };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  get(): AppSettings {
    return { ...this.cache };
  }

  save(s: AppSettings): void {
    this.cache = { ...s };
    if (!this.storage) return;
    try {
      this.storage.setItem(SETTINGS_KEY, JSON.stringify(this.cache));
    } catch {
      /* quota exceeded or private mode — keep the in-memory cache */
    }
  }
}

const HISTORY_KEY = 'pianoflow.history.v1';

/**
 * localStorage-backed practice session log (chronological, capped). Corrupt or
 * malformed entries are dropped on read; degrades to in-memory when storage is
 * unavailable. All writes are guarded.
 */
export class HistoryStore {
  private cache: SessionEntry[];

  constructor(
    private storage: Storage | null = safeStorage(),
    private maxEntries = 500,
  ) {
    this.cache = this.read();
  }

  private read(): SessionEntry[] {
    if (!this.storage) return [];
    try {
      const raw = this.storage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isSessionEntry).slice(-this.maxEntries);
    } catch {
      return [];
    }
  }

  private write(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(HISTORY_KEY, JSON.stringify(this.cache));
    } catch {
      /* quota exceeded or private mode — keep the in-memory cache */
    }
  }

  getAll(): SessionEntry[] {
    return this.cache;
  }

  /** Append a finished session and persist. */
  record(entry: SessionEntry): void {
    this.cache = appendSession(this.cache, entry, this.maxEntries);
    this.write();
  }

  clear(): void {
    this.cache = [];
    this.write();
  }
}
