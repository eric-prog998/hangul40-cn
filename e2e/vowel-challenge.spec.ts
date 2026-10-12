import { expect, expectTotalXp, lastAudio, openApp, test } from "./support/app.ts";
import type { Page } from "@playwright/test";

const panel = (page: Page) => page.locator("#vowel-listening");
const summary = (page: Page) => panel(page).locator(".vowel-history-summary p");

async function openChallenge(page: Page) {
  await page.locator(".vowel-practice-views button").nth(1).click();
  await expect(panel(page)).toBeVisible();
}

/** Answers every question of the running round; `wrongAt` lists 1-based questions to miss on purpose. */
async function playRound(page: Page, wrongAt: number[] = []) {
  let asked = 0;
  for (;;) {
    await expect(panel(page).locator(".vowel-challenge-choices button").first()).toBeEnabled();
    asked += 1;
    const clip = await lastAudio(page);
    if (clip.kind !== "syllable") throw new Error(`a vowel question should play a syllable, got ${JSON.stringify(clip)}`);
    const letters = await panel(page).locator(".vowel-challenge-choices button strong").allTextContents();
    expect(letters, `the vowel of ${clip.syllable} must be one of the two choices`).toContain(clip.vowel);
    const right = letters.indexOf(clip.vowel);
    const miss = wrongAt.includes(asked);
    await panel(page).locator(".vowel-challenge-choices button").nth(miss ? 1 - right : right).click();
    await expect(panel(page).locator(".vowel-challenge-feedback strong")).toContainText(miss ? `这次听到的是 ${clip.syllable}` : "这次听对了");
    const next = panel(page).locator(".vowel-challenge-feedback button");
    const last = (await next.innerText()).includes("查看结果");
    await next.click();
    if (last) break;
  }
  await expect(panel(page).locator(".vowel-challenge-results")).toBeVisible();
  return asked;
}

test.describe("元音盲听", () => {
  test("a round asks eight balanced questions, hides the answer until heard, and never touches XP", async ({ page }) => {
    await openApp(page);
    await openChallenge(page);
    await panel(page).locator(".vowel-challenge-intro button").click();
    await expect(panel(page).locator(".vowel-challenge-choices button").first()).toBeDisabled();
    expect(await playRound(page)).toBe(8);
    await expect(panel(page).locator(".vowel-challenge-results h4")).toHaveText("8 / 8");
    await expect(panel(page).locator(".vowel-challenge-results li")).toHaveText(["ㅓ / ㅗ4 / 4 正确", "ㅡ / ㅜ4 / 4 正确"]);
    await expect(summary(page)).toHaveText("最近 8 次作答：8 次正确；待巩固 0 个音例。");
    await expectTotalXp(page, 0);
  });

  test("a missed sound stays on the long-term list until it is answered right twice in a row", async ({ page }) => {
    await openApp(page);
    await openChallenge(page);
    await panel(page).locator(".vowel-challenge-intro button").click();
    await playRound(page, [1, 2]);
    await expect(panel(page).locator(".vowel-challenge-results h4")).toHaveText("6 / 8");
    await expect(summary(page)).toHaveText("最近 8 次作答：6 次正确；待巩固 2 个音例。");

    // "Only the mistakes" replays exactly the two missed questions.
    await panel(page).getByRole("button", { name: "只练错题 · 2 题" }).click();
    expect(await playRound(page)).toBe(2);
    await expect(summary(page)).toHaveText("最近 10 次作答：8 次正确；待巩固 2 个音例。");

    // The record survives a reload, and a second correct pass clears the list.
    await page.reload();
    await openChallenge(page);
    await expect(summary(page)).toHaveText("最近 10 次作答：8 次正确；待巩固 2 个音例。");
    await panel(page).getByRole("button", { name: "练长期错题 · 2 题" }).click();
    expect(await playRound(page)).toBe(2);
    await expect(summary(page)).toHaveText("最近 12 次作答：10 次正确；待巩固 0 个音例。");
    await expect(panel(page).getByRole("button", { name: /练长期错题/ })).toHaveCount(0);
  });

});

test.describe("元音盲听 · 自动下一题", () => {
  test.use({ autoAdvance: "site-default" });

  test("works from the keyboard: Enter starts, Korean keys answer, Space replays, Esc pauses", async ({ page }) => {
    await openApp(page);
    await openChallenge(page);
    await panel(page).focus();
    await page.keyboard.press("Enter");
    await expect(panel(page).locator(".vowel-challenge-choices button").first()).toBeEnabled();
    const clip = await lastAudio(page);
    if (clip.kind !== "syllable") throw new Error("expected a syllable clip");
    const key = { "ㅓ": "KeyJ", "ㅗ": "KeyH", "ㅡ": "KeyM", "ㅜ": "KeyN" }[clip.vowel] ?? "";
    await page.keyboard.press(key);
    await expect(panel(page).locator(".vowel-challenge-feedback strong")).toHaveText("这次听对了");

    // Esc cancels the automatic advance; the same question must still be there seconds later.
    await page.keyboard.press("Escape");
    await expect(panel(page).locator(".vowel-challenge-notice")).toContainText("自动下一题已暂停");
    await page.waitForTimeout(4_000);
    await expect(panel(page).locator(".vowel-challenge-header > span")).toHaveText("盲听 1 / 8");
    await page.keyboard.press("Space");
    await expect.poll(async () => { const replay = await lastAudio(page); return replay.kind === "syllable" ? replay.syllable : ""; }).toBe(clip.syllable);
    await expect(panel(page).locator(".vowel-challenge-notice")).toContainText("自动下一题仍暂停");
    await page.keyboard.press("Enter");
    await expect(panel(page).locator(".vowel-challenge-header > span")).toHaveText("盲听 2 / 8");
  });
});
