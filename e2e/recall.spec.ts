import { expect, expectTotalXp, openApp, phrases, test } from "./support/app.ts";
import type { Page } from "@playwright/test";
import { rateReview, reviewStorageKey } from "../app/review-logic.ts";

async function enterRecall(page: Page) {
  const section = page.locator("#daily-review");
  await section.scrollIntoViewIfNeeded();
  await section.focus();
  const chinese = await section.locator(".daily-review-chinese").innerText();
  const phrase = phrases.find(item => item.chinese === chinese);
  if (!phrase) throw new Error("Unknown recall phrase");
  await page.keyboard.press("KeyT");
  await expect(page.locator("#daily-review-input")).toBeFocused();
  return { section, phrase, input: page.locator("#daily-review-input") };
}

test("keyboard recall stays silent, compares text, and only explicit self-rating saves progress", async ({ page }, testInfo) => {
  await openApp(page);
  const { section, phrase, input } = await enterRecall(page);
  await input.press("Enter");
  await expect(section.locator(".daily-review-korean")).toHaveCount(0);
  await input.fill(phrase.korean.normalize("NFD"));
  await section.screenshot({ path: testInfo.outputPath("recall-desktop-input.png") });
  await input.press("Enter");
  await expect(section.locator(".daily-review-comparison")).toContainText("与本卡参考写法一致");
  await expect(section.locator(".daily-review-progress-heading strong span")).toHaveText("0 / 10");
  await expectTotalXp(page, 0);
  expect(await page.evaluate(() => window.__audioLog.length)).toBe(0);
  await page.keyboard.press("Digit2");
  await expect(section.locator(".daily-review-progress-heading strong span")).toHaveText("1 / 10");
  await page.keyboard.press("KeyT");
  await expect(input).toHaveValue("");
  await expect(section.locator(".daily-review-comparison")).toHaveCount(0);
  await page.reload();
  await expect(section.locator(".daily-review-progress-heading strong span")).toHaveText("1 / 10");
  await expect(input).toHaveCount(0);
});

test("IME confirmation, held Enter and numeric or space input never reveal, rate or play", async ({ page }) => {
  await openApp(page);
  const { section, phrase, input } = await enterRecall(page);
  await input.fill(phrase.korean);
  await input.dispatchEvent("compositionstart");
  await input.press("Enter");
  await expect(section.locator(".daily-review-korean")).toHaveCount(0);
  await input.dispatchEvent("compositionend");
  for (const event of [{ key: "Enter", code: "Enter", keyCode: 229 }, { key: "Enter", code: "Enter", isComposing: true }, { key: "Enter", code: "Enter", repeat: true }]) {
    await input.dispatchEvent("keydown", event);
    await expect(section.locator(".daily-review-korean")).toHaveCount(0);
  }
  await input.fill("");
  await input.pressSequentially("1 2");
  await expect(input).toHaveValue("1 2");
  await expect(section.locator(".daily-review-progress-heading strong span")).toHaveText("0 / 10");
  expect(await page.evaluate(() => window.__audioLog.length)).toBe(0);
  await input.press("Escape");
  await expect(section).toBeFocused();
  await page.keyboard.press("KeyT");
  await expect(input).toBeFocused();
  await input.fill(phrase.korean);
  await input.press("Enter");
  await expect(section.locator(".daily-review-korean")).toHaveText(phrase.korean);
});

test("a different expression is not called wrong and never automatically changes review records", async ({ page }) => {
  await openApp(page);
  const { section, input } = await enterRecall(page);
  await input.fill("다른 표현");
  await section.getByRole("button", { name: "对照参考答案" }).click();
  await expect(section.locator(".daily-review-comparison")).toContainText("不代表你的韩语表达一定错误");
  await expect(section.locator(".daily-review-comparison strong")).toHaveText("다른 표현");
  await expect(section.locator(".daily-review-progress-heading strong span")).toHaveText("0 / 10");
  await page.keyboard.press("Digit1");
  await expect(section.locator(".daily-review-progress-heading strong span")).toHaveText("1 / 10");
});

test("changing the local day discards the old draft without stealing focus", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-16T10:00:00+09:00") });
  await openApp(page);
  const { section, input } = await enterRecall(page);
  await input.fill("임시 입력");
  await page.locator("#today-plan").focus();
  await page.clock.fastForward("24:00:00");
  await expect(section.locator(".daily-review-progress-heading > span")).toHaveText("2026-10-17");
  await expect(page.locator("#today-plan")).toBeFocused();
  await expect(input).toHaveCount(0);
  await enterRecall(page);
  await expect(input).toHaveValue("");
});

test("returning to an earlier date never resurrects an abandoned draft or steals focus", async ({ page }) => {
  const firstDay = new Date("2026-10-17T10:00:00+09:00");
  await page.clock.install({ time: firstDay });
  await openApp(page);
  const { section, input } = await enterRecall(page);
  await input.fill("이전 입력");
  await page.locator("#today-plan").focus();
  await page.clock.fastForward("24:00:00");
  await expect(section.locator(".daily-review-progress-heading > span")).toHaveText("2026-10-18");
  await page.clock.setSystemTime(firstDay);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.clock.fastForward(60_000);
  await expect(section.locator(".daily-review-progress-heading > span")).toHaveText("2026-10-17");
  await expect(page.locator("#today-plan")).toBeFocused();
  await expect(input).toHaveCount(0);
  await enterRecall(page);
  await expect(input).toHaveValue("");
  await input.fill("새 입력");
  await input.press("Enter");
  await expect(section.locator(".daily-review-korean")).toBeVisible();
  await page.locator("#today-plan").focus();
  await page.clock.fastForward("24:00:00");
  await expect(section.locator(".daily-review-progress-heading > span")).toHaveText("2026-10-18");
  await page.clock.setSystemTime(firstDay);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(section.locator(".daily-review-progress-heading > span")).toHaveText("2026-10-17");
  await expect(page.locator("#today-plan")).toBeFocused();
  await expect(section.locator(".daily-review-korean")).toHaveCount(0);
  await expect(section.locator(".daily-review-comparison")).toHaveCount(0);
});

test("continuous input completes the five-card route by keyboard without leaking a held rating key", async ({ page }, testInfo) => {
  await openApp(page);
  await page.locator("#today-plan").focus();
  await page.keyboard.press("Digit1");
  const section = page.locator("#daily-review");
  const input = page.locator("#daily-review-input");
  const mode = page.locator("#daily-review-continuous");
  await mode.focus();
  await page.keyboard.press("Space");
  await expect(mode).toBeChecked();
  for (let count = 1; count <= 5; count += 1) {
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("");
    const chinese = await section.locator(".daily-review-chinese").innerText();
    const phrase = phrases.find(item => item.chinese === chinese);
    if (!phrase) throw new Error("Unknown phrase");
    await input.fill(phrase.korean);
    if (count === 1) await section.screenshot({ path: testInfo.outputPath("continuous-desktop.png") });
    await input.press("Enter");
    await page.keyboard.down("Digit2");
    await expect(section.locator(".daily-review-progress-heading strong span")).toHaveText(`${count} / 5`);
    if (count < 5) {
      await expect(input).toBeFocused();
      await page.keyboard.down("Digit2");
      await expect(input).toHaveValue("");
    }
    await page.keyboard.up("Digit2");
  }
  await expect(input).toHaveCount(0);
  await expect(section).toBeFocused();
  await expectTotalXp(page, 0);
  await page.reload();
  await expect(mode).not.toBeChecked();
});

test("turning continuous input off keeps the current draft but does not focus the next card", async ({ page }) => {
  await openApp(page);
  const mode = page.locator("#daily-review-continuous");
  await mode.check();
  const input = page.locator("#daily-review-input");
  await expect(input).toBeFocused();
  await input.fill("연습");
  await mode.uncheck();
  await expect(input).toHaveValue("연습");
  await input.press("Enter");
  await page.keyboard.press("Digit1");
  await expect(page.locator("#daily-review")).toBeFocused();
  await expect(input).toHaveCount(0);
});

test("retry hides the reference, stops playback and never adds a review until self-rated", async ({ page }, testInfo) => {
  await openApp(page);
  const { section, phrase, input } = await enterRecall(page);
  await input.fill("다른 입력");
  await input.press("Enter");
  await page.keyboard.press("Space");
  await page.keyboard.press("KeyR");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await expect(section.locator(".daily-review-korean")).toHaveCount(0);
  await expect(section.locator(".daily-review-comparison")).toHaveCount(0);
  await expect(section.locator(".daily-review-retry-note")).toContainText("已看过答案");
  expect(await page.evaluate(() => window.__audioElements.filter(audio => !audio.paused && !audio.ended).length)).toBe(0);
  await page.setViewportSize({ width: 360, height: 780 });
  await section.screenshot({ path: testInfo.outputPath("retry-mobile.png") });
  for (let retry = 0; retry < 2; retry += 1) {
    await input.fill(phrase.korean);
    await input.press("Enter");
    await expect(section.locator(".daily-review-progress-heading strong span")).toHaveText("0 / 10");
    if (retry === 0) await section.getByRole("button", { name: "遮住答案，再写一次" }).click();
  }
  await page.keyboard.press("Digit1");
  await expect(section.locator(".daily-review-progress-heading strong span")).toHaveText("1 / 10");
  await expect(section.locator(".daily-review-retry-note")).toHaveCount(0);
  await expectTotalXp(page, 0);
});

test("external review updates clear the draft without focusing the continuous input", async ({ page, context }) => {
  await page.clock.install({ time: new Date("2026-10-17T10:00:00+09:00") });
  await openApp(page);
  const { section, phrase, input } = await enterRecall(page);
  await page.locator("#daily-review-continuous").check();
  await input.fill("이전 카드");
  await page.locator("#today-plan").focus();
  const other = await context.newPage();
  await other.goto("/");
  const record = rateReview(undefined, phrase.id, "remembered", "2026-10-17", Date.parse("2026-10-17T10:00:00+09:00"));
  await other.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify(record)), { key: reviewStorageKey(phrase.id), record });
  await expect(section.locator(".daily-review-progress-heading strong span")).toHaveText("1 / 10");
  await expect(input).toHaveValue("");
  await expect(page.locator("#today-plan")).toBeFocused();
  await other.close();
});

test("leaving composition cannot leave all review shortcuts stuck", async ({ page }) => {
  await openApp(page);
  const { section, input } = await enterRecall(page);
  await input.dispatchEvent("compositionstart");
  await section.focus();
  await page.keyboard.press("Enter");
  await expect(section.locator(".daily-review-korean")).toBeVisible();
  for (const event of [{ key: "r", code: "KeyR", repeat: true }, { key: "r", code: "KeyR", ctrlKey: true }, { key: "r", code: "KeyR", isComposing: true }]) {
    await section.dispatchEvent("keydown", event);
    await expect(section.locator(".daily-review-korean")).toBeVisible();
  }
  await section.dispatchEvent("keydown", { key: "ㄱ", code: "KeyR" });
  await expect(input).toBeFocused();
});

test("typed reference comparison fits a phone screen with a long answer", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await openApp(page);
  const section = page.locator("#daily-review");
  await section.getByRole("button", { name: "用键盘试着输入" }).click();
  await page.locator("#daily-review-input").fill("네".repeat(80));
  await section.getByRole("button", { name: "对照参考答案" }).click();
  await expect(section.locator(".daily-review-comparison")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await section.screenshot({ path: testInfo.outputPath("recall-mobile.png") });
});
