import { describe, it, expect } from 'vitest';
import { sortLibrary, isLibrarySort, applyBulkFavorite, toggleSelected, LIBRARY_SORTS, type LibraryMeta, type LibrarySort } from '../src/library';

const meta: Record<string, LibraryMeta> = {
  a: { title: 'Alpha', difficulty: 3, duration: 60, lastPlayedAt: 100, bestAccuracy: 0.8, favorite: false },
  b: { title: 'Beta', difficulty: 1, duration: 30, lastPlayedAt: 300, bestAccuracy: 0.95, favorite: true },
  c: { title: 'Gamma', difficulty: 5, duration: 90, lastPlayedAt: 0, bestAccuracy: -1, favorite: false },
  d: { title: 'Delta', difficulty: 2, duration: 45, lastPlayedAt: 200, bestAccuracy: 0.5, favorite: true },
};
const ids = ['a', 'b', 'c', 'd'];
const get = (id: string) => meta[id];

describe('sortLibrary', () => {
  it('recommended preserves input order', () => {
    expect(sortLibrary(ids, 'recommended', get)).toEqual(ids);
  });
  it('title sorts alphabetically', () => {
    expect(sortLibrary(ids, 'title', get)).toEqual(['a', 'b', 'd', 'c']);
  });
  it('difficulty ascending (easy first) and descending', () => {
    expect(sortLibrary(ids, 'difficulty', get)).toEqual(['b', 'd', 'a', 'c']);
    expect(sortLibrary(ids, 'difficulty-desc', get)).toEqual(['c', 'a', 'd', 'b']);
  });
  it('duration ascending (short first)', () => {
    expect(sortLibrary(ids, 'duration', get)).toEqual(['b', 'd', 'a', 'c']);
  });
  it('recent puts most-recently played first, never-played last', () => {
    expect(sortLibrary(ids, 'recent', get)).toEqual(['b', 'd', 'a', 'c']);
  });
  it('grade puts best accuracy first, never-played last', () => {
    expect(sortLibrary(ids, 'grade', get)).toEqual(['b', 'a', 'd', 'c']);
  });
  it('favorites puts favorited first (stable within group)', () => {
    expect(sortLibrary(ids, 'favorites', get)).toEqual(['b', 'd', 'a', 'c']);
  });
  it('is stable on ties', () => {
    const tie: Record<string, LibraryMeta> = {
      x: { ...meta.a, title: 'Same' }, y: { ...meta.b, title: 'Same' }, z: { ...meta.c, title: 'Same' },
    };
    expect(sortLibrary(['x', 'y', 'z'], 'title', (id) => tie[id])).toEqual(['x', 'y', 'z']);
  });
  it('missing metadata sinks to the bottom of ranked orders without crashing', () => {
    const out = sortLibrary(['a', 'unknown', 'b'], 'difficulty', get);
    expect(out[out.length - 1]).toBe('unknown');
    expect(out.slice(0, 2)).toEqual(['b', 'a']);
  });
  it('does not mutate the input array', () => {
    const input = [...ids];
    sortLibrary(input, 'title', get);
    expect(input).toEqual(ids);
  });
  it('exposes a valid sort list + guard', () => {
    expect(LIBRARY_SORTS.length).toBe(8);
    for (const s of LIBRARY_SORTS) expect(isLibrarySort(s)).toBe(true);
    expect(isLibrarySort('nope')).toBe(false);
    expect(isLibrarySort(null)).toBe(false);
  });
});

describe('applyBulkFavorite', () => {
  it('adds the selected ids when favoriting', () => {
    const out = applyBulkFavorite(['a'], ['b', 'c'], true);
    expect([...out].sort()).toEqual(['a', 'b', 'c']);
  });
  it('removes only the selected ids when unfavoriting', () => {
    const out = applyBulkFavorite(['a', 'b', 'c'], ['b'], false);
    expect([...out].sort()).toEqual(['a', 'c']);
  });
  it('is idempotent for duplicates and already-present / absent ids', () => {
    expect([...applyBulkFavorite(['a'], ['a', 'a', 'b'], true)].sort()).toEqual(['a', 'b']);
    expect([...applyBulkFavorite(['a'], ['x', 'y'], false)]).toEqual(['a']);
  });
  it('empty selection is a no-op copy', () => {
    const out = applyBulkFavorite(['a', 'b'], [], true);
    expect([...out].sort()).toEqual(['a', 'b']);
  });
  it('does not mutate the input set or ids', () => {
    const current = new Set(['a']);
    const ids = ['b', 'c'];
    applyBulkFavorite(current, ids, true);
    expect([...current]).toEqual(['a']);
    expect(ids).toEqual(['b', 'c']);
  });
  it('favorite then unfavorite round-trips to the original', () => {
    const start = new Set(['a']);
    const added = applyBulkFavorite(start, ['b', 'c'], true);
    const back = applyBulkFavorite(added, ['b', 'c'], false);
    expect([...back]).toEqual(['a']);
  });
});

describe('toggleSelected', () => {
  it('adds an id that is not selected', () => {
    expect([...toggleSelected(['a'], 'b')].sort()).toEqual(['a', 'b']);
  });
  it('removes an id that is already selected', () => {
    expect([...toggleSelected(['a', 'b'], 'b')]).toEqual(['a']);
  });
  it('does not mutate the input', () => {
    const current = new Set(['a']);
    toggleSelected(current, 'b');
    expect([...current]).toEqual(['a']);
  });
  it('toggling twice returns to the original', () => {
    const once = toggleSelected(['a'], 'b');
    const twice = toggleSelected(once, 'b');
    expect([...twice]).toEqual(['a']);
  });
});
