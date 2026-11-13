# 素材署名 / Attributions

## 音色 SoundFonts
- 默认钢琴音色来自 **FluidR3_GM**（作者 Frank Wen），通过 [smplr](https://github.com/danigb/smplr) /
  [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) 加载，遵循其原始许可。
- **离线内置采样**：`apps/web/public/soundfont/acoustic_grand_piano-mp3.js` 为 FluidR3_GM 三角钢琴
  mp3 采样（88 键，A0–C8），源自官方 [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts)
  （经 jsDelivr 镜像下载，可用脚本 `scripts/fetch-soundfont.mjs` 重新获取）。应用优先加载本地采样以
  完全离线运行，失败时回退到 CDN，再回退到内置合成器。FluidR3_GM 遵循其原始许可（见该仓库）。
- 离线回退音色为 PianoFlow 内置的 Web Audio 合成钢琴（本项目代码，GPL-3.0）。

## 曲目 Songs
- 内置曲目均为**公有领域（Public Domain）**旋律的简化练习编曲，由本项目脚本
  `scripts/generate-songs.mjs` 生成：
  - 《小星星》Twinkle Twinkle Little Star（传统旋律，PD）
  - 《欢乐颂》Ode to Joy — Ludwig van Beethoven（PD）
  - 《伦敦桥》London Bridge（传统旋律，PD）
  - 《生日快乐》Happy Birthday（传统旋律，PD）
  - 《G 大调小步舞曲》Minuet in G — Christian Petzold（PD）
  - 《绿袖子》Greensleeves（传统旋律，PD）
  - 《致爱丽丝》Für Elise — Ludwig van Beethoven（PD）
- 用户自行导入的 MIDI 文件，其版权由用户自行负责。

## 第三方库
- 解析/渲染/输入核心为 PianoFlow 自研（零运行时依赖）。
- 构建与测试：Vite、TypeScript、vitest。
- 音频：smplr（MIT）。

> 若后续引入 CC-BY 音色（如 Salamander Grand Piano），请在此补充署名与许可链接。
