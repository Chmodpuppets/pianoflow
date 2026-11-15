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
import { Renderer, SheetRenderer, SheetPageRenderer, defaultTheme, paperTheme } from './packages/render/src/index.ts';
import { parseMidi, assignHands, buildSheet, fitKeyboardRange, FULL_KEYBOARD, buildTimeGrid, accuracyColor } from './packages/core/src/index.ts';
export { Renderer, SheetRenderer, SheetPageRenderer, defaultTheme, paperTheme, parseMidi, assignHands, buildSheet, fitKeyboardRange, FULL_KEYBOARD, buildTimeGrid, accuracyColor };
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
const { Renderer, SheetRenderer, SheetPageRenderer, defaultTheme, paperTheme, parseMidi, assignHands, buildSheet, fitKeyboardRange, FULL_KEYBOARD, buildTimeGrid, accuracyColor } =
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

// ---- New bundled content: Bach Prelude in C (dense arpeggios) + Canon in D ----
const prelude = loadSong('prelude-in-c.mid');
const preludeGrid = buildTimeGrid({ ppq: prelude.ppq, tempos: prelude.tempos, timeSignatures: prelude.timeSignatures, durationTicks: prelude.durationTicks });
const preludeFit = fitKeyboardRange(prelude.notes);
const preludeCanvas = prep(createCanvas(W, H));
const preludeRenderer = new Renderer(preludeCanvas, { showNoteLabels: false, showBeatGrid: true, ...preludeFit });
preludeRenderer.resize(W, H);
preludeRenderer.render({ position: 2.0, notes: prelude.notes, pressed: new Set(), dt: 1 / 60, grid: preludeGrid });
save(preludeCanvas, 'playfield-prelude.png');
console.log('prelude fitted', preludeFit, 'notes', prelude.notes.length);

const canon = loadSong('canon-in-d.mid');
const canonGrid = buildTimeGrid({ ppq: canon.ppq, tempos: canon.tempos, timeSignatures: canon.timeSignatures, durationTicks: canon.durationTicks });
const canonFit = fitKeyboardRange(canon.notes);
const canonCanvas = prep(createCanvas(W, H));
const canonRenderer = new Renderer(canonCanvas, { showNoteLabels: true, showBeatGrid: true, ...canonFit });
canonRenderer.resize(W, H);
canonRenderer.render({ position: 3.0, notes: canon.notes, pressed: new Set(), dt: 1 / 60, grid: canonGrid });
save(canonCanvas, 'playfield-canon.png');
console.log('canon fitted', canonFit, 'notes', canon.notes.length);

// ---- Sheet-music grand staff -------------------------------------------------------------
const layout = buildSheet(song, 60, true);
console.log('Für Elise key signature', JSON.stringify(layout.keySignature));
const sheetCanvas = prep(createCanvas(1280, 440));
const sheet = new SheetRenderer(sheetCanvas, {});
sheet.resize(1280, 440);
sheet.render({ layout, position: 3.0, theme: defaultTheme });
save(sheetCanvas, 'sheet.png');
sheet.render({ layout, position: 0.0, theme: defaultTheme });
save(sheetCanvas, 'sheet-start.png');

// ---- Full printable score (static multi-system grand-staff page) -------------------------
const pageCanvas = prep(createCanvas(1000, 200));
const page = new SheetPageRenderer(pageCanvas, { width: 1000, measuresPerSystem: 4, scale: 1 });
page.render({ layout, title: 'Für Elise', composer: 'Ludwig van Beethoven', theme: paperTheme });
save(pageCanvas, 'sheet-page.png');
console.log('sheet page css size', page.viewWidth + 'x' + page.viewHeight);

// ---- Key-signature showcase (Canon in D → D major, two sharps) ---------------------------
const canonLayout = buildSheet(canon, 60, true);
console.log('Canon key signature', JSON.stringify(canonLayout.keySignature));
const keyCanvas = prep(createCanvas(1000, 200));
const keyPage = new SheetPageRenderer(keyCanvas, { width: 1000, measuresPerSystem: 4, scale: 1 });
keyPage.render({ layout: canonLayout, title: 'Canon in D', composer: 'Johann Pachelbel', theme: paperTheme });
save(keyCanvas, 'sheet-key.png');
console.log('sheet-key css size', keyPage.viewWidth + 'x' + keyPage.viewHeight);

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

// ---- Open Graph / social share card (1200x630) -------------------------------------------
// Real playfield render as the backdrop, then a left scrim + brand text so the card reads
// as a product hero when the repo / demo link is shared. Written to public/ so it ships.
const OW = 1200;
const OH = 630;
const og = prep(createCanvas(OW, OH));
const ogRenderer = new Renderer(og, { showNoteLabels: true, showBeatGrid: true, ...fitted });
ogRenderer.resize(OW, OH);
ogRenderer.triggerPulse();
ogRenderer.notifyHit(71, 'right');
ogRenderer.notifyMilestone(50);
const ogState = { position: 3.0, notes: song.notes, pressed: new Set([71, 64]), dt: 1 / 60, grid };
for (let i = 0; i < 6; i++) ogRenderer.render(ogState);
const ox = og.getContext('2d');
// Left-to-right scrim so brand text stays legible over the falling notes.
const scrim = ox.createLinearGradient(0, 0, OW, 0);
scrim.addColorStop(0, 'rgba(8,10,20,0.97)');
scrim.addColorStop(0.45, 'rgba(8,10,20,0.88)');
scrim.addColorStop(0.75, 'rgba(8,10,20,0.35)');
scrim.addColorStop(1, 'rgba(8,10,20,0.10)');
ox.fillStyle = scrim;
ox.fillRect(0, 0, OW, OH);
// Brand mark + title.
ox.textAlign = 'left';
ox.textBaseline = 'alphabetic';
ox.fillStyle = '#4ea1ff';
ox.font = 'bold 30px system-ui, sans-serif';
ox.fillText('🎹', 64, 150);
ox.fillStyle = '#eef1fb';
ox.font = 'bold 84px system-ui, sans-serif';
ox.fillText('PianoFlow', 64, 236);
ox.fillStyle = '#9aa3c0';
ox.font = '28px system-ui, sans-serif';
ox.fillText('Learn piano by playing the falling notes.', 66, 292);
ox.fillText('A Synthesia-style trainer, open source.', 66, 330);
// Feature pills.
const pills = ['Open source', 'Web + macOS', 'MIDI · WebGL · PWA'];
ox.font = '600 20px system-ui, sans-serif';
let px = 66;
for (const p of pills) {
  const w = ox.measureText(p).width + 36;
  ox.fillStyle = 'rgba(78,161,255,0.14)';
  ox.strokeStyle = 'rgba(78,161,255,0.55)';
  ox.lineWidth = 1.5;
  ox.beginPath();
  ox.roundRect(px, 372, w, 44, 22);
  ox.fill();
  ox.stroke();
  ox.fillStyle = '#bcd6ff';
  ox.fillText(p, px + 18, 401);
  px += w + 14;
}
// Live-demo URL footer.
ox.fillStyle = '#59d98e';
ox.font = '600 24px system-ui, sans-serif';
ox.fillText('▶  chmodpuppets.github.io/pianoflow', 66, 560);
save(og, 'og.png');
fs.copyFileSync(path.join(outDir, 'og.png'), path.join(root, 'apps/web/public/og.png'));
console.log('copied og.png -> apps/web/public/og.png');

// ---- Browser-window mockup hero (README first view) --------------------------------------
// Wraps a real playfield render in a macOS-style browser chrome so the GitHub first view
// reads as a shipped product, not a bare canvas.
const CW = 1440;             // content width
const CH = 860;              // content height
const BAR = 56;              // title bar height
const PAD = 60;              // desktop margin
const MW = CW + PAD * 2;
const MH = CH + BAR + PAD * 2;
const mock = prep(createCanvas(MW, MH));
const mx = mock.getContext('2d');
// Desktop backdrop.
const bg = mx.createLinearGradient(0, 0, MW, MH);
bg.addColorStop(0, '#0b0e1a');
bg.addColorStop(1, '#141b30');
mx.fillStyle = bg;
mx.fillRect(0, 0, MW, MH);
// Window shadow + body.
mx.save();
mx.shadowColor = 'rgba(0,0,0,0.6)';
mx.shadowBlur = 48;
mx.shadowOffsetY = 18;
mx.fillStyle = '#0f1220';
mx.beginPath();
mx.roundRect(PAD, PAD, CW, CH + BAR, 16);
mx.fill();
mx.restore();
// Clip to the window so chrome + content share rounded corners.
mx.save();
mx.beginPath();
mx.roundRect(PAD, PAD, CW, CH + BAR, 16);
mx.clip();
// Title bar.
mx.fillStyle = '#1a2030';
mx.fillRect(PAD, PAD, CW, BAR);
mx.strokeStyle = '#262c4d';
mx.lineWidth = 1;
mx.beginPath();
mx.moveTo(PAD, PAD + BAR + 0.5);
mx.lineTo(PAD + CW, PAD + BAR + 0.5);
mx.stroke();
// Traffic lights.
const lights = ['#ff5f57', '#febc2e', '#28c840'];
lights.forEach((c, i) => {
  mx.fillStyle = c;
  mx.beginPath();
  mx.arc(PAD + 26 + i * 24, PAD + BAR / 2, 7, 0, Math.PI * 2);
  mx.fill();
});
// URL pill.
mx.fillStyle = '#0d1120';
mx.beginPath();
mx.roundRect(PAD + CW / 2 - 260, PAD + 12, 520, BAR - 24, 10);
mx.fill();
mx.fillStyle = '#9aa3c0';
mx.font = '500 15px system-ui, sans-serif';
mx.textAlign = 'center';
mx.textBaseline = 'middle';
mx.fillText('🔒 chmodpuppets.github.io/pianoflow', PAD + CW / 2, PAD + BAR / 2 + 1);
mx.textAlign = 'left';
mx.textBaseline = 'alphabetic';
// Real playfield content.
const content = prep(createCanvas(CW, CH));
const cRenderer = new Renderer(content, { showNoteLabels: true, showBeatGrid: true, ...fitted });
cRenderer.resize(CW, CH);
cRenderer.triggerPulse();
cRenderer.notifyHit(71, 'right');
cRenderer.notifyMilestone(50);
const cState = { position: 3.0, notes: song.notes, pressed: new Set([71, 64]), dt: 1 / 60, grid };
for (let i = 0; i < 6; i++) cRenderer.render(cState);
mx.drawImage(content, PAD, PAD + BAR);
mx.restore();
// Hairline window border.
mx.strokeStyle = 'rgba(120,140,200,0.25)';
mx.lineWidth = 1;
mx.beginPath();
mx.roundRect(PAD + 0.5, PAD + 0.5, CW - 1, CH + BAR - 1, 16);
mx.stroke();
save(mock, 'hero-mockup.png');
fs.copyFileSync(path.join(outDir, 'hero-mockup.png'), path.join(root, 'docs/img/hero-mockup.png'));
console.log('copied hero-mockup.png -> docs/img/hero-mockup.png');

// ---- Mobile PWA mockup (installable, portrait) -------------------------------------------
// Shows the installable-PWA story on a phone: portrait playfield inside a device frame with
// status bar, dynamic island and home indicator.
const SW = 372, SH = 892;              // screen size
const SX = 44, SY = 34;                // screen origin
const PW = SW + SX * 2, PH = SH + SY * 2 + 20;
const phone = prep(createCanvas(PW, PH));
const qx = phone.getContext('2d');
const pbg = qx.createLinearGradient(0, 0, PW, PH);
pbg.addColorStop(0, '#0b0e1a');
pbg.addColorStop(1, '#141b30');
qx.fillStyle = pbg;
qx.fillRect(0, 0, PW, PH);
// Device body.
qx.save();
qx.shadowColor = 'rgba(0,0,0,0.6)';
qx.shadowBlur = 40;
qx.shadowOffsetY = 14;
qx.fillStyle = '#0f1220';
qx.beginPath();
qx.roundRect(SX - 14, SY - 14, SW + 28, SH + 28, 56);
qx.fill();
qx.restore();
// Screen clip.
qx.save();
qx.beginPath();
qx.roundRect(SX, SY, SW, SH, 40);
qx.clip();
// Portrait playfield.
const pcontent = prep(createCanvas(SW, SH));
const pRenderer = new Renderer(pcontent, { showNoteLabels: false, showBeatGrid: true, ...fitted });
pRenderer.resize(SW, SH);
pRenderer.triggerPulse();
pRenderer.notifyHit(71, 'right');
const pState = { position: 3.0, notes: song.notes, pressed: new Set([71, 64]), dt: 1 / 60, grid };
for (let i = 0; i < 6; i++) pRenderer.render(pState);
qx.drawImage(pcontent, SX, SY);
// Status bar.
const sb = qx.createLinearGradient(0, SY, 0, SY + 60);
sb.addColorStop(0, 'rgba(8,10,20,0.9)');
sb.addColorStop(1, 'rgba(8,10,20,0)');
qx.fillStyle = sb;
qx.fillRect(SX, SY, SW, 60);
qx.fillStyle = '#eef1fb';
qx.font = '600 17px system-ui, sans-serif';
qx.textAlign = 'left';
qx.textBaseline = 'middle';
qx.fillText('9:41', SX + 26, SY + 26);
qx.textAlign = 'right';
qx.fillText('🔋', SX + SW - 24, SY + 26);
// Dynamic island.
qx.fillStyle = '#000';
qx.beginPath();
qx.roundRect(SX + SW / 2 - 55, SY + 12, 110, 26, 13);
qx.fill();
// Home indicator.
qx.fillStyle = 'rgba(238,241,251,0.8)';
qx.beginPath();
qx.roundRect(SX + SW / 2 - 60, SY + SH - 16, 120, 5, 3);
qx.fill();
qx.restore();
// Device border.
qx.strokeStyle = 'rgba(120,140,200,0.3)';
qx.lineWidth = 1.5;
qx.beginPath();
qx.roundRect(SX - 14, SY - 14, SW + 28, SH + 28, 56);
qx.stroke();
save(phone, 'mobile-mockup.png');
fs.copyFileSync(path.join(outDir, 'mobile-mockup.png'), path.join(root, 'docs/img/mobile-mockup.png'));
console.log('copied mobile-mockup.png -> docs/img/mobile-mockup.png');

fs.rmSync(bundlePath, { force: true });
console.log('done');
