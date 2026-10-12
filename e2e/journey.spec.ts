import { answerListen, expect, lastAudio, listenPanel, nextListen, openApp, syllableOf, test } from "./support/app.ts";
import type { Page } from "@playwright/test";

const coreVowels = ["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ"];
const basicConsonants = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅎ"];
const advancedConsonants = ["ㄲ", "ㅋ", "ㄸ", "ㅌ", "ㅃ", "ㅍ", "ㅆ", "ㅉ", "ㅊ"];
const advancedVowels = ["ㅑ", "ㅕ", "ㅛ", "ㅠ", "ㅐ", "ㅒ", "ㅔ", "ㅖ", "ㅘ", "ㅙ", "ㅚ", "ㅝ", "ㅞ", "ㅟ", "ㅢ"]; // in the order the table shows them

test.describe("新手路线", () => {
  const next = (page: Page) => page.locator(".starter-continue");
  const cards = (page: Page) => page.locator("#letter-panel .letter-card");
  const reviewCard = (page: Page) => page.locator(".starter-advance-grid article").nth(2);

  /** Opens the lesson the route points at and marks every card in it as learned. */
  async function studyLetters(page: Page, label: string, letters: string[]) {
    await expect(next(page)).toContainText(label);
    await next(page).click();
    await expect(cards(page)).toHaveCount(letters.length);
    await expect(page.locator(`#letter-master-${letters[0]}`)).toBeFocused();
    for (const letter of letters) await page.locator(`#letter-master-${letter}`).click();
  }

  test("a beginner can walk the whole route, from the first six vowels to the final 39-sound review", async ({ page }) => {
    test.slow();
    await openApp(page);
    await expect(reviewCard(page).getByRole("button")).toBeDisabled();

    await studyLetters(page, "继续：核心元音 6 音", coreVowels);
    await studyLetters(page, "继续：基础辅音 10 音", basicConsonants);

    // Step 3: eight syllables, six right answers are enough.
    await expect(next(page)).toContainText("继续：拼读第一局");
    await next(page).click();
    const blend = page.locator("#game-panel-blend");
    const initials = blend.locator(".blend-choice-group").nth(0).locator("button");
    const vowels = blend.locator(".blend-choice-group").nth(1).locator("button");
    for (let round = 1; round <= 8; round += 1) {
      await expect(blend.locator(".game-board-top span").first()).toContainText(`第 ${round} / 8 题 · 新手`);
      await expect(initials.first()).toBeEnabled();
      const clip = syllableOf(await lastAudio(page));
      if (!clip) throw new Error("the beginner round should play a syllable");
      const initialChoices = await initials.locator("span").allTextContents();
      const vowelChoices = await vowels.locator("span").allTextContents();
      const right = round > 2; // the first two are answered wrong on purpose
      await initials.nth(initialChoices.indexOf(clip.initial)).click();
      await vowels.nth(right ? vowelChoices.indexOf(clip.vowel) : (vowelChoices.indexOf(clip.vowel) + 1) % 4).click();
      await blend.locator(".game-feedback button").click();
    }
    await expect(blend.locator(".game-finish h3")).toHaveText("6 / 8");
    await expect(page.locator(".starter-path article").nth(2)).toContainText("新手拼读已达标");

    // Step 4: the two words that only use letters learned so far.
    await expect(next(page)).toContainText("继续：已学字母首读");
    await next(page).click();
    await expect(page.locator("#phrase-scene-starter")).toHaveAttribute("aria-pressed", "true");
    for (const id of ["word-where", "word-bus"]) await page.locator(`#phrase-master-${id}`).click();

    // Step 5: three of the six survival sentences.
    await expect(next(page)).toContainText("继续：生存 6 句");
    await next(page).click();
    await expect(page.locator("#phrase-scene-survival")).toHaveAttribute("aria-pressed", "true");
    for (const id of ["sentence-this", "sentence-toilet", "sentence-help"]) await page.locator(`#phrase-master-${id}`).click();
    await expect(page.locator(".starter-path article").nth(4)).toContainText("已达标 · 3/6");

    await studyLetters(page, "继续：补齐进阶辅音 9 音", advancedConsonants);
    await studyLetters(page, "继续：补齐进阶元音 15 音", advancedVowels);
    await expect(page.locator(".mastery-meter strong")).toHaveText("40/40");

    // Final review: ten mixed questions, eight right answers pass.
    await expect(next(page)).toContainText("最后验收：39 个可听音");
    await expect(reviewCard(page).getByRole("button")).toBeEnabled();
    await next(page).click();
    const asked = new Set<string>();
    for (let round = 1; round <= 10; round += 1) {
      await expect(page.getByTestId("listen-round")).toHaveText(`第 ${round} / 10 题`);
      const question = await answerListen(page, round !== 4 && round !== 7);
      expect(question.target, "the silent initial ㅇ has nothing to listen for").not.toBe("ㅇ");
      asked.add(question.target);
      await nextListen(page);
    }
    expect(asked.size, "a mixed review should not keep asking the same sound").toBeGreaterThanOrEqual(5);
    await expect(listenPanel(page).locator(".game-finish h3")).toHaveText("8 / 10");
    await expect(listenPanel(page).locator(".game-finish p")).toHaveText("完整路线验收已通过，刷新后也会保留。");
    await expect(next(page)).toContainText("完整路线已通过 · 再复习");
    await expect(reviewCard(page)).toContainText("已通过并保存");

    await page.reload();
    await expect(next(page)).toContainText("完整路线已通过 · 再复习");
    await expect(reviewCard(page)).toContainText("已通过并保存");
    await expect(page.locator(".mastery-meter strong")).toHaveText("40/40");
  });

  test("the final review stays locked until the earlier steps are done, and seven right answers do not pass", async ({ page, context }) => {
    // A learner who has done everything except the final review.
    await context.addInitScript(([letters, phraseIds]) => {
      try {
        if (window.localStorage.getItem("seeded-by-test")) return;
        window.localStorage.setItem("seeded-by-test", "1");
        window.localStorage.setItem("hangul-mastered", JSON.stringify(letters));
        window.localStorage.setItem("hangul-phrase-mastered", JSON.stringify(phraseIds));
      } catch { /* blank start page */ }
    }, [[...coreVowels, ...basicConsonants, ...advancedConsonants, ...advancedVowels], ["word-where", "word-bus", "sentence-this", "sentence-toilet", "sentence-help"]] as const);
    await openApp(page);
    await expect(page.locator(".mastery-meter strong")).toHaveText("40/40");
    // The beginner blend round has not been played yet, so the route still points there.
    await expect(next(page)).toContainText("继续：拼读第一局");
    await expect(reviewCard(page).getByRole("button")).toBeDisabled();
    await expect(reviewCard(page).getByRole("button")).toHaveText("完成前置学习后解锁");

    await page.evaluate(() => window.localStorage.setItem("hangul-beginner-blend-qualified-v23", "true"));
    await page.reload();
    await expect(next(page)).toContainText("最后验收：39 个可听音");
    await reviewCard(page).getByRole("button").click();
    for (let round = 1; round <= 10; round += 1) {
      await expect(page.getByTestId("listen-round")).toHaveText(`第 ${round} / 10 题`);
      await answerListen(page, round !== 2 && round !== 5 && round !== 10); // the third miss lands on the last question
      await nextListen(page);
    }
    await expect(listenPanel(page).locator(".game-finish h3")).toHaveText("7 / 10");
    await expect(listenPanel(page).locator(".game-finish p")).toHaveText("本轮还没达到 8 分；错音已记录，下局会更常遇到。");
    await expect(next(page)).toContainText("最后验收：39 个可听音");
    await page.reload();
    await expect(reviewCard(page)).not.toContainText("已通过");
  });
});
