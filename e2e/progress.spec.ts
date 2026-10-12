import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { answerListen, audibleClips, disableAutoAdvance, expect, expectTotalXp, installAudioSpy, nextListen, openApp, phrases, test, todayXp } from "./support/app.ts";
import type { Page } from "@playwright/test";

const mastered = (page: Page) => page.locator(".mastery-meter strong");

test.describe("学习进度", () => {
  test("two open tabs stay in sync and never overwrite each other's XP", async ({ page, context }) => {
    await openApp(page);
    const second = await context.newPage();
    await openApp(second);

    await page.locator("#letter-master-ㄱ").click();
    await expect(mastered(second)).toHaveText("1/40");

    await page.locator("#listen-start").click();
    await answerListen(page);
    await expectTotalXp(page, 12);
    await expectTotalXp(second, 12);

    await second.locator("#listen-start").click();
    await answerListen(second);
    await expectTotalXp(second, 24);
    await expectTotalXp(page, 24);

    await second.locator("#letter-master-ㄱ").click();
    await expect(mastered(page)).toHaveText("0/40");

    await page.reload();
    await second.reload();
    await expectTotalXp(page, 24);
    await expectTotalXp(second, 24);
    await expect(mastered(page)).toHaveText("0/40");
  });

  test("today's XP starts again at local midnight while the total is kept", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-12T23:58:30+09:00") });
    await openApp(page);
    await page.locator("#listen-start").click();
    await answerListen(page);
    expect(await todayXp(page)).toBe(12);
    // Let the feedback clip finish first: jumping the clock mid-playback would trip the player's stall guard.
    await expect.poll(() => audibleClips(page)).toBe(0);

    await page.clock.fastForward("00:02:00");
    await expect.poll(() => todayXp(page)).toBe(0);
    await expectTotalXp(page, 12);
    await expect(page.locator(".daily-goal p")).toHaveText("还差 80 XP");
    // Yesterday's points appear in the seven-day chart, not under today.
    await expect(page.locator(".week-card strong")).toHaveText("12 XP");

    await nextListen(page);
    await answerListen(page);
    expect(await todayXp(page)).toBe(14);
    await expectTotalXp(page, 26);
  });

  test("clearing site data from another tab resets this one, and it keeps saving afterwards", async ({ page, context }) => {
    await openApp(page);
    await page.locator("#letter-master-ㄱ").click();
    await page.locator("#listen-start").click();
    await answerListen(page);
    await expectTotalXp(page, 12);

    const second = await context.newPage();
    await openApp(second);
    await expectTotalXp(second, 12);
    await second.evaluate(() => window.localStorage.clear());
    await expectTotalXp(page, 0);
    await expect(mastered(page)).toHaveText("0/40");

    // The first tab is still mid-round; answering again must be stored under the fresh data.
    await nextListen(page);
    await answerListen(page);
    await expectTotalXp(page, 14);
    await page.reload();
    await expectTotalXp(page, 14);
    await expect(mastered(page)).toHaveText("0/40");
  });

  test("progress is not lost when a tab is closed right after an answer", async ({ page, context }) => {
    await openApp(page);
    await page.locator("#listen-start").click();
    await answerListen(page);
    await page.locator("#phrase-master-word-water").click();
    await page.close();
    const reopened = await context.newPage();
    await openApp(reopened);
    await expectTotalXp(reopened, 12);
    await expect(reopened.locator(".phrase-progress strong")).toHaveText(`1/${phrases.length}`);
  });

  test("switching to another app and back keeps saving new answers", async ({ page }) => {
    await openApp(page);
    await page.locator("#listen-start").click();
    await answerListen(page);
    await expectTotalXp(page, 12);

    // What the browser reports when the tab goes to the background and returns.
    const setVisibility = (state: "hidden" | "visible") => page.evaluate((value) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
    await setVisibility("hidden");
    await setVisibility("visible");

    await nextListen(page);
    await page.locator("#listen-replay").click(); // the question was paused while the tab was hidden
    await answerListen(page);
    await expectTotalXp(page, 26);
    await page.locator("#letter-master-ㅁ").click();
    await setVisibility("hidden");
    await setVisibility("visible");
    await page.locator("#letter-master-ㅂ").click();

    await page.reload();
    await expectTotalXp(page, 26);
    await expect(mastered(page)).toHaveText("2/40");
  });

  test("many visits never lose earlier progress, and old records are tidied instead of piling up", async ({ page }) => {
    await openApp(page);
    await page.locator("#listen-start").click();
    await answerListen(page);
    const letters = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ"];
    let mostRecords = 0;
    for (const [visit, letter] of letters.entries()) {
      await page.goto("about:blank"); // leaving the page, as when closing the tab
      await openApp(page);
      await expect(mastered(page), `visit ${visit + 1}`).toHaveText(`${visit}/40`);
      await page.locator(`#letter-master-${letter}`).click();
      await expect(mastered(page)).toHaveText(`${visit + 1}/40`);
      mostRecords = Math.max(mostRecords, await page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.includes(":ledger:")).length));
    }
    await page.reload();
    await expect(mastered(page)).toHaveText("12/40");
    await expectTotalXp(page, 12);
    expect(mostRecords, "per-visit records should be merged away, not accumulate forever").toBeLessThan(letters.length);
  });
});

test.describe("进度备份", () => {
  const moment = new Date("2026-10-12T07:20:00+09:00");
  const fileInput = (page: Page) => page.locator('input[aria-label="选择 JSON 进度备份"]');
  const status = (page: Page) => page.locator(".backup-status");
  // Plain-ASCII scratch folder: some headless environments cannot hand the browser a file whose path has CJK characters.
  const scratch = () => mkdtemp(join(tmpdir(), "hangul40-e2e-"));

  async function importFile(page: Page, path: string) {
    await expect(fileInput(page)).toBeEnabled();
    await fileInput(page).setInputFiles(path);
    await expect(page.locator(".backup-preview")).toBeVisible();
    await page.locator(".backup-preview .backup-actions button").first().click();
    await expect(status(page)).toHaveText("已合并恢复到本浏览器。现有已学内容保留，经验未重复累加；可以继续学习。");
  }

  test("a backup moves progress to another browser, merging instead of overwriting or double counting", async ({ page, browser }) => {
    await page.clock.install({ time: moment });
    await openApp(page);
    await page.locator("#letter-master-ㄱ").click();
    await page.locator("#letter-master-ㄴ").click();
    await page.locator("#phrase-master-word-water").click();
    await page.locator("#listen-start").click();
    await answerListen(page);
    await page.locator("#daily-review .daily-review-reveal").click();
    await page.locator("#daily-review .daily-review-rating button").nth(1).click();
    await page.locator("#auto-advance-setting").selectOption("5000");

    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#learning-tools .backup-actions button").click()]);
    // The file is named after the learner's own calendar day, not the UTC day.
    expect(download.suggestedFilename()).toBe("hangul40-progress-2026-10-12.json");
    const file = join(await scratch(), "backup.json");
    await download.saveAs(file);
    const backup = JSON.parse(await readFile(file, "utf8"));
    expect(backup.format).toBe("hangul40-progress");
    expect(backup.progress.stats.totalXp).toBe(12);
    expect(backup.progress.mastered).toEqual(["ㄱ", "ㄴ"]);
    expect(backup.progress.masteredPhrases).toEqual(["word-water"]);
    expect(Object.keys(backup.reviews)).toHaveLength(1);
    expect(backup.preferences.autoAdvanceMs).toBe(5000);

    // "Another device": a separate browser profile that already has different progress of its own.
    const other = await browser.newContext({ locale: "zh-CN", timezoneId: "Asia/Seoul" });
    await installAudioSpy(other);
    await disableAutoAdvance(other);
    const device = await other.newPage();
    await device.clock.install({ time: moment });
    await openApp(device);
    await device.locator("#letter-master-ㄷ").click();
    await device.locator("#listen-start").click();
    await answerListen(device);
    await nextListen(device);
    await answerListen(device);
    await expectTotalXp(device, 26);

    await importFile(device, file);
    await expectTotalXp(device, 26);                       // the higher of 26 and 12, never 38
    await expect(mastered(device)).toHaveText("3/40");     // ㄱ ㄴ from the backup plus ㄷ learned here
    await expect(device.locator(".phrase-progress strong")).toHaveText(`1/${phrases.length}`);
    await expect(device.locator("#daily-review .daily-review-progress-heading strong span")).toHaveText("1 / 10");
    await expect(device.locator("#auto-advance-setting")).toHaveValue("5000");

    await importFile(device, file);                        // importing the same file again changes nothing
    await expectTotalXp(device, 26);
    await expect(mastered(device)).toHaveText("3/40");

    await device.reload();
    await expectTotalXp(device, 26);
    await expect(mastered(device)).toHaveText("3/40");
    await expect(device.locator("#auto-advance-setting")).toHaveValue("5000");
    await other.close();
  });

  test("damaged or foreign files are refused and leave existing progress untouched", async ({ page }) => {
    await openApp(page);
    await page.locator("#letter-master-ㄱ").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#learning-tools .backup-actions button").click()]);
    const good = JSON.parse(await readFile(await download.path(), "utf8"));

    const cases: Array<[string, string, string]> = [
      ["negative.json", JSON.stringify({ ...good, progress: { ...good.progress, stats: { ...good.progress.stats, totalXp: -5 } } }), "备份格式不完整或含有无效记录"],
      ["unknown-letter.json", JSON.stringify({ ...good, progress: { ...good.progress, mastered: ["ㄱ", "Z"] } }), "备份格式不完整或含有无效记录"],
      ["other-app.json", JSON.stringify({ format: "something-else", version: 1 }), "不是本网站支持的进度备份版本"],
      ["future-version.json", JSON.stringify({ ...good, version: 2 }), "不是本网站支持的进度备份版本"],
      ["not-json.json", "hello", "这不是有效的 JSON 备份文件"],
    ];
    const folder = await scratch();
    for (const [name, content, message] of cases) {
      const path = join(folder, name);
      await writeFile(path, content);
      await expect(fileInput(page)).toBeEnabled();
      await fileInput(page).setInputFiles(path);
      await expect(status(page), name).toContainText(message);
      await expect(page.locator(".backup-preview"), name).toHaveCount(0);
    }
    await expect(mastered(page)).toHaveText("1/40");
    await page.reload();
    await expect(mastered(page)).toHaveText("1/40");
  });
});
