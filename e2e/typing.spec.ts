import { expect, expectTotalXp, lastAudio, openApp, test } from "./support/app.ts";
import type { Page } from "@playwright/test";

const panel = (page: Page) => page.locator("#game-panel-typing");
const input = (page: Page) => page.locator("#typing-input");
const target = (page: Page) => page.locator("#typing-target-korean");

async function typeStop(page: Page, text: string) {
  await input(page).fill(text);
  await input(page).press("Enter");
}

test.describe("地铁打字", () => {
  test("a wrong word keeps the train in the station; finishing the line saves a best time", async ({ page }) => {
    await openApp(page);
    await page.locator("#game-tab-typing").click();
    await expect(panel(page).locator(".typing-route-picker button")).toHaveCount(4);
    await page.locator("#typing-start").click();

    for (let stop = 1; stop <= 8; stop += 1) {
      await expect(panel(page).locator(".game-board-top span").first()).toHaveText(`第 ${stop} / 8 站`);
      const word = await target(page).innerText();
      if (stop === 2) {
        await typeStop(page, "가가가");
        await expect(page.locator("#typing-feedback-message")).toContainText("列车仍停在本站");
        await expect(input(page)).toHaveAttribute("aria-invalid", "true");
        await expect(panel(page).locator(".game-board-top span").first()).toHaveText("第 2 / 8 站");
        await expect(page.locator("#typing-feedback small")).toContainText("输入错误 1 次");
      }
      await typeStop(page, word);
    }

    await expect(panel(page).locator(".typing-finish h3")).toHaveText("到达终点");
    await expect(panel(page).locator(".typing-finish")).toContainText("有 1 个词曾输入错误");
    await expect(panel(page).locator(".typing-missed li")).toHaveCount(1);
    // Seven clean stops at 7 XP and one corrected stop at 4 XP.
    await expectTotalXp(page, 7 * 7 + 4);
    await expect(page.locator(".game-stats-row")).toContainText("1完成局数");

    await panel(page).locator(".typing-finish-actions .secondary").click();
    await expect(page.locator("#typing-route-survival em")).toContainText("最佳");
    await page.reload();
    await page.locator("#game-tab-typing").click();
    await expect(page.locator("#typing-route-survival em")).toContainText("最佳");
    await expectTotalXp(page, 53);
  });

  test("a clean run reports 100% accuracy and every route starts with its own first word", async ({ page }) => {
    await openApp(page);
    await page.locator("#game-tab-typing").click();
    const routes = panel(page).locator(".typing-route-picker button");
    const firstWords = new Set<string>();
    for (let index = 0; index < 4; index += 1) {
      await routes.nth(index).click();
      await page.locator("#typing-start").click();
      firstWords.add(await target(page).innerText());
      await input(page).press("Escape");
      await panel(page).locator(".typing-paused .secondary").click();
    }
    expect(firstWords.size, "four different lines").toBe(4);

    await routes.nth(3).click();
    await page.locator("#typing-start").click();
    for (let stop = 1; stop <= 8; stop += 1) {
      await expect(panel(page).locator(".game-board-top span").first()).toHaveText(`第 ${stop} / 8 站`);
      await typeStop(page, await target(page).innerText());
    }
    await expect(panel(page).locator(".typing-result-stats")).toContainText("准确率100%");
    await expect(panel(page).locator(".typing-finish")).toContainText("全程一次通过");
    await expectTotalXp(page, 56);
  });

  test("Escape pauses without losing the half-typed word, and the clock stops while paused", async ({ page }) => {
    await openApp(page);
    await page.locator("#game-tab-typing").click();
    await page.locator("#typing-start").click();
    const word = await target(page).innerText();
    await input(page).fill(word.slice(0, 1));
    // The run clock reads like "0:03.4".
    const runSeconds = async () => {
      const [, minutes, seconds] = /^(\d+):(\d+\.\d)$/.exec(await panel(page).locator(".game-board-top strong").innerText()) ?? [];
      return Number(minutes) * 60 + Number(seconds);
    };
    const before = await runSeconds();
    await input(page).press("Escape");
    await expect(panel(page).locator(".typing-paused h3")).toHaveText("行程已暂停");
    await page.waitForTimeout(4_000);
    await page.locator("#typing-resume").click();
    await expect(input(page)).toBeFocused();
    await expect(input(page)).toHaveValue(word.slice(0, 1));
    const after = await runSeconds();
    expect(after - before, `the 4 s pause must not be counted (clock went from ${before} s to ${after} s)`).toBeLessThan(2);
    expect(after).toBeGreaterThanOrEqual(before);
  });

  test("with a Korean input method, the Enter that only finishes a syllable is not taken as the answer", async ({ page, context }) => {
    await openApp(page);
    await page.locator("#game-tab-typing").click();
    await page.locator("#typing-start").click();
    const stop = panel(page).locator(".game-board-top span").first();
    const word = await target(page).innerText();
    await input(page).focus();

    // Drive Chromium's real composition machinery: every syllable but the last is committed,
    // the last one is still being composed (underlined) when Enter is pressed.
    const ime = await context.newCDPSession(page);
    if (word.length > 1) await ime.send("Input.insertText", { text: word.slice(0, -1) });
    await ime.send("Input.imeSetComposition", { text: word.slice(-1), selectionStart: 1, selectionEnd: 1 });
    await expect(input(page)).toHaveValue(word);
    await input(page).press("Enter");
    await expect(stop).toHaveText("第 1 / 8 站");
    await expect(input(page)).toHaveValue(word);
    await expect(page.locator("#typing-feedback small")).toContainText("输入错误 0 次");

    await ime.send("Input.insertText", { text: word.slice(-1) }); // the input method commits the syllable
    await input(page).press("Enter");
    await expect(stop).toHaveText("第 2 / 8 站");
    await expect(input(page), "nothing may leak into the next stop's field").toHaveValue("");
    await expectTotalXp(page, 7);
  });

  test("Shift+Enter replays the current word and Enter is ignored while it plays", async ({ page }) => {
    await openApp(page);
    await page.locator("#game-tab-typing").click();
    await page.locator("#typing-start").click();
    const word = await target(page).innerText();
    await input(page).press("Shift+Enter");
    await expect.poll(async () => { const clip = await lastAudio(page); return clip.kind === "phrase" ? clip.phrase.korean : ""; }).toBe(word);
    await expect(input(page)).toBeEnabled();
    await expect(panel(page).locator(".game-board-top span").first()).toHaveText("第 1 / 8 站");
    await typeStop(page, word);
    await expect(panel(page).locator(".game-board-top span").first()).toHaveText("第 2 / 8 站");
  });
});
