import { answerListen, expect, expectTotalXp, lastAudio, nextListen, openApp, test } from "./support/app.ts";

test.describe("页面基础", () => {
  test("loads without browser errors and shows every main section", async ({ page }) => {
    await openApp(page);
    await expect(page.locator("h1")).toContainText("把 40 音玩熟");
    for (const id of ["starter", "games", "daily-review", "learning-tools", "phrases", "learn", "pronunciation-practice", "batchim-lesson", "compare"]) {
      await expect(page.locator(`#${id}`), `section #${id}`).toBeAttached();
    }
    // Every in-page link must point at something that exists.
    const targets = await page.locator('a[href^="#"]').evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute("href") ?? ""))]);
    for (const target of targets) await expect(page.locator(`[id="${target.slice(1)}"]`), `anchor ${target}`).toBeAttached();
  });

  test("the 40-letter table lists 19 consonants and 21 vowels, and marks survive a reload", async ({ page }) => {
    await openApp(page);
    await expect(page.locator("#letter-panel .letter-card")).toHaveCount(19);
    await page.locator("#letter-tab-vowels").click();
    await expect(page.locator("#letter-panel .letter-card")).toHaveCount(21);
    await page.locator("#letter-master-ㅏ").click();
    await page.locator("#letter-tab-consonants").click();
    await page.locator("#letter-master-ㄱ").click();
    await expect(page.locator(".mastery-meter strong")).toHaveText("2/40");

    await page.reload();
    await expect(page.locator(".mastery-meter strong")).toHaveText("2/40");
    await expect(page.locator("#letter-master-ㄱ")).toHaveAttribute("aria-pressed", "true");
    // Un-marking is remembered too.
    await page.locator("#letter-master-ㄱ").click();
    await page.reload();
    await expect(page.locator(".mastery-meter strong")).toHaveText("1/40");

    await page.locator("#letter-filter-learning").click();
    await expect(page.locator("#letter-panel .letter-card")).toHaveCount(19);
    await page.locator("#letter-tab-vowels").click();
    await expect(page.locator("#letter-panel .letter-card")).toHaveCount(20);
  });

  test("letter cards play the matching audio: consonant name, human onset and vowel sample", async ({ page }) => {
    await openApp(page);
    const card = page.locator("#letter-panel .letter-card").filter({ has: page.locator("#letter-master-ㄴ") });
    await card.locator(".name-audio").click();
    await expect.poll(async () => (await page.evaluate(() => window.__audioLog.at(-1) ?? "")).includes("/audio/consonant-names/nieun.mp3")).toBe(true);
    await card.locator(".letter-audio-actions button").nth(1).click();
    await expect.poll(async () => (await page.evaluate(() => window.__audioLog.at(-1) ?? "")).includes("/audio/consonant-human-onset/nieun.wav")).toBe(true);
    await page.locator("#letter-tab-vowels").click();
    await page.locator("#letter-panel .letter-card").filter({ has: page.locator("#letter-master-ㅓ") }).locator(".letter-audio-actions button").click();
    // 어 = U+C5B4
    await expect.poll(async () => (await page.evaluate(() => window.__audioLog.at(-1) ?? "")).includes("/audio/hangul-natural/s-c5b4.mp3")).toBe(true);
  });

  test("a phone-sized screen has no sideways scrolling", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true, locale: "zh-CN" });
    const page = await context.newPage();
    await openApp(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "horizontal overflow in CSS pixels").toBeLessThanOrEqual(0);
    await context.close();
  });
});

test.describe("手机屏幕", () => {
  test.use({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true });

  test("listening, phrases and typing all work on a phone-sized touch screen", async ({ page }) => {
    await openApp(page);
    await page.locator("#listen-start").tap();
    for (let round = 0; round < 3; round += 1) {
      await answerListen(page);
      await nextListen(page);
    }
    await expectTotalXp(page, 12 + 14 + 16);

    await page.locator("#phrase-quiz-restart").tap();
    await expect(page.getByTestId("phrase-choice-0")).toBeEnabled();
    const clip = await lastAudio(page);
    if (clip.kind !== "phrase") throw new Error("expected a phrase clip");
    // Match the full meaning: e.g. 人 must not also select 中国人.
    const meanings = await page.locator('[data-testid^="phrase-choice-"] span').allTextContents();
    expect(meanings.filter((meaning) => meaning === clip.phrase.chinese)).toHaveLength(1);
    await page.getByTestId(`phrase-choice-${meanings.indexOf(clip.phrase.chinese)}`).tap();
    await expectTotalXp(page, 52);

    await page.locator("#game-tab-typing").tap();
    await page.locator("#typing-start").tap();
    const word = await page.locator("#typing-target-korean").innerText();
    await page.locator("#typing-input").fill(word);
    await page.locator("#typing-input").press("Enter");
    await expect(page.locator("#game-panel-typing .game-board-top span").first()).toHaveText("第 2 / 8 站");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "horizontal overflow in CSS pixels").toBeLessThanOrEqual(0);
  });
});
