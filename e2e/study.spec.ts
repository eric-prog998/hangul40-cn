import { decomposeHangulSyllable } from "../app/learning-logic.ts";
import { expect, expectTotalXp, lastAudio, openApp, phrases, test } from "./support/app.ts";
import type { Page } from "@playwright/test";

test.describe("词句记忆闯关", () => {
  const quiz = (page: Page) => page.locator("#phrase-quiz-panel");

  async function readQuestion(page: Page) {
    await expect(page.getByTestId("phrase-choice-0")).toBeEnabled();
    const clip = await lastAudio(page);
    if (clip.kind !== "phrase") throw new Error(`phrase quiz should play a phrase, got ${JSON.stringify(clip)}`);
    const choices = await page.locator('[data-testid^="phrase-choice-"] span').allTextContents();
    expect(new Set(choices).size, "four distinct meanings").toBe(4);
    expect(choices, `the meaning of ${clip.phrase.korean} must be offered`).toContain(clip.phrase.chinese);
    return { phrase: clip.phrase, index: choices.indexOf(clip.phrase.chinese) };
  }

  test("ten correct words score 10/10 for 100 XP, never repeating a word back to back", async ({ page }) => {
    await openApp(page);
    await page.locator("#phrase-quiz-restart").click();
    let previous = "";
    for (let round = 1; round <= 10; round += 1) {
      await expect(page.getByTestId("phrase-round")).toHaveText(`第 ${round} / 10 题`);
      const question = await readQuestion(page);
      expect(question.phrase.type).toBe("word");
      expect(question.phrase.id, "the same word must not come twice in a row").not.toBe(previous);
      previous = question.phrase.id;
      await page.getByTestId(`phrase-choice-${question.index}`).click();
      await expect(quiz(page).locator(".phrase-quiz-feedback strong")).toHaveText("正确！+10 XP");
      // After answering, the Korean text is revealed on the replay button.
      await expect(page.locator("#phrase-quiz-replay strong")).toHaveText(question.phrase.korean);
      await quiz(page).locator(".phrase-quiz-feedback button").click();
    }
    await expect(quiz(page).locator(".phrase-quiz-finish h3")).toHaveText("10 / 10");
    await expectTotalXp(page, 100);
    await expect(page.locator(".game-stats-row")).toContainText("1完成局数");
  });

  test("a wrong meaning shows the right one and gives no XP; sentences have their own quiz", async ({ page }) => {
    await openApp(page);
    await page.locator("#phrase-tab-sentence").click();
    await page.locator("#phrase-quiz-restart").click();
    const question = await readQuestion(page);
    expect(question.phrase.type).toBe("sentence");
    await page.getByTestId(`phrase-choice-${(question.index + 1) % 4}`).click();
    await expect(quiz(page).locator(".phrase-quiz-feedback strong")).toHaveText(`答案：${question.phrase.chinese}`);
    await expectTotalXp(page, 0);
  });

  test("the six survival sentences can be drilled and confirmed, which advances the beginner path", async ({ page }) => {
    await openApp(page);
    await page.locator(".starter-path article").nth(4).getByRole("button", { name: "练生存 6 句" }).click();
    await expect(page.locator("#phrase-scene-survival")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".phrase-grid article")).toHaveCount(6);
    await page.locator("#phrase-quiz-restart").click();
    const seen = new Set<string>();
    const total = Number(/\/ (\d+) 题/.exec(await page.getByTestId("phrase-round").innerText())?.[1]);
    for (let round = 1; round <= total; round += 1) {
      await expect(page.getByTestId("phrase-round")).toHaveText(`第 ${round} / ${total} 题`);
      const question = await readQuestion(page);
      seen.add(question.phrase.id);
      await page.getByTestId(`phrase-choice-${question.index}`).click();
      await quiz(page).locator(".phrase-quiz-feedback button").click();
    }
    await expect(quiz(page).locator(".phrase-quiz-finish h3")).toHaveText(`${total} / ${total}`);
    await quiz(page).locator(".confirm-mastery").click();
    await expect(page.locator(".phrase-progress strong")).toHaveText(`${seen.size}/${phrases.length}`);
    await expect(page.locator(".starter-path article").nth(4)).toContainText(seen.size >= 3 ? "已达标" : `${seen.size}/3 达标`);
  });

  test("phrase cards reveal, play their own audio, and remember what was marked", async ({ page }) => {
    await openApp(page);
    const card = page.locator(".phrase-grid article").filter({ has: page.locator("#phrase-master-word-water") });
    await card.locator(".phrase-audio").click();
    await expect.poll(async () => { const clip = await lastAudio(page); return clip.kind === "phrase" ? clip.phrase.id : ""; }).toBe("word-water");
    await expect(card.locator(".phrase-meaning p")).toHaveText("先回忆中文意思");
    await card.getByRole("button", { name: "翻开答案" }).click();
    await expect(card.locator(".phrase-meaning p")).toHaveText("水");
    await page.locator("#phrase-master-word-water").click();
    await expect(page.locator(".phrase-progress strong")).toHaveText(`1/${phrases.length}`);

    await page.reload();
    await expect(page.locator(".phrase-progress strong")).toHaveText(`1/${phrases.length}`);
    await page.locator("#phrase-filter-mastered").click();
    await expect(page.locator(".phrase-grid article")).toHaveCount(1);
    await page.locator("#phrase-filter-learning").click();
    await expect(page.locator(".phrase-grid article")).toHaveCount(phrases.filter((item) => item.type === "word").length - 1);
  });

  test("the two starter words can be drilled even though the group is tiny", async ({ page }) => {
    await openApp(page);
    const step = page.locator(".starter-path article").nth(3);
    await step.getByRole("button", { name: "打开首读词卡" }).click();
    await expect(page.locator("#phrase-scene-starter")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".phrase-grid article")).toHaveCount(2);
    await page.locator("#phrase-quiz-restart").click();
    let previous = "";
    for (let round = 1; round <= 4; round += 1) {
      await expect(page.getByTestId("phrase-round")).toHaveText(`第 ${round} / 4 题`);
      const question = await readQuestion(page); // still four distinct meanings, borrowed from other words
      expect(["word-where", "word-bus"]).toContain(question.phrase.id);
      expect(question.phrase.id).not.toBe(previous);
      previous = question.phrase.id;
      await page.getByTestId(`phrase-choice-${question.index}`).click();
      await quiz(page).locator(".phrase-quiz-feedback button").click();
    }
    await expect(quiz(page).locator(".phrase-quiz-finish h3")).toHaveText("4 / 4");
    await quiz(page).locator(".confirm-mastery").click();
    await expect(step).toContainText("已达标 · 2/2");
  });

  test("a question cut off by scrolling away asks for a replay instead of looking frozen", async ({ page }) => {
    await openApp(page);
    await page.locator("#phrase-quiz-restart").click();
    const question = await readQuestion(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(quiz(page).locator(".phrase-quiz-feedback")).toContainText("词句声音已中断：请点上方“只听声音”或按空格重播");
    await page.locator("#phrase-quiz-replay").click();
    const replayed = await readQuestion(page);
    expect(replayed.phrase.id, "replay must repeat the same question").toBe(question.phrase.id);
    await page.getByTestId(`phrase-choice-${replayed.index}`).click();
    await expectTotalXp(page, 10);
  });
});

test.describe("今日复习", () => {
  const review = (page: Page) => page.locator("#daily-review");
  const done = (page: Page) => review(page).locator(".daily-review-progress-heading strong span");

  async function reviewOne(page: Page, remembered: boolean) {
    const chinese = await review(page).locator(".daily-review-chinese").innerText();
    const expected = phrases.find((item) => item.chinese === chinese);
    await review(page).locator(".daily-review-reveal").click();
    await expect(review(page).locator(".daily-review-korean")).toHaveText(expected?.korean ?? "(unknown phrase)");
    await review(page).locator(".daily-review-rating button").nth(remembered ? 1 : 0).click();
    return expected;
  }

  test("ten cards a day and no more; the count survives a reload", async ({ page }) => {
    await openApp(page);
    for (let count = 1; count <= 10; count += 1) {
      await reviewOne(page, count % 2 === 0);
      await expect(done(page)).toHaveText(`${count} / 10`);
    }
    await expect(review(page).locator(".daily-review-empty h3")).toHaveText("今天的 10 项复习完成了");
    await expect(review(page).locator(".daily-review-reveal")).toHaveCount(0);
    // A self-rating never changes XP or the "mastered" marks.
    await expectTotalXp(page, 0);
    await expect(page.locator(".phrase-progress strong")).toHaveText(`0/${phrases.length}`);

    await page.reload();
    await expect(done(page)).toHaveText("10 / 10");
    await expect(review(page).locator(".daily-review-empty h3")).toHaveText("今天的 10 项复习完成了");
  });

  test("answers must be revealed before rating, and listening plays the same phrase", async ({ page }) => {
    await openApp(page);
    await review(page).focus();
    await page.keyboard.press("Digit2");
    await expect(done(page)).toHaveText("0 / 10");
    await page.keyboard.press("Enter");
    const korean = await review(page).locator(".daily-review-korean").innerText();
    await page.keyboard.press("Space");
    await expect.poll(async () => { const clip = await lastAudio(page); return clip.kind === "phrase" ? clip.phrase.korean : ""; }).toBe(korean);
    await page.keyboard.press("Digit2");
    await expect(done(page)).toHaveText("1 / 10");
  });

  test("cards come back on schedule: forgotten tomorrow, remembered after 1, then 3 days", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-12T10:00:00+09:00") });
    await openApp(page);
    await expect(review(page).locator(".daily-review-progress-heading > span")).toHaveText("2026-10-12");
    const forgotten = await reviewOne(page, false);
    await expect(review(page).locator(".daily-review-feedback")).toContainText("下次复习：2026-10-13");
    const remembered = await reviewOne(page, true);
    await expect(review(page).locator(".daily-review-feedback")).toContainText("下次复习：2026-10-13");

    // Next morning both are due again, oldest first, before any new card.
    await page.clock.fastForward("24:00:00");
    await expect(review(page).locator(".daily-review-progress-heading > span")).toHaveText("2026-10-13");
    await expect(done(page)).toHaveText("0 / 10");
    await expect(review(page).locator(".daily-review-card-meta")).toContainText("到期复习");
    await expect(review(page).locator(".daily-review-chinese")).toHaveText(forgotten?.chinese ?? "");
    await reviewOne(page, true);
    await expect(review(page).locator(".daily-review-feedback")).toContainText("下次复习：2026-10-14");
    await expect(review(page).locator(".daily-review-chinese")).toHaveText(remembered?.chinese ?? "");
    await reviewOne(page, true);
    // Second success in a row: the gap grows to three days.
    await expect(review(page).locator(".daily-review-feedback")).toContainText("下次复习：2026-10-16");
    await expect(review(page).locator(".daily-review-card-meta")).toContainText("第一次回忆");
  });
});

test.describe("收音入门", () => {
  const lesson = (page: Page) => page.locator("#batchim-lesson");

  test("five questions, each answered from the final consonant of the last block", async ({ page }) => {
    await openApp(page);
    await lesson(page).getByRole("button", { name: "开始 5 题练习" }).click();
    for (let question = 1; question <= 5; question += 1) {
      await expect(lesson(page).locator(".batchim-mode-controls span")).toHaveText(`第 ${question} / 5 题`);
      const last = await lesson(page).locator(".batchim-question p span").innerText();
      const final = decomposeHangulSyllable(last)?.final ?? "";
      const options = await lesson(page).locator(".batchim-question button strong").allTextContents();
      expect(options, `the final consonant of ${last}`).toContain(final);
      await lesson(page).locator(".batchim-question button").nth(options.indexOf(final)).click();
      await expect(lesson(page).locator(".batchim-result")).toHaveText("答对了");
      await lesson(page).locator(".batchim-next").click();
    }
    await expect(lesson(page).locator(".batchim-finished strong")).toHaveText("5 / 5");
    await expectTotalXp(page, 0);
  });

  test("a wrong pick names the right final, and each example plays its own whole word", async ({ page }) => {
    await openApp(page);
    const examples = lesson(page).locator(".batchim-examples button");
    await expect(examples).toHaveCount(5);
    for (let index = 0; index < 5; index += 1) {
      await examples.nth(index).click();
      const word = await lesson(page).locator(".batchim-word h3").innerText();
      await lesson(page).locator(".batchim-word button").click();
      await expect.poll(async () => { const clip = await lastAudio(page); return clip.kind === "phrase" ? clip.phrase.korean : ""; }).toBe(word);
      // The dictionary link must look up this very word, not a fragment of it.
      const href = await lesson(page).locator(".batchim-dictionary a").getAttribute("href");
      const searched = new URL(href ?? "").searchParams.get("mainSearchWord");
      if (searched !== null) expect(searched, `dictionary link for ${word}`).toBe(word);
    }

    await lesson(page).getByRole("button", { name: "开始 5 题练习" }).click();
    const last = await lesson(page).locator(".batchim-question p span").innerText();
    const final = decomposeHangulSyllable(last)?.final ?? "";
    const options = await lesson(page).locator(".batchim-question button strong").allTextContents();
    const wrong = options.find((option) => option !== final) ?? "";
    await lesson(page).locator(".batchim-question button").nth(options.indexOf(wrong)).click();
    await expect(lesson(page).locator(".batchim-result")).toHaveText(`这次选了 ${wrong}；正确是 ${final}`);
  });
});
