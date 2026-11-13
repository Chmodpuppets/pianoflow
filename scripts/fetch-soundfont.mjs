#!/usr/bin/env node
/**
 * Downloads the FluidR3_GM SoundFonts (from the official gleitz/midi-js-soundfonts
 * project) into apps/web/public/soundfont so PianoFlow can play real samples fully
 * offline, for every instrument in the bundled palette. Zero dependencies (Node >= 18 fetch).
 *
 * The files are the midi-js-soundfonts "MIDI.Soundfont." format that smplr's
 * Soundfont loads via `instrumentUrl`. mp3 is used because every browser
 * (including Safari) can decode it.
 *
 * Existing files are skipped (set FORCE=1 to re-download).
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'apps/web/public/soundfont');

// Keep in sync with packages/core/src/instruments.ts (INSTRUMENTS).
const INSTRUMENTS = [
  'acoustic_grand_piano',
  'electric_piano_1',
  'music_box',
  'vibraphone',
];

const exists = (p) => access(p).then(() => true, () => false);

async function fetchOne(id) {
  const outFile = join(outDir, `${id}-mp3.js`);
  if (!process.env.FORCE && (await exists(outFile))) {
    console.log(`[soundfont] skip ${id} (already bundled)`);
    return true;
  }
  // Same official files, two real sources. jsDelivr is usually much faster.
  const SOURCES = [
    `https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts/FluidR3_GM/${id}-mp3.js`,
    `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/${id}-mp3.js`,
  ];
  let lastErr;
  for (const url of SOURCES) {
    try {
      console.log(`[soundfont] fetching ${url}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.toString('latin1').includes('MIDI.Soundfont.')) {
        throw new Error('unexpected file format (not a midi-js-soundfonts file)');
      }
      await mkdir(outDir, { recursive: true });
      await writeFile(outFile, buf);
      console.log(`[soundfont] wrote ${outFile} (${buf.length} bytes)`);
      return true;
    } catch (e) {
      lastErr = e;
      console.warn(`[soundfont] source failed: ${e.message}`);
    }
  }
  console.error(`[soundfont] all sources failed for ${id}:`, lastErr);
  return false;
}

async function main() {
  let ok = true;
  for (const id of INSTRUMENTS) {
    ok = (await fetchOne(id)) && ok;
  }
  if (!ok) process.exit(1);
}

main();
