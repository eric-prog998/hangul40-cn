import { readFile } from "node:fs/promises";
import { expect, openApp, test, audioLog, audibleClips, lastAudioRate, consonantNames, phrases } from "./support/app.ts";
import { createAudioCatalog } from "../app/audio-catalog.ts";

const catalog = createAudioCatalog(consonantNames, phrases);

test.describe("音源与反馈", () => {
  test("shows honest provenance, explains repeated onsets and never invents silent ㅇ", async ({ page }, testInfo) => {
    await openApp(page, "/#audio-guide");
    const panel = page.locator("#audio-guide");
    await expect(panel.locator(".audio-review-count strong")).toHaveText(String(catalog.length));
    await expect(panel).toContainText("没有新增母语教师逐条听审记录");
    await panel.screenshot({ path: testInfo.outputPath("audio-guide-desktop.png") });
    await page.locator("#audio-category").selectOption("clarity");
    await expect(panel.locator(".audio-guide-explanation")).toContainText("重复两次");
    await expect(panel.locator(".audio-source-text")).toContainText("호로조");
    await expect(panel.locator(".audio-source-text a")).toHaveAttribute("href", /commons.wikimedia.org/);
    await page.locator("#audio-category").selectOption("onset");
    await page.locator("#audio-search").fill("ㅇ");
    await expect(page.locator("#audio-selection")).toBeDisabled();
    await expect(panel).toContainText("没有找到条目");
    await page.locator("#audio-category").selectOption("name");
    await expect(page.locator("#audio-selection")).toHaveValue("name-ieung");
    await expect(panel.locator(".audio-guide-badges")).toContainText("AI 合成示范");
  });

  test("search and selections are silent; explicit play and F8 work without overlapping audio", async ({ page }) => {
    await openApp(page, "/#audio-guide");
    const before = (await audioLog(page)).length;
    await page.locator("#audio-category").selectOption("phrase");
    await page.locator("#audio-search").fill("收据");
    await expect(page.locator("#audio-selection")).toHaveValue("word-receipt");
    expect((await audioLog(page)).length).toBe(before);
    await page.locator("#audio-guide-play").click();
    await expect(page.locator("#audio-guide-status")).toContainText("播放结束");
    await page.locator("#audio-guide").focus();
    await page.keyboard.press("F8");
    await expect.poll(async () => (await audioLog(page)).length).toBe(before + 2);
    expect(await audibleClips(page)).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(page.locator("#audio-guide-status")).toContainText("已停止");
    expect(await audibleClips(page)).toBe(0);
  });

  test("checking a recording plays it at its original speed and the same file version as the lessons", async ({ page }) => {
    await openApp(page);
    // A lesson clip shows which file version the lessons request. It plays before slow mode is on:
    // the Linux WebKit test build stalls or crashes on slowed playback (slow lessons are covered in Chromium).
    const start = (await audioLog(page)).length;
    await page.locator(".syllable-result").click();
    await expect.poll(async () => (await audioLog(page)).length).toBe(start + 1);
    const lesson = new URL((await audioLog(page)).at(-1)!);
    const slow = page.locator(".audio-speed-toggle").getByRole("button", { name: "慢放" });
    await slow.click();
    await expect(slow).toHaveAttribute("aria-pressed", "true");

    await page.locator("#audio-category").selectOption("phrase");
    await page.locator("#audio-search").fill("收据");
    await page.locator("#audio-guide-play").click();
    await expect(page.locator("#audio-guide-status")).toContainText("播放结束");
    const log = await audioLog(page);
    expect(log).toHaveLength(start + 2);
    const checked = new URL(log.at(-1)!);
    expect(checked.pathname).toBe("/audio/phrases/word-receipt.mp3");
    expect(checked.searchParams.get("v"), "the guide must not keep an older cached copy than the lessons").toBe(lesson.searchParams.get("v"));
    expect(await lastAudioRate(page), "a slowed-down copy is not the recording being checked").toBe(1);
    // Checking a recording leaves the learner's own slow-playback choice for the lessons alone.
    await expect(slow).toHaveAttribute("aria-pressed", "true");
  });

  test("feedback contains the chosen file and never sends it; changing the selection clears the draft", async ({ page }) => {
    const sent: string[] = [];
    page.on("request", request => { if (request.method() !== "GET") sent.push(request.url()); });
    await openApp(page, "/#audio-guide");
    await page.locator("#audio-category").selectOption("phrase");
    await page.locator("#audio-search").fill("收据");
    await page.getByRole("button", { name: "这条发音有疑问" }).click();
    await page.locator("#audio-note").fill("按 F8 后听起来不清楚。");
    await expect(page.locator("#audio-report")).toHaveValue(/word-receipt/);
    await expect(page.locator("#audio-report")).toHaveValue(/未发送/);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "下载反馈文件" }).click()]);
    expect(download.suggestedFilename()).toBe("hangul40-audio-word-receipt.txt");
    const report = await readFile((await download.path())!, "utf8");
    expect(report).toContain("按 F8 后听起来不清楚。");
    expect(report).toContain("/audio/phrases/word-receipt.mp3");
    expect(report).not.toContain("hangul-game-stats");
    expect(sent).toEqual([]);
    await page.locator("#audio-search").fill("咖啡");
    await expect(page.locator("#audio-feedback-form")).toHaveCount(0);
    await page.getByRole("button", { name: "这条发音有疑问" }).click();
    await expect(page.locator("#audio-note")).toHaveValue("");
    await expect(page.locator("#audio-report")).toHaveValue(/word-coffee/);
  });

  test("the review export remains entirely pending and does not modify progress", async ({ page }) => {
    await openApp(page, "/#audio-guide");
    const before = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "下载待听审清单" }).click()]);
    const checklist = JSON.parse(await readFile((await download.path())!, "utf8"));
    expect(checklist.items).toHaveLength(492);
    expect(checklist.items.every((item: { reviewStatus: string; reviewer: string }) => item.reviewStatus === "pending" && item.reviewer === "")).toBe(true);
    expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))).toBe(before);
  });

  test("report controls fit a narrow screen", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page, "/#audio-guide");
    await page.getByRole("button", { name: "这条发音有疑问" }).click();
    expect(await page.locator("#audio-guide").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(page.getByRole("button", { name: "下载反馈文件" })).toBeVisible();
    await page.locator("#audio-guide").screenshot({ path: testInfo.outputPath("audio-guide-mobile.png") });
  });
});
