# 🎹 PianoFlow

**An open-source, Synthesia-style piano practice app.** Falling notes, real piano
sound, MIDI keyboard support, and instant scoring — right in your browser.

> PianoFlow is an independent open-source project. It is **not** affiliated with,
> endorsed by, or connected to Synthesia LLC. "Synthesia" is a trademark of its
> respective owner; the name is used here only to describe the category of app.

---

## ✨ Features

- **Three-screen experience** — an animated welcome screen with local profiles
  (log in / create / continue as guest), a song library with live search, genre
  filters and favorites, and a focused full-screen player; a sidebar also gives you
  Practice, Progress and Settings views.
- **Falling-notes renderer** — Canvas2D, 88-key keyboard, color-coded hands, HiDPI aware.
- **Built for dense scores** — a time-bucket note index + viewport culling draws only the
  notes on screen (batched per hand), so very dense "black MIDI" files stay smooth.
- **Stage presentation** — a layered gradient backdrop with an ambient strike-line glow,
  a luminous hit line that pulses when you hit a note, and gradient keys with a soft glow
  on pressed keys, wrapped in a cohesive dark "concert stage" UI with glassy panels.
- **Playfield feedback** — keys glow in the hand color as their notes approach so you can
  anticipate finger placement, and successful hits burst into hand-colored sparks at the
  strike line for immediate, satisfying feedback.
- **Game-feel rewards** — combo milestones (10 / 25 / 50 / 100, then every 50) trigger a
  golden shockwave ring + radial spark burst and a soft two-note chime (higher combos ring
  higher), while a missed note flashes the stage edges red. Milestone-only sound keeps the
  reward meaningful without reading as noise; everything obeys the master mute/volume.
- **Auto-fit keyboard** — the visible keyboard zooms to the song's actual pitch span
  (Synthesia-style), so the falling notes fill the stage and stay large and readable instead
  of clustering in the middle of 88 keys. Boundaries snap to white keys with a minimum span;
  toggle "Fit keyboard to song" off to see the full A0–C8 piano. Re-fits on load and transpose.
- **Master mute** — one always-visible 🔊 button in the top bar silences everything
  (piano + metronome) in a single click; sound is on by default and the choice is saved.
- **Player comfort** — a persisted volume slider (mute always wins), a pause overlay with
  Resume / Restart / Back, and an on-stage hand-color legend (blue = right, green = left).
- **Calibration & key control** — input-latency compensation (±250 ms) so MIDI/keyboard
  timing lines up with what you hear, live transpose (±12 semitones) from the top bar, and
  a manual hand-split pitch slider for single-track files. All persisted.
- **Record & export** — capture your live performance (⏺ in the player) and download it as
  a standard `.mid` file (top-bar ⤓ or the results screen), ready to re-import or share.
- **Installable PWA** — add to home screen / install as a desktop app; a service worker
  caches the shell, songs and SoundFont so you can practice fully offline after first load.
- **Real piano sound, fully offline** — FluidR3_GM SoundFont samples via [`smplr`](https://github.com/danigb/smplr),
  bundled locally (no CDN needed); falls back to the CDN, then a built-in additive synth.
- **Sound palette** — switch timbre in the player (⚙️) or Settings: Grand Piano, Electric Piano,
  Music Box, Vibraphone. All four are bundled for offline play; switching reloads samples live.
- **Standard MIDI file parsing** — zero-dependency SMF parser (format 0/1, tempo map,
  time signatures, running status).
- **Transport** — play / pause / stop / seek, speed 0.25×–2×.
- **Two modes** — a prominent 🎧 Listen / 🎹 Play segmented toggle sits in the player top
  bar, so the core play-along loop is one tap away (no drawer digging).
  - *Listen* — auto-plays the song; play along freely.
  - *Practice* — you produce the sound; hits are judged (`perfect` / `good`), misses
    and wrong notes are counted, with combo / accuracy / grade (S–D). The first time you
    enter Practice, a dismissible coaching card explains the three input methods (MIDI,
    computer keys A–L, tap the on-screen piano) and the Wait-mode tip.
- **Wait mode** — playback pauses at each note **or chord** until you press the right
  key(s) (Practice).
- **A-B loop** — mark a region with the **A** / **B** buttons and loop it to drill
  difficult passages; the region is highlighted on the falling-notes view.
- **Metronome + count-in** — tempo-synced click track with accented downbeats and an
  optional lead-in (1 / 2 / 4 beats) before playback starts.
- **Hand filtering** — Both / Right / Left (in Listen mode this mutes the other hand).
- **Three input methods** — USB MIDI keyboard (Web MIDI), computer keyboard, and
  mouse / multi-touch on the virtual keys.
- **MIDI device map** — list connected USB MIDI inputs, choose one (or all), and watch a
  live note monitor; devices are detected automatically on hot-plug.
- **Accessibility & readability** — optional note-name labels on the falling notes
  (C4, D4, …), key labels, and a colorblind-friendly palette.
- **Bundled public-domain songs** — seven classics: *Twinkle Twinkle*, *Ode to Joy*,
  *London Bridge*, *Happy Birthday*, *Minuet in G*, *Greensleeves*, and *Für Elise*.
- **Song library** — browse bundled tracks with composer, duration, note count and a
  ★ difficulty estimate; your best grade / accuracy is shown per song.
- **Bring your own MIDI** — drop any `.mid` / `.midi` into `apps/web/public/songs/` and it
  appears in the library automatically: the folder is auto-indexed (dev live-refreshes on
  change; the index is baked into the production build). Curated metadata lives in
  `songs.json` / `songs/user.json`; unknown files get a prettified name under "Imported".
  You can also open a local `.mid` ad-hoc via 📂 Open .mid. Single-track (format 0) files
  are auto-split into hands by pitch.
- **Progress persistence** — best accuracy / grade / combo and play count are saved
  locally (localStorage), per song, and survive reloads.
- **Practice history & trends** — every completed Practice run is logged locally; the
  **📈 History** panel shows overall stats, per-song progress (first → latest accuracy with
  an improvement trend) and your recent sessions.
- **Practice insights** — the Progress view adds current / longest streaks and active-day
  count, a 7-day activity chart, and a 12-badge achievement board (sessions, S grades,
  flawless runs, combos, streaks, explorer) with per-badge progress, all computed locally.
- **Sheet-music view** — a 🎼 toggle in the player opens a scrolling grand staff (treble =
  right hand, bass = left) with vector clefs, barlines from the time signature, noteheads /
  stems / flags / accidentals / ledger lines and a glowing play cursor synced to playback.
  Notation math is pure and headless-tested; noteheads are tinted by hand to match the falling notes.
- **Results screen** — at the end of a Practice run: grade, accuracy, perfect / good /
  miss / wrong breakdown, max combo, and a "new best" indicator, with one-click retry.
- **Settings persistence** — mode, speed, hands, wait, labels, colorblind, metronome,
  count-in and mute are remembered across reloads.
- **Plugin system** — extend PianoFlow with overlays and practice aids through a small,
  error-isolated API (lifecycle events + a draw surface). Six plugins ship built in
  (combo overlay, session stats, auto-pause on mistakes, practice HUD, tempo trainer,
  loop trainer); toggle them in the **🧩 Plugins** panel and your choices are saved. See [PLUGINS.md](PLUGINS.md) to write your own.

## 🚀 Quick start

Requires **Node.js ≥ 20** and **pnpm ≥ 9**.

```bash
pnpm install        # install workspace dependencies
pnpm songs          # generate the bundled public-domain MIDI songs
pnpm dev            # start the dev server (http://localhost:5173)
```

Open the printed URL in **Chrome / Edge / Opera** for full MIDI support.

### Other scripts

```bash
pnpm build          # production build of the web app (apps/web/dist)
pnpm preview        # preview the production build
pnpm test           # run the core unit tests (vitest)
pnpm typecheck      # TypeScript type-check
pnpm soundfont      # re-download the bundled offline piano samples (optional)
```

## 🎮 Controls

| Action | Input |
| --- | --- |
| Play / Pause | `Space` or the ▶ button in the player top bar |
| Play notes | USB MIDI keyboard, computer keys `A W S E D F T G Y H U J K O L P ;`, or click/touch the keys |
| Seek | drag the timeline slider under the player top bar |
| Speed | the − / + stepper in the player top bar (or Practice view) |
| Mode | the 🎧 Listen / 🎹 Play toggle in the player top bar (or ⚙ drawer / Practice view) |
| Hands / Count-in | player ⚙ drawer, or the Practice view |
| Wait / Key labels / Note names / Colorblind | player ⚙ drawer, or the Settings view |
| A-B loop | player ⚙ drawer: **A** / **B** set the region, **Loop** toggles, **✕** clears |
| Metronome | the metronome button in the player top bar (or Practice view) |
| Mute / unmute | the 🔊 button in the player top bar (silences piano + metronome; saved) |
| Next song | the ⏭ button in the player top bar |
| Fullscreen | the ⛶ button in the player top bar |
| Sheet music | the 🎼 button in the player top bar opens a synced grand-staff panel (✕ or Esc closes) |
| Fit keyboard | player ⚙ drawer or Settings → Display: "Fit keyboard to song" zooms to the song's range (off = full 88 keys) |
| Song library | sidebar **Songs**: search, genre chips, ♥ favorite, ▶ Play, or open a local `.mid` |
| MIDI devices | Settings → MIDI, or player ⚙ → MIDI; pick a device (or All) and watch the note monitor |
| Plugins | Settings → Plugins, player ⚙, or the Practice view; enable / disable (saved) |
| Practice history | sidebar **Progress**: overall stats, per-song trends and recent sessions |
| Profiles | welcome screen, or the sidebar footer (switch / create) |
| Results | shown automatically at the end of a Practice run; **Retry** / **Close** |

## 🧱 Architecture

A pnpm monorepo with a **platform-agnostic TypeScript core** so the same logic can
later power a desktop (Tauri) or mobile shell.

```
packages/
  core/      MIDI parsing/writing, tempo map, hand assignment, scoring, transport, progress/difficulty, session history/insights, viewport index, keyboard auto-fit, sheet-music notation, plugin manager (no DOM)
  audio/     Web Audio engine: smplr SoundFont + synth fallback, look-ahead scheduler, master mute/volume
  render/    Canvas2D falling-notes renderer (viewport culling + batched draws + glow/sparks), scrolling grand-staff renderer, keyboard geometry, themes
  input/     Web MIDI, computer keyboard, pointer/touch adapters
apps/
  web/       Vite app wiring everything together (3-screen UI + controls + PWA)
scripts/
  generate-songs.mjs   zero-dependency MIDI writer for the bundled PD songs
  fetch-soundfont.mjs  downloads the bundled offline instrument SoundFonts
  generate-icons.py    renders the PWA/app icons (Pillow)
  render-preview.mjs   headless real-canvas (@napi-rs/canvas) PNG previews of the playfield + sheet for visual QA
```

The packages export TypeScript source directly and are consumed by Vite via aliases,
so there is no separate per-package build step during development.

## 🧩 Plugins

A plugin reacts to lifecycle events (song loaded, transport, note hit / miss / wrong,
score reset, per-frame, result) and can draw overlays through a `DrawSurface`. Each
plugin runs in isolation — one that throws is logged and skipped, never breaking the app
or the other plugins. Six ship built in:

| Plugin | What it does | Default |
| --- | --- | --- |
| **Combo overlay** | live combo counter + fading judgement flash on the playfield | on |
| **Session stats** | tallies hits / perfect / good / miss / wrong / max combo, logs a summary | on |
| **Auto-pause on mistakes** | pauses after N consecutive misses / wrong notes so you can recover | off |
| **Practice HUD** | live accuracy percentage + a song-progress bar at the top of the playfield | off |
| **Tempo trainer** | starts a song slow and steps the speed up after consecutive clean passes, toward a target tempo | off |
| **Loop trainer** | drills the A-B loop region, reports per-lap accuracy and optionally speeds up after clean laps | off |

Toggle them in the **🧩 Plugins** panel; choices are saved with your settings. See
**[PLUGINS.md](PLUGINS.md)** for the full API and a worked example.

## 🌐 Browser support

| Browser | Falling notes & sound | USB MIDI (Web MIDI) |
| --- | --- | --- |
| Chrome / Edge / Opera | ✅ | ✅ |
| Firefox | ✅ | ⚠️ gated / partial |
| Safari (macOS / iOS) | ✅ | ❌ (use computer keyboard or touch) |

Piano samples are **bundled locally**, so sound works fully offline. If the local file
is missing, PianoFlow falls back to the CDN, then to the built-in synth.

## 🗺️ Roadmap

- **M0 (done)** — vertical slice: parse → render → sound → transport → basic scoring.
- **M1 (done)** — A-B loop regions, metronome + count-in, chord-aware wait mode, listen-mode hand mute.
- **M2 (done)** — song library with difficulty, localStorage progress persistence, end-of-song results.
- **M3 (partial)** — offline SoundFont bundling and MIDI device mapping UI (done); desktop shell (Tauri) pending — requires a Rust toolchain.
- **M4 (done)** — expanded public-domain song library (7 tracks) and settings persistence.
- **M5 (partial)** — black-MIDI rendering optimizations: time-bucket note index, viewport culling and batched draws (done); WebGL renderer pending.
- **M6 (done)** — extensible plugin system (lifecycle events + draw surface, error-isolated) with bundled plugins and a toggle panel.
- **M7 (done)** — readability & feedback: note-name labels on falling notes and a Practice HUD plugin (live accuracy + song progress).
- **M8 (done)** — Tempo trainer plugin: gradual speed-up after consecutive clean passes (host `setSpeed` API).
- **M9 (done)** — practice session history: per-song progress trends and recent sessions, persisted locally.
- **M10 (done)** — stage polish: layered gradient backdrop, pulsing hit line, glowing keys, a cohesive UI palette, and a master mute control.
- **M11 (done)** — loop trainer plugin: per-lap accuracy over the A-B region with optional speed-up (host loop API).
- **M12 (done)** — three-screen UI redesign: animated welcome + local profiles, searchable/filterable song library with favorites, and a focused full-screen player with Practice / Progress / Settings views.
- **M13 (done)** — playfield feedback: hand-colored anticipation glow on upcoming keys and hit-spark particles at the strike line.
- **M14 (done)** — player comfort: persisted volume control, pause overlay (resume/restart/back), and a hand-color legend.
- **M15 (done)** — automatic song-folder indexing: drop a `.mid` into `public/songs/` and it appears in the library (dev live-refresh + baked build index), with metadata overrides and pitch-based hand split for format-0 files.
- **M16 (done)** — calibration & key control: input-latency compensation (±250 ms), live transpose (±12 semitones), and a manual hand-split slider; all persisted and unit-tested.
- **M17 (done)** — performance recording & export: capture live input to a timed take and download it as a standard MIDI file (zero-dep writer, round-trip tested against the parser).
- **M18 (done)** — installable PWA: web manifest + generated icons + offline service worker (shell/songs/SoundFont cached; navigation falls back to the shell), registered in production builds and runtime-tested headlessly.
- **M19 (done)** — sound palette: four bundled FluidR3_GM timbres (grand piano / electric piano / music box / vibraphone) with a live instrument picker in the player and Settings; engine hot-swaps samples offline-first, choice persisted.
- **M20 (done)** — practice insights: current/longest streaks + active days, a 7-day activity chart, and a 12-badge achievement board with per-badge progress in the Progress view (pure, headless-tested).
- **M21 (done)** — sheet-music view: a scrolling grand staff with vector clefs, time-signature barlines, noteheads/stems/flags/accidentals/ledger lines and a synced play cursor; pure notation core + canvas renderer, headless-tested.
- **M22 (done)** — auto-fit keyboard (Synthesia-style zoom to the song's pitch span, white-key snapped, toggleable) + a headless real-canvas render-preview harness (`pnpm render-preview`) that rasterizes the playfield and sheet to PNGs for visual QA.
- **M23 (done)** — game-feel pass: a headless full-loop integration test drives the real controller (load → practice → hit/miss/wait/transpose/record → result) end-to-end, plus combo-milestone celebrations (golden shockwave + spark burst + chime) and a red miss flash, all verified visually via the render-preview harness.
- **M24 (done)** — play-along discoverability: a prominent Listen / Play segmented toggle in the player top bar and a one-time, dismissible first-play coaching card (MIDI / computer-keyboard / touch input + Wait-mode tip), making the core game loop one tap away.

## 📄 License & attribution

- Code: **GPL-3.0-or-later** — see [LICENSE](LICENSE).
- Bundled songs are **public domain** (traditional / Beethoven / Petzold), as simplified practice arrangements.
- Piano samples: **FluidR3_GM** via `smplr` / `midi-js-soundfonts` (MIT / respective licenses).

See [ATTRIBUTION.md](ATTRIBUTION.md) for details.

## 🤝 Contributing

Issues and pull requests are welcome. Please run `pnpm test` and `pnpm typecheck`
before submitting. CI (GitHub Actions) runs tests, typecheck and the production build
on every push and pull request. By contributing you agree your contributions are
licensed under GPL-3.0-or-later.

---

## 🇨🇳 中文简介

**PianoFlow** 是一款开源的、类似 Synthesia 的钢琴练习应用：下落音符、真实钢琴音色、
MIDI 键盘输入与即时评分，全部在浏览器中运行。

> 本项目为独立开源项目，与 Synthesia LLC 无任何关联，也未获其背书。"Synthesia" 为其
> 各自所有者的商标，此处仅用于说明应用类别。

**快速开始**（需 Node ≥ 20、pnpm ≥ 9）：

```bash
pnpm install   # 安装依赖
pnpm songs     # 生成内置公版 MIDI 曲目
pnpm dev       # 启动开发服务器（http://localhost:5173）
```

**核心功能**：三屏体验（动画欢迎页 + 本地档案登录/创建/访客；可搜索/按流派筛选/收藏的曲库；
专注的全屏播放器，侧栏另含练习/进度/设置视图）；Canvas2D 下落音符 + 88 键键盘（时间桶索引 + 视口裁剪 + 批量绘制，密集黑 MIDI 更流畅）；FluidR3_GM SoundFont 真实钢琴音色（采样已
本地内置、完全离线可用，缺失时回退 CDN 再回退内置合成器）；MIDI 设备映射（列出/选择输入设备、
实时音符监视、热插拔检测）；零依赖 MIDI 解析；播放/暂停/停止/拖动/变速（0.25×–2×）；聆听与练习
两种模式（播放器顶栏 🎧 聆听 / 🎹 演奏 分段开关，核心玩法一键直达；首次进入演奏弹出可关闭的新手引导卡：MIDI/电脑键盘 A–L/触屏三种输入+等待模式提示）；练习模式下的判定（perfect/good）、连击、准确率与评级（S–D）；和弦感知等待模式；
A-B 循环区间（在落键视图高亮）；节拍器与倒数拍（1/2/4 拍）；左右手过滤（聆听模式可分手
静音）；USB MIDI / 电脑键盘 / 鼠标触屏三种输入；下落音符音名标签（C4、D4…）、琴键标签与色盲友好配色；曲库（难度星级、
时长、音符数）；本地进度持久化（最佳准确率/评级/连击与游玩次数）；练习结束结算画面（评级、
判定明细、新纪录提示）；练习会话历史与趋势（每首歌首次→最新准确率、进步幅度、近期会话，本地持久化）；练习洞察（当前/最长连续天数与活跃天数、近 7 天活动图、12 枚成就徽章含进度，Progress 视图本地计算）；五线谱视图（播放器 🎼 按钮开启滚动大谱表：高音=右手/低音=左手，矢量谱号、拍号小节线、符头/符干/符尾/升降号/加线与同步播放光标，纯函数记谱核心+无头测试）；自适应键盘（Synthesia 式按曲目音域自动缩放，白键对齐、可切换全 88 键，加载/移调时重新适配）；无头真实 Canvas 渲染预览（pnpm render-preview 将演奏画面与五线谱光栅化为 PNG 供视觉校验）；设置持久化（模式/速度/手/等待/标签/色盲/节拍器/倒数拍/静音刷新后保留）；
舞台质感（分层渐变背景 + 判定线氛围光晕、命中脉冲发光判定线、渐变琴键与按下辉光、统一深色舞台 UI）；演奏反馈（音符临近时琴键按手色预发光提示指位、命中时判定线火花粒子）；游戏化奖励（连击里程碑 10/25/50/100 及之后每 50 触发金色冲击波环+放射火花+柔和双音提示音，越高连击音越高；漏音时舞台边缘红光闪烁，仅里程碑发声避免嘈杂，统一受主静音/音量控制）；主静音（顶栏 🔊 一键静音钢琴+节拍器，默认开启声音）；音量滑杆（持久化、静音优先）；暂停覆盖层（继续/重开/返回）；手色图例（蓝=右手、绿=左手）；校准与调性（输入延迟补偿 ±250ms、顶栏实时移调 ±12 半音、单轨手动分手音高滑杆，均持久化）；演奏录制与导出（⏺ 录制实时演奏，⤓ 下载为标准 .mid，可再导入/分享）；可安装 PWA（manifest + 生成图标 + 离线 service worker，首载后断网可练）；音色面板（三角钢琴/电钢琴/八音盒/颤音琴四种内置 FluidR3_GM 音色，播放器与设置中实时切换、离线优先、选择持久化）；
插件系统（生命周期事件 + 绘制表面 API，错误隔离，内置连击叠加/会话统计/失误自动暂停/练习 HUD/速度训练器/循环训练器六个插件，
开关持久化，详见 PLUGINS.md）；
内置 7 首公版曲目（小星星、欢乐颂、伦敦桥、生日快乐、G 大调小步舞曲、绿袖子、致爱丽丝）；自动曲库索引（把任意 .mid/.midi 放入 public/songs/ 即自动出现在歌单，开发环境实时刷新、构建时烘焙索引，未知文件归入 Imported 并按音高自动拆手）。

**架构**：pnpm monorepo，平台无关的 TypeScript 核心（`core`/`audio`/`render`/`input`），
便于后续扩展到 Tauri 桌面端与移动端。

**浏览器**：Chrome/Edge/Opera 完整支持 Web MIDI；Firefox 部分支持；Safari 不支持 Web MIDI
（可用电脑键盘或触屏）。

**许可证**：代码 GPL-3.0-or-later；内置曲目为公版；钢琴采样来自 FluidR3_GM（经 smplr /
midi-js-soundfonts）。详见 [LICENSE](LICENSE) 与 [ATTRIBUTION.md](ATTRIBUTION.md)。
