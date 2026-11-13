import { mergeRecord, type SessionResult, type SongRecord } from '@pianoflow/core';

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
