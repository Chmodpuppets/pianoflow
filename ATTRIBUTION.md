# 素材署名 / Attributions

## 音色 SoundFonts
- 默认钢琴音色来自 **FluidR3_GM**（作者 Frank Wen），通过 [smplr](https://github.com/danigb/smplr) /
  [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) 加载，遵循其原始许可。
- 离线回退音色为 PianoFlow 内置的 Web Audio 合成钢琴（本项目代码，GPL-3.0）。

## 曲目 Songs
- 内置曲目均为**公有领域（Public Domain）**旋律，由本项目脚本 `scripts/generate-songs.mjs` 生成：
  - 《小星星》Twinkle Twinkle Little Star（传统旋律，PD）
  - 《欢乐颂》Ode to Joy — Ludwig van Beethoven（PD）
- 用户自行导入的 MIDI 文件，其版权由用户自行负责。

## 第三方库
- 解析/渲染/输入核心为 PianoFlow 自研（零运行时依赖）。
- 构建与测试：Vite、TypeScript、vitest。
- 音频：smplr（MIT）。

> 若后续引入 CC-BY 音色（如 Salamander Grand Piano），请在此补充署名与许可链接。
