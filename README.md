# 🎹 PianoFlow

**An open-source, Synthesia-style piano practice app.** Falling notes, real piano
sound, MIDI keyboard support, and instant scoring — right in your browser.

> PianoFlow is an independent open-source project. It is **not** affiliated with,
> endorsed by, or connected to Synthesia LLC. "Synthesia" is a trademark of its
> respective owner; the name is used here only to describe the category of app.

---

## ✨ Features

- **Falling-notes renderer** — Canvas2D, 88-key keyboard, color-coded hands, HiDPI aware.
- **Real piano sound** — SoundFont samples via [`smplr`](https://github.com/danigb/smplr)
  (FluidR3_GM), with a built-in additive synth fallback when samples can't load.
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
- **Accessibility** — optional note labels and a colorblind-friendly palette.
- **Bundled public-domain songs** — *Twinkle Twinkle Little Star* and *Ode to Joy*.

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
```

## 🎮 Controls

| Action | Input |
| --- | --- |
| Play / Pause | `Space` or the ▶ button |
| Play notes | USB MIDI keyboard, computer keys `A W S E D F T G Y H U J K O L P ;`, or click/touch the keys |
| Seek | drag the timeline slider |
| Speed / Hands / Mode | footer selectors |
| Wait / Labels / Colorblind | footer checkboxes |
| A-B loop | **A** / **B** set the region at the current position, **Loop** toggles, **✕** clears |
| Metronome / Count-in | footer checkbox / selector |

## 🧱 Architecture

A pnpm monorepo with a **platform-agnostic TypeScript core** so the same logic can
later power a desktop (Tauri) or mobile shell.

```
packages/
  core/      MIDI parsing, tempo map, hand assignment, scoring, transport (no DOM)
  audio/     Web Audio engine: smplr SoundFont + synth fallback, look-ahead scheduler
  render/    Canvas2D falling-notes renderer, keyboard geometry, themes
  input/     Web MIDI, computer keyboard, pointer/touch adapters
apps/
  web/       Vite app wiring everything together (DOM + controls)
scripts/
  generate-songs.mjs   zero-dependency MIDI writer for the bundled PD songs
```

The packages export TypeScript source directly and are consumed by Vite via aliases,
so there is no separate per-package build step during development.

## 🌐 Browser support

| Browser | Falling notes & sound | USB MIDI (Web MIDI) |
| --- | --- | --- |
| Chrome / Edge / Opera | ✅ | ✅ |
| Firefox | ✅ | ⚠️ gated / partial |
| Safari (macOS / iOS) | ✅ | ❌ (use computer keyboard or touch) |

SoundFont samples are fetched from a CDN on first load; if offline, PianoFlow
automatically falls back to the built-in synth.

## 🗺️ Roadmap

- **M0 (done)** — vertical slice: parse → render → sound → transport → basic scoring.
- **M1 (done)** — A-B loop regions, metronome + count-in, chord-aware wait mode, listen-mode hand mute.
- **M2** — song library & metadata, progress persistence, statistics history.
- **M3** — desktop shell (Tauri), offline SoundFont bundling, MIDI device mapping UI.
- **M4** — black-MIDI rendering optimizations (time-bucket index, WebGL), plugins.

## 📄 License & attribution

- Code: **GPL-3.0-or-later** — see [LICENSE](LICENSE).
- Bundled songs are **public domain** (traditional / Beethoven).
- Piano samples: **FluidR3_GM** via `smplr` / `midi-js-soundfonts` (MIT / respective licenses).

See [ATTRIBUTION.md](ATTRIBUTION.md) for details.

## 🤝 Contributing

Issues and pull requests are welcome. Please run `pnpm test` and `pnpm typecheck`
before submitting. By contributing you agree your contributions are licensed under
GPL-3.0-or-later.

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

**核心功能**：Canvas2D 下落音符 + 88 键键盘；smplr SoundFont 真实钢琴音色（离线时自动
回退到内置合成器）；零依赖 MIDI 解析；播放/暂停/停止/拖动/变速（0.25×–2×）；聆听与练习
两种模式；练习模式下的判定（perfect/good）、连击、准确率与评级（S–D）；和弦感知等待模式；
A-B 循环区间（在落键视图高亮）；节拍器与倒数拍（1/2/4 拍）；左右手过滤（聆听模式可分手
静音）；USB MIDI / 电脑键盘 / 鼠标触屏三种输入；音符标签与色盲友好配色；内置《小星星》
《欢乐颂》两首公版曲目。

**架构**：pnpm monorepo，平台无关的 TypeScript 核心（`core`/`audio`/`render`/`input`），
便于后续扩展到 Tauri 桌面端与移动端。

**浏览器**：Chrome/Edge/Opera 完整支持 Web MIDI；Firefox 部分支持；Safari 不支持 Web MIDI
（可用电脑键盘或触屏）。

**许可证**：代码 GPL-3.0-or-later；内置曲目为公版；钢琴采样来自 FluidR3_GM（经 smplr /
midi-js-soundfonts）。详见 [LICENSE](LICENSE) 与 [ATTRIBUTION.md](ATTRIBUTION.md)。
