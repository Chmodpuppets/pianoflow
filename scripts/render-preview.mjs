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
import { parseMidi, assignHands, buildSheet, fitKeyboardRange, FULL_KEYBOARD, buildTimeGrid, accuracyColor } from './packages/core/src/index.ts';
export { Renderer, SheetRenderer, defaultTheme, parseMidi, assignHands, buildSheet, fitKeyboardRange, FULL_KEYBOARD, buildTimeGrid, accuracyColor };
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
const { Renderer, SheetRenderer, defaultTheme, parseMidi, assignHands, buildSheet, fitKeyboardRange, FULL_KEYBOARD, buildTimeGrid, accuracyColor } =
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

// ---- Practice-review timeline (results screen) -------------------------------------------
// Mirrors the DOM result-review layout using the SAME accuracyColor scale the app uses,
// so the green/blue/gold/red mapping and proportional cell widths can be inspected.
const measures = [
  { measure: 1, total: 4, accuracy: 1 },
  { measure: 2, total: 4, accuracy: 1 },
  { measure: 3, total: 6, accuracy: 0.83 },
  { measure: 4, total: 4, accuracy: 0.5 },
  { measure: 5, total: 4, accuracy: 0.25 },
  { measure: 6, total: 6, accuracy: 0 },
  { measure: 7, total: 4, accuracy: 0.67 },
  { measure: 8, total: 4, accuracy: 1 },
  { measure: 9, total: 4, accuracy: 0.33 },
  { measure: 10, total: 4, accuracy: 0.9 },
];
const RW = 760;
const RH = 300;
const rc = prep(createCanvas(RW, RH));
const rx = rc.getContext('2d');
rx.fillStyle = '#0a0d18';
rx.fillRect(0, 0, RW, RH);
rx.fillStyle = '#12162b';
rx.fillRect(20, 20, RW - 40, RH - 40);
rx.strokeStyle = '#262c4d';
rx.lineWidth = 1;
rx.strokeRect(20.5, 20.5, RW - 41, RH - 41);
rx.fillStyle = '#eef1fb';
rx.font = 'bold 18px system-ui, sans-serif';
rx.textAlign = 'left';
rx.textBaseline = 'alphabetic';
rx.fillText('Where to focus', 44, 62);
// legend
const legend = [['#59d98e', '90%+'], ['#4ea1ff', '70%+'], ['#ffd166', '50%+'], ['#ff6b6b', '<50%']];
let lx = RW - 44;
rx.font = '12px system-ui, sans-serif';
rx.textAlign = 'right';
for (let i = legend.length - 1; i >= 0; i--) {
  const [color, label] = legend[i];
  rx.fillStyle = '#9aa3c0';
  rx.fillText(label, lx, 60);
  lx -= rx.measureText(label).width + 8;
  rx.fillStyle = color;
  rx.fillRect(lx - 10, 51, 10, 10);
  lx -= 22;
}
// timeline strip
const stripX = 44;
const stripW = RW - 88;
const stripY = 84;
const stripH = 34;
rx.fillStyle = '#0a0d18';
rx.fillRect(stripX - 3, stripY - 3, stripW + 6, stripH + 6);
const totalNotes = measures.reduce((s, m) => s + m.total, 0);
let cx = stripX;
for (const m of measures) {
  const w = (m.total / totalNotes) * stripW - 2;
  rx.fillStyle = accuracyColor(m.accuracy);
  rx.fillRect(cx, stripY, Math.max(3, w), stripH);
  cx += (m.total / totalNotes) * stripW;
}
// focus chips (the weakest measures)
const weakest = [...measures].filter((m) => m.accuracy < 1).sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
rx.font = '13px system-ui, sans-serif';
rx.textAlign = 'left';
rx.fillStyle = '#9aa3c0';
rx.fillText('Practice these:', 44, 168);
let chipX = 44;
const chipY = 184;
for (const m of weakest) {
  const label = `▶ Measure ${m.measure} · ${Math.round(m.accuracy * 100)}%`;
  const w = rx.measureText(label).width + 24;
  const color = accuracyColor(m.accuracy);
  rx.fillStyle = '#1a1f3a';
  rx.fillRect(chipX, chipY, w, 32);
  rx.fillStyle = color;
  rx.fillRect(chipX, chipY, 3, 32);
  rx.strokeStyle = color;
  rx.lineWidth = 1;
  rx.strokeRect(chipX + 0.5, chipY + 0.5, w - 1, 31);
  rx.fillStyle = '#eef1fb';
  rx.font = '600 13px system-ui, sans-serif';
  rx.fillText(label, chipX + 12, chipY + 21);
  chipX += w + 10;
}
rx.fillStyle = '#9aa3c0';
rx.font = '12px system-ui, sans-serif';
rx.fillText('Cell width ∝ notes in measure · click a chip to jump to that measure and practice it.', 44, 252);
save(rc, 'review.png');

fs.rmSync(bundlePath, { force: true });
console.log('done');
