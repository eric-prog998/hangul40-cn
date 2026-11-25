import { audioLog, expect, openApp, test } from "./support/app.ts";
import { AUTO_ADVANCE_KEY } from "../app/learning-settings.ts";

test("a failed batchim replay stays paused after a successful retry until Enter", async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, "5000"), AUTO_ADVANCE_KEY);
  await openApp(page, "/#batchim-lesson");
  await page.clock.install();
  const lesson = page.locator("#batchim-lesson");
  const progress = lesson.locator(".batchim-mode-controls > span");
  const status = lesson.getByRole("status");
  await lesson.getByRole("button", { name: "开始 5 题练习" }).click();
  await page.keyboard.press("Digit1");
  await expect(status).toContainText("5 秒后自动下一题");
  await page.evaluate(() => {
    const realPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      HTMLMediaElement.prototype.play = realPlay;
      return Promise.reject(new DOMException("First replay blocked", "NotAllowedError"));
    };
  });
  await page.keyboard.press("F8");
  await expect(status).toContainText("音频未能播放，自动下一题已暂停");
  await page.keyboard.press("F8");
  await expect(status).toContainText("完整词播放完毕");
  await page.clock.fastForward(6000);
  await expect(progress).toHaveText("第 1 / 5 题", { timeout: 1500 });
  await page.keyboard.press("Enter");
  await expect(progress).toHaveText("第 2 / 5 题");
});

for (const [section, tab] of [["phrases", "phrase-tab-sentence"], ["games", "game-tab-typing"]] as const) {
  test(`refresh and continue keep the selected ${tab} without starting an activity`, async ({ page }) => {
    await openApp(page, "/#" + section);
    const selected = page.locator("#" + tab);
    await selected.click();
    await expect(selected).toHaveAttribute("aria-selected", "true");
    await page.reload();
    await expect(page.locator("#" + section)).toBeVisible();
    await expect(selected).toHaveAttribute("aria-selected", "true");
    expect(await audioLog(page)).toEqual([]);
    await page.goto("about:blank");
    await openApp(page);
    await page.locator("#home-continue").click();
    await expect(page.locator("#" + section)).toBeVisible();
    await expect(selected).toHaveAttribute("aria-selected", "true");
    expect(await audioLog(page)).toEqual([]);
  });
}

test("resuming the blend workshop from a fresh home keeps it silent until replay", async ({ page }) => {
  await openApp(page, "/#games");
  await page.locator("#game-tab-blend").click();
  await expect(page.locator("#game-panel-blend")).toBeVisible();
  await page.goto("about:blank");
  await openApp(page);
  await page.locator("#home-continue").click();
  await expect(page.locator("#game-panel-blend")).toBeVisible();
  expect(await audioLog(page)).toEqual([]);
  await page.locator("#blend-replay").click();
  await expect.poll(async () => (await audioLog(page)).length).toBe(1);
});

test("an explicit listening tab link takes precedence over the previously bookmarked game", async ({ page }) => {
  await openApp(page, "/#games");
  await page.locator("#game-tab-typing").click();
  await expect(page.locator("#game-panel-typing")).toBeVisible();
  await page.goto("about:blank");
  await openApp(page, "/#game-tab-listen");
  await expect(page.locator("#game-tab-listen")).toBeFocused();
  await expect(page.locator("#game-panel-listen")).toBeVisible();
  expect(await audioLog(page)).toEqual([]);
});

test("non-default game and sentence deep links reveal the matching panel on load, back and forward", async ({ page }) => {
  await openApp(page, "/#game-tab-typing");
  const typing = page.locator("#game-tab-typing");
  const sentence = page.locator("#phrase-tab-sentence");
  await expect(typing).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#game-panel-typing")).toBeVisible();
  await expect(typing).toBeFocused();
  await page.evaluate(() => { location.hash = "phrase-tab-sentence"; });
  await expect(sentence).toHaveAttribute("aria-selected", "true");
  await expect(sentence).toBeFocused();
  await page.goBack();
  await expect(typing).toBeFocused();
  await expect(page.locator("#game-panel-typing")).toBeVisible();
  await page.goForward();
  await expect(sentence).toBeFocused();
  await expect(sentence).toHaveAttribute("aria-selected", "true");
  expect(await audioLog(page)).toEqual([]);
});

test("a direct blend panel link works even when that panel is not mounted initially", async ({ page }) => {
  await openApp(page, "/#game-panel-blend");
  await expect(page.locator("#game-panel-blend")).toBeVisible();
  await expect(page.locator("#game-tab-blend")).toHaveAttribute("aria-selected", "true");
  expect(await audioLog(page)).toEqual([]);
});

test("returning to a completed six-vowel course keeps the empty filter and focuses how to change it", async ({ page }) => {
  await openApp(page);
  await page.locator("#home-continue").click();
  const learn = page.locator("#learn");
  const filter = learn.locator("#letter-filter-learning");
  await filter.click();
  for (const char of ["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ"]) {
    await learn.locator("#letter-master-" + char).click();
  }
  await expect(learn.locator(".letter-grid-empty")).toBeVisible();
  await expect(filter).toBeFocused();
  await page.goto("about:blank");
  await openApp(page);
  await page.locator("#home-continue").focus();
  await page.keyboard.press("Enter");
  await expect(learn.locator(".letter-grid-empty")).toBeVisible();
  await expect(filter).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(learn.locator(".letter-card")).toHaveCount(6);
  expect(await audioLog(page)).toEqual([]);
});
