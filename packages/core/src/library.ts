/**
 * Pure library-sorting logic (no DOM) so the song browser's sort orders are
 * unit-testable headlessly. `recommended` preserves the curated/bundled order.
 */

export type LibrarySort =
  | 'recommended'
  | 'title'
  | 'difficulty'
  | 'difficulty-desc'
  | 'duration'
  | 'recent'
  | 'grade'
  | 'favorites';

export const LIBRARY_SORTS: LibrarySort[] = [
  'recommended', 'title', 'difficulty', 'difficulty-desc', 'duration', 'recent', 'grade', 'favorites',
];

export function isLibrarySort(v: unknown): v is LibrarySort {
  return typeof v === 'string' && (LIBRARY_SORTS as string[]).includes(v);
}

export interface LibraryMeta {
  title: string;
  /** 1..5; higher = harder. Unknown sorts last for ascending difficulty. */
  difficulty: number;
  /** seconds; unknown sorts last. */
  duration: number;
  /** epoch ms of last practice; 0 = never played (sorts last for `recent`). */
  lastPlayedAt: number;
  /** 0..1 best accuracy; -1 = never played (sorts last for `grade`). */
  bestAccuracy: number;
  favorite: boolean;
}

const DEFAULT_META: LibraryMeta = {
  title: '', difficulty: 99, duration: Number.POSITIVE_INFINITY, lastPlayedAt: 0, bestAccuracy: -1, favorite: false,
};

/**
 * Return a new array of ids sorted by `key`. Stable: ties (and `recommended`)
 * keep the input order. Missing metadata falls back to sane defaults so unknown
 * songs never crash the sort and sink to the bottom of ranked orders.
 */
export function sortLibrary(
  ids: string[],
  key: LibrarySort,
  meta: (id: string) => LibraryMeta | undefined,
): string[] {
  const get = (id: string): LibraryMeta => meta(id) ?? DEFAULT_META;
  const idx = new Map(ids.map((id, i) => [id, i]));
  const cmp = (a: string, b: string): number => {
    const ma = get(a);
    const mb = get(b);
    let d = 0;
    switch (key) {
      case 'title': d = ma.title.localeCompare(mb.title); break;
      case 'difficulty': d = ma.difficulty - mb.difficulty; break;
      case 'difficulty-desc': d = mb.difficulty - ma.difficulty; break;
      case 'duration': d = ma.duration - mb.duration; break;
      case 'recent': d = mb.lastPlayedAt - ma.lastPlayedAt; break;
      case 'grade': d = mb.bestAccuracy - ma.bestAccuracy; break;
      case 'favorites': d = Number(mb.favorite) - Number(ma.favorite); break;
      case 'recommended': d = 0; break;
    }
    return d !== 0 ? d : (idx.get(a)! - idx.get(b)!);
  };
  return [...ids].sort(cmp);
}

/**
 * Pure bulk-favorite transform: return a NEW set equal to `current` with every
 * id in `ids` added (favorite=true) or removed (favorite=false). Never mutates
 * the inputs; duplicate ids are idempotent. Powers the library's multi-select
 * "Favorite / Unfavorite" actions (and their undo snapshots).
 */
export function applyBulkFavorite(
  current: Iterable<string>,
  ids: Iterable<string>,
  favorite: boolean,
): Set<string> {
  const next = new Set(current);
  for (const id of ids) {
    if (favorite) next.add(id);
    else next.delete(id);
  }
  return next;
}

/**
 * Pure selection toggle: return a NEW set with `id` removed if present, added
 * otherwise. Never mutates the input. Powers per-row selection in select mode.
 */
export function toggleSelected(current: Iterable<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
