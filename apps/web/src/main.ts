import { PianoFlowApp } from './app';
import type { AppSettings, Hands, Mode } from './app';
import { ProgressStore, SettingsStore, HistoryStore } from './storage';
import { startWelcome } from './welcome';
import { applyStaticTranslations, htmlLang } from './i18n-dom';
import { SheetRenderer } from '@pianoflow/render';
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
  INSTRUMENTS,
  computeStreaks,
  recentActivity,
  computeAchievements,
  accuracyColor,
  t,
  detectLang,
  isLang,
  LANGS,
  sortLibrary,
  isLibrarySort,
  applyBulkFavorite,
  toggleSelected,
  CURRICULUM,
  buildStageProgress,
  curriculumSummary,
} from '@pianoflow/core';
import type { SessionResult, SongStats, Difficulty, SessionEntry, Lang, LibrarySort, LibraryMeta, Lesson, LessonProgress, CurriculumRecord } from '@pianoflow/core';

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

// ---------- language (English / 中文) ----------
const LANG_KEY = 'pianoflow.lang.v1';
function loadLang(): Lang {
  try {
    const raw = localStorage.getItem(LANG_KEY);
    if (isLang(raw)) return raw;
  } catch { /* ignore */ }
  return detectLang(typeof navigator !== 'undefined' ? navigator.language : null);
}
let lang: Lang = loadLang();
function tr(key: string, vars?: Record<string, string | number>): string {
  return t(lang, key, vars);
}
function saveLang(): void {
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ }
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
  learn: $<HTMLElement>('view-learn'),
  progress: $<HTMLElement>('view-progress'),
  settings: $<HTMLElement>('view-settings'),
};
const songSearch = $<HTMLInputElement>('songSearch');
const sortSel = $<HTMLSelectElement>('sortSel');
const genreChips = $<HTMLElement>('genreChips');
const songList = $<HTMLElement>('songList');
const loadBtn = $<HTMLButtonElement>('loadBtn');
const fileInput = $<HTMLInputElement>('fileInput');
const selectBtn = $<HTMLButtonElement>('selectBtn');
const bulkBar = $<HTMLElement>('bulkBar');
const bulkCount = $<HTMLElement>('bulkCount');
const bulkAll = $<HTMLButtonElement>('bulkAll');
const bulkNone = $<HTMLButtonElement>('bulkNone');
const bulkFav = $<HTMLButtonElement>('bulkFav');
const bulkUnfav = $<HTMLButtonElement>('bulkUnfav');
const bulkDone = $<HTMLButtonElement>('bulkDone');

const pHands = $<HTMLSelectElement>('pHands');
const pSpeed = $<HTMLSelectElement>('pSpeed');
const pCountIn = $<HTMLSelectElement>('pCountIn');
const pWait = $<HTMLInputElement>('pWait');
const pMetro = $<HTMLInputElement>('pMetro');
const pHandAssist = $<HTMLInputElement>('pHandAssist');
const practicePlugins = $<HTMLElement>('practicePlugins');
const startPracticeBtn = $<HTMLButtonElement>('startPracticeBtn');

const learnProgressLabel = $<HTMLElement>('learnProgressLabel');
const learnBarFill = $<HTMLElement>('learnBarFill');
const learnContinue = $<HTMLElement>('learnContinue');
const learnContinueTitle = $<HTMLElement>('learnContinueTitle');
const learnContinueBtn = $<HTMLButtonElement>('learnContinueBtn');
const learnAllDone = $<HTMLElement>('learnAllDone');
const learnPath = $<HTMLElement>('learnPath');

const progressSummary = $<HTMLElement>('progressSummary');
const progressList = $<HTMLElement>('progressList');
const streakStats = $<HTMLElement>('streakStats');
const activityBars = $<HTMLElement>('activityBars');
const achievementGrid = $<HTMLElement>('achievementGrid');
const progressClear = $<HTMLButtonElement>('progressClear');

const sLabels = $<HTMLInputElement>('sLabels');
const sNoteLabels = $<HTMLInputElement>('sNoteLabels');
const sColorblind = $<HTMLInputElement>('sColorblind');
const sFitKeys = $<HTMLInputElement>('sFitKeys');
const sGpu = $<HTMLInputElement>('sGpu');
const sBeatGrid = $<HTMLInputElement>('sBeatGrid');
const sMute = $<HTMLInputElement>('sMute');
const sVolume = $<HTMLInputElement>('sVolume');
const sInstrument = $<HTMLSelectElement>('sInstrument');
const instrumentSel = $<HTMLSelectElement>('instrument');
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
const recBtn = $<HTMLButtonElement>('recBtn');
const exportBtn = $<HTMLButtonElement>('exportBtn');
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
const sheetBtn = $<HTMLButtonElement>('sheetBtn');
const sheetPanel = $<HTMLElement>('sheetPanel');
const sheetCanvas = $<HTMLCanvasElement>('sheetCanvas');
const sheetClose = $<HTMLButtonElement>('sheetClose');
const sheetExport = $<HTMLButtonElement>('sheetExport');
const sheet = new SheetRenderer(sheetCanvas);
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
const modeListen = $<HTMLButtonElement>('modeListen');
const modePlay = $<HTMLButtonElement>('modePlay');
const coachHint = $<HTMLElement>('coachHint');
const coachGotIt = $<HTMLButtonElement>('coachGotIt');
const handsSel = $<HTMLSelectElement>('hands');
const countInSel = $<HTMLSelectElement>('countIn');
const waitChk = $<HTMLInputElement>('waitMode');
const labelsChk = $<HTMLInputElement>('labels');
const noteLabelsChk = $<HTMLInputElement>('noteLabels');
const cbChk = $<HTMLInputElement>('colorblind');
const fitKeysChk = $<HTMLInputElement>('fitKeys');
const gpuChk = $<HTMLInputElement>('gpu');
const beatGridChk = $<HTMLInputElement>('beatGrid');
const gpuBadge = $<HTMLElement>('gpuBadge');
const handAssistChk = $<HTMLInputElement>('handAssist');
const assistBadge = $<HTMLElement>('assistBadge');
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
const resultReview = $<HTMLElement>('resultReview');
const reviewTimeline = $<HTMLElement>('reviewTimeline');
const reviewFocus = $<HTMLElement>('reviewFocus');
const resultRetry = $<HTMLButtonElement>('resultRetry');
const resultExport = $<HTMLButtonElement>('resultExport');
const resultClose = $<HTMLButtonElement>('resultClose');

const langWelcome = $<HTMLButtonElement>('langWelcome');
const langSide = $<HTMLButtonElement>('langSide');
const langSelect = $<HTMLSelectElement>('langSelect');
const langSelectPlayer = $<HTMLSelectElement>('langSelectPlayer');

// ---------- helpers ----------
function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function fmtWhen(at: number): string {
  const d = Date.now() - at;
  if (d < 60_000) return tr('hist.when.justNow');
  if (d < 3_600_000) return tr('hist.when.m', { n: Math.floor(d / 60_000) });
  if (d < 86_400_000) return tr('hist.when.h', { n: Math.floor(d / 3_600_000) });
  if (d < 7 * 86_400_000) return tr('hist.when.d', { n: Math.floor(d / 86_400_000) });
  return new Date(at).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US');
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
    maybeShowCoach();
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
  if (name === 'learn') buildLearn();
  if (name === 'settings') syncControls();
}

// ---------- profiles ----------
function refreshProfileChip(): void {
  const name = profiles.active ?? tr('profile.guest');
  profileName.textContent = name;
  profileAvatar.textContent = name.charAt(0).toUpperCase();
}
function openProfileModal(mode: 'login' | 'create'): void {
  profileModalTitle.textContent = mode === 'login' ? tr('profile.loginTitle') : tr('profile.createTitle');
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
interface SongEntry { id: string; title: string; titleZh?: string; composer: string; composerZh?: string; genre?: string; file: string }
let bundledSongs: SongEntry[] = [];
/** Localized display title/composer (zh falls back to the original when absent). */
function locTitle(s: SongEntry | undefined): string {
  if (!s) return '';
  return lang === 'zh' && s.titleZh ? s.titleZh : s.title;
}
function locComposer(s: SongEntry | undefined): string {
  if (!s) return '';
  if (s.composer === 'Imported') return tr('songs.importedComposer');
  return lang === 'zh' && s.composerZh ? s.composerZh : s.composer;
}
function songById(id: string): SongEntry | undefined {
  return bundledSongs.find((s) => s.id === id);
}
let activeGenre = 'All Songs';
let searchTerm = '';
const SORT_KEY = 'pianoflow.sort.v1';
function loadSort(): LibrarySort {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    if (isLibrarySort(raw)) return raw;
  } catch { /* ignore */ }
  return 'recommended';
}
let sortKey: LibrarySort = loadSort();
function saveSort(): void {
  try { localStorage.setItem(SORT_KEY, sortKey); } catch { /* ignore */ }
}
// ---------- library multi-select / bulk actions ----------
let selectMode = false;
let selected = new Set<string>();
let visibleIds: string[] = [];
const songInfoCache = new Map<string, { stats: SongStats; difficulty: Difficulty; duration: number }>();
const ART_EMOJI: Record<string, string> = { Classical: '🎼', Traditional: '🎹', Folk: '🪕', Local: '📁', Imported: '📥' };

function diffBars(level: number): string {
  const lit = Math.max(1, Math.min(8, Math.round((level / 5) * 8)));
  let html = `<span class="song-diff diff-${level}" title="${tr('songs.diff', { level })}">`;
  for (let i = 0; i < 8; i++) html += `<span class="diff-bar${i < lit ? ' lit' : ''}"></span>`;
  return html + '</span>';
}
function genreLabel(g: string): string {
  return tr('genre.' + g);
}
function buildChips(): void {
  const genres = ['All Songs', ...Array.from(new Set(bundledSongs.map((s) => s.genre ?? 'Other')))];
  genreChips.innerHTML = '';
  genres.forEach((g) => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (g === activeGenre ? ' active' : '');
    chip.textContent = genreLabel(g);
    chip.addEventListener('click', () => { activeGenre = g; buildChips(); buildSongList(); });
    genreChips.appendChild(chip);
  });
}
function buildSongList(): void {
  const st = app.getState();
  const q = searchTerm.toLowerCase();
  const filtered = bundledSongs.filter((s) => {
    const genreOk = activeGenre === 'All Songs' || (s.genre ?? 'Other') === activeGenre;
    const hay = `${s.title} ${s.titleZh ?? ''} ${s.composer} ${s.composerZh ?? ''}`.toLowerCase();
    const searchOk = !q || hay.includes(q);
    return genreOk && searchOk;
  });
  const libMeta = (id: string): LibraryMeta | undefined => {
    const info = songInfoCache.get(id);
    const rec = progress.get(id);
    const entry = bundledSongs.find((s) => s.id === id);
    if (!info && !rec && !entry) return undefined;
    return {
      title: locTitle(entry) || id,
      difficulty: info?.difficulty.level ?? 99,
      duration: info?.duration ?? Number.POSITIVE_INFINITY,
      lastPlayedAt: rec?.lastPlayedAt ?? 0,
      bestAccuracy: rec?.bestAccuracy ?? -1,
      favorite: favs.has(id),
    };
  };
  const order = sortLibrary(filtered.map((s) => s.id), sortKey, libMeta);
  const byId = new Map(filtered.map((s) => [s.id, s]));
  const rows = order.map((id) => byId.get(id)!).filter(Boolean);
  visibleIds = rows.map((s) => s.id);
  songList.innerHTML = '';
  if (!rows.length) {
    songList.innerHTML = `<div class="empty-note">${tr('songs.empty')}</div>`;
    updateBulkBar();
    return;
  }
  rows.forEach((s) => {
    const info = songInfoCache.get(s.id);
    const row = document.createElement('div');
    row.className = 'song-row' + (st.songId === s.id ? ' playing' : '') + (selectMode ? ' selecting' : '') + (selected.has(s.id) ? ' selected' : '');
    const genre = s.genre ?? 'Local';
    const composer = locComposer(s);
    const sub = info ? `${composer} · ${tr('songs.notes', { n: info.stats.noteCount })} · ${fmt(info.duration)}` : composer;
    row.innerHTML = `
      ${selectMode ? `<input type="checkbox" class="song-check"${selected.has(s.id) ? ' checked' : ''} aria-label="${locTitle(s)}" />` : ''}
      <div class="song-art art-${genre}">${ART_EMOJI[genre] ?? '🎵'}</div>
      <div class="song-meta">
        <div class="song-title">${locTitle(s)}</div>
        <div class="song-sub">${sub}</div>
      </div>
      ${info ? diffBars(info.difficulty.level) : '<span class="song-diff"></span>'}
      <button class="fav-btn${favs.has(s.id) ? ' on' : ''}" title="${tr('songs.fav')}">${favs.has(s.id) ? '♥' : '♡'}</button>
      <button class="btn btn-primary song-play">${tr('songs.play')}</button>`;
    const favBtn = row.querySelector('.fav-btn') as HTMLButtonElement;
    favBtn.addEventListener('click', () => {
      if (favs.has(s.id)) favs.delete(s.id); else favs.add(s.id);
      saveFavs();
      favBtn.classList.toggle('on', favs.has(s.id));
      favBtn.textContent = favs.has(s.id) ? '♥' : '♡';
    });
    (row.querySelector('.song-play') as HTMLButtonElement).addEventListener('click', () => { void selectSong(s, true); });
    if (selectMode) {
      const check = row.querySelector('.song-check') as HTMLInputElement;
      const syncRow = (): void => {
        const on = selected.has(s.id);
        row.classList.toggle('selected', on);
        check.checked = on;
      };
      check.addEventListener('change', () => { selected = toggleSelected(selected, s.id); syncRow(); updateBulkBar(); });
      row.addEventListener('click', (e) => {
        if (e.target === check || e.target === favBtn) return;
        selected = toggleSelected(selected, s.id); syncRow(); updateBulkBar();
      });
    }
    songList.appendChild(row);
  });
  updateBulkBar();
}
function setSelectMode(on: boolean): void {
  selectMode = on;
  if (!on) selected = new Set();
  selectBtn.classList.toggle('active', on);
  selectBtn.setAttribute('aria-pressed', String(on));
  selectBtn.textContent = on ? tr('songs.selectDone') : tr('songs.select');
  bulkBar.classList.toggle('hidden', !on);
  buildSongList();
}
function updateBulkBar(): void {
  if (!selectMode) return;
  const n = selected.size;
  bulkCount.textContent = tr('songs.selected', { n });
  const allVisible = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  bulkAll.disabled = allVisible;
  bulkNone.disabled = n === 0;
  bulkFav.disabled = n === 0;
  bulkUnfav.disabled = n === 0;
}
function bulkFavorite(favorite: boolean): void {
  if (!selected.size) return;
  const snapshot = new Set(favs);
  const n = selected.size;
  favs = applyBulkFavorite(favs, selected, favorite);
  saveFavs();
  buildSongList();
  showUndoToast(tr(favorite ? 'songs.bulkFavDone' : 'songs.bulkUnfavDone', { n }), () => {
    favs = snapshot; saveFavs(); buildSongList();
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
    playerTitle.textContent = locTitle(entry);
    playerComposer.textContent = locComposer(entry);
    showScreen('player');
    buildSongList();
    if (autoplay) await app.play();
  } catch (err) {
    console.error('Failed to load song', err);
  }
}
// ---------- learn / curriculum ----------
function curriculumRecords(): Record<string, CurriculumRecord> {
  const out: Record<string, CurriculumRecord> = {};
  for (const s of bundledSongs) {
    const rec = progress.get(s.id);
    if (rec) out[s.id] = { bestGrade: rec.bestGrade, bestAccuracy: rec.bestAccuracy, plays: rec.plays };
  }
  return out;
}
function openLesson(lesson: Lesson): void {
  const entry = songById(lesson.songId);
  if (!entry) return;
  app.setMode('practice');
  app.setHands(lesson.hands);
  app.setSpeed(lesson.speed);
  persist();
  syncControls();
  void selectSong(entry, true);
}
function lessonCard(p: LessonProgress): HTMLElement {
  const { lesson } = p;
  const entry = songById(lesson.songId);
  const card = document.createElement('div');
  card.className = 'lesson-card status-' + p.status;
  const icon = p.status === 'completed' ? '✓' : p.status === 'locked' ? '🔒' : '▶';
  const best = p.bestGrade ? tr('learn.best', { grade: p.bestGrade }) : tr('learn.notPlayed');
  const goalLabel = tr('learn.goalGrade', { grade: lesson.goal.grade });
  card.innerHTML = `
    <div class="lesson-icon">${icon}</div>
    <div class="lesson-body">
      <div class="lesson-title">${locTitle(entry) || lesson.songId}</div>
      <div class="lesson-tags">
        <span class="lesson-tag">${tr('hands.' + lesson.hands)}</span>
        <span class="lesson-tag">${lesson.speed}×</span>
        <span class="lesson-tag goal">${tr('learn.goal')}: ${goalLabel}</span>
      </div>
      <div class="lesson-tip">${tr(lesson.tipKey)}</div>
    </div>
    <div class="lesson-side">
      <div class="lesson-best">${best}</div>
      <button class="btn btn-primary lesson-practice"${p.status === 'locked' ? ' disabled' : ''}>${tr('learn.practice')}</button>
    </div>`;
  if (p.status !== 'locked') {
    (card.querySelector('.lesson-practice') as HTMLButtonElement).addEventListener('click', () => openLesson(lesson));
  }
  return card;
}
function buildLearn(): void {
  const records = curriculumRecords();
  const stages = buildStageProgress(CURRICULUM, records);
  const sum = curriculumSummary(CURRICULUM, records);
  learnProgressLabel.textContent = tr('learn.progress', { done: sum.completed, total: sum.total });
  learnBarFill.style.width = `${Math.round(sum.pct * 100)}%`;
  const all = stages.flatMap((sp) => sp.lessons);
  const current = all.find((p) => p.lesson.id === sum.currentId) ?? null;
  if (current) {
    learnContinue.classList.remove('hidden');
    learnAllDone.classList.add('hidden');
    learnContinueTitle.textContent = locTitle(songById(current.lesson.songId)) || current.lesson.songId;
    learnContinueBtn.onclick = () => openLesson(current.lesson);
  } else {
    learnContinue.classList.add('hidden');
    learnAllDone.classList.remove('hidden');
  }
  learnPath.innerHTML = '';
  stages.forEach((sp, si) => {
    const stageEl = document.createElement('div');
    stageEl.className = 'learn-stage status-' + sp.status;
    const badge = sp.status === 'complete' ? '✓' : sp.status === 'locked' ? '🔒' : String(si + 1);
    const head = document.createElement('div');
    head.className = 'learn-stage-head';
    head.innerHTML = `
      <div class="learn-stage-badge">${badge}</div>
      <div class="learn-stage-meta">
        <div class="learn-stage-title">${tr(sp.stage.titleKey)}</div>
        <div class="learn-stage-desc">${tr(sp.stage.descKey)}</div>
      </div>
      <div class="learn-stage-count">${sp.completed}/${sp.total}</div>`;
    stageEl.appendChild(head);
    const list = document.createElement('div');
    list.className = 'learn-lessons';
    sp.lessons.forEach((p) => list.appendChild(lessonCard(p)));
    stageEl.appendChild(list);
    learnPath.appendChild(stageEl);
  });
}

songSearch.addEventListener('input', () => { searchTerm = songSearch.value; buildSongList(); });
sortSel.value = sortKey;
sortSel.addEventListener('change', () => {
  if (isLibrarySort(sortSel.value)) { sortKey = sortSel.value; saveSort(); buildSongList(); }
});
loadBtn.addEventListener('click', () => fileInput.click());
selectBtn.addEventListener('click', () => setSelectMode(!selectMode));
bulkDone.addEventListener('click', () => setSelectMode(false));
bulkAll.addEventListener('click', () => { selected = new Set([...selected, ...visibleIds]); buildSongList(); });
bulkNone.addEventListener('click', () => { selected = new Set(); buildSongList(); });
bulkFav.addEventListener('click', () => bulkFavorite(true));
bulkUnfav.addEventListener('click', () => bulkFavorite(false));
fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  const buf = await f.arrayBuffer();
  const name = f.name.replace(/\.(mid|midi)$/i, '');
  app.loadBuffer(buf, name, 'local:' + name);
  playerTitle.textContent = name;
  playerComposer.textContent = tr('songs.localComposer');
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
    const name = tr('plugin.' + p.id + '.name');
    const desc = tr('plugin.' + p.id + '.desc');
    item.innerHTML = `
      <div class="plugin-main">
        <div class="plugin-name">${name}${p.version ? ` <span class="muted-line">v${p.version}</span>` : ''}</div>
        <div class="plugin-desc">${desc}</div>
      </div>
      <label class="plugin-toggle"><input type="checkbox" ${p.enabled ? 'checked' : ''} /> <span>${p.enabled ? tr('plugins.on') : tr('plugins.off')}</span></label>`;
    const chk = item.querySelector('input') as HTMLInputElement;
    const lbl = item.querySelector('.plugin-toggle span') as HTMLElement;
    chk.addEventListener('change', () => {
      app.plugins.setEnabled(p.id, chk.checked);
      lbl.textContent = chk.checked ? tr('plugins.on') : tr('plugins.off');
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
  midiSupport.textContent = st.midiSupported ? tr('midi.supported') : tr('midi.unsupported');
  midiDeviceList.innerHTML = '';
  const all = document.createElement('div');
  all.className = 'midi-item' + (st.midiSelected === null ? ' active' : '');
  all.innerHTML = `<div><div class="midi-name">${tr('midi.all')}</div><div class="midi-sub">${tr('midi.allSub')}</div></div>`;
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
function renderInsights(log: SessionEntry[]): void {
  const now = Date.now();
  const streaks = computeStreaks(log, now);
  streakStats.innerHTML = `
    <div class="streak"><div class="streak-val">🔥 ${streaks.current}</div><div class="streak-label">${tr('streak.current')}</div></div>
    <div class="streak"><div class="streak-val">🏆 ${streaks.longest}</div><div class="streak-label">${tr('streak.longest')}</div></div>
    <div class="streak"><div class="streak-val">📆 ${streaks.activeDays}</div><div class="streak-label">${tr('streak.activeDays')}</div></div>`;

  const act = recentActivity(log, now, 7);
  const max = Math.max(1, ...act.map((a) => a.count));
  activityBars.innerHTML = '';
  for (const a of act) {
    const col = document.createElement('div');
    col.className = 'activity-col' + (a.isToday ? ' today' : '');
    col.title = tr('hist.activityTitle', { date: a.key, n: a.count });
    const dow = new Date(a.key + 'T12:00:00').getDay();
    const h = Math.round((a.count / max) * 100);
    col.innerHTML = `<div class="activity-bar" style="height:${Math.max(a.count ? 8 : 2, h)}%"></div><div class="activity-label">${tr('hist.dow.' + dow)}</div>`;
    activityBars.appendChild(col);
  }

  const achievements = computeAchievements(log, now);
  achievementGrid.innerHTML = '';
  for (const a of achievements) {
    const card = document.createElement('div');
    card.className = 'achievement' + (a.earned ? ' earned' : '');
    const pct = Math.round((a.value / a.target) * 100);
    card.innerHTML = `
      <div class="achievement-icon">${a.icon}</div>
      <div class="achievement-main">
        <div class="achievement-title">${tr('ach.' + a.id + '.title')}</div>
        <div class="achievement-desc">${tr('ach.' + a.id + '.desc')}</div>
        <div class="achievement-track"><div class="achievement-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="achievement-state">${a.earned ? '✓' : `${a.value}/${a.target}`}</div>`;
    achievementGrid.appendChild(card);
  }
}

function buildHistory(): void {
  const log = history.getAll();
  const sum = summarizeHistory(log);
  progressSummary.innerHTML = `
    <div class="stat"><div class="stat-val">${sum.totalSessions}</div><div class="stat-label">${tr('stat.sessions')}</div></div>
    <div class="stat"><div class="stat-val">${sum.songsPracticed}</div><div class="stat-label">${tr('stat.songsPracticed')}</div></div>
    <div class="stat"><div class="stat-val">${Math.round(sum.averageAccuracy * 100)}%</div><div class="stat-label">${tr('stat.avgAccuracy')}</div></div>
    <div class="stat"><div class="stat-val">${Math.round(sum.bestAccuracy * 100)}%</div><div class="stat-label">${tr('stat.bestAccuracy')}</div></div>`;
  renderInsights(log);
  progressList.innerHTML = '';
  if (!log.length) {
    progressList.innerHTML = `<div class="empty-note">${tr('progress.empty')}</div>`;
    return;
  }
  const songsHead = document.createElement('div');
  songsHead.className = 'hist-section';
  songsHead.textContent = tr('progress.bySong');
  progressList.appendChild(songsHead);
  practicedSongIds(log).forEach((id) => {
    const trend = songTrend(log, id);
    if (!trend) return;
    const title = locTitle(songById(id)) || log.find((e) => e.songId === id)?.songTitle || id;
    const card = document.createElement('div');
    card.className = 'hist-song';
    card.innerHTML = `
      <div class="hist-song-head"><span class="hist-song-title">${title}</span>${trendBadge(trend.improvement)}</div>
      <div class="hist-song-sub">${tr('hist.sessions', { n: trend.sessions })} · ${Math.round(trend.firstAccuracy * 100)}% → ${Math.round(trend.latestAccuracy * 100)}% · ${tr('hist.best', { pct: Math.round(trend.bestAccuracy * 100) })}</div>`;
    progressList.appendChild(card);
  });
  const recentHead = document.createElement('div');
  recentHead.className = 'hist-section';
  recentHead.textContent = tr('progress.recent');
  progressList.appendChild(recentHead);
  recentSessions(log, 12).forEach((e) => {
    const row = document.createElement('div');
    row.className = 'hist-row';
    row.innerHTML = `
      <div class="hist-row-main"><div class="hist-row-title">${locTitle(songById(e.songId)) || e.songTitle}</div><div class="hist-row-when">${fmtWhen(e.at)}</div></div>
      <div class="hist-row-score"><span class="hist-grade grade-${e.grade}">${e.grade}</span><span class="hist-acc">${Math.round(e.accuracy * 100)}%</span></div>`;
    progressList.appendChild(row);
  });
}
// ---------- undo toast (destructive clears are reversible) ----------
const toast = $<HTMLElement>('toast');
const toastMsg = $<HTMLElement>('toastMsg');
const toastUndo = $<HTMLButtonElement>('toastUndo');
const toastClose = $<HTMLButtonElement>('toastClose');
let toastTimer: number | null = null;
let toastUndoFn: (() => void) | null = null;
function hideToast(): void {
  toast.classList.add('hidden');
  if (toastTimer !== null) { window.clearTimeout(toastTimer); toastTimer = null; }
  toastUndoFn = null;
}
function showUndoToast(message: string, onUndo: () => void): void {
  toastMsg.textContent = message;
  toastUndoFn = onUndo;
  toast.classList.remove('hidden');
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(hideToast, 8000);
}
toastUndo.addEventListener('click', () => {
  const fn = toastUndoFn;
  hideToast();
  fn?.();
});
toastClose.addEventListener('click', hideToast);

function clearHistoryWithUndo(): void {
  const snapshot = [...history.getAll()];
  history.clear();
  buildHistory();
  showUndoToast(tr('toast.clearedHistory'), () => { history.restore(snapshot); buildHistory(); });
}
function clearScoresWithUndo(): void {
  const snapshot = { ...progress.getAll() };
  progress.clear();
  buildSongList();
  if (!views.progress.classList.contains('hidden')) buildHistory();
  showUndoToast(tr('toast.clearedScores'), () => {
    progress.restore(snapshot);
    buildSongList();
    if (!views.progress.classList.contains('hidden')) buildHistory();
  });
}
progressClear.addEventListener('click', clearHistoryWithUndo);
clearHistoryBtn.addEventListener('click', clearHistoryWithUndo);
clearProgressBtn.addEventListener('click', clearScoresWithUndo);

// ---------- result ----------
function renderReview(): void {
  const review = app.getReview();
  if (!review || review.measures.length === 0) {
    resultReview.classList.add('hidden');
    return;
  }
  resultReview.classList.remove('hidden');
  reviewTimeline.replaceChildren();
  for (const m of review.measures) {
    const cell = document.createElement('div');
    cell.className = 'review-cell';
    cell.style.background = accuracyColor(m.accuracy);
    cell.style.flexGrow = String(Math.max(1, m.total));
    const label = tr('review.cell', { n: m.measure, pct: Math.round(m.accuracy * 100), hit: m.perfect + m.good, total: m.total });
    cell.title = label;
    cell.setAttribute('role', 'img');
    cell.setAttribute('aria-label', label);
    reviewTimeline.appendChild(cell);
  }
  reviewFocus.replaceChildren();
  if (review.weakest.length === 0) {
    const clean = document.createElement('span');
    clean.className = 'review-clean';
    clean.textContent = tr('review.clean');
    reviewFocus.appendChild(clean);
    return;
  }
  const lbl = document.createElement('span');
  lbl.className = 'review-focus-label';
  lbl.textContent = tr('review.focus');
  reviewFocus.appendChild(lbl);
  for (const m of review.weakest) {
    const chip = document.createElement('button');
    chip.className = 'focus-chip';
    chip.style.setProperty('--fc', accuracyColor(m.accuracy));
    chip.textContent = tr('review.chip', { n: m.measure, pct: Math.round(m.accuracy * 100) });
    chip.title = tr('review.chipTitle', { n: m.measure });
    chip.addEventListener('click', () => {
      resultOverlay.classList.add('hidden');
      app.seek(m.start);
      void app.play();
    });
    reviewFocus.appendChild(chip);
  }
}

let lastResult: { result: SessionResult; songId: string } | null = null;
function showResult(result: SessionResult, songId: string): void {
  lastResult = { result, songId };
  const rec = progress.get(songId);
  resultGrade.textContent = result.grade;
  resultGrade.className = 'result-grade grade-' + result.grade;
  resultTitle.textContent = locTitle(songById(songId)) || app.currentSongInfo().title || tr('result.complete');
  resultBest.textContent = rec ? tr('result.best', { grade: rec.bestGrade, pct: Math.round(rec.bestAccuracy * 100) }) : '';
  resultStats.innerHTML =
    tr('result.stats1', { pct: Math.round(result.accuracy * 100), hits: result.hits, total: result.total }) + '<br>' +
    tr('result.stats2', { perfect: result.perfect, good: result.good, miss: result.miss, wrong: result.wrong }) + '<br>' +
    tr('result.stats3', { combo: result.maxCombo });
  renderReview();
  hidePause();
  resultOverlay.classList.remove('hidden');
}
app.onResult = (result, songId) => {
  progress.recordResult(songId, result);
  history.record(makeSession(songId, locTitle(songById(songId)) || app.currentSongInfo().title || 'Song', result, Date.now()));
  showResult(result, songId);
  buildSongList();
  if (!views.progress.classList.contains('hidden')) buildHistory();
  if (!views.learn.classList.contains('hidden')) buildLearn();
};
resultRetry.addEventListener('click', () => { resultOverlay.classList.add('hidden'); app.seek(0); void app.play(); });
resultClose.addEventListener('click', () => resultOverlay.classList.add('hidden'));

// ---------- recording / export ----------
function downloadMidi(): void {
  const bytes = app.buildRecordingMidi();
  if (!bytes || !bytes.length) return;
  const blob = new Blob([bytes as BlobPart], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (app.currentSongInfo().title || 'performance').replace(/[^\w\- ]+/g, '') + '.mid';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
recBtn.addEventListener('click', () => { app.toggleRecording(); });
exportBtn.addEventListener('click', downloadMidi);
resultExport.addEventListener('click', downloadMidi);

// ---------- drawers ----------
function closeAllDrawers(): void {
  playerSettings.classList.add('hidden');
  midiPanel.classList.add('hidden');
  pluginsPanel.classList.add('hidden');
  closeSheet();
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

// ---------- sheet music ----------
function resizeSheet(): void {
  const r = sheetCanvas.getBoundingClientRect();
  if (r.width > 0 && r.height > 0) sheet.resize(r.width, r.height);
}
function openSheet(): void {
  sheetPanel.classList.remove('hidden');
  sheetBtn.setAttribute('aria-pressed', 'true');
  sheetBtn.classList.add('active');
  resizeSheet();
}
function closeSheet(): void {
  sheetPanel.classList.add('hidden');
  sheetBtn.setAttribute('aria-pressed', 'false');
  sheetBtn.classList.remove('active');
}
function toggleSheet(): void {
  if (sheetPanel.classList.contains('hidden')) openSheet();
  else closeSheet();
}
sheetBtn.addEventListener('click', toggleSheet);
sheetClose.addEventListener('click', closeSheet);

/** Render the full printable score to an offscreen canvas and download it as PNG. */
function exportSheetPng(): void {
  const info = app.currentSongInfo();
  const entry = songById(info.id);
  const title = locTitle(entry) || info.title;
  const composer = locComposer(entry);
  const off = document.createElement('canvas');
  if (!app.exportSheetTo(off, { title, composer, scale: 2 })) return;
  off.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (info.title || 'sheet').replace(/[^\w\- ]+/g, '') + '-sheet.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
sheetExport.addEventListener('click', exportSheetPng);

// ---------- control sync ----------
function syncControls(): void {
  const s = app.getSettings();
  const st = app.getState();
  modeSel.value = s.mode;
  const isPractice = s.mode === 'practice';
  modeListen.classList.toggle('active', !isPractice);
  modePlay.classList.toggle('active', isPractice);
  modeListen.setAttribute('aria-pressed', String(!isPractice));
  modePlay.setAttribute('aria-pressed', String(isPractice));
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
  fitKeysChk.checked = s.fitKeyboard;
  sFitKeys.checked = s.fitKeyboard;
  gpuChk.checked = s.gpu;
  sGpu.checked = s.gpu;
  beatGridChk.checked = s.beatGrid;
  sBeatGrid.checked = s.beatGrid;
  handAssistChk.checked = s.handAssist;
  pHandAssist.checked = s.handAssist;
  const assistEnabled = s.hands !== 'both';
  handAssistChk.disabled = !assistEnabled;
  pHandAssist.disabled = !assistEnabled;
  pMetro.checked = s.metronome;
  sMute.checked = s.muted;
  const volPct = Math.round(s.volume * 100);
  sVolume.value = String(volPct);
  volumeSlider.value = String(volPct);
  sInstrument.value = s.instrument;
  instrumentSel.value = s.instrument;
  latencySlider.value = String(s.latencyMs);
  splitSlider.value = String(s.splitMidi);
  loopChk.checked = st.loopEnabled;
  speedVal.textContent = Math.round(st.speed * 100) + '%';
  metroBtn.setAttribute('aria-pressed', String(s.metronome));
  muteBtn.textContent = s.muted ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-pressed', String(s.muted));
  muteBtn.classList.toggle('muted', s.muted);
  settingsSound.textContent =
    st.soundfontSource === 'local' ? tr('settings.sound.local') :
    st.soundfontSource === 'cdn' ? tr('settings.sound.cdn') : tr('settings.sound.synth');
}

// ---------- player wiring ----------
let seeking = false;
function refresh(): void {
  const st = app.getState();
  playBtn.textContent = st.playing ? '⏸' : '▶';
  recBtn.textContent = st.recording ? '⏹' : '⏺';
  recBtn.classList.toggle('recording', st.recording);
  recBtn.setAttribute('aria-pressed', String(st.recording));
  recBtn.title = st.recording ? tr('player.recStop', { n: st.recordedNotes }) : tr('player.rec');
  exportBtn.disabled = !app.hasRecording;
  if (!seeking) seek.value = String(st.duration > 0 ? Math.round((st.position / st.duration) * 1000) : 0);
  timeEl.textContent = `${fmt(st.position)} / ${fmt(st.duration)}`;
  speedVal.textContent = Math.round(st.speed * 100) + '%';
  transVal.textContent = '♪ ' + (st.transpose > 0 ? '+' : '') + st.transpose;
  latencyVal.textContent = tr('ps.latencyUnit', { n: st.latencyMs });
  splitVal.textContent = noteName(st.splitMidi);
  const sc = st.score;
  scoreEl.textContent = tr('hud.hits', { hits: sc.hits, total: sc.total, combo: sc.combo, pct: Math.round(sc.accuracy * 100) });
  judgeEl.textContent = st.lastJudge ? tr('judge.' + st.lastJudge) : '';
  judgeEl.className = 'judge ' + (st.lastJudge || '');
  loopReadout.textContent = `A ${st.loopStart !== null ? fmt(st.loopStart) : '–:–'} · B ${st.loopEnd !== null ? fmt(st.loopEnd) : '–:–'}`;
  const assistOn = st.mode === 'practice' && st.handAssist && st.hands !== 'both';
  assistBadge.classList.toggle('hidden', !assistOn);
  if (assistOn) {
    const you = st.hands === 'right' ? tr('hands.right') : tr('hands.left');
    const auto = st.hands === 'right' ? tr('hands.left') : tr('hands.right');
    assistBadge.textContent = tr('assist.badge', { you, auto });
  }
  gpuBadge.classList.toggle('hidden', !st.gpuActive);
  midiLastNote.textContent = st.lastMidiNote !== null ? noteName(st.lastMidiNote) : '—';
  const sig = st.midiSelected + '|' + st.midiDevices.map((d) => d.id + d.state).join(',');
  if (sig !== midiSig && !midiPanel.classList.contains('hidden')) { midiSig = sig; buildMidiDevices(); }
}
app.onState = refresh;

function doResize(): void {
  const r = stage.getBoundingClientRect();
  app.resize(r.width, r.height);
  if (!sheetPanel.classList.contains('hidden')) resizeSheet();
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
sInstrument.addEventListener('change', () => { app.setInstrument(sInstrument.value); persist(); syncControls(); });
instrumentSel.addEventListener('change', () => { app.setInstrument(instrumentSel.value); persist(); syncControls(); });
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
modeSel.addEventListener('change', () => setModeAndSync(modeSel.value as Mode));

// ---- prominent play-mode toggle + first-play coaching ----
const COACH_KEY = 'pianoflow.coach.v1';
function coachSeen(): boolean {
  try {
    return localStorage.getItem(COACH_KEY) === '1';
  } catch {
    return true; // storage unavailable -> don't nag
  }
}
function showCoach(): void {
  coachHint.classList.remove('hidden');
}
function hideCoach(): void {
  coachHint.classList.add('hidden');
}
function maybeShowCoach(): void {
  if (app.getSettings().mode === 'practice' && !coachSeen()) showCoach();
}
function dismissCoach(): void {
  hideCoach();
  try {
    localStorage.setItem(COACH_KEY, '1');
  } catch {
    /* ignore */
  }
}
coachGotIt.addEventListener('click', dismissCoach);
function setModeAndSync(mode: Mode): void {
  app.setMode(mode);
  persist();
  syncControls();
  if (mode === 'practice') maybeShowCoach();
  else hideCoach();
}
modeListen.addEventListener('click', () => setModeAndSync('listen'));
modePlay.addEventListener('click', () => setModeAndSync('practice'));
handsSel.addEventListener('change', () => { app.setHands(handsSel.value as Hands); persist(); syncControls(); });
countInSel.addEventListener('change', () => { app.setCountIn(Number(countInSel.value)); persist(); syncControls(); });
waitChk.addEventListener('change', () => { app.setWaitMode(waitChk.checked); persist(); syncControls(); });
labelsChk.addEventListener('change', () => { app.setLabels(labelsChk.checked); persist(); syncControls(); });
noteLabelsChk.addEventListener('change', () => { app.setNoteLabels(noteLabelsChk.checked); persist(); syncControls(); });
cbChk.addEventListener('change', () => { app.setColorblind(cbChk.checked); persist(); syncControls(); });
fitKeysChk.addEventListener('change', () => { app.setFitKeyboard(fitKeysChk.checked); persist(); syncControls(); });
gpuChk.addEventListener('change', () => { app.setGpu(gpuChk.checked); persist(); syncControls(); });
beatGridChk.addEventListener('change', () => { app.setBeatGrid(beatGridChk.checked); persist(); syncControls(); });
handAssistChk.addEventListener('change', () => { app.setHandAssist(handAssistChk.checked); persist(); syncControls(); });
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
pHandAssist.addEventListener('change', () => { app.setHandAssist(pHandAssist.checked); persist(); syncControls(); });
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
sFitKeys.addEventListener('change', () => { app.setFitKeyboard(sFitKeys.checked); persist(); syncControls(); });
sGpu.addEventListener('change', () => { app.setGpu(sGpu.checked); persist(); syncControls(); });
sBeatGrid.addEventListener('change', () => { app.setBeatGrid(sBeatGrid.checked); persist(); syncControls(); });
sMute.addEventListener('change', () => { app.setMuted(sMute.checked); persist(); syncControls(); });

// nav
navButtons.forEach((b) => b.addEventListener('click', () => showView(b.dataset.view ?? 'songs')));

// keyboard shortcuts
window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
  if (e.code === 'Space' && currentScreen === 'player') { e.preventDefault(); userToggle(); }
  if (e.key === 'Escape') {
    if (!coachHint.classList.contains('hidden')) dismissCoach();
    else if (!pauseOverlay.classList.contains('hidden')) { hidePause(); void app.play(); }
    else if (!resultOverlay.classList.contains('hidden')) resultOverlay.classList.add('hidden');
    else if (!profileModal.classList.contains('hidden')) closeProfileModal();
    else if (!sheetPanel.classList.contains('hidden')) closeSheet();
    else closeAllDrawers();
  }
});

// ---------- language application ----------
function applyLanguage(): void {
  document.documentElement.lang = htmlLang(lang);
  applyStaticTranslations(document, tr);
  langSelect.value = lang;
  langSelectPlayer.value = lang;
  const otherLabel = lang === 'en' ? '🌐 中文' : '🌐 English';
  langWelcome.textContent = otherLabel;
  langSide.textContent = otherLabel;
  langWelcome.title = tr('settings.language');
  langSide.title = tr('settings.language');
  for (const sel of [sInstrument, instrumentSel]) {
    for (const opt of Array.from(sel.options)) opt.textContent = tr('instrument.' + opt.value);
  }
  refreshProfileChip();
  buildChips();
  buildSongList();
  selectBtn.textContent = selectMode ? tr('songs.selectDone') : tr('songs.select');
  const cur = songById(app.getState().songId);
  if (cur) {
    playerTitle.textContent = locTitle(cur);
    playerComposer.textContent = locComposer(cur);
  }
  buildPluginList(practicePlugins);
  buildPluginList(pluginsList);
  if (!midiPanel.classList.contains('hidden')) buildMidiDevices();
  if (!views.progress.classList.contains('hidden')) buildHistory();
  if (!views.learn.classList.contains('hidden')) buildLearn();
  if (lastResult && !resultOverlay.classList.contains('hidden')) showResult(lastResult.result, lastResult.songId);
  syncControls();
  refresh();
}
function setLang(next: Lang): void {
  if (!isLang(next)) return;
  lang = next;
  saveLang();
  applyLanguage();
}
langWelcome.addEventListener('click', () => setLang(lang === 'en' ? 'zh' : 'en'));
langSide.addEventListener('click', () => setLang(lang === 'en' ? 'zh' : 'en'));
langSelect.addEventListener('change', () => setLang(langSelect.value as Lang));
langSelectPlayer.addEventListener('change', () => setLang(langSelectPlayer.value as Lang));

// ---------- startup ----------
aboutVersion.textContent = 'v0.39.0';
for (const sel of [langSelect, langSelectPlayer]) {
  sel.innerHTML = '';
  for (const l of LANGS) {
    const opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = l.label;
    sel.appendChild(opt);
  }
}
for (const sel of [sInstrument, instrumentSel]) {
  sel.innerHTML = '';
  for (const inst of INSTRUMENTS) {
    const opt = document.createElement('option');
    opt.value = inst.id;
    opt.textContent = tr('instrument.' + inst.id);
    sel.appendChild(opt);
  }
}
const saved = settings.get();
app.applySettings(saved);
applyLanguage();
showView('songs');
showScreen('welcome');
void app.init().then(() => { refresh(); });
void loadSongs();

// Live-refresh the library when the songs folder changes (dev only).
if (import.meta.hot) {
  import.meta.hot.on('pianoflow:songs-changed', () => { void loadSongs(); });
}

// Installable, offline-capable PWA (production builds only).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline install is best-effort */ });
  });
}

function loop(): void {
  if (currentScreen === 'player') {
    app.frame();
    refresh();
    if (!sheetPanel.classList.contains('hidden')) {
      const layout = app.getSheetLayout();
      if (layout) sheet.render({ layout, position: app.getState().position });
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
