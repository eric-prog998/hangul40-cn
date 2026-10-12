import { confirmPendingKoreanKey, expect, expectTotalXp, goToTraining, keysFor, lastAudio, letterOf, openApp, syllableOf, test } from "./support/app.ts";
import type { Page } from "@playwright/test";

const statsRow = (page: Page) => page.locator(".game-stats-row");

test.describe("拼读工坊", () => {
  const panel = (page: Page) => page.locator("#game-panel-blend");
  const initials = (page: Page) => panel(page).locator(".blend-choice-group").nth(0).locator("button");
  const vowels = (page: Page) => panel(page).locator(".blend-choice-group").nth(1).locator("button");

  async function readQuestion(page: Page) {
    await expect(initials(page).first()).toBeEnabled();
    const heard = await lastAudio(page);
    const clip = syllableOf(heard);
    if (!clip) throw new Error(`blend question should play a syllable, got ${JSON.stringify(heard)}`);
    const initialChoices = await initials(page).locator("span").allTextContents();
    const vowelChoices = await vowels(page).locator("span").allTextContents();
    expect(new Set(initialChoices).size, "four distinct initials").toBe(4);
    expect(new Set(vowelChoices).size, "four distinct vowels").toBe(4);
    expect(initialChoices, `initial of ${clip.syllable} must be offered`).toContain(clip.initial);
    expect(vowelChoices, `vowel of ${clip.syllable} must be offered`).toContain(clip.vowel);
    return { ...clip, initialIndex: initialChoices.indexOf(clip.initial), vowelIndex: vowelChoices.indexOf(clip.vowel) };
  }

  test("eight correct syllables score 8/8 and award 96 XP", async ({ page }) => {
    await openApp(page);
    await page.locator("#game-tab-blend").click();
    for (let round = 1; round <= 8; round += 1) {
      await expect(panel(page).locator(".game-board-top span").first()).toContainText(`第 ${round} / 8 题`);
      const question = await readQuestion(page);
      await initials(page).nth(question.initialIndex).click();
      await vowels(page).nth(question.vowelIndex).click();
      await expect(panel(page).locator(".game-feedback strong")).toContainText(`拼对了！${question.initial} + ${question.vowel} = ${question.syllable}`);
      await panel(page).locator(".game-feedback button").click();
    }
    await expect(panel(page).locator(".game-finish h3")).toHaveText("8 / 8");
    await expectTotalXp(page, 96);
    await expect(statsRow(page)).toContainText("1完成局数");
  });

  test("a wrong part is explained, earns nothing and is remembered as a weak letter", async ({ page }) => {
    await openApp(page);
    await page.locator("#game-tab-blend").click();
    const question = await readQuestion(page);
    await initials(page).nth(question.initialIndex).click();
    await vowels(page).nth((question.vowelIndex + 1) % 4).click();
    await expect(panel(page).locator(".game-feedback strong")).toContainText(`再听：${question.initial} + ${question.vowel} 才是 ${question.syllable}`);
    await expectTotalXp(page, 0);
    await expect(page.locator(".weak-list button strong")).toHaveText([question.vowel]);
  });

  test("can be played from a Korean keyboard, including compound vowels", async ({ page }) => {
    await openApp(page);
    await page.locator("#game-tab-blend").click();
    await goToTraining(page);
    for (let round = 1; round <= 8; round += 1) {
      await expect(panel(page).locator(".game-board-top span").first()).toContainText(`第 ${round} / 8 题`);
      const question = await readQuestion(page);
      for (const key of [...keysFor(question.initial), ...keysFor(question.vowel)]) await page.keyboard.press(key);
      const verdict = panel(page).locator(".game-feedback strong");
      await confirmPendingKoreanKey(page, verdict);
      await expect(verdict).toContainText("拼对了！");
      await page.keyboard.press("Enter");
    }
    await expect(panel(page).locator(".game-finish h3")).toHaveText("8 / 8");
  });

  test("a question cut off by another sound asks for a replay", async ({ page }) => {
    await openApp(page);
    await page.locator("#game-tab-blend").click();
    const question = await readQuestion(page);
    await page.locator(".compare-buttons button").first().click();
    await expect(initials(page).first()).toBeDisabled();
    await expect(panel(page).locator(".game-feedback")).toContainText("题目声音已中断：请点上方播放按钮或按空格重播");
    await page.locator("#blend-replay").click();
    expect((await readQuestion(page)).syllable).toBe(question.syllable);
  });

  test("the beginner round only uses first-step letters and unlocks the next step", async ({ page }) => {
    const basicConsonants = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅎ"];
    const coreVowels = ["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ"];
    await openApp(page);
    const step = page.locator(".starter-path article").nth(2);
    await step.getByRole("button", { name: "10 × 6 拼读" }).click();
    for (let round = 1; round <= 8; round += 1) {
      await expect(panel(page).locator(".game-board-top span").first()).toContainText(`第 ${round} / 8 题 · 新手`);
      const question = await readQuestion(page);
      for (const letter of await initials(page).locator("span").allTextContents()) expect(basicConsonants).toContain(letter);
      for (const letter of await vowels(page).locator("span").allTextContents()) expect(coreVowels).toContain(letter);
      await initials(page).nth(question.initialIndex).click();
      await vowels(page).nth(question.vowelIndex).click();
      await panel(page).locator(".game-feedback button").click();
    }
    await expect(panel(page).locator(".game-finish h3")).toHaveText("8 / 8");
    await expect(step).toContainText("新手拼读已达标");
    await page.reload();
    await expect(page.locator(".starter-path article").nth(2)).toContainText("新手拼读已达标");
  });
});

test.describe("配对消除", () => {
  const panel = (page: Page) => page.locator("#game-panel-match");

  test("every sound card pairs with its letter; clearing the board awards 73 XP", async ({ page }) => {
    await openApp(page);
    await page.locator("#game-tab-match").click();
    await expect(panel(page).locator(".match-grid button")).toHaveCount(12);
    const soundCards = panel(page).locator('.match-grid button[aria-label*="声音牌"]');
    await expect(soundCards).toHaveCount(6);
    const soundIds = await soundCards.evaluateAll((cards) => cards.map((card) => card.id));
    let matched = 0;
    for (const id of soundIds) {
      const sound = page.locator(`#${id}`);
      await sound.click();
      // The card stays locked while its clip plays, then shows as selected.
      await expect(sound).toHaveAttribute("aria-pressed", "true");
      await expect(sound).toBeEnabled();
      const letter = letterOf(await lastAudio(page));
      const letterCard = panel(page).locator(`.match-grid button[aria-label*="字母牌 ${letter}，"]`);
      await expect(letterCard, `a letter card for ${letter}`).toHaveCount(1);
      await letterCard.click();
      matched += 1;
      await expect(panel(page).locator(".game-board-top span").first()).toHaveText(`已配对 ${matched} / 6`);
    }
    await expect(panel(page).locator(".game-feedback span")).toHaveText("全部消除！奖励 25 XP。");
    await expectTotalXp(page, 6 * 8 + 25);
    await expect(statsRow(page)).toContainText("1完成局数");
  });

  test("a sound with the wrong letter does not pair: both flip back, nothing is scored, the right letter still works", async ({ page }) => {
    await openApp(page);
    await page.locator("#game-tab-match").click();
    const sound = panel(page).locator('.match-grid button[aria-label*="声音牌"]').first();
    await sound.click();
    await expect(sound).toHaveAttribute("aria-pressed", "true");
    await expect(sound).toBeEnabled();
    const letter = letterOf(await lastAudio(page));
    const rightLetter = panel(page).locator(`.match-grid button[aria-label*="字母牌 ${letter}，"]`);
    const wrongLetter = panel(page).locator(`.match-grid button[aria-label*="字母牌"]:not([aria-label*="字母牌 ${letter}，"])`).first();

    await wrongLetter.click();
    await expect(panel(page).locator(".game-feedback span")).toHaveText("这两张牌不匹配，稍后会自动翻回。");
    await expect(sound).toHaveAttribute("aria-pressed", "false");
    await expect(wrongLetter).toHaveAttribute("aria-pressed", "false");
    await expect(panel(page).locator(".game-board-top span").first()).toHaveText("已配对 0 / 6");
    await expectTotalXp(page, 0);

    await expect(sound).toBeEnabled();
    await sound.click();
    await expect(sound).toHaveAttribute("aria-pressed", "true");
    await expect(sound).toBeEnabled();
    await rightLetter.click();
    await expect(panel(page).locator(".game-board-top span").first()).toHaveText("已配对 1 / 6");
    await expectTotalXp(page, 8);
  });

  test("two letter cards never match and flip back", async ({ page }) => {
    await openApp(page);
    await page.locator("#game-tab-match").click();
    const letterCards = panel(page).locator('.match-grid button[aria-label*="字母牌"]');
    await letterCards.nth(0).click();
    await letterCards.nth(1).click();
    await expect(panel(page).locator(".game-feedback span")).toHaveText("这两张牌不匹配，稍后会自动翻回。");
    await expect(letterCards.nth(0)).toHaveAttribute("aria-pressed", "false");
    await expect(letterCards.nth(0)).toBeEnabled();
    await expect(panel(page).locator(".game-board-top span").first()).toHaveText("已配对 0 / 6");
    await expectTotalXp(page, 0);
  });
});

test.describe("回声跟读", () => {
  const panel = (page: Page) => page.locator("#game-panel-shadow");
  const counter = (page: Page) => panel(page).locator(".game-board-top span").first();

  async function repeatAndRate(page: Page, confident: boolean) {
    await expect(page.locator("#shadow-confirm")).toBeEnabled();
    await page.locator("#shadow-confirm").click();
    const rate = page.locator(confident ? "#shadow-rate-confident" : "#shadow-rate-unsure");
    await expect(rate).toBeEnabled();
    await rate.click();
  }

  test("eight confident repeats finish the loop with 64 XP", async ({ page }) => {
    await openApp(page);
    await page.locator("#game-tab-shadow").click();
    await page.locator("#shadow-start").click();
    for (let item = 1; item <= 8; item += 1) {
      await expect(counter(page)).toHaveText(`第 ${item} / 8 个示范`);
      const sample = await panel(page).locator(".shadow-card > strong").innerText();
      expect(syllableOf(await lastAudio(page))?.syllable, "the model audio must be the syllable shown").toBe(sample);
      await repeatAndRate(page, true);
    }
    await expect(panel(page).locator(".game-finish h3")).toHaveText("8 个示范");
    await expectTotalXp(page, 64);
    await expect(statsRow(page)).toContainText("1完成局数");
  });

  test("an item rated unsure comes back at the end of the queue", async ({ page }) => {
    await openApp(page);
    await page.locator("#game-tab-shadow").click();
    await page.locator("#shadow-start").click();
    await expect(counter(page)).toHaveText("第 1 / 8 个示范");
    const first = await panel(page).locator(".shadow-card > strong").innerText();
    await repeatAndRate(page, false);
    for (let item = 2; item <= 8; item += 1) {
      await expect(counter(page)).toHaveText(`第 ${item} / 9 个示范`);
      await repeatAndRate(page, true);
    }
    await expect(counter(page)).toHaveText("第 9 / 9 个示范");
    await expect(panel(page).locator(".shadow-card > strong")).toHaveText(first);
    await repeatAndRate(page, true);
    await expect(panel(page).locator(".game-finish h3")).toHaveText("8 个示范");
    await expectTotalXp(page, 64);
  });
});

test.describe("极速认读", () => {
  const panel = (page: Page) => page.locator("#game-panel-speed");
  const optionTexts = (page: Page) => panel(page).locator(".speed-options button").evaluateAll((buttons) => buttons.map((button) => button.lastChild?.textContent ?? ""));

  test("the right romanisation is always offered, only right answers score, and the clock ends the round", async ({ page }) => {
    await openApp(page);
    await page.locator("#game-tab-speed").click();
    await page.locator("#speed-restart").click();
    let score = 0;
    for (let question = 0; question < 5; question += 1) {
      await expect(page.locator("#speed-choice-0")).toBeEnabled();
      const target = await panel(page).locator(".speed-target strong").innerText();
      const options = await optionTexts(page);
      expect(new Set(options).size, "four distinct options").toBe(4);
      await page.locator("#speed-choice-0").click();
      const feedback = panel(page).locator(".speed-feedback");
      await expect(feedback).toContainText(`${target} 是 `);
      const text = await feedback.innerText();
      const answer = /是 (.+?)(?:。|，扣)/.exec(text)?.[1] ?? "";
      expect(options, `the correct reading of ${target} must be one of the options`).toContain(answer);
      if (text.startsWith("正确")) {
        expect(answer).toBe(options[0]);
        score += 1;
      } else {
        expect(text).toContain("再看一次");
        expect(answer).not.toBe(options[0]);
      }
      await expect(panel(page).locator(".game-board-top span").first()).toHaveText(`得分 ${score}`);
    }
    // No more answers: the 30-second clock must finish the round by itself.
    await expect(panel(page).locator(".speed-start h3")).toHaveText(`本轮认出 ${score} 个`, { timeout: 60_000 });
    await expect(statsRow(page)).toContainText("1完成局数");
    await expectTotalXp(page, await page.evaluate(() => Number(document.querySelector(".header-progress span")?.textContent)));
  });

  test("leaving the game cancels the round instead of letting it run in the background", async ({ page }) => {
    await openApp(page);
    await page.locator("#game-tab-speed").click();
    await page.locator("#speed-restart").click();
    await expect(page.locator("#speed-choice-0")).toBeEnabled();
    await page.locator("#game-tab-match").click();
    await page.locator("#game-tab-speed").click();
    await expect(panel(page).locator(".speed-start h3")).toHaveText("本轮已取消");
    await expect(statsRow(page)).toContainText("0完成局数");
  });
});
