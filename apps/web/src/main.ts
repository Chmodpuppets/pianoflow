import { PianoFlowApp } from './app';
import type { AppSettings, Hands, Mode } from './app';
import { ProgressStore, SettingsStore, HistoryStore } from './storage';
import { startWelcome } from './welcome';
import {
  parseMidi,
  noteName,
  songStats,
  estimateDifficulty,
  makeSession,
  recentSessions,
  songTrend,
  summarizeHistory,
  practicedSongIds,
} from '@pianoflow/core';
import type { SessionResult, SongStats, Difficulty } from '@pianoflow/core';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

// ---------- stores ----------
const progress = new ProgressStore();
const settings = new SettingsStore();
const history = new HistoryStore();

// ---------- local profiles & favourites ----------
const PROFILE_KEY = 'pianoflow.profiles.v1';
const FAV_KEY = 'pianoflow.favs.v1';
interface Profiles { list: string[]; active: string | null }
function loadProfiles(): Profiles {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Profiles;
      if (Array.isArray(p.list)) return { list: p.list.filter((x) => typeof x === 'string'), active: p.active ?? null };
    }
  } catch { /* ignore */ }
  return { list: [], active: null };
}
function saveProfiles(p: Profiles): void {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
let profiles = loadProfiles();
function loadFavs(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}
let favs = loadFavs();
function saveFavs(): void {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch { /* ignore */ }
}

// ---------- app ----------
const canvas = $<HTMLCanvasElement>('canvas');
const app = new PianoFlowApp(canvas);

// ---------- element refs ----------
const screens = {
  welcome: $<HTMLElement>('screen-welcome'),
  library: $<HTMLElement>('screen-library'),
  player: $<HTMLElement>('screen-player'),
};
type ScreenName = keyof typeof screens;
let currentScreen: ScreenName = 'welcome';
let stopWelcome: (() => void) | null = null;

const welcomeCanvas = $<HTMLCanvasElement>('welcomeCanvas');
const loginBtn = $<HTMLButtonElement>('loginBtn');
const createBtn = $<HTMLButtonElement>('createBtn');
const guestBtn = $<HTMLButtonElement>('guestBtn');
const profileModal = $<HTMLElement>('profileModal');
const profileModalTitle = $<HTMLElement>('profileModalTitle');
const profileNameInput = $<HTMLInputElement>('profileNameInput');
const profileList = $<HTMLElement>('profileList');
const profileSave = $<HTMLButtonElement>('profileSave');
const profileCancel = $<HTMLButtonElement>('profileCancel');
const profileAvatar = $<HTMLElement>('profileAvatar');
const profileName = $<HTMLElement>('profileName');
const switchProfileBtn = $<HTMLButtonElement>('switchProfileBtn');

const navButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.side-item'));
const views: Record<string, HTMLElement> = {
  songs: $<HTMLElement>('view-songs'),
  practice: $<HTMLElement>('view-practice'),
  progress: $<HTMLElement>('view-progress'),
  settings: $<HTMLElement>('view-settings'),
};
const songSearch = $<HTMLInputElement>('songSearch');
const genreChips = $<HTMLElement>('genreChips');
const songList = $<HTMLElement>('songList');
const loadBtn = $<HTMLButtonElement>('loadBtn');
const fileInput = $<HTMLInputElement>('fileInput');

const pHands = $<HTMLSelectElement>('pHands');
const pSpeed = $<HTMLSelectElement>('pSpeed');
const pCountIn = $<HTMLSelectElement>('pCountIn');
const pWait = $<HTMLInputElement>('pWait');
const pMetro = $<HTMLInputElement>('pMetro');
const practicePlugins = $<HTMLElement>('practicePlugins');
const startPracticeBtn = $<HTMLButtonElement>('startPracticeBtn');

const progressSummary = $<HTMLElement>('progressSummary');
const progressList = $<HTMLElement>('progressList');
const progressClear = $<HTMLButtonElement>('progressClear');

const sLabels = $<HTMLInputElement>('sLabels');
const sNoteLabels = $<HTMLInputElement>('sNoteLabels');
const sColorblind = $<HTMLInputElement>('sColorblind');
const sMute = $<HTMLInputElement>('sMute');
const sVolume = $<HTMLInputElement>('sVolume');
const openMidiBtn = $<HTMLButtonElement>('openMidiBtn');
const openPluginsBtn = $<HTMLButtonElement>('openPluginsBtn');
const settingsSound = $<HTMLElement>('settingsSound');
const clearProgressBtn = $<HTMLButtonElement>('clearProgressBtn');
const clearHistoryBtn = $<HTMLButtonElement>('clearHistoryBtn');
const aboutVersion = $<HTMLElement>('aboutVersion');

const backBtn = $<HTMLButtonElement>('backBtn');
const playerTitle = $<HTMLElement>('playerTitle');
const playerComposer = $<HTMLElement>('playerComposer');
const playBtn = $<HTMLButtonElement>('playBtn');
const nextBtn = $<HTMLButtonElement>('nextBtn');
const speedDown = $<HTMLButtonElement>('speedDown');
const speedUp = $<HTMLButtonElement>('speedUp');
const speedVal = $<HTMLElement>('speedVal');
const transDown = $<HTMLButtonElement>('transDown');
const transUp = $<HTMLButtonElement>('transUp');
const transVal = $<HTMLElement>('transVal');
const metroBtn = $<HTMLButtonElement>('metroBtn');
const muteBtn = $<HTMLButtonElement>('muteBtn');
const gearBtn = $<HTMLButtonElement>('gearBtn');
const fsBtn = $<HTMLButtonElement>('fsBtn');
const seek = $<HTMLInputElement>('seek');
const timeEl = $<HTMLElement>('time');
const scoreEl = $<HTMLElement>('score');
const judgeEl = $<HTMLElement>('judge');
const stage = $<HTMLElement>('stage');
const volumeSlider = $<HTMLInputElement>('volume');
const latencySlider = $<HTMLInputElement>('latency');
const latencyVal = $<HTMLElement>('latencyVal');
const latencyReset = $<HTMLButtonElement>('latencyReset');
const splitSlider = $<HTMLInputElement>('split');
const splitVal = $<HTMLElement>('splitVal');
const pauseOverlay = $<HTMLElement>('pauseOverlay');
const pauseResume = $<HTMLButtonElement>('pauseResume');
const pauseRestart = $<HTMLButtonElement>('pauseRestart');
const pauseBack = $<HTMLButtonElement>('pauseBack');

const playerSettings = $<HTMLElement>('playerSettings');
const playerSettingsClose = $<HTMLButtonElement>('playerSettingsClose');
const modeSel = $<HTMLSelectElement>('mode');
const handsSel = $<HTMLSelectElement>('hands');
const countInSel = $<HTMLSelectElement>('countIn');
const waitChk = $<HTMLInputElement>('waitMode');
const labelsChk = $<HTMLInputElement>('labels');
const noteLabelsChk = $<HTMLInputElement>('noteLabels');
const cbChk = $<HTMLInputElement>('colorblind');
const loopChk = $<HTMLInputElement>('loopEnabled');
const loopA = $<HTMLButtonElement>('loopA');
const loopB = $<HTMLButtonElement>('loopB');
const loopClear = $<HTMLButtonElement>('loopClear');
const loopReadout = $<HTMLElement>('loopReadout');
const psMidiBtn = $<HTMLButtonElement>('psMidiBtn');
const psPluginsBtn = $<HTMLButtonElement>('psPluginsBtn');

const midiPanel = $<HTMLElement>('midiPanel');
const midiClose = $<HTMLButtonElement>('midiClose');
const midiSupport = $<HTMLElement>('midiSupport');
const midiDeviceList = $<HTMLElement>('midiDeviceList');
const midiLastNote = $<HTMLElement>('midiLastNote');
const pluginsPanel = $<HTMLElement>('pluginsPanel');
const pluginsClose = $<HTMLButtonElement>('pluginsClose');
const pluginsList = $<HTMLElement>('pluginsList');

const resultOverlay = $<HTMLElement>('resultOverlay');
const resultGrade = $<HTMLElement>('resultGrade');
const resultTitle = $<HTMLElement>('resultTitle');
const resultBest = $<HTMLElement>('resultBest');
const resultStats = $<HTMLElement>('resultStats');
const resultRetry = $<HTMLButtonElement>('resultRetry');
const resultClose = $<HTMLButtonElement>('resultClose');

// ---------- helpers ----------
function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function fmtWhen(at: number): string {
  const d = Date.now() - at;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  if (d < 7 * 86_400_000) return `${Math.floor(d / 86_400_000)}d ago`;
  return new Date(at).toLocaleDateString();
}
function persist(): void {
  settings.save(app.getSettings());
}

// ---------- screen router ----------
function showScreen(name: ScreenName): void {
  currentScreen = name;
  (Object.keys(screens) as ScreenName[]).forEach((k) => screens[k].classList.toggle('hidden', k !== name));
  if (name === 'welcome') {
    if (!stopWelcome) stopWelcome = startWelcome(welcomeCanvas);
  } else if (stopWelcome) {
    stopWelcome();
    stopWelcome = null;
  }
  if (name === 'player') {
    doResize();
  } else {
    app.pause();
  }
  closeAllDrawers();
  hidePause();
  syncControls();
}
function showView(name: string): void {
  Object.entries(views).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
  navButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'progress') buildHistory();
  if (name === 'practice') buildPluginList(practicePlugins);
  if (name === 'settings') syncControls();
}

// ---------- profiles ----------
function refreshProfileChip(): void {
  const name = profiles.active ?? 'Guest';
  profileName.textContent = name;
  profileAvatar.textContent = name.charAt(0).toUpperCase();
}
function openProfileModal(mode: 'login' | 'create'): void {
  profileModalTitle.textContent = mode === 'login' ? 'Log in to a profile' : 'Create a profile';
  profileNameInput.value = mode === 'create' ? '' : profiles.active ?? '';
  profileList.innerHTML = '';
  profiles.list.forEach((name) => {
    const row = document.createElement('button');
    row.className = 'profile-pick';
    row.innerHTML = `<span class="avatar">${name.charAt(0).toUpperCase()}</span><span>${name}</span>`;
    row.addEventListener('click', () => {
      profiles.active = name;
      saveProfiles(profiles);
      refreshProfileChip();
      closeProfileModal();
      showScreen('library');
    });
    profileList.appendChild(row);
  });
  profileModal.classList.remove('hidden');
  profileNameInput.focus();
}
function closeProfileModal(): void {
  profileModal.classList.add('hidden');
}
profileSave.addEventListener('click', () => {
  const name = profileNameInput.value.trim();
  if (!name) { profileNameInput.focus(); return; }
  if (!profiles.list.includes(name)) profiles.list.push(name);
  profiles.active = name;
  saveProfiles(profiles);
  refreshProfileChip();
  closeProfileModal();
  showScreen('library');
});
profileCancel.addEventListener('click', closeProfileModal);
loginBtn.addEventListener('click', () => openProfileModal('login'));
createBtn.addEventListener('click', () => openProfileModal('create'));
guestBtn.addEventListener('click', () => { profiles.active = null; saveProfiles(profiles); refreshProfileChip(); showScreen('library'); });
switchProfileBtn.addEventListener('click', () => openProfileModal('login'));

// ---------- song library ----------
interface SongEntry { id: string; title: string; composer: string; genre?: string; file: string }
let bundledSongs: SongEntry[] = [];
let activeGenre = 'All Songs';
let searchTerm = '';
const songInfoCache = new Map<string, { stats: SongStats; difficulty: Difficulty; duration: number }>();
const ART_EMOJI: Record<string, string> = { Classical: '🎼', Traditional: '🎹', Folk: '🪕', Local: '📁', Imported: '📥' };

function diffBars(level: number): string {
  const lit = Math.max(1, Math.min(8, Math.round((level / 5) * 8)));
  let html = `<span class="song-diff diff-${level}" title="Difficulty ${level}/5">`;
  for (let i = 0; i < 8; i++) html += `<span class="diff-bar${i < lit ? ' lit' : ''}"></span>`;
  return html + '</span>';
}
function buildChips(): void {
  const genres = ['All Songs', ...Array.from(new Set(bundledSongs.map((s) => s.genre ?? 'Other')))];
  genreChips.innerHTML = '';
  genres.forEach((g) => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (g === activeGenre ? ' active' : '');
    chip.textContent = g;
    chip.addEventListener('click', () => { activeGenre = g; buildChips(); buildSongList(); });
    genreChips.appendChild(chip);
  });
}
function buildSongList(): void {
  const st = app.getState();
  const q = searchTerm.toLowerCase();
  const rows = bundledSongs.filter((s) => {
    const genreOk = activeGenre === 'All Songs' || (s.genre ?? 'Other') === activeGenre;
    const searchOk = !q || s.title.toLowerCase().includes(q) || s.composer.toLowerCase().includes(q);
    return genreOk && searchOk;
  });
  songList.innerHTML = '';
  if (!rows.length) {
    songList.innerHTML = '<div class="empty-note">No songs match your search.</div>';
    return;
  }
  rows.forEach((s) => {
    const info = songInfoCache.get(s.id);
    const best = progress.get(s.id)?.bestGrade;
    const row = document.createElement('div');
    row.className = 'song-row' + (st.songId === s.id ? ' playing' : '');
    const genre = s.genre ?? 'Local';
    row.innerHTML = `
      <div class="song-art art-${genre}">${ART_EMOJI[genre] ?? '🎵'}</div>
      <div class="song-meta">
        <div class="song-title">${s.title}</div>
        <div class="song-sub">${s.composer}${info ? ` · ${info.stats.noteCount} notes · ${fmt(info.duration)}` : ''}</div>
      </div>
      ${info ? diffBars(info.difficulty.level) : '<span class="song-diff"></span>'}
      <button class="fav-btn${favs.has(s.id) ? ' on' : ''}" title="Favorite">${favs.has(s.id) ? '♥' : '♡'}</button>
      <button class="btn btn-primary song-play">▶ Play</button>`;
    const favBtn = row.querySelector('.fav-btn') as HTMLButtonElement;
    favBtn.addEventListener('click', () => {
      if (favs.has(s.id)) favs.delete(s.id); else favs.add(s.id);
      saveFavs();
      favBtn.classList.toggle('on', favs.has(s.id));
      favBtn.textContent = favs.has(s.id) ? '♥' : '♡';
    });
    (row.querySelector('.song-play') as HTMLButtonElement).addEventListener('click', () => { void selectSong(s, true); });
    songList.appendChild(row);
  });
}
async function enrichLibrary(): Promise<void> {
  await Promise.all(bundledSongs.map(async (s) => {
    if (songInfoCache.has(s.id)) return;
    try {
      const res = await fetch(`songs/${s.file}`);
      const buf = await res.arrayBuffer();
      const song = parseMidi(buf);
      songInfoCache.set(s.id, { stats: songStats(song), difficulty: estimateDifficulty(song), duration: song.duration });
    } catch { /* ignore */ }
  }));
  buildSongList();
}
async function selectSong(entry: SongEntry, autoplay: boolean): Promise<void> {
  try {
    const res = await fetch(`songs/${entry.file}`);
    const buf = await res.arrayBuffer();
    app.loadBuffer(buf, entry.title, entry.id);
    playerTitle.textContent = entry.title;
    playerComposer.textContent = entry.composer;
    showScreen('player');
    buildSongList();
    if (autoplay) await app.play();
  } catch (err) {
    console.error('Failed to load song', err);
  }
}
songSearch.addEventListener('input', () => { searchTerm = songSearch.value; buildSongList(); });
loadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  const buf = await f.arrayBuffer();
  const name = f.name.replace(/\.(mid|midi)$/i, '');
  app.loadBuffer(buf, name, 'local:' + name);
  playerTitle.textContent = name;
  playerComposer.textContent = 'Local file';
  showScreen('player');
  await app.play();
  fileInput.value = '';
});
function prettifyTitle(file: string): string {
  const base = file.replace(/\.(mid|midi)$/i, '').replace(/[-_]+/g, ' ').trim();
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}
async function fetchJson<T>(url: string): Promise<T[]> {
  try { return (await (await fetch(url)).json()) as T[]; } catch { return []; }
}
async function loadSongs(): Promise<void> {
  // The folder scan (auto.json) is the source of truth for which files exist, so
  // dropping a .mid into public/songs/ makes it appear automatically. Curated
  // manifests only supply nicer metadata; unknown files get a prettified name.
  const [base, user, auto] = await Promise.all([
    fetchJson<SongEntry>('songs/songs.json'),
    fetchJson<SongEntry>('songs/user.json'),
    fetchJson<{ id: string; file: string }>('songs/auto.json'),
  ]);
  const meta = new Map<string, SongEntry>();
  for (const s of [...base, ...user]) { meta.set(s.file, s); meta.set(s.id, s); }
  let entries: SongEntry[];
  if (auto.length) {
    entries = auto.map((a) => {
      const m = meta.get(a.file) ?? meta.get(a.id);
      if (m) return { ...m, file: a.file };
      return { id: a.id, file: a.file, title: prettifyTitle(a.file), composer: 'Imported', genre: 'Imported' };
    });
  } else {
    entries = [...base, ...user];
  }
  const seen = new Set<string>();
  bundledSongs = entries.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  buildChips();
  buildSongList();
  void enrichLibrary();
}

// ---------- plugins ----------
function buildPluginList(container: HTMLElement): void {
  container.innerHTML = '';
  app.plugins.list().forEach((p) => {
    const item = document.createElement('div');
    item.className = 'plugin-item' + (p.enabled ? '' : ' off');
    item.innerHTML = `
      <div class="plugin-main">
        <div class="plugin-name">${p.name}${p.version ? ` <span class="muted-line">v${p.version}</span>` : ''}</div>
        <div class="plugin-desc">${p.description ?? ''}</div>
      </div>
      <label class="plugin-toggle"><input type="checkbox" ${p.enabled ? 'checked' : ''} /> <span>${p.enabled ? 'On' : 'Off'}</span></label>`;
    const chk = item.querySelector('input') as HTMLInputElement;
    const lbl = item.querySelector('.plugin-toggle span') as HTMLElement;
    chk.addEventListener('change', () => {
      app.plugins.setEnabled(p.id, chk.checked);
      lbl.textContent = chk.checked ? 'On' : 'Off';
      item.classList.toggle('off', !chk.checked);
      persist();
      buildPluginList(practicePlugins);
      buildPluginList(pluginsList);
    });
    container.appendChild(item);
  });
}

// ---------- MIDI ----------
let midiSig = '';
function buildMidiDevices(): void {
  const st = app.getState();
  midiSupport.textContent = st.midiSupported
    ? 'WebMIDI supported. Select a device or use all.'
    : 'WebMIDI not supported in this browser. Use Chrome/Edge, or play with keyboard/touch.';
  midiDeviceList.innerHTML = '';
  const all = document.createElement('div');
  all.className = 'midi-item' + (st.midiSelected === null ? ' active' : '');
  all.innerHTML = '<div><div class="midi-name">All devices</div><div class="midi-sub">Listen to every connected input</div></div>';
  all.addEventListener('click', () => { app.selectMidiDevice(null); buildMidiDevices(); });
  midiDeviceList.appendChild(all);
  st.midiDevices.forEach((d) => {
    const item = document.createElement('div');
    item.className = 'midi-item' + (st.midiSelected === d.id ? ' active' : '');
    item.innerHTML = `<div><div class="midi-name">${d.name}</div><div class="midi-sub">${d.manufacturer ?? ''} · ${d.state}</div></div>`;
    item.addEventListener('click', () => { app.selectMidiDevice(d.id); buildMidiDevices(); });
    midiDeviceList.appendChild(item);
  });
}

// ---------- progress / history ----------
function trendBadge(improvement: number): string {
  const pct = Math.round(improvement * 100);
  if (pct > 0) return `<span class="trend-up">▲ +${pct}%</span>`;
  if (pct < 0) return `<span class="trend-down">▼ ${pct}%</span>`;
  return '<span class="trend-flat">— 0%</span>';
}
function buildHistory(): void {
  const log = history.getAll();
  const sum = summarizeHistory(log);
  progressSummary.innerHTML = `
    <div class="stat"><div class="stat-val">${sum.totalSessions}</div><div class="stat-label">Sessions</div></div>
    <div class="stat"><div class="stat-val">${sum.songsPracticed}</div><div class="stat-label">Songs practiced</div></div>
    <div class="stat"><div class="stat-val">${Math.round(sum.averageAccuracy * 100)}%</div><div class="stat-label">Avg accuracy</div></div>
    <div class="stat"><div class="stat-val">${Math.round(sum.bestAccuracy * 100)}%</div><div class="stat-label">Best accuracy</div></div>`;
  progressList.innerHTML = '';
  if (!log.length) {
    progressList.innerHTML = '<div class="empty-note">No sessions yet. Play a song in Practice mode to start tracking progress.</div>';
    return;
  }
  const songsHead = document.createElement('div');
  songsHead.className = 'hist-section';
  songsHead.textContent = 'Progress by song';
  progressList.appendChild(songsHead);
  practicedSongIds(log).forEach((id) => {
    const t = songTrend(log, id);
    if (!t) return;
    const title = log.find((e) => e.songId === id)?.songTitle ?? id;
    const card = document.createElement('div');
    card.className = 'hist-song';
    card.innerHTML = `
      <div class="hist-song-head"><span class="hist-song-title">${title}</span>${trendBadge(t.improvement)}</div>
      <div class="hist-song-sub">${t.sessions} sessions · ${Math.round(t.firstAccuracy * 100)}% → ${Math.round(t.latestAccuracy * 100)}% · best ${Math.round(t.bestAccuracy * 100)}%</div>`;
    progressList.appendChild(card);
  });
  const recentHead = document.createElement('div');
  recentHead.className = 'hist-section';
  recentHead.textContent = 'Recent sessions';
  progressList.appendChild(recentHead);
  recentSessions(log, 12).forEach((e) => {
    const row = document.createElement('div');
    row.className = 'hist-row';
    row.innerHTML = `
      <div class="hist-row-main"><div class="hist-row-title">${e.songTitle}</div><div class="hist-row-when">${fmtWhen(e.at)}</div></div>
      <div class="hist-row-score"><span class="hist-grade grade-${e.grade}">${e.grade}</span><span class="hist-acc">${Math.round(e.accuracy * 100)}%</span></div>`;
    progressList.appendChild(row);
  });
}
progressClear.addEventListener('click', () => {
  if (window.confirm('Delete all recorded practice sessions?')) { history.clear(); buildHistory(); }
});
clearHistoryBtn.addEventListener('click', () => {
  if (window.confirm('Delete all recorded practice sessions?')) { history.clear(); buildHistory(); }
});
clearProgressBtn.addEventListener('click', () => {
  if (window.confirm('Delete all best scores?')) { progress.clear(); buildSongList(); }
});

// ---------- result ----------
function showResult(result: SessionResult, songId: string): void {
  const rec = progress.get(songId);
  resultGrade.textContent = result.grade;
  resultGrade.className = 'result-grade grade-' + result.grade;
  resultTitle.textContent = app.currentSongInfo().title || 'Session complete';
  resultBest.textContent = rec ? `Best: ${rec.bestGrade} · ${Math.round(rec.bestAccuracy * 100)}%` : '';
  resultStats.innerHTML =
    `Accuracy ${Math.round(result.accuracy * 100)}% · ${result.hits}/${result.total} hits<br>` +
    `Perfect ${result.perfect} · Good ${result.good} · Miss ${result.miss} · Wrong ${result.wrong}<br>` +
    `Max combo ${result.maxCombo}`;
  hidePause();
  resultOverlay.classList.remove('hidden');
}
app.onResult = (result, songId) => {
  progress.recordResult(songId, result);
  history.record(makeSession(songId, app.currentSongInfo().title || 'Song', result, Date.now()));
  showResult(result, songId);
  buildSongList();
  if (!views.progress.classList.contains('hidden')) buildHistory();
};
resultRetry.addEventListener('click', () => { resultOverlay.classList.add('hidden'); app.seek(0); void app.play(); });
resultClose.addEventListener('click', () => resultOverlay.classList.add('hidden'));

// ---------- drawers ----------
function closeAllDrawers(): void {
  playerSettings.classList.add('hidden');
  midiPanel.classList.add('hidden');
  pluginsPanel.classList.add('hidden');
}
function openDrawer(el: HTMLElement): void {
  closeAllDrawers();
  el.classList.remove('hidden');
  if (el === midiPanel) buildMidiDevices();
  if (el === pluginsPanel) buildPluginList(pluginsList);
}
gearBtn.addEventListener('click', () => openDrawer(playerSettings));
playerSettingsClose.addEventListener('click', () => playerSettings.classList.add('hidden'));
openMidiBtn.addEventListener('click', () => openDrawer(midiPanel));
psMidiBtn.addEventListener('click', () => openDrawer(midiPanel));
midiClose.addEventListener('click', () => midiPanel.classList.add('hidden'));
openPluginsBtn.addEventListener('click', () => openDrawer(pluginsPanel));
psPluginsBtn.addEventListener('click', () => openDrawer(pluginsPanel));
pluginsClose.addEventListener('click', () => pluginsPanel.classList.add('hidden'));

// ---------- control sync ----------
function syncControls(): void {
  const s = app.getSettings();
  const st = app.getState();
  modeSel.value = s.mode;
  handsSel.value = s.hands;
  pHands.value = s.hands;
  countInSel.value = String(s.countIn);
  pCountIn.value = String(s.countIn);
  pSpeed.value = String(s.speed);
  waitChk.checked = s.waitMode;
  pWait.checked = s.waitMode;
  labelsChk.checked = s.labels;
  sLabels.checked = s.labels;
  noteLabelsChk.checked = s.noteLabels;
  sNoteLabels.checked = s.noteLabels;
  cbChk.checked = s.colorblind;
  sColorblind.checked = s.colorblind;
  pMetro.checked = s.metronome;
  sMute.checked = s.muted;
  const volPct = Math.round(s.volume * 100);
  sVolume.value = String(volPct);
  volumeSlider.value = String(volPct);
  latencySlider.value = String(s.latencyMs);
  splitSlider.value = String(s.splitMidi);
  loopChk.checked = st.loopEnabled;
  speedVal.textContent = Math.round(st.speed * 100) + '%';
  metroBtn.setAttribute('aria-pressed', String(s.metronome));
  muteBtn.textContent = s.muted ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-pressed', String(s.muted));
  muteBtn.classList.toggle('muted', s.muted);
  settingsSound.textContent =
    st.soundfontSource === 'local' ? 'Sound: FluidR3_GM piano (bundled, offline).' :
    st.soundfontSource === 'cdn' ? 'Sound: FluidR3_GM piano (streamed).' : 'Sound: built-in synth fallback.';
}

// ---------- player wiring ----------
let seeking = false;
function refresh(): void {
  const st = app.getState();
  playBtn.textContent = st.playing ? '⏸' : '▶';
  if (!seeking) seek.value = String(st.duration > 0 ? Math.round((st.position / st.duration) * 1000) : 0);
  timeEl.textContent = `${fmt(st.position)} / ${fmt(st.duration)}`;
  speedVal.textContent = Math.round(st.speed * 100) + '%';
  transVal.textContent = '♪ ' + (st.transpose > 0 ? '+' : '') + st.transpose;
  latencyVal.textContent = `${st.latencyMs} ms`;
  splitVal.textContent = noteName(st.splitMidi);
  const sc = st.score;
  scoreEl.textContent = `Hits ${sc.hits}/${sc.total} · Combo ${sc.combo} · Acc ${Math.round(sc.accuracy * 100)}%`;
  judgeEl.textContent = st.lastJudge ? st.lastJudge.toUpperCase() : '';
  judgeEl.className = 'judge ' + (st.lastJudge || '');
  loopReadout.textContent = `A ${st.loopStart !== null ? fmt(st.loopStart) : '–:–'} · B ${st.loopEnd !== null ? fmt(st.loopEnd) : '–:–'}`;
  midiLastNote.textContent = st.lastMidiNote !== null ? noteName(st.lastMidiNote) : '—';
  const sig = st.midiSelected + '|' + st.midiDevices.map((d) => d.id + d.state).join(',');
  if (sig !== midiSig && !midiPanel.classList.contains('hidden')) { midiSig = sig; buildMidiDevices(); }
}
app.onState = refresh;

function doResize(): void {
  const r = stage.getBoundingClientRect();
  app.resize(r.width, r.height);
}
window.addEventListener('resize', () => { if (currentScreen === 'player') doResize(); });

playBtn.addEventListener('click', () => { userToggle(); });

// Pause overlay: shown only on an explicit user pause (not wait-mode/auto-pause).
function showPause(): void { pauseOverlay.classList.remove('hidden'); }
function hidePause(): void { pauseOverlay.classList.add('hidden'); }
function userToggle(): void {
  if (app.getState().playing) { app.pause(); showPause(); }
  else { hidePause(); void app.play(); }
}
pauseResume.addEventListener('click', () => { hidePause(); void app.play(); });
pauseRestart.addEventListener('click', () => { hidePause(); app.seek(0); void app.play(); });
pauseBack.addEventListener('click', () => { hidePause(); app.pause(); showScreen('library'); });
sVolume.addEventListener('input', () => { app.setVolume(Number(sVolume.value) / 100); persist(); });
volumeSlider.addEventListener('input', () => { app.setVolume(Number(volumeSlider.value) / 100); persist(); });
backBtn.addEventListener('click', () => { app.pause(); showScreen('library'); });
nextBtn.addEventListener('click', () => {
  if (!bundledSongs.length) return;
  const idx = bundledSongs.findIndex((s) => s.id === app.getState().songId);
  const next = bundledSongs[(idx + 1) % bundledSongs.length];
  void selectSong(next, true);
});
function nudgeSpeed(dir: number): void {
  const cur = app.getState().speed;
  const next = Math.min(2, Math.max(0.25, Math.round((cur + dir * 0.25) * 100) / 100));
  app.setSpeed(next);
  persist();
  syncControls();
}
speedDown.addEventListener('click', () => nudgeSpeed(-1));
speedUp.addEventListener('click', () => nudgeSpeed(1));
function nudgeTranspose(dir: number): void {
  const cur = app.getState().transpose;
  app.setTranspose(cur + dir);
  persist();
  syncControls();
}
transDown.addEventListener('click', () => nudgeTranspose(-1));
transUp.addEventListener('click', () => nudgeTranspose(1));
latencySlider.addEventListener('input', () => { app.setLatency(Number(latencySlider.value)); persist(); });
latencyReset.addEventListener('click', () => { app.setLatency(0); persist(); syncControls(); });
splitSlider.addEventListener('input', () => { app.setSplit(Number(splitSlider.value)); persist(); });
metroBtn.addEventListener('click', () => { app.setMetronome(!app.getSettings().metronome); persist(); syncControls(); });
muteBtn.addEventListener('click', () => { app.setMuted(!app.getSettings().muted); persist(); syncControls(); });
fsBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => {});
  else void document.exitFullscreen().catch(() => {});
});
document.addEventListener('fullscreenchange', () => { fsBtn.textContent = document.fullscreenElement ? '🡼' : '⛶'; if (currentScreen === 'player') doResize(); });
seek.addEventListener('pointerdown', () => { seeking = true; });
seek.addEventListener('input', () => {
  const st = app.getState();
  app.seek((Number(seek.value) / 1000) * st.duration);
});
seek.addEventListener('change', () => { seeking = false; });
seek.addEventListener('pointerup', () => { seeking = false; });

// player settings drawer controls
modeSel.addEventListener('change', () => { app.setMode(modeSel.value as Mode); persist(); syncControls(); });
handsSel.addEventListener('change', () => { app.setHands(handsSel.value as Hands); persist(); syncControls(); });
countInSel.addEventListener('change', () => { app.setCountIn(Number(countInSel.value)); persist(); syncControls(); });
waitChk.addEventListener('change', () => { app.setWaitMode(waitChk.checked); persist(); syncControls(); });
labelsChk.addEventListener('change', () => { app.setLabels(labelsChk.checked); persist(); syncControls(); });
noteLabelsChk.addEventListener('change', () => { app.setNoteLabels(noteLabelsChk.checked); persist(); syncControls(); });
cbChk.addEventListener('change', () => { app.setColorblind(cbChk.checked); persist(); syncControls(); });
loopChk.addEventListener('change', () => { app.setLoopEnabled(loopChk.checked); syncControls(); });
loopA.addEventListener('click', () => { app.markLoopStart(); syncControls(); });
loopB.addEventListener('click', () => { app.markLoopEnd(); syncControls(); });
loopClear.addEventListener('click', () => { app.clearLoop(); syncControls(); });

// practice view controls
pHands.addEventListener('change', () => { app.setHands(pHands.value as Hands); persist(); syncControls(); });
pSpeed.addEventListener('change', () => { app.setSpeed(Number(pSpeed.value)); persist(); syncControls(); });
pCountIn.addEventListener('change', () => { app.setCountIn(Number(pCountIn.value)); persist(); syncControls(); });
pWait.addEventListener('change', () => { app.setWaitMode(pWait.checked); persist(); syncControls(); });
pMetro.addEventListener('change', () => { app.setMetronome(pMetro.checked); persist(); syncControls(); });
startPracticeBtn.addEventListener('click', async () => {
  app.setMode('practice');
  persist();
  const st = app.getState();
  const current = bundledSongs.find((s) => s.id === st.songId) ?? bundledSongs[0];
  if (current) await selectSong(current, true);
  else showScreen('player');
});

// settings view controls
sLabels.addEventListener('change', () => { app.setLabels(sLabels.checked); persist(); syncControls(); });
sNoteLabels.addEventListener('change', () => { app.setNoteLabels(sNoteLabels.checked); persist(); syncControls(); });
sColorblind.addEventListener('change', () => { app.setColorblind(sColorblind.checked); persist(); syncControls(); });
sMute.addEventListener('change', () => { app.setMuted(sMute.checked); persist(); syncControls(); });

// nav
navButtons.forEach((b) => b.addEventListener('click', () => showView(b.dataset.view ?? 'songs')));

// keyboard shortcuts
window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
  if (e.code === 'Space' && currentScreen === 'player') { e.preventDefault(); userToggle(); }
  if (e.key === 'Escape') {
    if (!pauseOverlay.classList.contains('hidden')) { hidePause(); void app.play(); }
    else if (!resultOverlay.classList.contains('hidden')) resultOverlay.classList.add('hidden');
    else if (!profileModal.classList.contains('hidden')) closeProfileModal();
    else closeAllDrawers();
  }
});

// ---------- startup ----------
aboutVersion.textContent = 'v0.16.0';
refreshProfileChip();
const saved = settings.get();
app.applySettings(saved);
syncControls();
showView('songs');
showScreen('welcome');
void app.init().then(() => { refresh(); });
void loadSongs();

// Live-refresh the library when the songs folder changes (dev only).
if (import.meta.hot) {
  import.meta.hot.on('pianoflow:songs-changed', () => { void loadSongs(); });
}

function loop(): void {
  if (currentScreen === 'player') {
    app.frame();
    refresh();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
