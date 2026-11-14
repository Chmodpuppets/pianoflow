// Headless visual-verification harness.
// Bundles the real render + core packages with esbuild, then rasterizes representative
// scenes through @napi-rs/canvas (a genuine Canvas2D implementation) so the playfield and
// sheet-music views can be inspected as PNGs without a browser. Dev/QA only — not shipped.
//
//   node scripts/render-preview.mjs            # write exports/preview/*.png
//
import { build } from 'esbuild';
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'exports', 'preview');
fs.mkdirSync(outDir, { recursive: true });

const entry = `
import { Renderer, SheetRenderer, defaultTheme } from './packages/render/src/index.ts';
import { parseMidi, assignHands, buildSheet, fitKeyboardRange, FULL_KEYBOARD, buildTimeGrid } from './packages/core/src/index.ts';
export { Renderer, SheetRenderer, defaultTheme, parseMidi, assignHands, buildSheet, fitKeyboardRange, FULL_KEYBOARD, buildTimeGrid };
`;

const result = await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: 'preview-entry.ts', loader: 'ts' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
  alias: {
    '@pianoflow/core': path.join(root, 'packages/core/src/index.ts'),
    '@pianoflow/render': path.join(root, 'packages/render/src/index.ts'),
  },
});

const bundlePath = path.join(root, 'exports', '.preview-bundle.mjs');
fs.writeFileSync(bundlePath, result.outputFiles[0].text);
const { Renderer, SheetRenderer, defaultTheme, parseMidi, assignHands, buildSheet, fitKeyboardRange, FULL_KEYBOARD, buildTimeGrid } =
  await import(bundlePath);

// The renderers read window.devicePixelRatio; pin it to 1 for deterministic previews.
globalThis.window = { devicePixelRatio: 1 };

function loadSong(file) {
  const buf = fs.readFileSync(path.join(root, 'apps/web/public/songs', file));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const song = parseMidi(ab);
  assignHands(song.notes);
  return song;
}

function save(canvas, name) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, canvas.toBuffer('image/png'));
  console.log(`wrote ${path.relative(root, file)} (${canvas.width}x${canvas.height})`);
}

// node-canvas has no DOM `.style`; the renderers set style.width/height on resize.
function prep(canvas) {
  canvas.style = { width: '', height: '' };
  return canvas;
}

const song = loadSong('fur-elise.mid');
const grid = buildTimeGrid({
  ppq: song.ppq,
  tempos: song.tempos,
  timeSignatures: song.timeSignatures,
  durationTicks: song.durationTicks,
});

// ---- Falling-notes playfield -------------------------------------------------------------
const W = 1280;
const H = 800;
const fitted = fitKeyboardRange(song.notes);
console.log('fitted keyboard range', fitted, 'full', FULL_KEYBOARD);
const canvas = prep(createCanvas(W, H));
const renderer = new Renderer(canvas, { showNoteLabels: true, showBeatGrid: true, ...fitted });
renderer.resize(W, H);
renderer.triggerPulse();
renderer.notifyHit(71, 'right');
renderer.notifyHit(64, 'left');
renderer.render({ position: 3.0, notes: song.notes, pressed: new Set([71, 64]), dt: 1 / 60, grid });
save(canvas, 'playfield.png');

// Clean rhythm-grid view (no particles): scrolling measure lines + numbers + beat lines.
const gridCanvas = prep(createCanvas(W, H));
const gridRenderer = new Renderer(gridCanvas, { showNoteLabels: true, showBeatGrid: true, ...fitted });
gridRenderer.resize(W, H);
gridRenderer.render({ position: 3.0, notes: song.notes, pressed: new Set(), dt: 1 / 60, grid });
save(gridCanvas, 'playfield-grid.png');

// Visual count-in: a big pulsing countdown number during the lead-in (position < 0),
// tying the audible count-in clicks to a visible event. Show "3" at full pop.
const beatDur = grid.length > 1 ? grid[1].time - grid[0].time : 0.5;
const ciCanvas = prep(createCanvas(W, H));
const ciRenderer = new Renderer(ciCanvas, { showNoteLabels: true, showBeatGrid: true, ...fitted });
ciRenderer.resize(W, H);
ciRenderer.render({
  position: -beatDur * 3, notes: song.notes, pressed: new Set(), dt: 1 / 60, grid,
  countIn: { beats: 4, beatDur },
});
save(ciCanvas, 'playfield-countin.png');

// Resize stability: shrink and re-render the same scene.
renderer.resize(820, 620);
renderer.render({ position: 3.0, notes: song.notes, pressed: new Set([71, 64]), dt: 1 / 60 });
save(canvas, 'playfield-small.png');

// Before/after comparison: the old full-88-key view of the same scene.
const fullCanvas = prep(createCanvas(W, H));
const fullRenderer = new Renderer(fullCanvas, { showNoteLabels: true, ...FULL_KEYBOARD });
fullRenderer.resize(W, H);
fullRenderer.render({ position: 3.0, notes: song.notes, pressed: new Set([71, 64]), dt: 1 / 60 });
save(fullCanvas, 'playfield-full.png');

// Combo-milestone celebration: golden shockwave ring + radial spark burst.
const mileCanvas = prep(createCanvas(W, H));
const mileRenderer = new Renderer(mileCanvas, { showNoteLabels: true, ...fitted });
mileRenderer.resize(W, H);
mileRenderer.triggerPulse();
mileRenderer.notifyHit(71, 'right');
mileRenderer.notifyMilestone(50);
const mileState = { position: 3.0, notes: song.notes, pressed: new Set([71, 64]), dt: 1 / 60 };
for (let i = 0; i < 8; i++) mileRenderer.render(mileState); // let the ring expand a little
save(mileCanvas, 'playfield-milestone.png');

// Miss feedback: red edge wash over the stage.
const missCanvas = prep(createCanvas(W, H));
const missRenderer = new Renderer(missCanvas, { showNoteLabels: true, ...fitted });
missRenderer.resize(W, H);
missRenderer.notifyMiss();
missRenderer.render({ position: 3.0, notes: song.notes, pressed: new Set(), dt: 1 / 60 });
save(missCanvas, 'playfield-miss.png');

// Hand assist: player practices the RIGHT hand (bright); the LEFT hand is auto-played
// (muted notes, no labels) and its key still lights up so sound ties to a visible event.
const assistCanvas = prep(createCanvas(W, H));
const assistRenderer = new Renderer(assistCanvas, { showNoteLabels: true, ...fitted });
assistRenderer.resize(W, H);
assistRenderer.triggerPulse();
assistRenderer.notifyHit(71, 'right');
assistRenderer.render({
  position: 3.0, notes: song.notes, pressed: new Set([71, 64]), dt: 1 / 60, dimHand: 'left',
});
save(assistCanvas, 'playfield-assist.png');

// ---- Sheet-music grand staff -------------------------------------------------------------
const layout = buildSheet(song, 60);
const sheetCanvas = prep(createCanvas(1280, 440));
const sheet = new SheetRenderer(sheetCanvas, {});
sheet.resize(1280, 440);
sheet.render({ layout, position: 3.0, theme: defaultTheme });
save(sheetCanvas, 'sheet.png');
sheet.render({ layout, position: 0.0, theme: defaultTheme });
save(sheetCanvas, 'sheet-start.png');

fs.rmSync(bundlePath, { force: true });
console.log('done');
