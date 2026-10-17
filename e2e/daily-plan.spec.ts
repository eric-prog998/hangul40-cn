import { expect, lastAudio, openApp, phrases, test, audioLog, expectTotalXp } from "./support/app.ts";
import type { Page } from "@playwright/test";
import { rateReview, reviewStorageKey } from "../app/review-logic.ts";
import { makeVowelQuestions } from "../app/vowel-challenge-logic.ts";
import { VOWEL_HISTORY_PREFIX } from "../app/vowel-history.ts";

const plan = (page: Page) => page.locator("#today-plan");
const review = (page: Page) => page.locator("#daily-review");
const listening = (page: Page) => page.locator("#vowel-listening");
const reviewCount = (page: Page) => page.getByTestId("plan-review-progress");
const listenCount = (page: Page) => page.getByTestId("plan-listening-progress");
/** "done / goal" in the review section itself: the goal is 5 in the route's short practice, 10 otherwise. */
const reviewGoal = (page: Page) => review(page).locator(".daily-review-progress-heading strong span");
const reviewBackToPlan = (page: Page) => review(page).getByRole("button", { name: "返回今日路线" });
const listeningBackToPlan = (page: Page) => page.locator("#pronunciation-practice").getByRole("button", { name: "返回今日路线" });
const mainNav = (page: Page) => page.getByRole("navigation", { name: "主要导航" });

async function enterReview(page: Page) {
  await plan(page).focus();
  await page.keyboard.press("Digit1");
  await expect(review(page)).toBeFocused();
}

async function rateOne(page: Page, key = "Digit2") {
  await review(page).focus();
  await page.keyboard.press("Enter");
  await expect(review(page).locator(".daily-review-korean")).toBeVisible();
  await page.keyboard.press(key);
  await expect(review(page).locator(".daily-review-korean")).toHaveCount(0);
}

test.describe("今日 10 分钟路线", () => {
  test("opening a route is silent and earns nothing; beginner recommendation uses the actual next lesson", async ({ page }, testInfo) => {
    await openApp(page, "/#today-plan");
    await expect(reviewCount(page)).toHaveText("0 / 5 项已回忆");
    await expect(listenCount(page)).toHaveText("0 / 8 次已作答");
    const contrast = await plan(page).locator(".section-kicker").evaluate(element => {
      const style = getComputedStyle(element);
      const luminance = (color: string) => {
        const values = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(value => {
          const channel = Number(value) / 255;
          return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        });
        return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
      };
      const a = luminance(style.color); const b = luminance(style.backgroundColor);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    });
    expect(contrast, "small badge text must remain readable on its background").toBeGreaterThanOrEqual(4.5);
    await plan(page).screenshot({ path: testInfo.outputPath("daily-plan-desktop.png") });
    await plan(page).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#letter-panel .letter-card")).toHaveCount(6);
    await expect(page.locator("#letter-master-ㅏ")).toBeFocused();
    await expect(reviewCount(page)).toHaveText("0 / 5 项已回忆");
    expect(await audioLog(page)).toHaveLength(0);
    await expectTotalXp(page, 0);
  });

  test("five keyboard ratings end the short session; regular review and reload share the same count", async ({ page }) => {
    await openApp(page);
    await enterReview(page);
    for (let count = 1; count <= 5; count += 1) {
      await rateOne(page, count === 1 ? "Digit1" : "Digit2");
      await expect(reviewCount(page)).toHaveText(`${count} / 5 项已回忆`);
    }
    await expect(review(page).locator(".daily-review-empty h3")).toHaveText("今天的 5 项复习完成了");
    await expect(review(page).locator(".daily-review-reveal")).toHaveCount(0);
    await review(page).getByRole("button", { name: "返回今日路线" }).click();
    await expect(plan(page)).toBeFocused();
    await expect(plan(page).locator(".daily-plan-count strong")).toHaveText("1 / 2");
    await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "今日复习", exact: true }).click();
    await expect(review(page).locator(".daily-review-progress-heading strong span")).toHaveText("5 / 10");
    await page.reload();
    await expect(reviewCount(page)).toHaveText("5 / 5 项已回忆");
    await expect(review(page).locator(".daily-review-progress-heading strong span")).toHaveText("5 / 10");
    await expectTotalXp(page, 0);
  });

  test("keyboard navigation opens blind listening without playing; actual answers including mistakes fill the goal", async ({ page }) => {
    await openApp(page);
    await plan(page).focus();
    await page.keyboard.press("Digit2");
    await expect(listening(page)).toBeFocused();
    expect(await audioLog(page)).toHaveLength(0);
    await page.keyboard.press("Enter");
    for (let count = 1; count <= 8; count += 1) {
      await expect(listening(page).locator(".vowel-challenge-choices button").first()).toBeEnabled();
      const clip = await lastAudio(page);
      if (clip.kind !== "syllable") throw new Error("Expected an existing vowel syllable clip");
      const choices = await listening(page).locator(".vowel-challenge-choices button strong").allTextContents();
      const right = choices.indexOf(clip.vowel);
      await page.keyboard.press(`Digit${(count === 1 ? 1 - right : right) + 1}`);
      await expect(listenCount(page)).toHaveText(`${count} / 8 次已作答`);
      await page.keyboard.press("Enter");
    }
    await expect(listening(page).locator(".vowel-challenge-results h4")).toHaveText("7 / 8");
    await page.locator("#pronunciation-practice").getByRole("button", { name: "返回今日路线" }).click();
    await expect(plan(page)).toBeFocused();
    await expect(plan(page)).toContainText("目前有 1 个待巩固音例");
    await expect(plan(page).locator(".daily-plan-count strong")).toHaveText("1 / 2");
    await page.reload();
    await expect(listenCount(page)).toHaveText("8 / 8 次已作答");
  });

  test("cross-tab reviews update the plan and a new local day clears today's goals without erasing history", async ({ page, context }) => {
    await page.clock.install({ time: new Date("2026-10-16T10:00:00+09:00") });
    await openApp(page);
    const other = await context.newPage();
    await other.clock.install({ time: new Date("2026-10-16T10:00:00+09:00") });
    await openApp(other);
    await enterReview(other);
    await rateOne(other);
    await expect(reviewCount(page)).toHaveText("1 / 5 项已回忆");
    await other.close();
    await page.clock.fastForward("24:00:00");
    await expect(plan(page).locator(".daily-plan-count")).toContainText("2026-10-17");
    await expect(reviewCount(page)).toHaveText("0 / 5 项已回忆");
    await expect(plan(page)).toContainText("当前有 1 项到期");
  });

  test("a fully future-scheduled catalog is not brought forward; an existing eight-answer day needs no fake new task", async ({ page, context }) => {
    const at = Date.parse("2026-10-16T10:00:00+09:00");
    const question = makeVowelQuestions(() => .5)[0];
    const entries = phrases.map(item => [reviewStorageKey(item.id), JSON.stringify(rateReview(undefined, item.id, "remembered", "2026-10-17", at))]);
    for (let i = 0; i < 8; i += 1) {
      const id = `attempt-${String(i).padStart(16, "0")}`;
      entries.push([VOWEL_HISTORY_PREFIX + id, JSON.stringify({ id, questionId: question.id, choice: question.answer, at })]);
    }
    await context.addInitScript(values => { for (const [key, value] of values) localStorage.setItem(key, value); }, entries);
    await page.clock.install({ time: new Date(at) });
    await openApp(page);
    await expect(reviewCount(page)).toHaveText("今天暂不用复习");
    await expect(plan(page).getByRole("button", { name: "查看短练结果" })).toBeDisabled();
    await expect(plan(page)).toContainText("下次到期：2026-10-18");
    await expect(plan(page)).toContainText("今天的两项练习已完成，可以休息了。");
    await expect(plan(page).locator(".daily-plan-primary")).toHaveCount(0);
    const before = await page.evaluate(() => JSON.stringify(localStorage));
    await plan(page).focus(); await page.keyboard.press("Enter"); await page.keyboard.press("Digit1");
    await expect(plan(page)).toBeFocused();
    expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(before);
    expect(await audioLog(page)).toHaveLength(0);
  });

  test("native button Enter, composition and held keys do not invoke a second route", async ({ page }) => {
    await openApp(page);
    await plan(page).focus();
    for (const event of [{ key: "1", code: "Digit1", repeat: true }, { key: "Enter", code: "Enter", isComposing: true }, { key: "Enter", code: "Enter", keyCode: 229 }, { key: "1", code: "Digit1", ctrlKey: true }]) {
      await plan(page).dispatchEvent("keydown", event);
      await expect(plan(page)).toBeFocused();
    }
    const button = plan(page).getByRole("button", { name: "进入盲听／错题" });
    await button.focus(); await page.keyboard.press("Enter");
    await expect(listening(page)).toBeFocused();
    await expect(listening(page).locator(".vowel-challenge-intro")).toBeVisible();
    expect(await audioLog(page)).toHaveLength(0);
  });

  test("mobile layout stays inside the viewport and storage failure remains visible on the plan", async ({ page, context }, testInfo) => {
    await context.addInitScript(() => { Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("blocked", "SecurityError"); } }); });
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page, "/#today-plan");
    await enterReview(page); await rateOne(page);
    await review(page).getByRole("button", { name: "返回今日路线" }).click();
    await expect(reviewCount(page)).toHaveText("1 / 5 项已回忆");
    await expect(plan(page).locator(".daily-plan-storage")).toContainText("仅本页");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
    for (const button of await plan(page).getByRole("button").all()) {
      const box = await button.boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
    }
    await plan(page).screenshot({ path: testInfo.outputPath("daily-plan-mobile.png") });
  });
});

test.describe("今日路线 · 中止自动切题", () => {
  test.use({ autoAdvance: "site-default" });
  test("returning to the route cancels pending audio and automatic advancement", async ({ page }) => {
    await openApp(page);
    await plan(page).getByRole("button", { name: "进入盲听／错题" }).click();
    await page.keyboard.press("Enter");
    await expect(listening(page).locator(".vowel-challenge-choices button").first()).toBeEnabled();
    await page.keyboard.press("Digit1");
    await expect(listenCount(page)).toHaveText("1 / 8 次已作答");
    await page.locator("#pronunciation-practice").getByRole("button", { name: "返回今日路线" }).click();
    await expect(plan(page)).toBeFocused();
    const played = (await audioLog(page)).length;
    await page.waitForTimeout(3500);
    expect((await audioLog(page)).length).toBe(played);
    await expect(listening(page).locator(".vowel-challenge-header > span")).toHaveText("盲听 1 / 8");
    await expect(listenCount(page)).toHaveText("1 / 8 次已作答");
  });
});

test.describe("今日路线 · 离开短练", () => {
  test("a click outside the short practice ends it, so coming back shows the regular review and listening", async ({ page }) => {
    await openApp(page);
    await enterReview(page);
    await rateOne(page);
    await expect(reviewGoal(page)).toHaveText("1 / 5");
    await expect(reviewBackToPlan(page)).toBeVisible();
    // Working inside the practice keeps it.
    await review(page).locator(".daily-review-notes summary").click();
    await expect(reviewGoal(page)).toHaveText("1 / 5");
    await expect(reviewBackToPlan(page)).toBeVisible();

    // Leave through the main navigation, then scroll back instead of using a route or review link.
    await mainNav(page).getByRole("link", { name: "40 音表", exact: true }).click();
    await review(page).scrollIntoViewIfNeeded();
    await expect(reviewGoal(page)).toHaveText("1 / 10");
    await expect(reviewBackToPlan(page)).toHaveCount(0);
    await expect(review(page).locator(".daily-review-reveal")).toBeVisible();

    await plan(page).getByRole("button", { name: "进入盲听／错题" }).click();
    await expect(listening(page)).toBeFocused();
    await expect(listeningBackToPlan(page)).toBeVisible();
    // Any other section counts as leaving, not only the navigation bar.
    await page.locator("#audio-guide-title").click();
    await page.locator("#pronunciation-practice").scrollIntoViewIfNeeded();
    await expect(listeningBackToPlan(page)).toHaveCount(0);
    await expect(reviewCount(page)).toHaveText("1 / 5 项已回忆");
    expect(await audioLog(page)).toHaveLength(0);
  });

  test("keyboard jumps to another section end it; the shortcut help shown over it does not", async ({ page }) => {
    await openApp(page);
    await enterReview(page);
    const dialog = page.getByRole("dialog");
    await page.keyboard.press("Shift+Slash");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "关闭快捷键帮助" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(review(page)).toBeFocused();
    await page.getByRole("button", { name: "打开键盘快捷键帮助" }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(reviewGoal(page)).toHaveText("0 / 5");
    await expect(reviewBackToPlan(page)).toBeVisible();

    await review(page).focus();
    await page.keyboard.press("F2");
    await expect(page.locator("#keyboard-game-console")).toBeFocused();
    await expect(reviewGoal(page)).toHaveText("0 / 10");
    await expect(reviewBackToPlan(page)).toHaveCount(0);

    await plan(page).focus();
    await page.keyboard.press("Digit2");
    await expect(listening(page)).toBeFocused();
    await expect(listeningBackToPlan(page)).toBeVisible();
    await page.keyboard.press("Shift+Digit4");
    await expect(page.locator("#batchim-lesson")).toBeFocused();
    await expect(listeningBackToPlan(page)).toHaveCount(0);

    // From the route card, "learn the next step" is not part of a short practice either.
    await plan(page).focus();
    await page.keyboard.press("Digit1");
    await expect(review(page)).toBeFocused();
    await expect(reviewBackToPlan(page)).toBeVisible();
    await plan(page).focus();
    await page.keyboard.press("Digit3");
    await expect(page.locator("#letter-master-ㅏ")).toBeFocused();
    await expect(reviewGoal(page)).toHaveText("0 / 10");
    await expect(reviewBackToPlan(page)).toHaveCount(0);
    expect(await audioLog(page)).toHaveLength(0);
  });
});
