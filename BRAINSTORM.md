# 开源版 Synthesia（钢琴瀑布流练琴软件）— 开发头脑风暴与路线图

> 目标：做一款对标 [Synthesia](https://synthesiagame.com)（下落音符钢琴练习/游戏软件）的**免费开源**替代品。
> 本文是项目启动前的头脑风暴，覆盖产品拆解、技术选型、核心难点、里程碑、开源工程化、参考项目、风险与差异化。
> 注：产品名避免直接使用 "Synthesia"（商标），"My Synthesia" 仅作内部开发代号。

---

## 0. 先对齐：我们到底复刻什么

Synthesia 的核心体验：
- MIDI 音符像瀑布一样下落 → 落到 88 键虚拟键盘上 → 触发钢琴音色发声。
- 跟弹练习（弹对才继续）、分手练习、乐句循环、变速不变调、评分结算。
- 内置曲库 + 用户导入自己的 `.mid`；支持 USB MIDI 键盘，也支持电脑键盘/鼠标/触屏。

我们的定位差异：**永久免费、开源、本地隐私、可定制、社区驱动**，并加入 Synthesia 没有的亮点（音频转 MIDI、简谱/五线谱双谱、社区曲库、插件生态）。

初期明确**不做**：账号体系、云同步、付费曲库、DAW 级完整编辑器。

---

## 1. 功能拆解（MoSCoW 优先级）

### MVP（必须有，垂直切片）
- MIDI 解析与播放：多轨、tempo/拍号变化、延音踏板（CC64）。
- 下落音符渲染 + 88/61 键键盘视图，按轨道/左右手分色。
- SoundFont（SF2）钢琴音色发声，低延迟。
- 播放控制：播放/暂停/进度拖动/变速（0.25–2×，MIDI 变速天然不变调）。
- 输入：USB MIDI（WebMIDI）+ 电脑键盘/鼠标/触屏弹奏。
- 基础判定与评分：音高 + 时间窗匹配、连击、准确率、结算评级。
- 曲库：内置 5 首公有领域 MIDI + 用户导入 `.mid`。
- 设置：下落速度、音符标签（音名/唱名/简谱/指法）、左右手颜色、键数。
- 中英双语。

### 应该做（v0.2–0.5）
- 跟弹等待模式（Melody Practice：弹对下一个音才继续）。
- 分手练习（静音某手 / 自动弹另一手）、乐句循环。
- 节拍器 + 预备拍、延迟校准（音频/输入/显示）。
- 练习进度、最佳成绩、统计的本地持久化。
- 主题/配色（含色盲友好）、背景自定义。
- 桌面壳（Tauri）解决 Safari/原生 MIDI；移动端 PWA + 多指触屏。

### 可以做（差异化亮点，v1+）
- 五线谱 / 简谱视图（OpenSheetMusicDisplay / Verovio；MIDI→MusicXML 量化是难点）。
- 音频转 MIDI（basic-pitch / piano_transcription）："任何 mp3 都能练"。
- 演奏录制 + 量化 + 导出 MIDI；简单乐句编辑器。
- 社区曲库分享、难度自动评级（notes/s、手跨度、和弦密度）。
- 成就 / 连续打卡 / XP；OBS 透明背景演奏模式；插件 / 主题 API。
- BLE MIDI（iOS/macOS）、MIDI 输出到外部音源。

### 暂不做
账号、云同步、付费内容、完整 DAW 编辑。

---

## 2. 技术栈选型（3 条路线 + 推荐）

### A. Web 优先（推荐用于 MVP）
TypeScript + Vite + Canvas2D / pixi.js + Web Audio + `@tonejs/midi` + `smplr`/Tone.js + WebMIDI。
- 优点：demo 即开即玩、易传播（GitHub Pages）、贡献门槛低、天然跨平台。
- 缺点：Safari/iOS 无 WebMIDI；音频延迟需调优；超大 black MIDI 需性能优化。

### B. 桌面原生
C++ + raylib/SDL2 + RtMidi + TinySoundFont/FluidSynth；或 Rust（Bevy + midir + rodio）。
- 优点：极致性能/低延迟、单文件分发。
- 缺点：UI 开发慢、贡献者少、迭代成本高。

### C. 游戏引擎
Godot 4 + MIDI GDExtension + 音频合成（FluidSynth 绑定 / MeltySynth 思路）。
- 优点：动画/UI/粒子工具链成熟、全平台导出。
- 缺点：MIDI 输入需插件维护、合成器集成工作量。

### 推荐策略
**A 起步**，把核心逻辑（MIDI 解析/规范化、分手、判定、评分、练习状态机、延迟模型）写成**纯 TS 包、与平台解耦、可单测**；后续用 **Tauri（Rust `midir` 桥）** 套壳上桌面，复用同一前端。
C# 血统参考：Avalonia/Unity + MeltySynth + Minis（PianoFromAbove 路线）。

---

## 3. 核心技术难点（提前想清楚）

1. **MIDI 规范化**：多轨合并/分手（先按 track/channel；单轨按音高阈值切分，默认 C4=60，可手动覆盖）、tempo map、踏板延音、重叠音、量化可读性。
2. **渲染性能**：视口裁剪 + 时间分桶空间索引 + 批量绘制；目标 5k 可见音符稳定 60fps；用 black MIDI（10 万+ 音符）做压力测试。
3. **音频低延迟**：SF2 采样合成；前瞻调度器（look-ahead ~100ms、25ms 轮询），基于 `AudioContext.currentTime`；复音 64–128、踏板、力度层、release 采样。
   - Web 音色体积：Salamander Grand Piano（CC-BY，~1GB）需裁剪/降采样；起步可用 FluidR3_GM（~30MB）。
4. **延迟校准**：综合补偿音频输出 + MIDI 输入 + 显示延迟；让用户跟节拍器敲击测偏移，按设备保存。
5. **判定/评分**：音高匹配 + 时间窗（±80ms perfect / ±150ms good）、miss/wrong/extra、连击、准确率、S/A/B/C 评级。
   - 等待模式状态机：在下一个期望音 onset 暂停 transport，直到匹配 note-on，超时给提示。
6. **平台输入**：WebMIDI 仅 Chrome/Edge/Opera 完整支持；Firefox 受限（add-on/权限门控）；**Safari（macOS/iOS）完全不支持** → Apple 平台需原生壳或 BLE MIDI。处理热插拔、多设备、电脑键盘映射。
7. **曲库/音色版权**：只内置公有领域/CC 的 MIDI（古典作曲 PD，但演奏录音可能有邻接权；用 Mutopia / KunstderFuge 等 PD 来源）；用户导入责任自负；音色 CC-BY 需署名。

---

## 4. 开发步骤 / 里程碑路线图

| 阶段 | 周期(粗估) | 交付物 |
|---|---|---|
| **M0 技术验证** | 1–2 周 | 解析一首 MIDI → 下落音符+键盘渲染 → SoundFont 发声 → 播放/暂停/变速；性能与延迟摸底 |
| **M1 核心播放器** | 3–6 周 | WebMIDI/键盘输入、命中判定与评分、分手分色、循环、曲库(5 首 PD)、设置、中英 i18n、本地存档 → v0.1 可日常练琴 |
| **M2 练习模式** | 3–5 周 | 等待模式、分手自动伴奏、节拍器/预备拍、延迟校准、结算页、进度统计 → v0.3 对标 Synthesia 核心学习体验 |
| **M3 打磨与发布** | 2–4 周 | 主题/标签/色盲、PWA 触屏、Tauri 桌面构建、CI 多平台 release、文档/演示站 → v0.5 公开 |
| **M4+ 差异化** | 持续 | 五线谱/简谱、音频转 MIDI、录制导出、社区曲库、成就、插件 |

> 业余单人粗估：MVP ~2–3 个月，完整 v1 ~4–6 个月。

---

## 5. 开源工程化（从第一天做）

- **命名/商标**：产品名避免直接用 "Synthesia"。候选：KeyFall / PianoFlow / FallingKeys / 落键 / 瀑音（先查重名与商标）。
- **许可证**：
  - 应用代码 GPLv3（防闭源商用 fork，契合"永远免费"）或 Apache-2.0/MIT（最大化采用/被集成）。
  - 核心纯逻辑包可宽松许可以便复用；素材 CC-BY 并附 `ATTRIBUTION.md`。
- **仓库结构（monorepo）**：
  ```
  packages/core      # MIDI 解析/规范化/分手/判定/评分/练习状态机（无 DOM 依赖，可单测）
  packages/audio     # SoundFont 加载 + Web Audio 调度 / 原生桥
  packages/render    # Canvas2D/WebGL 渲染（音符/键盘/特效）+ 主题系统
  packages/input     # WebMIDI 适配 + 键盘/鼠标/触屏 + (Tauri 原生桥)
  apps/web           # Vite + UI（曲库/设置/结算）+ PWA
  apps/desktop       # Tauri 壳（Rust midir），复用 web 前端
  data/songs         # PD MIDI + 元数据 JSON
  docs               # 文档/路线图/署名
  ```
- **CI/CD**：GitHub Actions（lint/test/build + Tauri Win/mac/Linux 矩阵 release）、语义化版本、CHANGELOG。
- **社区**：README（中英）+ demo GIF、CONTRIBUTING、good-first-issues（主题/曲目/翻译）、issue 模板、Discord/QQ、GitHub Pages 在线 demo。
- **测试**：MIDI 解析/分手/评分单测；渲染性能基准；延迟回归。

---

## 6. 可参考的开源项目与库

### 同类播放器（已验证）
- [PianoFromAbove](https://github.com/brian-pantano/PianoFromAbove)（C#，⭐318）：经典开源 Synthesia-like。
- [Kiva](https://github.com/arduano/Kiva)：现代高性能 MIDI 播放器（black MIDI 向，目标替代 PFA）。
- [PFAviz++](https://github.com/flopp1/PFAviz-plus-plus)：PFA 性能重写（十亿级音符加载、视频渲染）。
- [PianoFromAbove-android](https://github.com/kiptunor/PianoFromAbove-android)：PFA 的 Android/多平台移植。

### 关键库
- Web：[`@tonejs/midi`](https://github.com/Tonejs/midi)（解析）、[`smplr`](https://github.com/danigb/smplr)/Tone.js（SoundFont 播放）。
- 原生合成：[FluidSynth](https://github.com/fluidsynth/fluidsynth)、[TinySoundFont](https://github.com/schellingb/TinySoundFont)、[MeltySynth](https://github.com/sinshu/meltysynth)（C# SF2）。
- MIDI 输入：[Minis](https://github.com/keijiro/Minis)（Unity）、RtMidi/midir（原生）。
- 打谱：[OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay)、[Verovio](https://github.com/rism-digital/verovio)。
- 音频转 MIDI：[basic-pitch](https://github.com/spotify/basic-pitch)。

### WebMIDI 支持现状
- [caniuse.com/midi](https://caniuse.com/midi)、[MDN Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)：Chrome/Edge/Opera 支持，Firefox 受限，Safari 不支持。

---

## 7. 风险与差异化

### 风险
- Web 音频延迟抖动；Safari/iOS 输入受限；超大 MIDI 性能；曲库/音色版权；单人范围蔓延；商标。

### 差异化（为什么选我们）
- 永久免费 + 本地隐私。
- 音频转 MIDI："任何歌都能练"。
- 简谱 + 五线谱双谱（中文用户友好）。
- 社区曲库 + 主题/插件生态。
- 演奏录制导出、OBS 演奏模式、可定制判定/评分。

---

## 8. 下一步（建议立即做）

1. **定三件事**：技术栈（推荐 Web 优先 + 纯 TS core）、许可证、产品名。
2. **搭骨架 + M0 demo**：monorepo + 解析 MIDI + 下落音符 + 发声 + 播放控制（可由助手直接生成）。
3. **垂直切片**：选 1 首 PD MIDI（如《小星星》/《卡农》片段）跑通全链路，验证渲染/音频/输入/判定。
