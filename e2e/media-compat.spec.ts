import { test, expect } from "@playwright/test";

// Expected network failures are injected here, so these tests deliberately use
// the base fixture, assert those failures, and independently reject page exceptions.
test("network failure gives a retry, never silently advances, and recovers", async ({ page }) => {
  const errors: string[] = [];
  const failures: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("requestfailed", request => failures.push(request.url()));
  let blocked = true;
  await page.route("**/audio/hangul-natural/s-c544.mp3*", route => blocked ? route.abort("failed") : route.continue());
  await page.goto("/#audio-guide");
  await page.locator("#audio-guide-play").click();
  await expect(page.locator("#audio-guide-status")).toContainText("音频未能播放");
  expect(failures.some(url => url.includes("s-c544.mp3"))).toBe(true);
  await expect(page.locator("#audio-selection")).toHaveValue("syllable-c544");
  blocked = false;
  await page.locator("#audio-guide-play").click();
  await expect(page.locator("#audio-guide-status")).toContainText("播放结束");
  expect(errors).toEqual([]);
});

test("stopping during a stalled load immediately releases controls", async ({ page }) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/audio/hangul-natural/s-c544.mp3*", async route => { await gate; await route.continue().catch(() => {}); });
  await page.goto("/#audio-guide");
  await page.locator("#audio-guide-play").click();
  await expect(page.locator("#audio-guide-status")).toContainText("正在播放");
  await page.locator("#audio-guide").getByRole("button", { name: "停止", exact: true }).click();
  await expect(page.locator("#audio-guide-status")).toContainText("已停止", { timeout: 2000 });
  await expect(page.locator("#audio-guide-play")).toHaveText("播放这条音频");
  release!();
});

test("a browser play rejection stays recoverable without auto-play bypass flags", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play;
    let first = true;
    HTMLMediaElement.prototype.play = function () {
      if (first) { first = false; return Promise.reject(new DOMException("Gesture required", "NotAllowedError")); }
      return original.call(this);
    };
  });
  await page.goto("/#audio-guide");
  await page.locator("#audio-guide-play").click();
  await expect(page.locator("#audio-guide-status")).toContainText("浏览器声音权限");
  await page.locator("#audio-guide-play").click();
  await expect(page.locator("#audio-guide-status")).toContainText("播放结束");
});
