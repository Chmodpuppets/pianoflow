#!/usr/bin/env node
/**
 * Downloads the FluidR3_GM acoustic grand piano SoundFont (from the official
 * gleitz/midi-js-soundfonts project) into apps/web/public/soundfont so PianoFlow
 * can play real piano samples fully offline. Zero dependencies (Node >= 18 fetch).
 *
 * The file is the midi-js-soundfonts "MIDI.Soundfont." format that smplr's
 * Soundfont loads via `instrumentUrl`. mp3 is used because every browser
 * (including Safari) can decode it.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'apps/web/public/soundfont');
const outFile = join(outDir, 'acoustic_grand_piano-mp3.js');

// Same official files, two real sources. jsDelivr is usually much faster.
const SOURCES = [
  'https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts/FluidR3_GM/acoustic_grand_piano-mp3.js',
  'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_grand_piano-mp3.js',
];

async function main() {
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
      return;
    } catch (e) {
      lastErr = e;
      console.warn(`[soundfont] source failed: ${e.message}`);
    }
  }
  console.error('[soundfont] all sources failed:', lastErr);
  process.exit(1);
}

main();
