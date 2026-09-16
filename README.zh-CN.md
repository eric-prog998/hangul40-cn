# 韩语 40 音｜中文闯关版 v13

这是一个面向中文母语者的韩语 40 音学习网站。源码是未压缩、可编辑的 TypeScript + React，适合直接交给 AI 或开发者继续修改。

## 先让 AI 读这些文件

按下面顺序阅读，通常不必先看构建产物：

1. `README.md`：项目目标、结构和修改规则。
2. `app/page.tsx`：页面内容、学习数据、发音逻辑、小游戏、键盘控制和本地进度。
3. `app/globals.css`：全部视觉样式、移动端适配和交互状态。
4. `data/consonant-names.json`：19 个辅音的正式名称、IPA、真人音频映射和 ㅇ 静音规则。
5. `data/phrases.json`：单词与句子题库。
6. `tests/rendered-html.test.mjs`：现有功能必须满足的自动测试。
7. `HUMAN_CONSONANT_AUDIO.md`：真人辅音起音的来源、许可和制作方法。

## 主要功能

- 19 个辅音、21 个元音的学习卡。
- 18 个辅音使用韩国母语者真人起音 WAV；`ㅇ` 作初声时保持静音。
- 元音和组合音节使用随项目附带的韩语音频。
- 单词、句子背诵卡与十题记忆闯关。
- 五种小游戏：听音辨字、影子跟读、配对消除、拼读工坊、30 秒极速认读。
- 答题后自动播放并自动进入下一题。
- 错题加权、每日 XP、连续答对、掌握状态和近七天记录。
- 键盘完整操作：
  - `1 2 3 4` 或 `A S D F`：选择四个答案。
  - `Space` 或 `R`：重播。
  - `Enter`：开始或进入下一题。
  - `←` / `→`：切换小游戏。
  - 配对游戏：`Q W E R`、`A S D F`、`Z X C V`。
  - 拼读游戏：`A S D F` 选辅音，`J K L ;` 选元音。
  - `?`：快捷键帮助；`Esc`：关闭帮助。

## 技术结构

```text
app/
  page.tsx                    核心页面和全部交互逻辑
  globals.css                 页面样式与响应式布局
  layout.tsx                  网站标题、描述和 favicon
data/
  consonant-names.json        辅音名称、IPA、音频文件映射
  consonant-human-clips.json  真人起音原始录音与裁剪元数据
  phrases.json                单词和句子题库
public/audio/
  consonant-human-onset/      18 个韩国真人辅音起音 WAV
  hangul-natural/             元音和韩字音节 MP3
  phrases/                    单词与句子 MP3
tests/
  rendered-html.test.mjs      页面、发音素材、自动推进等回归测试
scripts/
  extract-human-consonants.py 可复现的真人起音提取脚本
.openai/hosting.json          现有 OpenAI Sites 项目标识
```

## 发音逻辑（修改时不要破坏）

- `consonantSoundPath()` 把辅音映射到 `public/audio/consonant-human-onset/*.wav`。
- `audioPath()` 把韩字音节映射到 `public/audio/hangul-natural/s-<Unicode 十六进制>.mp3`。
- `phraseAudioPaths` 把词句映射到 `public/audio/phrases/<id>.mp3`。
- 页面通过一个共享的 `activeAudio` 停止上一段音频，避免一次点击同时播放两个声音。
- 辅音学习卡的“正式名称”使用设备里的韩语语音；“听真人起音”播放项目内 WAV。这两个按钮用途不同。
- 不要把辅音真人起音改回振荡器合成音，也不要用“辅音 + ㅏ”冒充独立辅音。
- `ㅇ` 作初声没有声音；它作为收音时才读 `[ŋ]`。

## 数据与浏览器状态

页面不需要账号或数据库。学习记录保存在浏览器 `localStorage`：

- `hangul-audio-speed`
- `hangul-mastered`
- `hangul-phrase-mastered`
- `hangul-game-stats`

清除浏览器网站数据会清空本机学习记录。

## 本地运行

需要 Node.js `22.13.0` 或更高版本。

```bash
npm install
npm run dev
```

然后打开终端里显示的本地网址。

## 测试与构建

```bash
npm test
```

`npm test` 会先完成生产构建，再检查页面内容、19 个辅音名称、18 个真人 WAV、关键音频文件、自动推进和键盘逻辑。修改后应保持全部测试通过。

也可以分别运行：

```bash
npm run build
npm run lint
```

## 常见修改位置

- 增加单词或句子：修改 `data/phrases.json`，并在 `public/audio/phrases/` 添加同名 `<id>.mp3`。
- 修改字母提示：编辑 `app/page.tsx` 顶部的 `consonants` 或 `vowels`。
- 修改小游戏：搜索 `gameModes`、`switchGameMode` 和对应的状态变量。
- 修改自动下一题等待时间：搜索 `AUTO_ADVANCE_DELAY_MS` 和 `phraseAutoAdvanceDelay()`。
- 修改键盘操作：搜索 `handleKeyboard`。
- 修改颜色、布局或移动端：编辑 `app/globals.css`。
- 更新当前线上网站：保留 `.openai/hosting.json` 中的 `project_id`，不要创建重复站点。

## 给 AI 的维护约束

1. 先阅读本文件和测试，再修改代码。
2. 保留中文界面和适合中国学习者的发音提示。
3. 保留真实音频来源说明，不要删除 `HUMAN_CONSONANT_AUDIO.md` 和两个辅音 JSON 文件。
4. 修改发音逻辑时，重点检查“一次点击只播放一次”和“答题后只推进一次”。
5. 保持鼠标、触屏和键盘三种操作都可用。
6. 不要把 API 密钥、账号、手机号或其他私人信息写入源码。
7. 完成后运行 `npm test`，再进行发布。

## 音频许可

18 个韩国真人辅音起音来自母语者 호로조（Jeebeen）的 Wikimedia Commons / Lingua Libre 发音录音，源文件为 CC0 1.0。逐文件来源、SHA-256 和裁剪范围见 `data/consonant-human-clips.json`，完整说明见 `HUMAN_CONSONANT_AUDIO.md`。
