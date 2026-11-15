// Real-browser end-to-end verification (headless system Chrome via playwright-core).
// Serves the PRODUCTION build under the /pianoflow/ subpath (exactly like GitHub Pages),
// then drives the primary flow with real clicks/keys/touch and asserts on live DOM state,
// console errors, overflow and canvas sizing. No browser download required.
//
//   node scripts/e2e-verify.mjs
//
import { chromium } from 'playwright-core';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { build } from 'esbuild';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/web/dist');
// Guard: the build must use the Pages base, exactly like production.
const indexHtml = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
if (!indexHtml.includes('/pianoflow/assets/')) {
  console.error('dist was not built with the Pages base. Run: pnpm build:pages');
  process.exit(2);
}
const outDir = path.join(root, 'exports/e2e');
fs.mkdirSync(outDir, { recursive: true });
// Resolve a system Chrome/Chromium (no browser download): env override, macOS app,
// then the usual Linux paths (GitHub ubuntu runners ship google-chrome).
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!CHROME) {
  console.error('No system Chrome/Chromium found. Set CHROME_PATH to the executable.');
  process.exit(2);
}
const PORT = 8123;
const BASE = `http://localhost:${PORT}/pianoflow/`;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.mid': 'audio/midi', '.midi': 'audio/midi', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!p.startsWith('/pianoflow')) { res.writeHead(404); res.end(); return; }
  p = p.slice('/pianoflow'.length) || '/';
  if (p === '/' || p === '') p = '/index.html';
  const fp = path.join(dist, p);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(PORT, r));

const results = [];
function check(name, fn) {
  return fn().then(() => { results.push(['PASS', name]); console.log('PASS', name); return true; })
    .catch((e) => { results.push(['FAIL', name, e.message]); console.log('FAIL', name, '::', e.message); return false; });
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [
  '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--no-sandbox', '--mute-audio',
  // Headless CI otherwise throttles/suspends requestAnimationFrame for "hidden" pages,
  // which stalls the rAF-driven transport (Wait-mode pauses never engage). Keep it live.
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
] });

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US', acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => { if (!r.url().startsWith('data:')) errors.push('requestfailed ' + r.url()); });
  return { ctx, page, errors };
}
const hidden = (page, sel) => page.waitForFunction((s) => document.querySelector(s).classList.contains('hidden'), sel, { timeout: 10000 });
const visible = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const st = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && !el.classList.contains('hidden') && st.display !== 'none';
}, sel);
const overflow = (page) => page.evaluate(() => {
  const doc = document.documentElement;
  const bad = [];
  if (doc.scrollWidth > window.innerWidth + 1) bad.push(`document scrollWidth ${doc.scrollWidth} > ${window.innerWidth}`);
  for (const el of document.querySelectorAll('.screen:not(.hidden) *')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > window.innerWidth + 2 || r.left < -2)) {
      const st = getComputedStyle(el);
      if (st.position === 'fixed' || st.overflow === 'hidden') continue;
      bad.push(`${el.tagName}#${el.id}.${String(el.className).slice(0, 30)} right=${Math.round(r.right)}`);
      if (bad.length > 6) break;
    }
  }
  return bad;
});
async function shot(page, name) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file });
  // programmatic non-blank check (model-independent): pixel variance
  const img = await loadImage(file);
  const cv = createCanvas(img.width, img.height);
  const c = cv.getContext('2d');
  c.drawImage(img, 0, 0);
  const d = c.getImageData(0, 0, img.width, img.height).data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 400) { const v = d[i]; if (v < min) min = v; if (v > max) max = v; }
  assert(max - min > 30, `${name} looks blank (range ${max - min})`);
}

// Parse a bundled song in Node (same core parser the app uses) so the practice
// test can seek to exact note times — fully deterministic, no transport/rAF timing.
async function loadSongRightHand(file, splitMidi = 60) {
  const r = await build({
    stdin: { contents: `export { parseMidi, assignHands } from '@pianoflow/core';`, resolveDir: root, loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node', write: false,
    alias: { '@pianoflow/core': path.join(root, 'packages/core/src/index.ts') },
  });
  const mod = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
  const buf = fs.readFileSync(path.join(root, 'apps/web/public/songs', file));
  const song = mod.parseMidi(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const notes = mod.assignHands(song.notes, { splitMidi });
  const right = notes.filter((n) => n.hand === 'right').sort((a, b) => a.time - b.time);
  return { duration: song.duration, right };
}
// computer-keyboard offset (baseMidi 60) -> key, mirroring packages/input/src/keyboard.ts
const OFFSET_KEY = { 0: 'a', 1: 'w', 2: 's', 3: 'e', 4: 'd', 5: 'f', 6: 't', 7: 'g', 8: 'y', 9: 'h', 10: 'u', 11: 'j', 12: 'k', 13: 'o', 14: 'l', 15: 'p', 16: ';' };

// ================= DESKTOP =================
const d = await newPage();
const page = d.page;
const loadOk = await check('desktop: page loads, welcome visible, zero console errors', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#screen-welcome:not(.hidden)', { timeout: 15000 });
  assert(await visible(page, '#guestBtn'), 'guest button visible');
  assert.strictEqual(d.errors.length, 0, 'console errors: ' + d.errors.join(' | '));
});
if (!loadOk) {
  await browser.close(); server.close();
  console.log('ABORT: app failed to load; fix before running the rest.');
  process.exit(1);
}
await check('desktop: service worker registered under /pianoflow/', async () => {
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.scope : null;
  });
  assert(scope && scope.endsWith('/pianoflow/'), 'scope=' + scope);
});
await check('desktop: guest -> library with 13 songs', async () => {
  await page.click('#guestBtn');
  await page.waitForSelector('#screen-library:not(.hidden)');
  await page.waitForFunction(() => document.querySelectorAll('.song-row').length >= 13, null, { timeout: 20000 });
  const n = await page.evaluate(() => document.querySelectorAll('.song-row').length);
  assert.strictEqual(n, 13, 'rows=' + n);
});
await check('desktop: sort by title reorders live', async () => {
  await page.selectOption('#sortSel', 'title');
  const first = await page.evaluate(() => document.querySelector('.song-title').textContent);
  assert.strictEqual(first, 'Amazing Grace', 'first=' + first);
  await page.selectOption('#sortSel', 'recommended');
});
await check('desktop: search filters live', async () => {
  await page.fill('#songSearch', 'canon');
  await page.waitForFunction(() => document.querySelectorAll('.song-row').length === 1);
  const t = await page.evaluate(() => document.querySelector('.song-title').textContent);
  assert.strictEqual(t, 'Canon in D');
  await page.fill('#songSearch', '');
  await page.waitForFunction(() => document.querySelectorAll('.song-row').length === 13);
});
await check('desktop: genre chip filters', async () => {
  await page.evaluate(() => [...document.querySelectorAll('#genreChips .chip')].find((c) => c.textContent.includes('Classical')).click());
  const n = await page.evaluate(() => document.querySelectorAll('.song-row').length);
  assert(n > 0 && n < 13, 'classical rows=' + n);
  await page.evaluate(() => document.querySelector('#genreChips .chip').click());
});
await check('desktop: favorite toggles + persists', async () => {
  await page.click('.song-row .fav-btn');
  assert(await page.evaluate(() => document.querySelector('.song-row .fav-btn').classList.contains('on')));
  const stored = await page.evaluate(() => localStorage.getItem('pianoflow.favs.v1'));
  assert(stored && stored.includes('['), 'favs stored');
  await page.click('.song-row .fav-btn');
});
await check('desktop: bulk select + batch favorite + undo', async () => {
  const favCount = () => page.evaluate(() => JSON.parse(localStorage.getItem('pianoflow.favs.v1') || '[]').length);
  const before = await favCount();
  await page.click('#selectBtn');
  await page.waitForSelector('#bulkBar:not(.hidden)');
  await page.waitForSelector('.song-row.selecting .song-check');
  // select the first two rows by clicking their titles (row body toggles selection)
  await page.click('.song-row:nth-child(1) .song-title');
  await page.click('.song-row:nth-child(2) .song-title');
  await page.waitForFunction(() => document.querySelectorAll('.song-row.selected').length === 2);
  assert((await page.evaluate(() => document.querySelector('#bulkCount').textContent)).includes('2'), 'count shows 2');
  // batch favorite -> favs grows by 2 + undo toast appears
  await page.click('#bulkFav');
  await page.waitForSelector('#toast:not(.hidden)');
  await page.waitForFunction((b) => JSON.parse(localStorage.getItem('pianoflow.favs.v1') || '[]').length === b + 2, before);
  // undo restores the exact prior favs
  await page.click('#toastUndo');
  await page.waitForFunction(() => document.querySelector('#toast').classList.contains('hidden'));
  await page.waitForFunction((b) => JSON.parse(localStorage.getItem('pianoflow.favs.v1') || '[]').length === b, before);
  // select all / clear
  await page.click('#bulkAll');
  await page.waitForFunction(() => document.querySelectorAll('.song-row.selected').length === 13);
  await page.click('#bulkNone');
  await page.waitForFunction(() => document.querySelectorAll('.song-row.selected').length === 0);
  // done exits selection mode
  await page.click('#bulkDone');
  await page.waitForFunction(() => document.querySelector('#bulkBar').classList.contains('hidden'));
  await page.waitForFunction(() => document.querySelectorAll('.song-row.selecting').length === 0);
});
await check('desktop: language switch EN->zh->EN', async () => {
  await page.click('#langSide');
  const nav = await page.evaluate(() => document.querySelector('#navSongs').textContent);
  assert(nav.includes('曲库'), 'nav=' + nav);
  await page.click('#langSide');
  const nav2 = await page.evaluate(() => document.querySelector('#navSongs').textContent);
  assert(nav2.includes('Songs'), 'nav2=' + nav2);
});
await check('desktop: learn curriculum path + continue opens lesson in practice', async () => {
  await page.click('#navLearn');
  await page.waitForSelector('#view-learn:not(.hidden)');
  const stages = await page.evaluate(() => document.querySelectorAll('#learnPath .learn-stage').length);
  assert.strictEqual(stages, 4, 'stages=' + stages);
  const cards = await page.evaluate(() => document.querySelectorAll('#learnPath .lesson-card').length);
  assert.strictEqual(cards, 12, 'lesson cards=' + cards);
  const firstStatus = await page.evaluate(() => document.querySelector('#learnPath .lesson-card').className);
  assert(firstStatus.includes('status-available'), 'first lesson not available: ' + firstStatus);
  const lastDisabled = await page.evaluate(() => {
    const all = document.querySelectorAll('#learnPath .lesson-card');
    const last = all[all.length - 1];
    return last.className.includes('status-locked') && last.querySelector('.lesson-practice').disabled;
  });
  assert(lastDisabled, 'last lesson should be locked + disabled');
  assert(await visible(page, '#learnContinue'), 'continue card visible');
  const contTitle = await page.evaluate(() => document.querySelector('#learnContinueTitle').textContent);
  assert(contTitle.includes('Twinkle'), 'continue title=' + contTitle);
  const label = await page.evaluate(() => document.querySelector('#learnProgressLabel').textContent);
  assert(label.includes('0 of 12'), 'progress label=' + label);
  // Continue opens the first lesson (Twinkle, right hand) in practice mode.
  await page.click('#learnContinueBtn');
  await page.waitForSelector('#screen-player:not(.hidden)');
  const title = await page.evaluate(() => document.querySelector('#playerTitle').textContent);
  assert(title.includes('Twinkle'), 'lesson title=' + title);
  const practice = await page.evaluate(() => document.querySelector('#modePlay').getAttribute('aria-pressed'));
  assert.strictEqual(practice, 'true', 'not practice mode: ' + practice);
  const hands = await page.evaluate(() => document.querySelector('#hands').value);
  assert.strictEqual(hands, 'right', 'hands=' + hands);
  // restore listen mode + default hands/speed (the lesson set right hand + 0.75x)
  // and return to the library SONGS view so later tests run from a clean state.
  await page.click('#modeListen');
  await page.evaluate(() => {
    const h = document.querySelector('#hands'); h.value = 'both'; h.dispatchEvent(new Event('change', { bubbles: true }));
    const sp = document.querySelector('#pSpeed'); sp.value = '1'; sp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#backBtn');
  await page.waitForSelector('#screen-library:not(.hidden)');
  await page.click('#navSongs');
  await page.waitForSelector('#view-songs:not(.hidden)');
});
await check('desktop: open shortest song -> player renders', async () => {
  await page.fill('#songSearch', 'twinkle');
  await page.waitForFunction(() => document.querySelectorAll('.song-row').length === 1);
  await page.click('.song-row .song-play');
  await page.waitForSelector('#screen-player:not(.hidden)');
  await page.waitForFunction(() => {
    const c = document.querySelector('#canvas');
    return c && c.width > 0 && c.height > 0;
  }, null, { timeout: 15000 });
  const title = await page.evaluate(() => document.querySelector('#playerTitle').textContent);
  assert(title.includes('Twinkle'), 'title=' + title);
  await page.waitForTimeout(1200);
  await shot(page, 'desktop-player.png');
});
await check('desktop: transport pause overlay + resume', async () => {
  await page.click('#playBtn'); // pause
  await page.waitForSelector('#pauseOverlay:not(.hidden)', { timeout: 5000 });
  await page.click('#pauseResume');
  await hidden(page, '#pauseOverlay');
});
await check('desktop: practice mode + coach card + keyboard input judged', async () => {
  // Read the song's actual right-hand notes in Node so we can seek to each note's
  // exact time. Judging a paused transport at a known position is deterministic and
  // independent of rAF / audio-clock timing (which headless CI throttles).
  const { duration, right } = await loadSongRightHand('twinkle.mid');
  const targets = right.slice(0, 7);
  assert(targets.length >= 5, 'twinkle right-hand notes=' + targets.length);
  await page.click('#modePlay');
  await page.waitForTimeout(300);
  if (await visible(page, '#coachHint')) await page.click('#coachGotIt');
  await hidden(page, '#coachHint');
  // Judge the RIGHT hand (melody) only; Wait mode off (we drive position ourselves).
  await page.evaluate(() => {
    const h = document.querySelector('#hands');
    h.value = 'right'; h.dispatchEvent(new Event('change', { bubbles: true }));
    const w = document.querySelector('#waitMode');
    w.checked = false; w.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const hitsNow = () => page.evaluate(() => {
    const s = document.querySelector('#score').textContent;
    return Number((s.match(/Hits (\d+)/) || s.match(/命中 (\d+)/) || [])[1] || 0);
  });
  // mode switch restarts paused at 0; seek to each note and play its key.
  for (const n of targets) {
    await page.evaluate((frac) => {
      const s = document.querySelector('#seek');
      s.value = String(Math.round(frac * 1000));
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
      const ae = document.activeElement; if (ae && ae.blur) ae.blur();
    }, duration > 0 ? n.time / duration : 0);
    const before = await hitsNow();
    const key = OFFSET_KEY[n.midi - 60];
    assert(key, 'no computer-keyboard key for midi ' + n.midi);
    await page.keyboard.press(key);
    await page.waitForFunction((prev) => {
      const s = document.querySelector('#score').textContent;
      const h = Number((s.match(/Hits (\d+)/) || s.match(/命中 (\d+)/) || [])[1] || 0);
      return h > prev;
    }, before, { timeout: 5000 });
  }
  const hits = await hitsNow();
  assert(hits >= 5, 'too few hits: ' + hits);
  // restore Both hands so the following tests run freely.
  await page.evaluate(() => {
    const h = document.querySelector('#hands');
    h.value = 'both'; h.dispatchEvent(new Event('change', { bubbles: true }));
  });
});
await check('desktop: seek to end -> results overlay with review', async () => {
  // 80% leaves Twinkle's final phrase ahead of the cursor: those notes get missed,
  // so the results screen must show both a grade and a per-measure review.
  // Play the tail at 2x so it finishes quickly even on a throttled CI runner. The
  // end-of-song result is emitted by the audio scheduler (ctx.resume + setInterval),
  // not rAF; the anti-throttle launch flags keep that clock running. A single seek
  // (no re-seeking) preserves the missed-tail judgements that feed the review.
  await page.evaluate(() => {
    const sp = document.querySelector('#pSpeed'); sp.value = '2'; sp.dispatchEvent(new Event('change', { bubbles: true }));
    const s = document.querySelector('#seek');
    s.value = '800'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // seeking while paused freezes the transport; make sure it is playing so the run can finish
  const playTxt = await page.evaluate(() => document.querySelector('#playBtn').textContent.trim());
  if (playTxt === '▶') await page.click('#playBtn');
  await page.waitForSelector('#resultOverlay:not(.hidden)', { timeout: 45000 });
  const grade = await page.evaluate(() => document.querySelector('#resultGrade').textContent);
  assert(/^[SABCD]$/.test(grade), 'grade=' + grade);
  assert(await visible(page, '#resultReview'), 'review visible');
  const cells = await page.evaluate(() => document.querySelectorAll('#reviewTimeline .review-cell').length);
  assert(cells > 0, 'review cells=' + cells);
  await shot(page, 'desktop-result.png');
  // restore default speed for the remaining checks
  await page.evaluate(() => { const sp = document.querySelector('#pSpeed'); sp.value = '1'; sp.dispatchEvent(new Event('change', { bubbles: true })); });
});
await check('desktop: result retry restarts run', async () => {
  assert(await visible(page, '#resultOverlay'), 'result overlay must be open before retry');
  await page.click('#resultRetry');
  await hidden(page, '#resultOverlay');
  await page.waitForTimeout(1200);
  const playing = await page.evaluate(() => document.querySelector('#playBtn').textContent.trim());
  assert.strictEqual(playing, '⏸', 'not playing after retry: ' + playing);
});
await check('desktop: sheet panel opens + PNG export downloads', async () => {
  await page.click('#sheetBtn');
  await page.waitForSelector('#sheetPanel:not(.hidden)');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#sheetExport'),
  ]);
  const name = download.suggestedFilename();
  assert(name.endsWith('-sheet.png'), 'download=' + name);
  const p = path.join(outDir, name);
  await download.saveAs(p);
  const sz = fs.statSync(p).size;
  assert(sz > 20000, 'sheet png bytes=' + sz);
  await page.click('#sheetClose');
});
await check('desktop: transpose stepper live (top bar)', async () => {
  await page.click('#transUp');
  const tv = await page.evaluate(() => document.querySelector('#transVal').textContent);
  assert(tv.includes('+1'), 'transpose=' + tv);
  await page.click('#transDown');
  const tv2 = await page.evaluate(() => document.querySelector('#transVal').textContent);
  assert(!tv2.includes('+1'), 'transpose not reset: ' + tv2);
});
await check('desktop: gear drawer opens, inner control live, closes', async () => {
  await page.click('#gearBtn');
  await page.waitForSelector('#playerSettings:not(.hidden)');
  const before = await page.evaluate(() => document.querySelector('#noteLabels').checked);
  await page.click('#noteLabels', { force: true });
  const after = await page.evaluate(() => document.querySelector('#noteLabels').checked);
  assert(before !== after, 'noteLabels toggle had no effect');
  await page.click('#noteLabels', { force: true });
  await page.click('#playerSettingsClose');
  await hidden(page, '#playerSettings');
});
await check('desktop: resize stability (3 sizes, canvas tracks, no errors)', async () => {
  for (const [w, h] of [[900, 600], [1440, 900], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(350);
    const ok = await page.evaluate(() => {
      const c = document.querySelector('#canvas');
      const r = c.getBoundingClientRect();
      return c.width >= r.width && c.height >= r.height && r.width > 100;
    });
    assert(ok, `canvas mismatch at ${w}x${h}`);
  }
});
await check('desktop: back to library, zero console errors overall', async () => {
  await page.click('#backBtn');
  await page.waitForSelector('#screen-library:not(.hidden)');
  assert.strictEqual(d.errors.length, 0, 'console errors: ' + d.errors.join(' | '));
});
await check('desktop: clear history is undoable via toast', async () => {
  await page.click('#navProgress');
  await page.waitForSelector('#view-progress:not(.hidden)');
  const before = await page.evaluate(() => document.querySelectorAll('#progressList .hist-row').length);
  assert(before > 0, 'expected recorded history rows, got ' + before);
  await page.click('#progressClear');
  await page.waitForSelector('#toast:not(.hidden)');
  const cleared = await page.evaluate(() => document.querySelectorAll('#progressList .hist-row').length);
  assert.strictEqual(cleared, 0, 'history not cleared: ' + cleared);
  await page.click('#toastUndo');
  await hidden(page, '#toast');
  const restored = await page.evaluate(() => document.querySelectorAll('#progressList .hist-row').length);
  assert.strictEqual(restored, before, 'undo did not restore history: ' + restored + ' != ' + before);
});
await d.ctx.close();

// ================= LOCALE AUTO-DETECT (zh-CN browser) =================
const z = await newPage({ locale: 'zh-CN' });
await check('locale: zh-CN browser auto-detects Chinese UI', async () => {
  await z.page.goto(BASE, { waitUntil: 'networkidle' });
  await z.page.waitForSelector('#screen-welcome:not(.hidden)');
  const tag = await z.page.evaluate(() => document.querySelector('.welcome-tag').textContent);
  assert(tag.includes('下落音符'), 'welcome tag=' + tag);
  const stored = await z.page.evaluate(() => localStorage.getItem('pianoflow.lang.v1'));
  assert.strictEqual(stored, null); // auto-detect need not persist until user chooses
  await z.page.click('#guestBtn');
  await z.page.waitForSelector('#screen-library:not(.hidden)');
  const nav = await z.page.evaluate(() => document.querySelector('#navSongs').textContent);
  assert(nav.includes('曲库'), 'nav=' + nav);
  const navLearn = await z.page.evaluate(() => document.querySelector('#navLearn').textContent);
  assert(navLearn.includes('课程'), 'navLearn=' + navLearn);
  const listTxt = await z.page.evaluate(() => document.querySelector('#songList').textContent);
  assert(listTxt.includes('小星星') && listTxt.includes('致爱丽丝'), 'song titles not localized: ' + listTxt.slice(0, 80));
  await z.page.click('#navLearn');
  await z.page.waitForSelector('#view-learn:not(.hidden)');
  const learnTxt = await z.page.evaluate(() => document.querySelector('#learnPath').textContent);
  assert(learnTxt.includes('第一步') && learnTxt.includes('小星星'), 'curriculum not localized: ' + learnTxt.slice(0, 80));
  assert.strictEqual(z.errors.length, 0, 'console errors: ' + z.errors.join(' | '));
});
await z.ctx.close();

// ================= MOBILE (touch, 390x844) =================
const m = await newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const mp = m.page;
const mLoadOk = await check('mobile: welcome -> library, no horizontal overflow', async () => {
  await mp.goto(BASE, { waitUntil: 'networkidle' });
  await mp.waitForSelector('#screen-welcome:not(.hidden)');
  await mp.tap('#guestBtn');
  await mp.waitForSelector('#screen-library:not(.hidden)');
  await mp.waitForFunction(() => document.querySelectorAll('.song-row').length >= 13, null, { timeout: 20000 });
  const bad = await overflow(mp);
  assert.strictEqual(bad.length, 0, 'overflow: ' + bad.join(' | '));
  await shot(mp, 'mobile-library.png');
});
if (!mLoadOk) {
  await browser.close(); server.close();
  console.log('ABORT: mobile load failed.');
  process.exit(1);
}
await check('mobile: sort + search reachable and live', async () => {
  await mp.selectOption('#sortSel', 'title');
  const first = await mp.evaluate(() => document.querySelector('.song-title').textContent);
  assert.strictEqual(first, 'Amazing Grace');
  await mp.selectOption('#sortSel', 'recommended');
});
await check('mobile: player opens, controls reachable, no overflow', async () => {
  await mp.tap('.song-row .song-play');
  await mp.waitForSelector('#screen-player:not(.hidden)');
  await mp.waitForTimeout(1200);
  const bad = await overflow(mp);
  assert.strictEqual(bad.length, 0, 'overflow: ' + bad.join(' | '));
  for (const sel of ['#playBtn', '#gearBtn', '#sheetBtn', '#muteBtn', '#seek']) {
    const box = await mp.evaluate((s) => {
      const el = document.querySelector(s);
      const r = el.getBoundingClientRect();
      return { right: r.right, bottom: r.bottom, w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
    }, sel);
    assert(box.w > 0 && box.right <= box.vw + 2 && box.bottom <= box.vh + 2 && box.right >= 0, `${sel} unreachable: ${JSON.stringify(box)}`);
  }
  await shot(mp, 'mobile-player.png');
});
await check('mobile: touch the on-screen piano registers input', async () => {
  await mp.tap('#modePlay');
  await mp.waitForTimeout(300);
  if (await visible(mp, '#coachHint')) await mp.tap('#coachGotIt');
  const before = await mp.evaluate(() => document.querySelector('#score').textContent);
  const box = await mp.evaluate(() => {
    const c = document.querySelector('#canvas').getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height };
  });
  // keyboard occupies bottom ~18% of the stage; tap a white key
  await mp.touchscreen.tap(box.x + box.w * 0.5, box.y + box.h * 0.93);
  await mp.waitForTimeout(400);
  const after = await mp.evaluate(() => document.querySelector('#score').textContent);
  const judge = await mp.evaluate(() => document.querySelector('#judge').textContent);
  assert(after !== before || judge.length > 0, `no touch response: before="${before}" after="${after}" judge="${judge}"`);
});
await check('mobile: gear drawer fits viewport, language switch works', async () => {
  await mp.tap('#gearBtn');
  await mp.waitForSelector('#playerSettings:not(.hidden)');
  const bad = await overflow(mp);
  assert.strictEqual(bad.length, 0, 'drawer overflow: ' + bad.join(' | '));
  await mp.selectOption('#langSelectPlayer', 'zh');
  const title = await mp.evaluate(() => document.querySelector('#playerSettings .drawer-head span').textContent);
  assert(title.includes('练习设置'), 'drawer title=' + title);
  await mp.selectOption('#langSelectPlayer', 'en');
  await mp.tap('#playerSettingsClose');
});
await check('mobile: zero console errors overall', async () => {
  assert.strictEqual(m.errors.length, 0, 'console errors: ' + m.errors.join(' | '));
});
await m.ctx.close();

await browser.close();
server.close();
const fails = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (fails.length) { console.log('FAILURES:'); for (const f of fails) console.log(' -', f[1], '::', f[2]); process.exit(1); }
console.log('E2E CLEAN');
