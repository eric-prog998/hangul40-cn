# 用 GitHub Desktop 把源码推到 hangul40-cn

全程图形界面，不用终端，不用 token。大概 10 分钟，大部分时间在等下载和上传。

仓库现状：只有一个 `hangul40-v13-ai-readable-source.zip`，需要换成真实文件树。

---

## 第 1 步：装好并登录

1. 打开 https://desktop.github.com ，下载 macOS 版，拖进「应用程序」
2. 首次打开 → **Sign in to GitHub.com** → 会跳到浏览器（你已经登录了）→ 点授权 → 跳回 App
3. 它会问 Name / Email，随便填，这只影响 commit 里显示的作者名

---

## 第 2 步：把仓库克隆到本地

1. 菜单栏 **File → Clone repository**
2. 选 **GitHub.com** 标签，列表里找 `eric-prog998/hangul40-cn`
3. Local path 选个位置（默认的 `~/Documents/GitHub/hangul40-cn` 就行）→ **Clone**

克隆完，Finder 里打开这个文件夹，里面应该只有那个 zip。

---

## 第 3 步：把文件放进去

在**克隆下来的 `hangul40-cn` 文件夹**里操作：

1. **删掉** `hangul40-v13-ai-readable-source.zip`
2. 解压你本地那份源码 zip，进到 `hangul40-v13-ai-readable-source` 文件夹里面
   （能看到 `package.json`、`app`、`public` 那一层）
3. **全选里面所有内容**（Cmd+A），拷贝，粘贴进 `hangul40-cn` 文件夹
   ⚠️ 要的是**文件夹里的内容**，不是那个文件夹本身。粘完 `hangul40-cn` 里应该直接看到
   `package.json`、`app/`、`public/`，而不是又套一层 `hangul40-v13-ai-readable-source/`
4. 把我给你的 4 个文件放进去，覆盖同名的：
   - `README.md` ← 覆盖（英文版，审核看这个）
   - `README.zh-CN.md` ← 新增（原中文版，内容一字未改）
   - `LICENSE` ← 新增
   - `package.json` ← 覆盖（改掉了模板名 `site-creator-vinext-starter`，加了 license 和仓库字段）
5. `gitignore.txt` 改名成 `.gitignore`，覆盖原有的
   - Finder 里按 **Cmd+Shift+.** 可以显示/隐藏以点开头的文件
   - 改名时会弹"以点开头的名称保留给系统"，点「使用.」继续

### 关于 `.openai` 文件夹

新 `.gitignore` 会排除它，所以它不会被推上去（里面有你线上站的 project_id，没必要公开）。
**本地那份千万别删** —— 删了就没法继续更新现在的线上站。

---

## 第 4 步：提交并推送

1. 回到 GitHub Desktop，左侧 Changes 会列出几百个改动（正常，488 个文件）
2. 左下角 Summary 填：`Initial import: Hangul 40 (Chinese edition) v13 source`
3. 点 **Commit to main**
4. 顶部出现 **Push origin** → 点它，等进度条走完（7MB，看网速）

---

## 第 5 步：检查

打开 https://github.com/eric-prog998/hangul40-cn ，确认：

- [ ] 文件树能展开，看得到 `app/`、`data/`、`public/audio/`、`tests/`
- [ ] 首页显示英文 README
- [ ] 右侧 About 下方出现 `MIT` 许可证
- [ ] 顶部出现语言统计条（TypeScript / CSS）
- [ ] 那个 `.zip` 不在了
- [ ] `.openai/` 没被推上去

任何一项不对，截图发我。

---

## 第 6 步（可选，但对申请有帮助）

- 仓库 **Settings** → 勾上 **Issues**（审核在看"活跃维护"，issue 区是证据）
- 右侧 About 齿轮 → Website 填 `https://hangul40-cn-eric0716.ericlll1.chatgpt.site/`
- Topics 加上：`korean` `hangul` `language-learning` `chinese` `kpop`
- 有空把线上 v32 的代码也推一次，仓库和线上站就对齐了

---

搞定之后跟我说，我去把 OpenAI 那个表单填完，截图给你确认再提交。
