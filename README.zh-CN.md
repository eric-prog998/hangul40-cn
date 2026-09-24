# 韩语 40 音｜中文闯关版 v37

面向中文学习者的韩语入门网站。现有线上入口：[韩语 40 音](https://hangul40-cn-eric0716.ericlll1.chatgpt.site/)。完整使用说明、版本变化和边界见 [README.md](README.md)；后续规划见 [LEARNING_ROADMAP_ZH.md](LEARNING_ROADMAP_ZH.md)。

## 当前功能

- 19 个辅音、21 个元音，字块拆解，以及 52 个生活词句。
- 六种训练：听音辨字、影子跟读、配对消除、拼读工坊、极速认读、地铁打字。
- ㅓ/ㅗ、ㅡ/ㅜ 发音对比；最长 15 秒本地录音，仅在主动点击后申请麦克风，不上传、不持久保存。
- 今日复习：每天最多 10 项，先回忆再翻面自评；复习排期与学习记录保存在当前浏览器，不跨设备同步。
- v37 收音第一课：仅覆盖词尾 ㄹ、ㅁ、ㅇ，使用 물、지하철、사람、지금、영수증 的现有完整词音频；不是完整七类收音或变音课程。

## 键盘入门

页面顶部按 Enter 进入训练场，再按 Enter 开始；F2 返回训练场，`[` / `]` 切换游戏。听音与拼读默认使用韩国标准双拼键位，例如 R → ㄱ、K → ㅏ、Shift+R → ㄲ、H 后接 K → ㅘ；也可使用数字选项或切回传统 ASDF 模式。韩文键位模式下 R 不是重播键，请用空格或 F8。

地铁打字输入框需要系统韩语输入法。发音对比、今日复习与收音课分别使用本区显示的快捷键，不应将某一区域的按键规则套用到全站；按钮聚焦时保留原生 Enter / Space 行为。详见主 README 与页面快捷键提示。

## 源码导航

- `app/page.tsx`、`app/globals.css`：主页面、训练场和整体样式。
- `app/learning-logic.ts`、`app/typing-logic.ts`、`app/keyboard-logic.ts`、`app/korean-keyboard.tsx`：字块、打字与韩文键位。
- `app/progress-ledger.ts`：学习进度合并与保护；不要随意清空或改名已有存储键。
- `app/pronunciation-data.ts`、`app/vowel-practice.tsx`、`app/local-voice-recorder.tsx`、`app/recording-logic.ts`：发音对比与录音。
- `app/review-logic.ts`、`app/review-storage.ts`、`app/use-daily-review.ts`、`app/daily-review.tsx`、`app/date-logic.ts`：复习排期、存储与生命周期。
- `app/batchim-data.ts`、`app/batchim-lesson.tsx`、`app/batchim-lesson.css`：收音第一课及资料来源。
- `data/`、`public/audio/`：题库、真人录音来源元数据及随项目附带的音频。
- `tests/`：页面、键盘、发音、录音、复习和收音回归测试。
- `vite.config.ts`、`build/`、`worker/`、`.openai/hosting.json`：构建与现有 Sites 项目配置。

## 本地运行与检查

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
npm run lint
npm test
```

`npm test` 会先生产构建再运行测试。使用独立本地端口检查，避免改动用户现有网站的学习记录。更新 GitHub 源码不等于发布网站；只有明确要求部署时才更新现有 Sites 项目，并保留原 `project_id`。

## 发音与许可边界

18 个辅音起音来自韩国母语者的录音裁剪，`ㅇ` 作初声静音、作收音读 [ŋ]。起音片段不是可独立持续发出的完整音，也不能用“辅音 + ㅏ”冒充。真人来源、CC0 许可及裁剪细节见 [HUMAN_CONSONANT_AUDIO.md](HUMAN_CONSONANT_AUDIO.md) 与 `data/consonant-human-clips.json`。

完整音节与词句示范包含固定 AI 音频，未全部经母语教师逐条复核。口型和收音提示附有官方资料来源；听辨得分、跟读练习及复习自评均不代表发音准确度，本项目不提供自动发音评分。代码沿用 [MIT License](LICENSE)。
