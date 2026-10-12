import { answerListen, confirmPendingKoreanKey, expect, expectTotalXp, goToTraining, keysFor, lastAudio, letterOf, listenPanel, nextListen, openApp, readListenQuestion, test, todayXp } from "./support/app.ts";

test.describe("听音闯关", () => {
  test("ten correct answers score 10/10, award exactly 180 XP and survive a reload", async ({ page }) => {
    await openApp(page);
    await page.locator("#listen-start").click();
    for (let round = 1; round <= 10; round += 1) {
      await expect(page.getByTestId("listen-round")).toHaveText(`第 ${round} / 10 题`);
      await answerListen(page);
      // +12, +14, +16, +18, then capped at +20: 10 XP plus two per combo step.
      await expect(listenPanel(page).locator(".game-feedback strong")).toContainText(`+${10 + Math.min(round * 2, 10)} XP`);
      await nextListen(page);
    }
    await expect(listenPanel(page).locator(".game-finish h3")).toHaveText("10 / 10");
    await expectTotalXp(page, 180);
    expect(await todayXp(page)).toBe(180);
    await expect(page.locator(".game-stats-row")).toContainText("10最佳连胜");
    await expect(page.locator(".game-stats-row")).toContainText("1完成局数");

    await page.reload();
    await expectTotalXp(page, 180);
    await expect(page.locator(".game-stats-row")).toContainText("1完成局数");
  });

  test("three wrong answers end the round, give no XP and remember the missed letters", async ({ page }) => {
    await openApp(page);
    await page.locator("#listen-start").click();
    const missed: string[] = [];
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const question = await answerListen(page, false);
      missed.push(question.target);
      await expect(page.locator(".heart-row .sr-only")).toHaveText(`剩余 ${3 - attempt} 颗心`);
      await nextListen(page);
    }
    await expect(listenPanel(page).locator(".game-finish h3")).toHaveText("0 / 10");
    await expectTotalXp(page, 0);
    const weakLetters = await page.locator(".weak-list button strong").allTextContents();
    for (const letter of new Set(missed)) expect(weakLetters).toContain(letter);
  });

  test("a missed sound comes back two questions later", async ({ page }) => {
    await openApp(page);
    await page.locator("#listen-start").click();
    const missed = await answerListen(page, false);
    await nextListen(page);
    await answerListen(page);
    await nextListen(page);
    await expect(page.getByTestId("listen-round")).toHaveText("第 3 / 10 题");
    const third = await readListenQuestion(page);
    expect(third.target, "question 3 should bring the missed sound back").toBe(missed.target);
  });

  test("the weak-sound drill asks only sounds that were missed, and their buttons replay them", async ({ page }) => {
    await openApp(page);
    await page.locator("#listen-start").click();
    const missed = new Set<string>();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      missed.add((await answerListen(page, false)).target);
      await nextListen(page);
    }
    await expect(listenPanel(page).locator(".game-finish h3")).toHaveText("0 / 10");

    const weakButton = page.locator(".weak-list button").first();
    const weakLetter = await weakButton.locator("strong").innerText();
    await weakButton.click();
    await expect.poll(async () => letterOf(await lastAudio(page))).toBe(weakLetter);

    await page.locator(".weak-drill-button").click();
    await expect(listenPanel(page).locator(".session-chip")).toHaveText("薄弱音专项");
    await expect(page.getByTestId("listen-round")).toHaveText("第 1 / 10 题");
    for (let round = 1; round <= 6; round += 1) {
      const question = await answerListen(page); // still four distinct choices, borrowed from other letters
      expect([...missed], "the drill must stay inside the missed sounds").toContain(question.target);
      await nextListen(page);
    }
  });

  test("choices stay locked until the question has been heard, and a second click cannot change the answer", async ({ page }) => {
    await openApp(page);
    await page.locator("#listen-start").click();
    // Right after starting, the clip is still playing: nothing may be answered yet.
    await expect(page.getByTestId("listen-choice-0")).toBeDisabled();
    const question = await readListenQuestion(page);
    await page.getByTestId(`listen-choice-${question.index}`).click();
    for (let index = 0; index < 4; index += 1) await expect(page.getByTestId(`listen-choice-${index}`)).toBeDisabled();
    await expectTotalXp(page, 12);
  });

  test("the round can be played entirely from a Korean keyboard", async ({ page }) => {
    await openApp(page);
    await goToTraining(page);
    await page.keyboard.press("Enter");
    for (let round = 1; round <= 10; round += 1) {
      await expect(page.getByTestId("listen-round")).toHaveText(`第 ${round} / 10 题`);
      const question = await readListenQuestion(page);
      for (const key of keysFor(question.target)) await page.keyboard.press(key);
      const verdict = listenPanel(page).locator(".game-feedback strong");
      await confirmPendingKoreanKey(page, verdict);
      await expect(verdict).toContainText("正确！");
      await page.keyboard.press("Enter");
    }
    await expect(listenPanel(page).locator(".game-finish h3")).toHaveText("10 / 10");
    await expectTotalXp(page, 180);
  });

  test("number keys and the ASDF layout both answer", async ({ page }) => {
    await openApp(page);
    await goToTraining(page);
    await page.keyboard.press("Enter");
    let question = await readListenQuestion(page);
    await page.keyboard.press(`Digit${question.index + 1}`);
    await expect(listenPanel(page).locator(".game-feedback strong")).toContainText("正确！");
    await page.keyboard.press("Enter");

    await page.getByRole("button", { name: "ASDF 选项" }).click();
    await goToTraining(page);
    question = await readListenQuestion(page);
    await page.keyboard.press(`Key${"ASDF"[question.index]}`);
    await expect(listenPanel(page).locator(".game-feedback strong")).toContainText("正确！");
  });

  test("a beginner drill stays inside its letter set and can confirm what was answered correctly", async ({ page }) => {
    await openApp(page);
    const coreVowels = ["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ"];
    await page.locator(".starter-path article").nth(0).getByRole("button", { name: "听音练习" }).click();
    const heard = new Set<string>();
    for (let round = 1; round <= 10; round += 1) {
      const question = await answerListen(page);
      expect(coreVowels, "a core-vowel drill must only ask core vowels").toContain(question.target);
      heard.add(question.target);
      await nextListen(page);
    }
    await expect(listenPanel(page).locator(".game-finish h3")).toHaveText("10 / 10");
    await listenPanel(page).locator(".confirm-mastery").click();
    await expect(page.locator(".mastery-meter strong")).toHaveText(`${heard.size}/40`);
    await expect(page.locator(".starter-path article").nth(0)).toContainText(`${heard.size}/6 已标记`);
  });

  test("a question cut off by another sound asks for a replay instead of looking frozen", async ({ page }) => {
    await openApp(page);
    await page.locator("#listen-start").click();
    const question = await readListenQuestion(page);
    await page.locator(".syllable-result").click(); // any other sound on the page takes over
    await expect(page.getByTestId("listen-choice-0")).toBeDisabled();
    await expect(listenPanel(page).locator(".game-feedback")).toContainText("题目声音已中断：请点“再听一次”或按空格重播");
    await expect(page.getByTestId("listen-choice-0").locator("small")).toHaveText("先重播");

    await page.locator("#listen-replay").click();
    const replayed = await readListenQuestion(page);
    expect(replayed.target, "replay must repeat the same question").toBe(question.target);
    await expect(listenPanel(page).locator(".game-feedback")).toContainText("可以作答");
    await page.getByTestId(`listen-choice-${replayed.index}`).click();
    await expectTotalXp(page, 12);
  });

  test("scrolling far away pauses the question; coming back shows how to continue", async ({ page }) => {
    await openApp(page);
    await page.locator("#listen-start").click();
    const question = await readListenQuestion(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(listenPanel(page).locator(".game-feedback")).toContainText("题目声音已中断");
    await page.locator("#games").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("listen-choice-0")).toBeDisabled();
    await goToTraining(page);
    await page.keyboard.press("Space");
    const replayed = await readListenQuestion(page);
    expect(replayed.target).toBe(question.target);
  });
});
