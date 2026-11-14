import { describe, it, expect } from 'vitest';
import { sortLibrary, isLibrarySort, LIBRARY_SORTS, type LibraryMeta, type LibrarySort } from '../src/library';

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
