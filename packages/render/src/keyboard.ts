export interface Key {
  midi: number;
  isBlack: boolean;
  x: number;
  width: number;
}

export interface KeyboardLayout {
  keys: Key[];
  byMidi: Map<number, Key>;
  whiteWidth: number;
  startMidi: number;
  endMidi: number;
  width: number;
}

const BLACK = new Set([1, 3, 6, 8, 10]);

export function isBlackKey(midi: number): boolean {
  return BLACK.has(((midi % 12) + 12) % 12);
}

/** Build keyboard geometry for a pitch range scaled to `width` pixels. */
export function buildKeyboard(startMidi: number, endMidi: number, width: number): KeyboardLayout {
  let whites = 0;
  for (let m = startMidi; m <= endMidi; m++) if (!isBlackKey(m)) whites++;
  const whiteWidth = width / Math.max(1, whites);
  const whiteX = new Map<number, number>();
  let wi = 0;
  for (let m = startMidi; m <= endMidi; m++) {
    if (!isBlackKey(m)) {
      whiteX.set(m, wi * whiteWidth);
      wi++;
    }
  }
  const keys: Key[] = [];
  const byMidi = new Map<number, Key>();
  const bw = whiteWidth * 0.62;
  for (let m = startMidi; m <= endMidi; m++) {
    let key: Key;
    if (!isBlackKey(m)) {
      key = { midi: m, isBlack: false, x: whiteX.get(m)!, width: whiteWidth };
    } else {
      const px = whiteX.get(m - 1) ?? 0;
      key = { midi: m, isBlack: true, x: px + whiteWidth - bw / 2, width: bw };
    }
    keys.push(key);
    byMidi.set(m, key);
  }
  return { keys, byMidi, whiteWidth, startMidi, endMidi, width };
}

/** Hit-test a point inside the keyboard area (y relative to keyboard top). */
export function keyAt(layout: KeyboardLayout, x: number, y: number, keyboardHeight: number): number | null {
  const blackRegion = y < keyboardHeight * 0.62;
  if (blackRegion) {
    for (const k of layout.keys) {
      if (k.isBlack && x >= k.x && x <= k.x + k.width) return k.midi;
    }
  }
  for (const k of layout.keys) {
    if (!k.isBlack && x >= k.x && x <= k.x + k.width) return k.midi;
  }
  return null;
}
