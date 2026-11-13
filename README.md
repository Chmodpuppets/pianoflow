# 🎹 PianoFlow

**An open-source, Synthesia-style piano practice app.** Falling notes, real piano
sound, MIDI keyboard support, and instant scoring — right in your browser.

> PianoFlow is an independent open-source project. It is **not** affiliated with,
> endorsed by, or connected to Synthesia LLC. "Synthesia" is a trademark of its
> respective owner; the name is used here only to describe the category of app.

---

## ✨ Features

- **Falling-notes renderer** — Canvas2D, 88-key keyboard, color-coded hands, HiDPI aware.
- **Built for dense scores** — a time-bucket note index + viewport culling draws only the
  notes on screen (batched per hand), so very dense "black MIDI" files stay smooth.
- **Real piano sound, fully offline** — FluidR3_GM SoundFont samples via [`smplr`](https://github.com/danigb/smplr),
  bundled locally (no CDN needed); falls back to the CDN, then a built-in additive synth.
- **Standard MIDI file parsing** — zero-dependency SMF parser (format 0/1, tempo map,
  time signatures, running status).
- **Transport** — play / pause / stop / seek, speed 0.25×–2×.
- **Two modes**
  - *Listen* — auto-plays the song; play along freely.
  - *Practice* — you produce the sound; hits are judged (`perfect` / `good`), misses
    and wrong notes are counted, with combo / accuracy / grade (S–D).
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
- **Progress persistence** — best accuracy / grade / combo and play count are saved
  locally (localStorage), per song, and survive reloads.
- **Results screen** — at the end of a Practice run: grade, accuracy, perfect / good /
  miss / wrong breakdown, max combo, and a "new best" indicator, with one-click retry.
- **Settings persistence** — mode, speed, hands, wait, labels, colorblind, metronome and
  count-in are remembered across reloads.
- **Plugin system** — extend PianoFlow with overlays and practice aids through a small,
  error-isolated API (lifecycle events + a draw surface). Four plugins ship built in
  (combo overlay, session stats, auto-pause on mistakes, practice HUD); toggle them in the
  **🧩 Plugins** panel and your choices are saved. See [PLUGINS.md](PLUGINS.md) to write your own.

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
| Play / Pause | `Space` or the ▶ button |
| Play notes | USB MIDI keyboard, computer keys `A W S E D F T G Y H U J K O L P ;`, or click/touch the keys |
| Seek | drag the timeline slider |
| Speed / Hands / Mode | footer selectors |
| Wait / Key labels / Note names / Colorblind | footer checkboxes |
| A-B loop | **A** / **B** set the region at the current position, **Loop** toggles, **✕** clears |
| Metronome / Count-in | footer checkbox / selector |
| Song library | **📚 Songs** button; click a song to load it |
| MIDI devices | **🎛 MIDI** button; pick a device (or All) and watch the note monitor |
| Plugins | **🧩 Plugins** button; enable / disable bundled plugins (saved) |
| Results | shown automatically at the end of a Practice run; **Retry** / **Close** |

## 🧱 Architecture

A pnpm monorepo with a **platform-agnostic TypeScript core** so the same logic can
later power a desktop (Tauri) or mobile shell.

```
packages/
  core/      MIDI parsing, tempo map, hand assignment, scoring, transport, progress/difficulty, viewport index, plugin manager (no DOM)
  audio/     Web Audio engine: smplr SoundFont + synth fallback, look-ahead scheduler
  render/    Canvas2D falling-notes renderer (viewport culling + batched draws), keyboard geometry, themes
  input/     Web MIDI, computer keyboard, pointer/touch adapters
apps/
  web/       Vite app wiring everything together (DOM + controls)
scripts/
  generate-songs.mjs   zero-dependency MIDI writer for the bundled PD songs
  fetch-soundfont.mjs  downloads the bundled offline piano SoundFont
```

The packages export TypeScript source directly and are consumed by Vite via aliases,
so there is no separate per-package build step during development.

## 🧩 Plugins

A plugin reacts to lifecycle events (song loaded, transport, note hit / miss / wrong,
score reset, per-frame, result) and can draw overlays through a `DrawSurface`. Each
plugin runs in isolation — one that throws is logged and skipped, never breaking the app
or the other plugins. Four ship built in:

| Plugin | What it does | Default |
| --- | --- | --- |
| **Combo overlay** | live combo counter + fading judgement flash on the playfield | on |
| **Session stats** | tallies hits / perfect / good / miss / wrong / max combo, logs a summary | on |
| **Auto-pause on mistakes** | pauses after N consecutive misses / wrong notes so you can recover | off |
| **Practice HUD** | live accuracy percentage + a song-progress bar at the top of the playfield | off |

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

**核心功能**：Canvas2D 下落音符 + 88 键键盘（时间桶索引 + 视口裁剪 + 批量绘制，密集黑 MIDI 更流畅）；FluidR3_GM SoundFont 真实钢琴音色（采样已
本地内置、完全离线可用，缺失时回退 CDN 再回退内置合成器）；MIDI 设备映射（列出/选择输入设备、
实时音符监视、热插拔检测）；零依赖 MIDI 解析；播放/暂停/停止/拖动/变速（0.25×–2×）；聆听与练习
两种模式；练习模式下的判定（perfect/good）、连击、准确率与评级（S–D）；和弦感知等待模式；
A-B 循环区间（在落键视图高亮）；节拍器与倒数拍（1/2/4 拍）；左右手过滤（聆听模式可分手
静音）；USB MIDI / 电脑键盘 / 鼠标触屏三种输入；下落音符音名标签（C4、D4…）、琴键标签与色盲友好配色；曲库（难度星级、
时长、音符数）；本地进度持久化（最佳准确率/评级/连击与游玩次数）；练习结束结算画面（评级、
判定明细、新纪录提示）；设置持久化（模式/速度/手/等待/标签/色盲/节拍器/倒数拍刷新后保留）；
插件系统（生命周期事件 + 绘制表面 API，错误隔离，内置连击叠加/会话统计/失误自动暂停/练习 HUD 四个插件，
开关持久化，详见 PLUGINS.md）；
内置 7 首公版曲目（小星星、欢乐颂、伦敦桥、生日快乐、G 大调小步舞曲、绿袖子、致爱丽丝）。

**架构**：pnpm monorepo，平台无关的 TypeScript 核心（`core`/`audio`/`render`/`input`），
便于后续扩展到 Tauri 桌面端与移动端。

**浏览器**：Chrome/Edge/Opera 完整支持 Web MIDI；Firefox 部分支持；Safari 不支持 Web MIDI
（可用电脑键盘或触屏）。

**许可证**：代码 GPL-3.0-or-later；内置曲目为公版；钢琴采样来自 FluidR3_GM（经 smplr /
midi-js-soundfonts）。详见 [LICENSE](LICENSE) 与 [ATTRIBUTION.md](ATTRIBUTION.md)。
