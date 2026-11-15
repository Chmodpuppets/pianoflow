<div align="center">

<img src="docs/img/hero-mockup.png" alt="PianoFlow — open-source Synthesia-style piano trainer in a browser window" width="100%">

# 🎹 PianoFlow

**Open-source, Synthesia-style falling-notes piano trainer.**
**开源「下落音符」钢琴练习应用（Synthesia 风格）。**

[![CI](https://github.com/Chmodpuppets/pianoflow/actions/workflows/ci.yml/badge.svg)](https://github.com/Chmodpuppets/pianoflow/actions/workflows/ci.yml)
[![Pages](https://github.com/Chmodpuppets/pianoflow/actions/workflows/pages.yml/badge.svg)](https://github.com/Chmodpuppets/pianoflow/actions/workflows/pages.yml)
[![Release](https://img.shields.io/github/v/release/Chmodpuppets/pianoflow)](https://github.com/Chmodpuppets/pianoflow/releases/latest)

**[▶ Live demo 在线试玩](https://chmodpuppets.github.io/pianoflow/)** ·
**[⬇ Desktop app 桌面下载](https://github.com/Chmodpuppets/pianoflow/releases/latest)** ·
**[📖 Full guide 完整文档](docs/GUIDE.md)**

[中文](#中文) · [English](#english)

</div>

---

## 📸 Screenshots · 截图

| 🎮 Falling notes · 下落音符 | ⚡ WebGL GPU rendering · GPU 渲染 |
|:---:|:---:|
| [![playfield](docs/img/playfield.png)](docs/img/playfield.png) | [![gpu](docs/img/playfield-gpu.png)](docs/img/playfield-gpu.png) |
| 🎹 Hand assist · 单手辅助 | 🎉 Combo celebration · 连击庆祝 |
| [![assist](docs/img/playfield-assist.png)](docs/img/playfield-assist.png) | [![milestone](docs/img/playfield-milestone.png)](docs/img/playfield-milestone.png) |
| 🎼 Dense scores · 密集谱（巴赫） | 🎵 Canon in D · 卡农 |
| [![prelude](docs/img/playfield-prelude.png)](docs/img/playfield-prelude.png) | [![canon](docs/img/playfield-canon.png)](docs/img/playfield-canon.png) |
| 📜 Scrolling sheet · 滚动五线谱 | 🖨 Printable score · 整谱导出 |
| [![sheet](docs/img/sheet.png)](docs/img/sheet.png) | [![page](docs/img/sheet-page.png)](docs/img/sheet-page.png) |
| 📊 Practice review · 练习复盘 | ⏱ Visual count-in · 视觉倒数 |
| [![review](docs/img/review.png)](docs/img/review.png) | [![countin](docs/img/playfield-countin.png)](docs/img/playfield-countin.png) |

<div align="center">

### 🔑 Auto key signatures · 自动调号

<img src="docs/img/sheet-key.png" alt="Canon in D engraved with an inferred D-major key signature" width="640">

The score infers the key (Krumhansl–Schmuckler), prints the signature after each clef,
respells notes into the key, and cancels with naturals only where needed.
自动推断调性、在谱号后打印调号、按调拼写音符，仅在需要处用还原号取消。

</div>

<div align="center">

### 𝄽 Rests & ties · 休止符与连音线

<img src="docs/img/sheet-rests.png" alt="Amazing Grace engraved with rests and ties across barlines" width="640">

The renderer estimates rests and ties from note timing. Entirely silent measures show a centered whole rest.
休止符与跨小节连音线根据 MIDI 音符时序推断。完全空白的小节显示居中的全休止符。

</div>

<div align="center">

### 🎼 MIDI sheet preview · MIDI 五线谱预览

The PNG export shows a piano brace, a stacked opening time signature on each staff,
and a centered whole rest in empty measures. Tempo and approximate dynamics are derived from the MIDI.

PNG 导出显示钢琴大括号、每条谱表各自的完整开头拍号，以及居中的整小节休止符。速度和力度取自 MIDI，力度为近似值。

The scrolling view and PNG export generate a two-staff practice score from MIDI. MusicXML import,
a separate vocal staff, lyrics, chord diagrams, pedal markings, and fixed paper pagination are not available yet.

滚动谱和 PNG 导出根据 MIDI 生成双谱表练习谱。目前尚不支持 MusicXML 导入、独立声乐谱表、歌词、和弦图、踏板标记或固定纸张分页。

</div>

<div align="center">

### 📱 Installable PWA · 可安装到手机

<img src="docs/img/mobile-mockup.png" alt="PianoFlow running as an installed PWA on a phone" width="300">

Add to Home Screen for a full-screen, offline practice app.
添加到主屏幕，即可全屏离线练习。

</div>

---

## 中文

**PianoFlow** 是一个开源的 Synthesia 风格钢琴练习应用：音符下落、真实钢琴音色、MIDI 键盘 / 电脑键盘输入、即时评分。浏览器即开即玩，也有 macOS / Windows / Linux 原生桌面版。

### 亮点
- 🎮 **下落音符舞台** — 双手分色、键盘自动适配音域、节奏网格、视觉倒数。
- ⚡ **WebGL GPU 渲染** — 实例化单次绘制数千音符，无 WebGL 时自动回退 Canvas2D；五线谱静态层离屏缓存、符杠几何按布局缓存，回退路径以廉价光晕替代高开销阴影模糊。
- 🎹 **练习模式** — 单手辅助（另一只手自动弹奏）、逐小节复盘 + 弱项跳转、评分与成就、清空可撤销。
- 🎓 **引导式课程** — 4 阶段 12 课循序渐进，按最佳成绩解锁下一课，一键继续练习。
- 📜 **五线谱** — 滚动大谱表 + 可打印整谱 PNG 导出，自动推断调号、按调拼写音符、八分/十六分音符自动符杠、休止符与跨小节连音线、导出谱显示开头拍号、速度和推断的力度；曲库每首歌一键 🎼 打开乐谱，播放器内高亮「五线谱」按钮随时切换。
- 🎵 **12 首内置公版曲目** — 致爱丽丝、卡农、巴赫前奏曲、奇异恩典等。
- 🗂 **曲库管理** — 实时搜索、8 种排序、收藏；多选批量收藏 / 取消收藏，可一键撤销。
- 🎤 **真实音色** — 5 种离线采样音色，包含 Salamander Grand（雅马哈 C5）。通过 Chrome / Edge 的 MIDI 输出可让 Pianoteq 等外部音源发声。
- 🌐 **双语界面** — English / 中文 一键切换，曲目名与作者也本地化。
- 📦 **PWA + 桌面** — 可安装、离线可用；Tauri 原生桌面应用（macOS / Windows / Linux）。

### 快速开始
```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm tauri:build  # 原生 macOS .app（需 Rust）
```
更多细节见 [完整文档](docs/GUIDE.md)。

---

## English

**PianoFlow** is an open-source, Synthesia-style piano practice app: falling notes, real piano
sound, MIDI / computer-keyboard input and instant scoring. Runs in the browser, with native
macOS / Windows / Linux desktop builds.

### Highlights
- 🎮 **Falling-notes stage** — color-coded hands, auto-fit keyboard, rhythm grid, visual count-in.
- ⚡ **WebGL GPU rendering** — one instanced draw call for thousands of notes; Canvas2D fallback. The score caches its static layer and beam geometry to reduce per-frame drawing.
- 🎹 **Practice mode** — hand assist (app plays the other hand), per-measure review + focus chips, scoring & achievements, undoable clears.
- 🎓 **Guided curriculum** — 4 stages / 12 lessons, unlock the next by best grade, one-tap continue.
- 📜 **Sheet music** — scrolling grand staff + printable full-score PNG export, with inferred key signatures, key-aware note spelling, beamed eighth/sixteenth notes, rests and ties across barlines, opening time signature, tempo and estimated dynamics in the export. Open the score with one tap 🎼 on any library song, or the highlighted "Sheet" toggle in the player.
- 🎵 **12 bundled public-domain songs** — Für Elise, Canon in D, Bach Prelude, Amazing Grace…
- 🗂 **Library management** — live search, 8 sort orders, favorites; multi-select bulk favorite / unfavorite with one-tap undo.
- 🎤 **Real sound** — Five offline sample-based instruments, including Salamander Grand (Yamaha C5). Chrome and Edge can also send MIDI to external instruments such as Pianoteq.
- 🌐 **Bilingual UI** — English / 中文, one tap; song titles & composers localized too.
- 📦 **PWA + desktop** — installable & offline; native Tauri apps for macOS / Windows / Linux.

### Quick start
```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm tauri:build  # native macOS .app (requires Rust)
```
See the [full guide](docs/GUIDE.md) for details.

---

<div align="center">

GPL-3.0 · Independent open-source project, **not** affiliated with Synthesia LLC.
GPL-3.0 · 独立开源项目，与 Synthesia LLC 无关联。

</div>
