# 韩语 40 音｜中文闯关版 v42

面向中文学习者的韩语入门网站。现有线上入口：[韩语 40 音](https://hangul40-cn-eric0716.ericlll1.chatgpt.site/)。完整使用说明、版本变化和边界见 [README.md](README.md)；后续规划见 [LEARNING_ROADMAP_ZH.md](LEARNING_ROADMAP_ZH.md)。

**v42 是应用版本**；`package.json` 中的 `0.1.0` 是私有 npm 项目的包版本，不代表线上功能仍为旧版。本项目没有发布为公共 npm 包。

v42 修复声音中断后重播提示、录音结束状态、词典链接、备份本地日期和旧浏览器兼容性，新增 86 项 Chromium 浏览器回归测试。详见 [V42-RELEASE-NOTES.md](V42-RELEASE-NOTES.md)。音源、学习记录格式和既有学习功能保持不变。

## 当前功能

- 19 个辅音、21 个元音，字块拆解，以及 52 个生活词句。
- 六种训练：听音辨字、影子跟读、配对消除、拼读工坊、极速认读、地铁打字。
- ㅓ/ㅗ、ㅡ/ㅜ 发音对比；最长 15 秒本地录音，仅在主动点击后申请麦克风，不上传、不持久保存。
- 今日复习：每天最多 10 项，先回忆再翻面自评；复习排期与学习记录保存在当前浏览器。
- 收音第一课：仅覆盖词尾 ㄹ、ㅁ、ㅇ，使用 물、지하철、사람、지금、영수증 的现有完整词音频；不是完整七类收音或变音课程。
- 元音盲听：ㅓ/ㅗ、ㅡ/ㅜ 共 8 题，完整示范播放成功后作答；支持本轮错题和长期错题重练。保存最近 200 次作答，显示最近 20 次表现；在保留记录范围内，错过的音例连续答对两次后移出待巩固。
- 设置·备份：听音、拼读、词句闯关、元音盲听、收音练习可选择手动或 2／3／5 秒自动下一题，默认 3 秒；其他模式保持各自规则。
- JSON 进度备份：导入先检查和预览，再确认合并。已学标记取并集，经验与累计次数取较高值，每日复习保留较新记录；重复导入不会重复加分。

没有账号云同步。换电脑或浏览器时，可自行下载并导入 JSON 备份；文件只在本地浏览器读取，不上传，不包含录音、音频资源或进行中的题目。恢复需要支持 Web Locks 的浏览器，建议使用 Chrome；导入时请暂停其他标签页的学习。备份格式与限制见 [V41-FEATURE-NOTES.md](V41-FEATURE-NOTES.md)。

## 键盘入门

页面顶部按 Enter 进入训练场，再按 Enter 开始；F2 返回训练场，`[` / `]` 切换游戏。听音与拼读默认使用韩国标准双拼键位，例如 R → ㄱ、K → ㅏ、Shift+R → ㄲ、H 后接 K → ㅘ；也可使用数字选项或切回传统 ASDF 模式。韩文键位模式下 R 不是重播键，请用空格或 F8。

- Shift + 1／2／3／4 分别进入训练场、40 音点读、词句闯关、收音练习；输入框内不拦截这些组合。
- 40 音点读支持韩文物理键位和 1.5 秒内的复合元音连按；1 选择辅音名称，2 选择真人起音，空格／Enter 重播，Backspace 清除组合，Esc 停止。
- 收音练习可用 F／A／D 选择 ㄹ／ㅁ／ㅇ，也保留 1／2／3。元音盲听可用 1／2 或相应韩文物理键 J／H／M／N；空格／F8 重听，Enter 开始／继续，Esc 停止。
- 地铁打字输入框需要系统韩语输入法。IME 确认 Enter 不应提交答案，完成组合后可用 Shift + Enter 重播。

发音对比、今日复习与收音课分别使用本区显示的快捷键，不应将某一区域的按键规则套用到全站；按钮聚焦时保留原生 Enter / Space 行为。F2／F8 功能键在部分 Mac 设置下需要配合 Fn。事件逻辑测试不等同于实体 Mac 韩语输入法的完整验收，详见页面提示和 [V38-KEYBOARD-NOTES.md](V38-KEYBOARD-NOTES.md)。

## 源码导航

- `app/page.tsx`、`app/globals.css`：主页面、训练场和整体样式。
- `app/learning-logic.ts`、`app/typing-logic.ts`、`app/keyboard-logic.ts`、`app/korean-keyboard.tsx`：字块、打字与韩文键位。
- `app/letter-keyboard-lab.tsx`、`app/letter-keyboard-lab.css`：40 音点读与实体键位联动。
- `app/progress-ledger.ts`：学习进度合并与保护；不要随意清空或改名已有存储键。
- `app/pronunciation-data.ts`、`app/vowel-practice.tsx`、`app/local-voice-recorder.tsx`、`app/recording-logic.ts`：发音对比与录音。
- `app/vowel-listening-challenge.tsx`、`app/vowel-challenge-logic.ts`：元音盲听、题目转换及本轮错题。
- `app/vowel-history.ts`、`app/use-vowel-history.ts`：长期作答历史、去重、保留上限与错题巩固。
- `app/learning-tools.tsx`、`app/learning-settings.ts`、`app/portable-backup.ts`：切题设置、备份界面、格式校验及进度合并；主页面负责协调恢复各类记录。
- `app/review-logic.ts`、`app/review-storage.ts`、`app/use-daily-review.ts`、`app/daily-review.tsx`、`app/date-logic.ts`：复习排期、存储与生命周期。
- `app/batchim-data.ts`、`app/batchim-lesson.tsx`、`app/batchim-lesson.css`：收音第一课及资料来源。
- `data/`、`public/audio/`：题库、真人录音来源元数据及随项目附带的音频。
- `tests/`：页面、键盘、发音、录音、复习、收音、盲听和备份回归测试。
- `e2e/`、`playwright.config.ts`：真浏览器测试，构建网站后在 Chromium 里把各种玩法实际操作一遍。
- `vite.config.ts`、`build/`、`worker/`、`.openai/hosting.json`：构建与现有 Sites 项目配置。

## 本地运行与检查

需要 Node.js `>=22.13.0`。随附音频无需 API 密钥。下面命令适用于 macOS／Linux；当前 npm 脚本使用 POSIX 环境变量写法，Windows 建议使用 WSL。

```bash
npm ci
npm run dev
```

开发服务启动后，按终端提示打开本地网址；在另一终端检查：

```bash
npx tsc --noEmit
npm run lint
npm test
npm run test:e2e
```

`npm test` 会先生产构建再运行测试。使用独立本地端口检查，避免改动用户现有网站的学习记录；浏览器按网址来源隔离本地进度。

`npm run test:e2e` 是真浏览器测试：自动构建网站，在本机 Chromium 里像学习者一样操作六种训练、词句闯关、今日复习、收音课、发音对比、录音、新手路线、纯键盘操作、进度保存和备份导入导出，并检查浏览器有没有报错，全程需要几分钟。第一次在新电脑上运行前先执行 `npx playwright install chromium`。它只访问本机 `127.0.0.1:4173`，不会碰线上网站和你的学习记录。

这套测试用的是桌面版 Chromium（含手机尺寸的屏幕模拟）、Chromium 自带的模拟麦克风和模拟的输入法组合事件，不等同于 Safari、手机真机、实体 Mac 韩语输入法或音质验收，这些仍需人工确认。仓库的 GitHub Actions 会在每次推送和 Pull Request 时自动跑同样的检查。

这是 Vinext／Cloudflare Worker 项目，不是双击 HTML 即可运行的静态页面，也不能直接当作 GitHub Pages 目录上传。更新 GitHub 源码不等于发布网站；只有明确要求部署时才更新现有 Sites 项目，并保留原 `project_id`。不要提交 `.env*`、访问令牌、学习备份、录音、日志、构建目录或本地重复副本。

## 发音与许可边界

18 个辅音起音来自韩国母语者的录音裁剪，`ㅇ` 作初声静音、作收音读 [ŋ]。起音片段不是可独立持续发出的完整音，也不能用“辅音 + ㅏ”冒充。真人来源、CC0 许可及裁剪细节见 [HUMAN_CONSONANT_AUDIO.md](HUMAN_CONSONANT_AUDIO.md) 与 `data/consonant-human-clips.json`。

完整音节与词句示范包含固定 AI 音频，未全部经母语教师逐条复核。口型和收音提示附有官方资料来源；听辨得分、跟读练习及复习自评均不代表发音准确度，本项目不提供自动发音评分。

## 许可与版权

Copyright © 2026 **Eric D**.

项目代码采用 [MIT License](LICENSE)，属于 OSI 认可的开源许可。允许使用、复制、修改、合并、发布、分发、再许可及商业使用，但必须保留 MIT 许可证要求的版权与许可声明。真人辅音起音仍按其原始 **CC0 1.0** 条款使用，其他第三方材料遵循各自许可证。
