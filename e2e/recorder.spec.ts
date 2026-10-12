import { audibleClips, expect, openApp, test } from "./support/app.ts";
import type { Page } from "@playwright/test";

declare global {
  interface Window {
    /** Every microphone track the page was given (test-only), to check that it is switched off again. */
    __micTracks: MediaStreamTrack[];
  }
}

// Uses Chromium's built-in fake microphone (see playwright.config.ts).
test.describe("录音回听", () => {
  const recorder = (page: Page) => page.locator(".local-voice-recorder");
  const buttons = (page: Page) => recorder(page).locator(".local-recorder-actions button");
  const status = (page: Page) => recorder(page).locator(".local-recorder-status");
  const phase = (page: Page, value: string) => expect(recorder(page)).toHaveAttribute("data-recording-phase", value);
  const microphoneRequests = (page: Page) => page.evaluate(() => window.__micTracks.length);
  const liveMicrophones = (page: Page) => page.evaluate(() => window.__micTracks.filter((track) => track.readyState === "live").length);
  const ready = "录音已就绪。交替播放示范和自己的声音，听听差别。";

  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.__micTracks = [];
      const devices = navigator.mediaDevices;
      if (!devices?.getUserMedia) return;
      const original = devices.getUserMedia.bind(devices);
      devices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        window.__micTracks.push(...stream.getTracks());
        return stream;
      };
    });
  });

  async function record(page: Page, seconds: number) {
    await buttons(page).first().click();
    await phase(page, "recording");
    await expect(buttons(page).first()).toContainText(`${seconds} / 15 秒`);
    await buttons(page).first().click();
    await expect(status(page)).toHaveText(ready);
  }

  test("the microphone is only on between start and stop, and the clip plays back to its end", async ({ page }) => {
    await openApp(page);
    await expect(status(page)).toHaveText("先听示范，再录下自己读的声音。");
    await expect(buttons(page).nth(1)).toBeDisabled();
    expect(await microphoneRequests(page), "no microphone request before the learner asks").toBe(0);

    await buttons(page).first().click();
    await phase(page, "recording");
    expect(await liveMicrophones(page)).toBe(1);
    await expect(buttons(page).first()).toContainText("1 / 15 秒");
    await buttons(page).first().click();
    await expect(status(page)).toHaveText(ready);
    expect(await liveMicrophones(page), "the microphone is switched off as soon as recording stops").toBe(0);

    await buttons(page).nth(1).click();
    await expect(status(page)).toHaveText("正在回放你的录音。");
    await expect(buttons(page).nth(1)).toHaveText("停止回放");
    await expect(status(page)).toHaveText("回放结束。再听一次示范，或重录后比较。");
    await expect(buttons(page).nth(1)).toHaveText("回放我的声音");

    await buttons(page).nth(2).click();
    await expect(status(page)).toHaveText("录音已清除。声音只在本页临时保留，不会上传。");
    await expect(buttons(page).nth(1)).toBeDisabled();
    expect(await microphoneRequests(page), "one recording, one microphone request").toBe(1);
  });

  test("a demo sound takes over from the playback, and the clip is dropped when the vowel pair changes", async ({ page }) => {
    await openApp(page);
    await record(page, 2);
    await buttons(page).nth(1).click();
    await expect(status(page)).toHaveText("正在回放你的录音。");
    await page.locator(".vowel-contrast-card").first().click();
    await expect(status(page)).toHaveText("已停止播放，录音仍保留在本页。");
    expect(await audibleClips(page), "the recording and the demo must not sound together").toBeLessThanOrEqual(1);
    await expect(page.locator(".vowel-playback-status")).toHaveText("示范播放完成。模仿两次，再录下自己，交替回听比较。");
    await expect(buttons(page).nth(1)).toBeEnabled();

    await page.locator(".vowel-pair-picker button").nth(1).click();
    await expect(status(page)).toHaveText("录音已清除。声音只在本页临时保留，不会上传。");
    await expect(buttons(page).nth(1)).toBeDisabled();
  });

  test("starting a game or hiding the tab ends the recording and releases the microphone, keeping the clip", async ({ page }) => {
    await openApp(page);
    await buttons(page).first().click();
    await phase(page, "recording");
    await page.locator("#listen-start").click();
    await expect(status(page)).toHaveText(ready);
    expect(await liveMicrophones(page)).toBe(0);

    await buttons(page).first().click(); // 重新录音
    await phase(page, "recording");
    expect(await liveMicrophones(page)).toBe(1);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(status(page)).toHaveText(ready);
    expect(await liveMicrophones(page)).toBe(0);
    await expect(buttons(page).nth(1)).toBeEnabled();
  });

  test("recording stops by itself after 15 seconds", async ({ page }) => {
    await page.clock.install();
    await openApp(page);
    await buttons(page).first().click();
    await phase(page, "recording");
    await page.clock.fastForward(14_000);
    await phase(page, "recording");
    await page.clock.fastForward(1_500);
    await expect(status(page)).toHaveText(ready);
    expect(await liveMicrophones(page)).toBe(0);
  });

  test("a refused microphone is explained, can be retried, and the demos keep working", async ({ page, context }) => {
    await context.addInitScript(() => {
      if (!navigator.mediaDevices) return;
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
    });
    await openApp(page);
    await buttons(page).first().click();
    await expect(status(page)).toHaveText("没有获得麦克风权限。请在浏览器的网站设置中允许麦克风后重试；也可以继续听示范，不必开启录音。");
    await expect(buttons(page).first()).toHaveText("开始录音");
    await expect(buttons(page).first()).toBeEnabled();
    await page.locator(".vowel-contrast-card").first().click();
    await expect(page.locator(".vowel-playback-status")).toHaveText("示范播放完成。模仿两次，再录下自己，交替回听比较。");
  });

  test("a browser that cannot record says so instead of offering dead buttons", async ({ page, context }) => {
    await context.addInitScript(() => {
      Object.defineProperty(window, "MediaRecorder", { configurable: true, value: undefined });
    });
    await openApp(page);
    await expect(status(page)).toHaveText("当前浏览器不支持网页录音。你仍可听示范；录音可尝试最新版 Safari、Chrome 或 Edge。");
    for (const index of [0, 1, 2]) await expect(buttons(page).nth(index)).toBeDisabled();
    await page.locator(".vowel-contrast-card").nth(1).click();
    await expect(page.locator(".vowel-playback-status")).toHaveText("示范播放完成。模仿两次，再录下自己，交替回听比较。");
  });
});
