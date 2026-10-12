import { answerListen, audibleClips, expect, expectTotalXp, nextListen, openApp, readListenQuestion, test } from "./support/app.ts";

test.describe("异常情况下仍可用", () => {
  test("progress saved by an old version of the site is carried over", async ({ page, context }) => {
    await context.addInitScript(() => {
      try {
        if (window.localStorage.getItem("seeded-by-test")) return;
        window.localStorage.setItem("seeded-by-test", "1");
        window.localStorage.setItem("hangul-game-stats", JSON.stringify({ date: "2026-01-05", dailyXp: 30, totalXp: 100, bestCombo: 3, games: 2, mistakes: { "ㄱ": 2 } }));
        window.localStorage.setItem("hangul-mastered", JSON.stringify(["ㄱ", "ㅏ"]));
        window.localStorage.setItem("hangul-phrase-mastered", JSON.stringify(["word-water"]));
      } catch { /* blank start page */ }
    });
    await openApp(page);
    await expectTotalXp(page, 100);
    await expect(page.locator(".mastery-meter strong")).toHaveText("2/40");
    await expect(page.locator(".phrase-progress strong")).toContainText("1/");
    await expect(page.locator(".weak-list button strong")).toHaveText(["ㄱ"]);
    await expect(page.locator(".game-stats-row")).toContainText("3最佳连胜");

    await page.locator("#listen-start").click();
    await answerListen(page);
    await expectTotalXp(page, 112);
    await page.reload();
    await expectTotalXp(page, 112);
    await expect(page.locator(".mastery-meter strong")).toHaveText("2/40");
  });

  test("a damaged progress record is skipped with a warning; the rest keeps working and saving", async ({ page }) => {
    await openApp(page);
    await page.locator("#letter-master-ㄱ").click();
    await page.goto("about:blank");
    await openApp(page);
    await page.locator("#letter-master-ㄴ").click();
    await expect(page.locator(".mastery-meter strong")).toHaveText("2/40");

    // Break the record written by the first visit.
    const broken = await page.evaluate(() => {
      const keys = Object.keys(window.localStorage).filter((key) => key.includes(":ledger:")).sort();
      const victim = keys.find((key) => (window.localStorage.getItem(key) ?? "").includes("ㄱ"));
      if (victim) window.localStorage.setItem(victim, "{ this is not valid");
      return Boolean(victim);
    });
    expect(broken).toBe(true);
    await page.reload();
    await expect(page.locator(".share-toast")).toContainText("损坏");
    await expect(page.locator(".mastery-meter strong")).toHaveText("1/40");
    await expect(page.locator("#letter-master-ㄴ")).toHaveAttribute("aria-pressed", "true");

    await page.locator("#letter-master-ㄷ").click();
    await page.reload();
    await expect(page.locator(".mastery-meter strong")).toHaveText("2/40");
  });

  test("when the browser refuses to store anything the site still works for this visit and says so", async ({ page, context }) => {
    await context.addInitScript(() => {
      Storage.prototype.setItem = function refuse() { throw new DOMException("The quota has been exceeded.", "QuotaExceededError"); };
    });
    await openApp(page);
    await page.locator("#listen-start").click();
    await answerListen(page);
    await expectTotalXp(page, 12);
    await expect(page.locator(".share-toast")).toBeVisible();
    await nextListen(page);
    await answerListen(page);
    await expectTotalXp(page, 26);
    await page.locator("#letter-master-ㄱ").click();
    await expect(page.locator(".mastery-meter strong")).toHaveText("1/40");
  });

  test("with site storage blocked entirely the page still loads and the games still play", async ({ page, context }) => {
    await context.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("Access is denied for this document.", "SecurityError"); } });
    });
    await openApp(page);
    await page.locator("#listen-start").click();
    await answerListen(page);
    await expectTotalXp(page, 12);
    await page.locator("#game-tab-blend").click();
    await expect(page.locator("#game-panel-blend .blend-choice-row button").first()).toBeEnabled();
    await page.locator("#daily-review .daily-review-reveal").click();
    await page.locator("#daily-review .daily-review-rating button").nth(1).click();
    await expect(page.locator("#daily-review .daily-review-progress-heading strong span")).toHaveText("1 / 10");
  });

  test("hammering the game tabs leaves the site in a playable state with a single sound", async ({ page }) => {
    await openApp(page);
    const tabs = ["shadow", "match", "blend", "speed", "typing", "listen"];
    let loudest = 0;
    for (let lap = 0; lap < 3; lap += 1) {
      for (const tab of tabs) {
        await page.locator(`#game-tab-${tab}`).click();
        loudest = Math.max(loudest, await audibleClips(page));
      }
    }
    expect(loudest, "clips audible at the same moment").toBeLessThanOrEqual(1);
    await expect(page.getByTestId("listen-round")).toHaveText("第 1 / 10 题");
    await readListenQuestion(page);
    await answerListen(page);
    await expectTotalXp(page, 12);
  });
});
