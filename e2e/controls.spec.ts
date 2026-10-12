import { answerListen, audibleClips, expect, expectTotalXp, goToTraining, lastAudio, lastAudioRate, letterOf, nextListen, openApp, readListenQuestion, settle, syllableOf, test } from "./support/app.ts";

test.describe("练习节奏", () => {
  test.use({ autoAdvance: "site-default" });

  test("by default the next question arrives by itself a few seconds after the feedback", async ({ page }) => {
    await openApp(page);
    await expect(page.locator("#auto-advance-setting")).toHaveValue("3000");
    await page.locator("#listen-start").click();
    await answerListen(page);
    await expect(page.getByTestId("listen-round")).toHaveText("第 2 / 10 题", { timeout: 12_000 });
    // It advances once, not twice.
    await readListenQuestion(page);
    await page.waitForTimeout(4_000);
    await expect(page.getByTestId("listen-round")).toHaveText("第 2 / 10 题");
  });

  test("manual mode waits for the learner, and the setting is remembered", async ({ page }) => {
    await openApp(page);
    await page.locator("#auto-advance-setting").selectOption("0");
    await page.locator("#listen-start").click();
    await answerListen(page);
    await expect(page.locator("#game-panel-listen .game-feedback small")).toHaveText("自动下一题已关闭；按 Enter 继续。");
    await page.waitForTimeout(5_000);
    await expect(page.getByTestId("listen-round")).toHaveText("第 1 / 10 题");
    await nextListen(page);
    await expect(page.getByTestId("listen-round")).toHaveText("第 2 / 10 题");

    await page.reload();
    await expect(page.locator("#auto-advance-setting")).toHaveValue("0");
  });
});

test.describe("键盘导航", () => {
  test("Shift+1 to Shift+4 jump to the four practice areas", async ({ page }) => {
    await openApp(page);
    for (const [key, id] of [["Shift+Digit2", "letter-keyboard-console"], ["Shift+Digit3", "phrase-quiz-panel"], ["Shift+Digit4", "batchim-lesson"], ["Shift+Digit1", "keyboard-game-console"]]) {
      await page.keyboard.press(key);
      await expect(page.locator(`#${id}`), key).toBeFocused();
      await expect(page.locator(`#${id}`), key).toBeInViewport();
    }
  });

  test("the letter keyboard reads plain, tense and compound letters, by name or by onset", async ({ page }) => {
    await openApp(page);
    await page.keyboard.press("Shift+Digit2");
    const shown = page.locator(".letter-keyboard-result strong");

    await page.keyboard.press("KeyR");
    await expect(shown).toHaveText("ㄱ");
    await expect.poll(() => lastAudio(page)).toEqual({ kind: "name", char: "ㄱ" });

    await page.keyboard.press("Shift+KeyR");
    await expect(shown).toHaveText("ㄲ");
    await expect.poll(() => lastAudio(page)).toEqual({ kind: "name", char: "ㄲ" });

    await page.keyboard.press("KeyH");
    await page.keyboard.press("KeyK");
    await expect(shown).toHaveText("ㅘ");
    await expect.poll(async () => syllableOf(await lastAudio(page))?.syllable).toBe("와");

    await page.keyboard.press("Digit2");
    await page.keyboard.press("KeyS");
    await expect(shown).toHaveText("ㄴ");
    await expect.poll(() => lastAudio(page)).toEqual({ kind: "onset", char: "ㄴ" });
  });

  test("square brackets cycle through the six games", async ({ page }) => {
    await openApp(page);
    await goToTraining(page);
    const selected = () => page.locator('.game-tabs [role="tab"][aria-selected="true"]');
    await expect(selected()).toHaveId("game-tab-listen");
    await page.keyboard.press("BracketRight");
    await expect(selected()).toHaveId("game-tab-shadow");
    await settle(page);
    await page.keyboard.press("BracketLeft");
    await expect(selected()).toHaveId("game-tab-listen");
    await settle(page);
    await page.keyboard.press("BracketLeft");
    await expect(selected()).toHaveId("game-tab-typing");
  });

  test("the shortcut help opens with ?, keeps focus inside, and Esc returns to where the learner was", async ({ page }) => {
    await openApp(page);
    await page.locator("#game-tab-listen").focus();
    await page.keyboard.press("Shift+Slash");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((node) => node.contains(document.activeElement)), `focus stays in the dialog after Tab ${step + 1}`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#game-tab-listen")).toBeFocused();
  });
});

test.describe("纯键盘操作", () => {
  test("Enter at the top of the page enters the training area and a second Enter starts the round", async ({ page }) => {
    await openApp(page);
    await page.keyboard.press("Enter");
    await expect(page.locator("#keyboard-game-console")).toBeFocused();
    await expect(page.locator("#keyboard-game-console")).toBeInViewport();
    await settle(page);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("listen-round")).toHaveText("第 1 / 10 题");
    await readListenQuestion(page);
  });

  test("the phrase quiz is fully playable with number keys, ASDF, Space and Enter", async ({ page }) => {
    await openApp(page);
    await page.keyboard.press("Shift+Digit3");
    await expect(page.locator("#phrase-quiz-panel")).toBeFocused();
    await settle(page);
    await page.keyboard.press("Enter");
    const round = page.getByTestId("phrase-round");
    const verdict = page.locator("#phrase-quiz-panel .phrase-quiz-feedback strong");
    const question = async () => {
      await expect(page.getByTestId("phrase-choice-0")).toBeEnabled();
      const clip = await lastAudio(page);
      if (clip.kind !== "phrase") throw new Error("expected a phrase clip");
      const choices = await page.locator('[data-testid^="phrase-choice-"] span').allTextContents();
      return { id: clip.phrase.id, index: choices.indexOf(clip.phrase.chinese) };
    };

    await expect(round).toHaveText("第 1 / 10 题");
    let current = await question();
    await page.keyboard.press(`Digit${current.index + 1}`);
    await expect(verdict).toHaveText("正确！+10 XP");
    await page.keyboard.press("Enter");

    await expect(round).toHaveText("第 2 / 10 题");
    current = await question();
    const before = (await page.evaluate(() => window.__audioLog.length));
    await page.keyboard.press("Space"); // replay must not answer or skip
    await expect.poll(() => page.evaluate(() => window.__audioLog.length)).toBe(before + 1);
    expect((await question()).id).toBe(current.id);
    await page.keyboard.press(`Key${"ASDF"[current.index]}`);
    await expect(verdict).toHaveText("正确！+10 XP");
    await page.keyboard.press("Enter");
    await expect(round).toHaveText("第 3 / 10 题");
    await expectTotalXp(page, 20);
  });

  test("shadowing and matching respond to their own keys", async ({ page }) => {
    await openApp(page);
    await goToTraining(page);
    await page.keyboard.press("BracketRight"); // 回声跟读
    await expect(page.locator("#game-tab-shadow")).toHaveAttribute("aria-selected", "true");
    await settle(page);
    await page.keyboard.press("Enter");
    const counter = page.locator("#game-panel-shadow .game-board-top span").first();
    await expect(counter).toHaveText("第 1 / 8 个示范");
    await expect(page.locator("#shadow-confirm")).toBeEnabled();
    await page.keyboard.press("Enter");
    await expect(page.locator("#shadow-rate-confident")).toBeEnabled();
    await page.keyboard.press("Digit2");
    await expect(counter).toHaveText("第 2 / 8 个示范");
    await expectTotalXp(page, 8);

    await page.keyboard.press("BracketRight"); // 配对消除
    const cards = page.locator("#game-panel-match .match-grid button");
    await expect(cards).toHaveCount(12);
    await settle(page);
    const keys = ["Q", "W", "E", "R", "A", "S", "D", "F", "Z", "X", "C", "V"];
    const labels = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label") ?? ""));
    const soundIndex = labels.findIndex((label) => label.includes("声音牌"));
    await page.keyboard.press(`Key${keys[soundIndex]}`);
    await expect(cards.nth(soundIndex)).toHaveAttribute("aria-pressed", "true");
    await expect(cards.nth(soundIndex)).toBeEnabled();
    const letter = letterOf(await lastAudio(page));
    const letterIndex = labels.findIndex((label) => label.includes(`字母牌 ${letter}，`));
    await page.keyboard.press(`Key${keys[letterIndex]}`);
    await expect(page.locator("#game-panel-match .game-board-top span").first()).toHaveText("已配对 1 / 6");
  });
});

test.describe("播放设置", () => {
  test("hiding romanisation and slow playback are applied and remembered", async ({ page }) => {
    await openApp(page);
    const firstRoman = page.locator("#letter-panel .letter-card .roman").first();
    await expect(firstRoman).toHaveText("g / k");
    await page.locator(".roman-mode-toggle").click();
    await expect(firstRoman).toHaveText("罗马字已隐藏");
    await page.locator(".audio-speed-toggle").getByRole("button", { name: "慢放" }).click();
    await page.locator(".syllable-result").click();
    await expect.poll(() => lastAudioRate(page)).toBe(0.82);

    await page.reload();
    await expect(firstRoman).toHaveText("罗马字已隐藏");
    await expect(page.locator(".audio-speed-toggle").getByRole("button", { name: "慢放" })).toHaveAttribute("aria-pressed", "true");
    await page.locator(".syllable-result").click();
    await expect.poll(() => lastAudioRate(page)).toBe(0.82);
  });

  test("starting a new sound always silences the previous one", async ({ page }) => {
    await openApp(page);
    const buttons = page.locator(".compare-buttons button");
    await expect(buttons).toHaveCount(12);
    let loudest = 0;
    for (let index = 0; index < 12; index += 1) {
      await buttons.nth(index).click();
      loudest = Math.max(loudest, await audibleClips(page));
    }
    expect(loudest, "clips audible at the same moment").toBeLessThanOrEqual(1);
    // …and a game question takes over from a reference sound in the same way.
    await page.locator(".syllable-result").click();
    await page.locator("#listen-start").click();
    expect(await audibleClips(page)).toBeLessThanOrEqual(1);
    await answerListen(page);
  });
});
