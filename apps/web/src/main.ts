import { PianoFlowApp, type Hands, type Mode } from './app';
import { ProgressStore, SettingsStore } from './storage';
import {
  parseMidi,
  assignHands,
  songStats,
  estimateDifficulty,
  noteName,
  type SessionResult,
  type SongRecord,
  type Difficulty,
  type SongStats,
} from '@pianoflow/core';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('canvas');
const stage = $<HTMLElement>('stage');
const app = new PianoFlowApp(canvas);
const progress = new ProgressStore();
const settings = new SettingsStore();

const songSelect = $<HTMLSelectElement>('songSelect');
const loadBtn = $<HTMLButtonElement>('loadBtn');
const fileInput = $<HTMLInputElement>('fileInput');
const libraryBtn = $<HTMLButtonElement>('libraryBtn');
const library = $<HTMLDivElement>('library');
const libraryClose = $<HTMLButtonElement>('libraryClose');
const libraryList = $<HTMLDivElement>('libraryList');
const resultOverlay = $<HTMLDivElement>('resultOverlay');
const resultGrade = $<HTMLDivElement>('resultGrade');
const resultTitle = $<HTMLDivElement>('resultTitle');
const resultBest = $<HTMLDivElement>('resultBest');
const resultStats = $<HTMLDivElement>('resultStats');
const resultRetry = $<HTMLButtonElement>('resultRetry');
const resultClose = $<HTMLButtonElement>('resultClose');
const soundStatus = $<HTMLSpanElement>('soundStatus');
const midiStatus = $<HTMLSpanElement>('midiStatus');
const midiBtn = $<HTMLButtonElement>('midiBtn');
const midiPanel = $<HTMLDivElement>('midiPanel');
const midiClose = $<HTMLButtonElement>('midiClose');
const midiSupport = $<HTMLDivElement>('midiSupport');
const midiDeviceList = $<HTMLDivElement>('midiDeviceList');
const midiLastNote = $<HTMLSpanElement>('midiLastNote');
const pluginsBtn = $<HTMLButtonElement>('pluginsBtn');
const pluginsPanel = $<HTMLDivElement>('pluginsPanel');
const pluginsClose = $<HTMLButtonElement>('pluginsClose');
const pluginsList = $<HTMLDivElement>('pluginsList');
const playBtn = $<HTMLButtonElement>('playBtn');
const stopBtn = $<HTMLButtonElement>('stopBtn');
const seek = $<HTMLInputElement>('seek');
const timeEl = $<HTMLSpanElement>('time');
const speedSel = $<HTMLSelectElement>('speed');
const handsSel = $<HTMLSelectElement>('hands');
const modeSel = $<HTMLSelectElement>('mode');
const waitChk = $<HTMLInputElement>('waitMode');
const labelsChk = $<HTMLInputElement>('labels');
const noteLabelsChk = $<HTMLInputElement>('noteLabels');
const cbChk = $<HTMLInputElement>('colorblind');
const metroChk = $<HTMLInputElement>('metronome');
const countInSel = $<HTMLSelectElement>('countIn');
const loopChk = $<HTMLInputElement>('loopEnabled');
const loopABtn = $<HTMLButtonElement>('loopA');
const loopBBtn = $<HTMLButtonElement>('loopB');
const loopClearBtn = $<HTMLButtonElement>('loopClear');
const loopReadout = $<HTMLSpanElement>('loopReadout');
const scoreEl = $<HTMLDivElement>('score');
const judgeEl = $<HTMLDivElement>('judge');

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

let seeking = false;
let lastMidiSig = '';
function refresh(): void {
  const st = app.getState();
  playBtn.textContent = st.playing ? '⏸ Pause' : '▶ Play';
  soundStatus.textContent =
    st.soundfontSource === 'local'
      ? '🎹 Piano · offline'
      : st.soundfontSource === 'cdn'
        ? '🎹 SoundFont'
        : '🔊 Synth';
  midiStatus.textContent = st.midiSupported
    ? st.midiConnected
      ? `MIDI: ${st.midiDevices.length} device${st.midiDevices.length === 1 ? '' : 's'}`
      : 'MIDI: ready'
    : 'MIDI: unsupported';
  midiLastNote.textContent = st.lastMidiNote != null ? noteName(st.lastMidiNote) : '—';
  const sig = st.midiSelected + '|' + st.midiDevices.map((d) => d.id + ':' + d.state).join(',');
  if (!midiPanel.classList.contains('hidden') && sig !== lastMidiSig) {
    lastMidiSig = sig;
    buildMidiDevices();
  }
  if (!seeking) {
    seek.value = String(st.duration ? Math.round((st.position / st.duration) * 1000) : 0);
  }
  timeEl.textContent = `${fmt(st.position)} / ${fmt(st.duration)}`;
  const acc = Math.round(st.score.accuracy * 100);
  scoreEl.textContent = `Hits ${st.score.hits}/${st.score.total} · Combo ${st.score.combo} · Acc ${acc}% · ${st.score.grade}`;
  judgeEl.textContent = st.lastJudge ? st.lastJudge.toUpperCase() : '';
  judgeEl.className = 'judge ' + (st.lastJudge || '');
  waitChk.disabled = st.mode !== 'practice';
  metroChk.checked = st.metronome;
  countInSel.value = String(st.countIn);
  loopChk.checked = st.loopEnabled;
  loopChk.disabled = st.loopStart == null || st.loopEnd == null;
  loopReadout.textContent = `A ${st.loopStart != null ? fmt(st.loopStart) : '–:–'} · B ${
    st.loopEnd != null ? fmt(st.loopEnd) : '–:–'
  }`;
}
app.onState = refresh;

function persist(): void {
  settings.save(app.getSettings());
}

function doResize(): void {
  const r = stage.getBoundingClientRect();
  app.resize(Math.max(1, r.width), Math.max(1, r.height));
}
window.addEventListener('resize', doResize);

playBtn.addEventListener('click', () => void app.toggle());
stopBtn.addEventListener('click', () => app.stop());
seek.addEventListener('input', () => {
  seeking = true;
  const st = app.getState();
  app.seek((Number(seek.value) / 1000) * st.duration);
});
seek.addEventListener('change', () => {
  seeking = false;
});
speedSel.addEventListener('change', () => { app.setSpeed(Number(speedSel.value)); persist(); });
handsSel.addEventListener('change', () => { app.setHands(handsSel.value as Hands); persist(); });
modeSel.addEventListener('change', () => { app.setMode(modeSel.value as Mode); persist(); });
waitChk.addEventListener('change', () => { app.setWaitMode(waitChk.checked); persist(); });
labelsChk.addEventListener('change', () => { app.setLabels(labelsChk.checked); persist(); });
noteLabelsChk.addEventListener('change', () => { app.setNoteLabels(noteLabelsChk.checked); persist(); });
cbChk.addEventListener('change', () => { app.setColorblind(cbChk.checked); persist(); });
metroChk.addEventListener('change', () => { app.setMetronome(metroChk.checked); persist(); });
countInSel.addEventListener('change', () => { app.setCountIn(Number(countInSel.value)); persist(); });
loopChk.addEventListener('change', () => app.setLoopEnabled(loopChk.checked));
loopABtn.addEventListener('click', () => app.markLoopStart());
loopBBtn.addEventListener('click', () => app.markLoopEnd());
loopClearBtn.addEventListener('click', () => app.clearLoop());

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement | null;
  if (e.code === 'Space' && !target?.closest('input,select,textarea,button')) {
    e.preventDefault();
    void app.toggle();
  } else if (e.code === 'Escape') {
    closeLibrary();
    closeMidi();
    closePlugins();
    resultOverlay.classList.add('hidden');
  }
});

loadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  const buf = await f.arrayBuffer();
  await app.loadBuffer(buf, f.name, 'local:' + f.name);
  doResize();
  refresh();
  buildLibrary();
});

interface SongEntry {
  id: string;
  title: string;
  composer: string;
  file: string;
}
interface SongInfo {
  duration: number;
  stats: SongStats;
  difficulty: Difficulty;
}

let bundledSongs: SongEntry[] = [];
const songInfoCache = new Map<string, SongInfo>();

async function selectSong(entry: SongEntry): Promise<void> {
  const res = await fetch('songs/' + entry.file);
  if (!res.ok) throw new Error('failed to fetch ' + entry.file);
  const buf = await res.arrayBuffer();
  await app.loadBuffer(buf, entry.title, entry.id);
  songSelect.value = entry.id;
  doResize();
  refresh();
  buildLibrary();
}

async function loadSongs(): Promise<void> {
  try {
    const res = await fetch('songs/songs.json');
    if (!res.ok) return;
    bundledSongs = (await res.json()) as SongEntry[];
    songSelect.innerHTML = '';
    for (const s of bundledSongs) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.title;
      songSelect.appendChild(opt);
    }
    if (bundledSongs.length) await selectSong(bundledSongs[0]);
    void enrichLibrary();
  } catch (e) {
    console.warn('[pianoflow] no bundled songs available', e);
  }
}
songSelect.addEventListener('change', () => {
  const entry = bundledSongs.find((s) => s.id === songSelect.value);
  if (entry) void selectSong(entry);
});

function difficultyStars(level: number): string {
  return '★'.repeat(level) + '☆'.repeat(5 - level);
}

function buildLibrary(): void {
  libraryList.innerHTML = '';
  const currentId = app.getState().songId;
  for (const s of bundledSongs) {
    const rec = progress.get(s.id);
    const info = songInfoCache.get(s.id);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'lib-item' + (s.id === currentId ? ' active' : '');

    const main = document.createElement('div');
    main.className = 'lib-main';
    const title = document.createElement('div');
    title.className = 'lib-title';
    title.textContent = s.title;
    const sub = document.createElement('div');
    sub.className = 'lib-sub';
    sub.textContent = s.composer;
    main.append(title, sub);

    const meta = document.createElement('div');
    meta.className = 'lib-meta';
    if (info) {
      const diff = document.createElement('span');
      diff.className = 'lib-diff';
      diff.title = info.difficulty.label;
      diff.textContent = difficultyStars(info.difficulty.level);
      const dur = document.createElement('span');
      dur.textContent = `${fmt(info.duration)} · ${info.stats.noteCount} notes`;
      meta.append(diff, dur);
    }
    if (rec) {
      const best = document.createElement('span');
      best.className = 'lib-best grade-' + rec.bestGrade;
      best.textContent = `${rec.bestGrade} · ${Math.round(rec.bestAccuracy * 100)}%`;
      best.title = `${rec.plays} play(s)`;
      meta.append(best);
    }
    item.append(main, meta);
    item.addEventListener('click', () => {
      void selectSong(s);
      closeLibrary();
    });
    libraryList.appendChild(item);
  }
  if (!bundledSongs.length) {
    const empty = document.createElement('div');
    empty.className = 'lib-empty';
    empty.textContent = 'No bundled songs. Use Open… to load a .mid file.';
    libraryList.appendChild(empty);
  }
}

async function enrichLibrary(): Promise<void> {
  for (const s of bundledSongs) {
    if (songInfoCache.has(s.id)) continue;
    try {
      const res = await fetch('songs/' + s.file);
      if (!res.ok) continue;
      const song = parseMidi(await res.arrayBuffer());
      assignHands(song.notes);
      songInfoCache.set(s.id, {
        duration: song.duration,
        stats: songStats(song),
        difficulty: estimateDifficulty(song),
      });
    } catch {
      /* skip unreadable entry */
    }
  }
  buildLibrary();
}

function openLibrary(): void {
  buildLibrary();
  library.classList.remove('hidden');
}
function closeLibrary(): void {
  library.classList.add('hidden');
}
libraryBtn.addEventListener('click', openLibrary);
libraryClose.addEventListener('click', closeLibrary);

function buildMidiDevices(): void {
  const st = app.getState();
  midiSupport.textContent = st.midiSupported
    ? 'Web MIDI is available. Pick a device to listen to, or use all devices.'
    : 'Web MIDI is not supported in this browser. Use the computer keyboard or touch the keys instead.';
  midiDeviceList.innerHTML = '';
  if (!st.midiSupported) return;

  const mkItem = (id: string | null, name: string, sub: string): HTMLButtonElement => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'midi-item' + (st.midiSelected === id ? ' active' : '');
    const main = document.createElement('div');
    main.className = 'midi-name';
    main.textContent = name;
    const s = document.createElement('div');
    s.className = 'midi-sub';
    s.textContent = sub;
    item.append(main, s);
    item.addEventListener('click', () => app.selectMidiDevice(id));
    return item;
  };

  midiDeviceList.appendChild(mkItem(null, 'All devices', 'Listen to every connected input'));
  for (const d of st.midiDevices) {
    midiDeviceList.appendChild(mkItem(d.id, d.name, `${d.manufacturer || 'Unknown'} · ${d.state}`));
  }
  if (!st.midiDevices.length) {
    const empty = document.createElement('div');
    empty.className = 'lib-empty';
    empty.textContent = 'No MIDI devices detected. Plug in a USB MIDI keyboard and it will appear here.';
    midiDeviceList.appendChild(empty);
  }
}

function openMidi(): void {
  lastMidiSig = '';
  buildMidiDevices();
  midiPanel.classList.remove('hidden');
}
function closeMidi(): void {
  midiPanel.classList.add('hidden');
}
midiBtn.addEventListener('click', openMidi);
midiClose.addEventListener('click', closeMidi);

function buildPlugins(): void {
  pluginsList.innerHTML = '';
  for (const p of app.plugins.list()) {
    const item = document.createElement('div');
    item.className = 'plugin-item' + (p.enabled ? '' : ' off');

    const main = document.createElement('div');
    main.className = 'plugin-main';
    const name = document.createElement('div');
    name.className = 'plugin-name';
    name.textContent = p.name + (p.version ? ` · v${p.version}` : '');
    const desc = document.createElement('div');
    desc.className = 'plugin-desc';
    desc.textContent = p.description ?? '';
    main.append(name, desc);

    const toggle = document.createElement('label');
    toggle.className = 'plugin-toggle';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = p.enabled;
    const lbl = document.createElement('span');
    lbl.textContent = p.enabled ? 'Enabled' : 'Disabled';
    chk.addEventListener('change', () => {
      app.plugins.setEnabled(p.id, chk.checked);
      lbl.textContent = chk.checked ? 'Enabled' : 'Disabled';
      item.classList.toggle('off', !chk.checked);
      persist();
    });
    toggle.append(chk, lbl);

    item.append(main, toggle);
    pluginsList.appendChild(item);
  }
}
function openPlugins(): void {
  buildPlugins();
  pluginsPanel.classList.remove('hidden');
}
function closePlugins(): void {
  pluginsPanel.classList.add('hidden');
}
pluginsBtn.addEventListener('click', openPlugins);
pluginsClose.addEventListener('click', closePlugins);

function showResult(result: SessionResult, rec: SongRecord, isNewBest: boolean): void {
  resultGrade.textContent = result.grade;
  resultGrade.className = 'result-grade grade-' + result.grade;
  resultTitle.textContent = app.currentSongInfo().title || 'Song';
  resultBest.textContent = isNewBest
    ? '🏆 New best!'
    : `Best: ${rec.bestGrade} · ${Math.round(rec.bestAccuracy * 100)}%`;
  resultStats.innerHTML = '';
  const rows: [string, string][] = [
    ['Accuracy', Math.round(result.accuracy * 100) + '%'],
    ['Perfect', String(result.perfect)],
    ['Good', String(result.good)],
    ['Miss', String(result.miss)],
    ['Wrong', String(result.wrong)],
    ['Max combo', String(result.maxCombo)],
    ['Notes', `${result.hits}/${result.total}`],
  ];
  for (const [k, v] of rows) {
    const row = document.createElement('div');
    row.className = 'result-row';
    const kk = document.createElement('span');
    kk.textContent = k;
    const vv = document.createElement('span');
    vv.textContent = v;
    row.append(kk, vv);
    resultStats.appendChild(row);
  }
  resultOverlay.classList.remove('hidden');
}

app.onResult = (result, id) => {
  const prev = progress.get(id);
  const rec = progress.recordResult(id, result);
  const isNewBest = !prev || result.accuracy >= prev.bestAccuracy;
  showResult(result, rec, isNewBest);
  buildLibrary();
};

resultRetry.addEventListener('click', () => {
  resultOverlay.classList.add('hidden');
  app.seek(0);
  void app.play();
});
resultClose.addEventListener('click', () => resultOverlay.classList.add('hidden'));

// Restore persisted preferences and sync the controls to match.
const saved = settings.get();
app.applySettings(saved);
modeSel.value = saved.mode;
handsSel.value = saved.hands;
speedSel.value = String(saved.speed);
waitChk.checked = saved.waitMode;
labelsChk.checked = saved.labels;
noteLabelsChk.checked = saved.noteLabels;
cbChk.checked = saved.colorblind;
metroChk.checked = saved.metronome;
countInSel.value = String(saved.countIn);

doResize();
void app.init().then(refresh);
void loadSongs();

function loop(): void {
  app.frame();
  refresh();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
