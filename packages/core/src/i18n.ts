/**
 * Lightweight, dependency-free internationalisation for the PianoFlow UI.
 *
 * Every user-facing string lives in {@link MESSAGES} as an `{ en, zh }` pair so the
 * two languages can never drift apart (a parity test enforces this). The UI looks
 * strings up with {@link t}, which interpolates `{name}` placeholders and falls back
 * English → key so a missing translation degrades gracefully instead of crashing.
 *
 * This module is pure (no DOM) so it is unit-testable headlessly and reusable by any
 * future shell (web / desktop).
 */

export type Lang = 'en' | 'zh';

export interface LangOption {
  id: Lang;
  /** Native name shown in the language picker. */
  label: string;
}

export const LANGS: LangOption[] = [
  { id: 'en', label: 'English' },
  { id: 'zh', label: '中文' },
];

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'zh';
}

/** Pick a language from a BCP-47 navigator language (zh* → Chinese, else English). */
export function detectLang(navLanguage?: string | null): Lang {
  return typeof navLanguage === 'string' && /^zh\b/i.test(navLanguage) ? 'zh' : 'en';
}

type Entry = { en: string; zh: string };

/**
 * The full UI catalogue. Keys are dotted namespaces; `{placeholders}` are filled by
 * {@link t}. Id-keyed entries (`genre.*`, `instrument.*`, `ach.*`, `plugin.*`) localise
 * data-driven content that originates elsewhere in the core.
 */
export const MESSAGES: Record<string, Entry> = {
  // ---- welcome ----
  'welcome.tag': { en: 'Learn and play piano with falling notes', zh: '跟随下落音符，轻松学弹钢琴' },
  'welcome.login': { en: '👤 Log In', zh: '👤 登录' },
  'welcome.create': { en: 'Create Account', zh: '创建账户' },
  'welcome.guest': { en: 'Continue as Guest', zh: '以访客身份继续' },
  'welcome.foot': { en: 'Open source · GPL-3.0 · no account required', zh: '开源 · GPL-3.0 · 无需账户' },

  // ---- library nav / profile ----
  'nav.songs': { en: '🎵 Songs', zh: '🎵 曲库' },
  'nav.practice': { en: '🎯 Practice', zh: '🎯 练习' },
  'nav.progress': { en: '📈 Progress', zh: '📈 进度' },
  'nav.settings': { en: '⚙️ Settings', zh: '⚙️ 设置' },
  'profile.guest': { en: 'Guest', zh: '访客' },
  'profile.switch': { en: 'Switch profile', zh: '切换账户' },
  'profile.loginTitle': { en: 'Log in to a profile', zh: '登录账户' },
  'profile.createTitle': { en: 'Create a profile', zh: '创建账户' },
  'profile.hint': { en: 'Profiles are stored locally on this device — no server, no password.', zh: '账户仅保存在本设备 —— 无服务器、无密码。' },
  'profile.namePlaceholder': { en: 'Your name', zh: '你的名字' },
  'profile.cancel': { en: 'Cancel', zh: '取消' },
  'profile.continue': { en: 'Continue', zh: '继续' },

  // ---- songs view ----
  'songs.title': { en: 'Songs', zh: '曲库' },
  'songs.open': { en: '📂 Open .mid', zh: '📂 打开 .mid' },
  'songs.search': { en: 'Search songs, artists, or composers…', zh: '搜索曲目、艺术家或作曲者…' },
  'songs.sort': { en: 'Sort songs', zh: '排序' },
  'songs.sort.recommended': { en: 'Recommended', zh: '推荐顺序' },
  'songs.sort.title': { en: 'Title A–Z', zh: '标题 A–Z' },
  'songs.sort.difficulty': { en: 'Easiest first', zh: '由易到难' },
  'songs.sort.difficultyDesc': { en: 'Hardest first', zh: '由难到易' },
  'songs.sort.duration': { en: 'Shortest first', zh: '时长最短' },
  'songs.sort.recent': { en: 'Recently played', zh: '最近练习' },
  'songs.sort.grade': { en: 'Best grade', zh: '最佳成绩' },
  'songs.sort.favorites': { en: 'Favorites first', zh: '收藏优先' },
  'songs.hint.pre': { en: 'Tip: drop any ', zh: '提示：将任意 ' },
  'songs.hint.mid': { en: ' / ', zh: ' / ' },
  'songs.hint.post': { en: ' file into ', zh: ' 文件放入 ' },
  'songs.hint.end': { en: ' — it appears here automatically and stays in your library.', zh: ' —— 它会自动出现在这里并保留在曲库中。' },
  'songs.empty': { en: 'No songs match your search.', zh: '没有匹配的曲目。' },
  'songs.play': { en: '▶ Play', zh: '▶ 播放' },
  'songs.fav': { en: 'Favorite', zh: '收藏' },
  'songs.diff': { en: 'Difficulty {level}/5', zh: '难度 {level}/5' },
  'songs.notes': { en: '{n} notes', zh: '{n} 个音符' },
  'songs.localComposer': { en: 'Local file', zh: '本地文件' },
  'songs.importedComposer': { en: 'Imported', zh: '导入' },

  // ---- genres ----
  'genre.All Songs': { en: 'All Songs', zh: '全部' },
  'genre.Classical': { en: 'Classical', zh: '古典' },
  'genre.Traditional': { en: 'Traditional', zh: '传统' },
  'genre.Folk': { en: 'Folk', zh: '民谣' },
  'genre.Imported': { en: 'Imported', zh: '导入' },
  'genre.Local': { en: 'Local', zh: '本地' },
  'genre.Other': { en: 'Other', zh: '其他' },
  'genre.Movie & TV': { en: 'Movie & TV', zh: '影视' },

  // ---- practice view ----
  'practice.title': { en: 'Practice', zh: '练习' },
  'practice.sub': { en: 'Set up a focused session, then jump into the playfield.', zh: '设置一次专注练习，然后进入演奏界面。' },
  'practice.session': { en: 'Session', zh: '练习设置' },
  'practice.wait': { en: 'Wait for correct note', zh: '等待正确音符' },
  'practice.metro': { en: 'Metronome', zh: '节拍器' },
  'practice.assist': { en: 'App plays the other hand', zh: '应用自动弹奏另一只手' },
  'practice.aids': { en: 'Practice aids (plugins)', zh: '练习辅助（插件）' },
  'practice.start': { en: '▶ Start practicing', zh: '▶ 开始练习' },

  // ---- shared form labels ----
  'label.hands': { en: 'Hands', zh: '手' },
  'label.speed': { en: 'Speed', zh: '速度' },
  'label.countin': { en: 'Count-in', zh: '预备拍' },
  'label.mode': { en: 'Mode', zh: '模式' },
  'label.instrument': { en: 'Instrument', zh: '音色' },
  'label.volume': { en: 'Volume', zh: '音量' },
  'hands.both': { en: 'Both', zh: '双手' },
  'hands.right': { en: 'Right', zh: '右手' },
  'hands.left': { en: 'Left', zh: '左手' },
  'mode.listen': { en: 'Listen', zh: '欣赏' },
  'mode.practice': { en: 'Practice', zh: '练习' },
  'countin.off': { en: 'Off', zh: '关' },
  'countin.1': { en: '1 beat', zh: '1 拍' },
  'countin.2': { en: '2 beats', zh: '2 拍' },
  'countin.4': { en: '4 beats', zh: '4 拍' },

  // ---- progress view ----
  'progress.title': { en: 'Progress', zh: '进度' },
  'progress.consistency': { en: 'Consistency', zh: '坚持度' },
  'progress.achievements': { en: 'Achievements', zh: '成就' },
  'progress.clear': { en: 'Clear history', zh: '清空历史' },
  'progress.activityAria': { en: 'Sessions per day, last 7 days', zh: '近 7 天每日练习次数' },
  'progress.empty': { en: 'No sessions yet. Play a song in Practice mode to start tracking progress.', zh: '还没有练习记录。在练习模式下弹奏一首曲目即可开始记录进度。' },
  'progress.bySong': { en: 'Progress by song', zh: '按曲目进度' },
  'progress.recent': { en: 'Recent sessions', zh: '近期练习' },
  'stat.sessions': { en: 'Sessions', zh: '练习次数' },
  'stat.songsPracticed': { en: 'Songs practiced', zh: '练过的曲目' },
  'stat.avgAccuracy': { en: 'Avg accuracy', zh: '平均准确率' },
  'stat.bestAccuracy': { en: 'Best accuracy', zh: '最佳准确率' },
  'streak.current': { en: 'Current streak', zh: '当前连续' },
  'streak.longest': { en: 'Longest streak', zh: '最长连续' },
  'streak.activeDays': { en: 'Active days', zh: '活跃天数' },
  'hist.sessions': { en: '{n} sessions', zh: '{n} 次练习' },
  'hist.best': { en: 'best {pct}%', zh: '最佳 {pct}%' },
  'hist.when.justNow': { en: 'just now', zh: '刚刚' },
  'hist.when.m': { en: '{n}m ago', zh: '{n} 分钟前' },
  'hist.when.h': { en: '{n}h ago', zh: '{n} 小时前' },
  'hist.when.d': { en: '{n}d ago', zh: '{n} 天前' },
  'hist.activityTitle': { en: '{date}: {n} sessions', zh: '{date}：{n} 次练习' },
  'hist.dow.0': { en: 'Sun', zh: '周日' },
  'hist.dow.1': { en: 'Mon', zh: '周一' },
  'hist.dow.2': { en: 'Tue', zh: '周二' },
  'hist.dow.3': { en: 'Wed', zh: '周三' },
  'hist.dow.4': { en: 'Thu', zh: '周四' },
  'hist.dow.5': { en: 'Fri', zh: '周五' },
  'hist.dow.6': { en: 'Sat', zh: '周六' },
  'confirm.clearHistory': { en: 'Delete all recorded practice sessions?', zh: '删除所有练习记录？' },
  'confirm.clearScores': { en: 'Delete all best scores?', zh: '删除所有最佳成绩？' },
  'toast.clearedHistory': { en: 'Practice history cleared', zh: '练习历史已清空' },
  'toast.clearedScores': { en: 'Best scores cleared', zh: '最佳成绩已清空' },
  'toast.undo': { en: 'Undo', zh: '撤销' },
  'toast.dismiss': { en: 'Dismiss', zh: '关闭' },

  // ---- settings view ----
  'settings.title': { en: 'Settings', zh: '设置' },
  'settings.display': { en: 'Display', zh: '显示' },
  'settings.labels': { en: 'Key labels (C4…)', zh: '琴键标签（C4…）' },
  'settings.noteLabels': { en: 'Note names on falling notes', zh: '下落音符显示音名' },
  'settings.colorblind': { en: 'Colorblind-friendly palette', zh: '色盲友好配色' },
  'settings.fitKeys': { en: 'Fit keyboard to song range', zh: '键盘自适应曲目音域' },
  'settings.gpu': { en: 'GPU-accelerated notes (WebGL)', zh: 'GPU 加速音符（WebGL）' },
  'settings.beatGrid': { en: 'Measure & beat grid', zh: '小节与拍子网格' },
  'settings.mute': { en: 'Mute all sound', zh: '静音' },
  'settings.sound': { en: 'Sound', zh: '声音' },
  'settings.soundHint': { en: 'Bundled FluidR3_GM timbres play fully offline; switching reloads samples.', zh: '内置 FluidR3_GM 音色完全离线播放；切换音色会重新加载采样。' },
  'settings.devices': { en: 'Devices & extensions', zh: '设备与扩展' },
  'settings.midi': { en: '🎛 MIDI devices', zh: '🎛 MIDI 设备' },
  'settings.plugins': { en: '🧩 Plugins', zh: '🧩 插件' },
  'settings.data': { en: 'Data', zh: '数据' },
  'settings.clearScores': { en: 'Clear best scores', zh: '清空最佳成绩' },
  'settings.clearHistory': { en: 'Clear session history', zh: '清空练习历史' },
  'settings.about': { en: 'About', zh: '关于' },
  'settings.about.pre': { en: 'PianoFlow ', zh: 'PianoFlow ' },
  'settings.about.post': { en: ' · open-source falling-notes piano practice. GPL-3.0. SoundFont: FluidR3_GM (offline). Songs: public-domain arrangements.', zh: ' · 开源下落音符钢琴练习。GPL-3.0。音色：FluidR3_GM（离线）。曲目：公有领域编曲。' },
  'settings.language': { en: 'Language', zh: '语言' },
  'settings.sound.local': { en: 'Sound: FluidR3_GM piano (bundled, offline).', zh: '声音：FluidR3_GM 钢琴（内置，离线）。' },
  'settings.sound.cdn': { en: 'Sound: FluidR3_GM piano (streamed).', zh: '声音：FluidR3_GM 钢琴（在线流式）。' },
  'settings.sound.synth': { en: 'Sound: built-in synth fallback.', zh: '声音：内置合成器（回退）。' },

  // ---- player ----
  'player.back': { en: '‹ Songs', zh: '‹ 曲库' },
  'player.modeAria': { en: 'Play mode', zh: '演奏模式' },
  'player.listen': { en: '🎧 Listen', zh: '🎧 欣赏' },
  'player.play': { en: '🎹 Play', zh: '🎹 弹奏' },
  'player.listenTitle': { en: 'Watch & listen', zh: '观看并聆听' },
  'player.playTitle': { en: 'Play along & get scored', zh: '跟随弹奏并获得评分' },
  'player.playPause': { en: 'Play / pause (Space)', zh: '播放 / 暂停（空格）' },
  'player.next': { en: 'Next song', zh: '下一首' },
  'player.rec': { en: 'Record your performance', zh: '录制你的演奏' },
  'player.recStop': { en: 'Stop recording ({n} notes)', zh: '停止录制（{n} 个音符）' },
  'player.speedTitle': { en: 'Playback speed', zh: '播放速度' },
  'player.slower': { en: 'Slower', zh: '减速' },
  'player.faster': { en: 'Faster', zh: '加速' },
  'player.transTitle': { en: 'Transpose (semitones)', zh: '移调（半音）' },
  'player.lower': { en: 'Lower pitch', zh: '降调' },
  'player.raise': { en: 'Raise pitch', zh: '升调' },
  'player.gpuTitle': { en: 'Falling notes are GPU-accelerated (WebGL)', zh: '下落音符由 GPU 加速（WebGL）' },
  'player.metro': { en: 'Metronome', zh: '节拍器' },
  'player.mute': { en: 'Mute / unmute', zh: '静音 / 取消静音' },
  'player.export': { en: 'Export recording as .mid', zh: '导出录音为 .mid' },
  'player.sheet': { en: 'Sheet music', zh: '五线谱' },
  'player.gear': { en: 'Practice settings', zh: '练习设置' },
  'player.fs': { en: 'Fullscreen', zh: '全屏' },
  'player.seek': { en: 'Seek', zh: '拖动进度' },
  'hud.hits': { en: 'Hits {hits}/{total} · Combo {combo} · Acc {pct}%', zh: '命中 {hits}/{total} · 连击 {combo} · 准确率 {pct}%' },
  'legend.right': { en: 'Right', zh: '右手' },
  'legend.left': { en: 'Left', zh: '左手' },
  'assist.badge': { en: '🎹 You: {you} · App: {auto}', zh: '🎹 你：{you} · 应用：{auto}' },
  'judge.perfect': { en: 'PERFECT', zh: '完美' },
  'judge.good': { en: 'GOOD', zh: '良好' },
  'judge.miss': { en: 'MISS', zh: '失误' },
  'judge.wrong': { en: 'WRONG', zh: '错音' },

  // ---- coaching ----
  'coach.aria': { en: 'How to play', zh: '玩法说明' },
  'coach.title': { en: '🎹 Your turn!', zh: '🎹 轮到你了！' },
  'coach.lead': { en: 'Hit each key as its note reaches the glowing line.', zh: '当音符到达发光线时按下对应琴键。' },
  'coach.midi': { en: 'MIDI keyboard — plug in & play', zh: 'MIDI 键盘 —— 即插即弹' },
  'coach.keys.pre': { en: 'Computer keys ', zh: '电脑键盘 ' },
  'coach.keys.post': { en: ' for the white keys', zh: ' 对应白键' },
  'coach.tap': { en: 'Tap or click the on-screen piano', zh: '点击或触摸屏幕上的钢琴' },
  'coach.tip.pre': { en: 'Tip: enable ', zh: '提示：在 ⚙️ 设置中开启' },
  'coach.tip.mode': { en: 'Wait mode', zh: '「等待模式」' },
  'coach.tip.post': { en: ' in ⚙️ settings to pause until you hit the right note.', zh: '，弹对音符前会暂停。' },
  'coach.gotit': { en: 'Got it — let’s play', zh: '明白了 —— 开始吧' },

  // ---- sheet music ----
  'sheet.aria': { en: 'Sheet music', zh: '五线谱' },
  'sheet.title': { en: '🎼 Sheet music', zh: '🎼 五线谱' },
  'sheet.hint': { en: 'Treble = right hand · Bass = left hand', zh: '高音谱表 = 右手 · 低音谱表 = 左手' },
  'sheet.close': { en: 'Close sheet music', zh: '关闭五线谱' },
  'sheet.export': { en: '⤓ Export PNG', zh: '⤓ 导出 PNG' },

  // ---- pause ----
  'pause.aria': { en: 'Paused', zh: '已暂停' },
  'pause.title': { en: 'Paused', zh: '已暂停' },
  'pause.resume': { en: '▶ Resume', zh: '▶ 继续' },
  'pause.restart': { en: '↺ Restart', zh: '↺ 重新开始' },
  'pause.back': { en: '‹ Back to songs', zh: '‹ 返回曲库' },

  // ---- player settings drawer ----
  'ps.title': { en: '⚙️ Practice settings', zh: '⚙️ 练习设置' },
  'ps.close': { en: 'Close', zh: '关闭' },
  'ps.noteLabels': { en: 'Note names', zh: '音名' },
  'ps.colorblind': { en: 'Colorblind palette', zh: '色盲配色' },
  'ps.fitKeys': { en: 'Fit keyboard to song', zh: '键盘自适应曲目' },
  'ps.gpu': { en: 'GPU notes (WebGL)', zh: 'GPU 音符（WebGL）' },
  'ps.latency': { en: 'Latency', zh: '延迟' },
  'ps.latencyReset': { en: 'Reset latency', zh: '重置延迟' },
  'ps.split': { en: 'Hand split', zh: '左右手分界' },
  'ps.calibHint': { en: 'Latency compensates keyboard/audio delay. Hand split sets the left/right boundary for single-track songs.', zh: '延迟用于补偿键盘/音频延时。左右手分界设定单轨曲目的左右手分界音。' },
  'ps.loop': { en: 'Loop region', zh: '循环区域' },
  'ps.loopA': { en: 'Set loop start (A)', zh: '设置循环起点（A）' },
  'ps.loopB': { en: 'Set loop end (B)', zh: '设置循环终点（B）' },
  'ps.loopClear': { en: 'Clear loop', zh: '清除循环' },
  'ps.midi': { en: '🎛 MIDI', zh: '🎛 MIDI' },
  'ps.plugins': { en: '🧩 Plugins', zh: '🧩 插件' },
  'ps.latencyUnit': { en: '{n} ms', zh: '{n} 毫秒' },

  // ---- MIDI drawer ----
  'midi.aria': { en: 'MIDI devices', zh: 'MIDI 设备' },
  'midi.title': { en: '🎛 MIDI devices', zh: '🎛 MIDI 设备' },
  'midi.supported': { en: 'WebMIDI supported. Select a device or use all.', zh: '支持 WebMIDI。选择一个设备或使用全部。' },
  'midi.unsupported': { en: 'WebMIDI not supported in this browser. Use Chrome/Edge, or play with keyboard/touch.', zh: '此浏览器不支持 WebMIDI。请使用 Chrome/Edge，或用键盘/触摸弹奏。' },
  'midi.all': { en: 'All devices', zh: '全部设备' },
  'midi.allSub': { en: 'Listen to every connected input', zh: '监听所有已连接的输入' },
  'midi.last': { en: 'Last note:', zh: '最近音符：' },

  // ---- plugins drawer ----
  'plugins.aria': { en: 'Plugins', zh: '插件' },
  'plugins.title': { en: '🧩 Plugins', zh: '🧩 插件' },
  'plugins.hint': { en: 'Extend PianoFlow with overlays and practice aids. Toggles are saved.', zh: '用叠加层与练习辅助扩展 PianoFlow。开关状态会被保存。' },
  'plugins.on': { en: 'On', zh: '开' },
  'plugins.off': { en: 'Off', zh: '关' },

  // ---- result ----
  'result.complete': { en: 'Session complete', zh: '练习完成' },
  'result.best': { en: 'Best: {grade} · {pct}%', zh: '最佳：{grade} · {pct}%' },
  'result.stats1': { en: 'Accuracy {pct}% · {hits}/{total} hits', zh: '准确率 {pct}% · 命中 {hits}/{total}' },
  'result.stats2': { en: 'Perfect {perfect} · Good {good} · Miss {miss} · Wrong {wrong}', zh: '完美 {perfect} · 良好 {good} · 失误 {miss} · 错音 {wrong}' },
  'result.stats3': { en: 'Max combo {combo}', zh: '最高连击 {combo}' },
  'result.retry': { en: '↻ Retry', zh: '↻ 重试' },
  'result.export': { en: '⤓ Export .mid', zh: '⤓ 导出 .mid' },
  'result.close': { en: 'Close', zh: '关闭' },
  'review.aria': { en: 'Per-measure accuracy', zh: '逐小节准确率' },
  'review.title': { en: 'Where to focus', zh: '重点练习' },
  'review.cell': { en: 'Measure {n}: {pct}% ({hit}/{total})', zh: '第 {n} 小节：{pct}%（{hit}/{total}）' },
  'review.clean': { en: '🎉 Flawless — every measure clean!', zh: '🎉 完美无瑕 —— 每个小节都干净！' },
  'review.focus': { en: 'Practice these:', zh: '重点练习：' },
  'review.chip': { en: '▶ Measure {n} · {pct}%', zh: '▶ 第 {n} 小节 · {pct}%' },
  'review.chipTitle': { en: 'Jump to measure {n} and practice it', zh: '跳转到第 {n} 小节并练习' },

  // ---- instruments (id-keyed) ----
  'instrument.acoustic_grand_piano': { en: 'Grand Piano', zh: '大钢琴' },
  'instrument.electric_piano_1': { en: 'Electric Piano', zh: '电钢琴' },
  'instrument.music_box': { en: 'Music Box', zh: '八音盒' },
  'instrument.vibraphone': { en: 'Vibraphone', zh: '颤音琴' },

  // ---- plugins (id-keyed) ----
  'plugin.session-stats.name': { en: 'Session statistics', zh: '会话统计' },
  'plugin.session-stats.desc': { en: 'Counts hits, misses and wrong notes; logs a summary at the end of a run.', zh: '统计命中、失误与错音；在练习结束时输出摘要。' },
  'plugin.auto-pause.name': { en: 'Auto-pause on mistakes', zh: '失误自动暂停' },
  'plugin.auto-pause.desc': { en: 'Pauses playback after several consecutive misses so you can regroup.', zh: '连续多次失误后暂停播放，让你调整状态。' },
  'plugin.combo-overlay.name': { en: 'Combo overlay', zh: '连击叠加层' },
  'plugin.combo-overlay.desc': { en: 'Draws a live combo counter and judgement flash on the playfield.', zh: '在演奏界面实时显示连击数与判定闪光。' },
  'plugin.practice-hud.name': { en: 'Practice HUD', zh: '练习仪表' },
  'plugin.practice-hud.desc': { en: 'Live accuracy percentage and a song-progress bar at the top of the playfield.', zh: '在演奏界面顶部显示实时准确率与曲目进度条。' },
  'plugin.tempo-trainer.name': { en: 'Tempo trainer', zh: '速度训练器' },
  'plugin.tempo-trainer.desc': { en: 'Starts slow and speeds up after consecutive clean passes, up to a target tempo.', zh: '从慢速开始，连续干净通过后逐步提速，直至目标速度。' },
  'plugin.loop-trainer.name': { en: 'Loop trainer', zh: '循环训练器' },
  'plugin.loop-trainer.desc': { en: 'Drills the A-B loop region, reporting each lap’s accuracy and optionally speeding up after clean laps.', zh: '反复练习 A-B 循环区域，报告每圈准确率，并可在干净通过后提速。' },

  // ---- achievements (id-keyed) ----
  'ach.first-steps.title': { en: 'First Steps', zh: '初次起步' },
  'ach.first-steps.desc': { en: 'Finish your first practice session.', zh: '完成第一次练习。' },
  'ach.getting-serious.title': { en: 'Getting Serious', zh: '渐入佳境' },
  'ach.getting-serious.desc': { en: 'Complete 10 sessions.', zh: '完成 10 次练习。' },
  'ach.dedicated.title': { en: 'Dedicated', zh: '持之以恒' },
  'ach.dedicated.desc': { en: 'Complete 50 sessions.', zh: '完成 50 次练习。' },
  'ach.century.title': { en: 'Century Club', zh: '百次俱乐部' },
  'ach.century.desc': { en: 'Complete 100 sessions.', zh: '完成 100 次练习。' },
  'ach.explorer.title': { en: 'Explorer', zh: '探索者' },
  'ach.explorer.desc': { en: 'Practice 5 different songs.', zh: '练习 5 首不同的曲目。' },
  'ach.first-s.title': { en: 'Top Marks', zh: '满分佳绩' },
  'ach.first-s.desc': { en: 'Earn an S grade.', zh: '获得一次 S 评级。' },
  'ach.perfectionist.title': { en: 'Perfectionist', zh: '完美主义者' },
  'ach.perfectionist.desc': { en: 'Earn 5 S grades.', zh: '获得 5 次 S 评级。' },
  'ach.flawless.title': { en: 'Flawless', zh: '完美无瑕' },
  'ach.flawless.desc': { en: 'Finish a run at 100% accuracy.', zh: '以 100% 准确率完成一次练习。' },
  'ach.combo-50.title': { en: 'Combo 50', zh: '连击 50' },
  'ach.combo-50.desc': { en: 'Reach a 50-note combo.', zh: '达成 50 音符连击。' },
  'ach.combo-100.title': { en: 'Combo 100', zh: '连击 100' },
  'ach.combo-100.desc': { en: 'Reach a 100-note combo.', zh: '达成 100 音符连击。' },
  'ach.week-streak.title': { en: 'Week Warrior', zh: '一周勇士' },
  'ach.week-streak.desc': { en: 'Practice 7 days in a row.', zh: '连续 7 天练习。' },
  'ach.month-streak.title': { en: 'Month Master', zh: '月度大师' },
  'ach.month-streak.desc': { en: 'Practice 30 days in a row.', zh: '连续 30 天练习。' },
};

/**
 * Translate `key` into `lang`, interpolating `{name}` placeholders from `vars`.
 * Falls back to English, then to the raw key, so a missing entry never throws.
 */
export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const entry = MESSAGES[key];
  let text = entry ? (entry[lang] || entry.en) : key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
