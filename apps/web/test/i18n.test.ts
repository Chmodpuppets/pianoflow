import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MESSAGES,
  LANGS,
  INSTRUMENTS,
  createBuiltinPlugins,
  computeAchievements,
} from '@pianoflow/core';

/**
 * Completeness guard for the bilingual UI: every key the web app actually uses
 * (static `data-i18n*` attributes in index.html + literal `tr('…')` calls in
 * main.ts) must exist in the core catalogue in BOTH languages, and every
 * id-keyed family (instruments / plugins / achievements / genres / judgements /
 * weekdays) must be fully covered. A half-translated UI is a defect, so this
 * fails the build if any string is missing or one-sided.
 */

const root = fileURLToPath(new URL('../', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const main = readFileSync(root + 'src/main.ts', 'utf8');
const songs = JSON.parse(readFileSync(root + 'public/songs/songs.json', 'utf8')) as { genre?: string }[];

function assertKey(key: string): void {
  const entry = MESSAGES[key];
  expect(entry, `missing i18n key: ${key}`).toBeDefined();
  expect(entry.en.trim().length, `empty en for ${key}`).toBeGreaterThan(0);
  expect(entry.zh.trim().length, `empty zh for ${key}`).toBeGreaterThan(0);
}

/** Collect static keys from `tr('key'…)`, skipping dynamic `tr('prefix.' + …)`. */
function staticTrKeys(src: string): string[] {
  const keys: string[] = [];
  const re = /\btr\(\s*(['"])([^'"]+)\1\s*([+,)])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m[3] !== '+') keys.push(m[2]);
  }
  return keys;
}

describe('i18n UI coverage', () => {
  it('every data-i18n* attribute key exists in both languages', () => {
    const re = /data-i18n(?:-placeholder|-title|-aria)?="([^"]+)"/g;
    const keys = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) keys.add(m[1]);
    expect(keys.size).toBeGreaterThan(50); // the chrome is substantially tagged
    for (const key of keys) assertKey(key);
  });

  it('every literal tr() key in main.ts exists in both languages', () => {
    const keys = staticTrKeys(main);
    expect(keys.length).toBeGreaterThan(40);
    for (const key of keys) assertKey(key);
  });

  it('covers every instrument id', () => {
    for (const inst of INSTRUMENTS) assertKey('instrument.' + inst.id);
  });

  it('covers every built-in plugin name + description', () => {
    for (const p of createBuiltinPlugins()) {
      assertKey('plugin.' + p.id + '.name');
      assertKey('plugin.' + p.id + '.desc');
    }
  });

  it('covers every achievement title + description', () => {
    const ach = computeAchievements([], Date.now());
    expect(ach.length).toBeGreaterThanOrEqual(12);
    for (const a of ach) {
      assertKey('ach.' + a.id + '.title');
      assertKey('ach.' + a.id + '.desc');
    }
  });

  it('covers every genre used by the bundled songs (+ fallbacks)', () => {
    const genres = new Set<string>(['All Songs', 'Other', 'Local', 'Imported']);
    for (const s of songs) if (s.genre) genres.add(s.genre);
    for (const g of genres) assertKey('genre.' + g);
  });

  it('covers judgements, hands, modes, count-in and weekdays', () => {
    for (const j of ['perfect', 'good', 'miss', 'wrong']) assertKey('judge.' + j);
    for (const h of ['both', 'right', 'left']) assertKey('hands.' + h);
    for (const mo of ['listen', 'practice']) assertKey('mode.' + mo);
    for (const c of ['off', '1', '2', '4']) assertKey('countin.' + c);
    for (let d = 0; d < 7; d++) assertKey('hist.dow.' + d);
  });

  it('catalogue is fully bilingual (parity) and pickers match LANGS', () => {
    for (const [key, entry] of Object.entries(MESSAGES)) {
      expect(entry.en.trim().length, `empty en for ${key}`).toBeGreaterThan(0);
      expect(entry.zh.trim().length, `empty zh for ${key}`).toBeGreaterThan(0);
    }
    expect(LANGS.map((l) => l.id)).toEqual(['en', 'zh']);
  });
});
