import type { Page } from "@playwright/test";
import { audioLog, describeAudio, expect, openApp, syllableOf, test } from "./support/app";

declare global {
  interface Window { __letterEvents: { event: string; source: string; previousEnded?: boolean }[] }
}

const lab = (page: Page) => page.locator("#letter-keyboard-console");
const clips = async (page: Page) => (await audioLog(page)).map((src) => syllableOf(describeAudio(src))?.syllable ?? src);
async function start(page: Page) {
  await openApp(page, "/#learn");
  await page.keyboard.press("Shift+Digit2");
  await expect(lab(page)).toBeFocused();
}

async function recordMediaEvents(page: Page) {
  await page.evaluate(() => {
    window.__letterEvents = [];
    const play = HTMLMediaElement.prototype.play;
    let previousEnded: (() => boolean) | undefined;
    HTMLMediaElement.prototype.play = function () {
      const source = this.currentSrc || this.src;
      window.__letterEvents.push({ event: "play", source, previousEnded: previousEnded?.() });
      previousEnded = () => this.ended;
      this.addEventListener("ended", () => window.__letterEvents.push({ event: "ended", source }), { once: true });
      return play.call(this);
    };
  });
}
async function timeline(page: Page) {
  const events = await page.evaluate(() => [...window.__letterEvents]);
  return events.map(({ event, source }) => event + ":" + syllableOf(describeAudio(source))?.syllable);
}

// At natural completion, the browser can deliver a pause event with ended=true
// before delivering the ended event. Measure the real media state at the instant
// the next clip starts, not the relative timing of two independent callbacks.
async function expectFinishedPairs(page: Page, expected: string[]) {
  await expect.poll(async () => (await timeline(page)).filter((s) => s.startsWith("ended:")))
    .toEqual(expected.map((s) => "ended:" + s));
  expect(await clips(page)).toEqual(expected);
  expect(await page.evaluate(() => window.__letterEvents.filter((e) => e.event === "play").slice(1).map((e) => e.previousEnded)))
    .toEqual(expected.slice(1).map(() => true));
}

test("all seven two-key vowels play only the combined sound by default", async ({ page }) => {
  await start(page);
  const expected: string[] = [];
  for (const [first, second, jamo, spoken] of [
    ["H", "K", "ㅘ", "와"], ["H", "O", "ㅙ", "왜"], ["H", "L", "ㅚ", "외"],
    ["N", "J", "ㅝ", "워"], ["N", "P", "ㅞ", "웨"], ["N", "L", "ㅟ", "위"], ["M", "L", "ㅢ", "의"],
  ]) {
    await page.keyboard.press("Key" + first);
    await expect(lab(page).getByRole("status")).toContainText("正在等第二键");
    expect(await clips(page)).toEqual(expected);
    await page.keyboard.press("Key" + second);
    await expect(lab(page).locator(".letter-keyboard-result strong")).toHaveText(jamo);
    expected.push(spoken);
    await expect.poll(() => clips(page)).toEqual(expected);
  }
});

test("single prefix can be confirmed now or after the stated wait; replays do not leave a timer", async ({ page }) => {
  await start(page);
  await page.clock.install();
  await page.keyboard.press("KeyH");
  await page.keyboard.press("Enter");
  await expect.poll(() => clips(page)).toEqual(["오"]);
  await page.clock.fastForward(1600);
  expect(await clips(page)).toEqual(["오"]);
  await page.keyboard.press("KeyM");
  await page.clock.fastForward(1600);
  await expect.poll(() => clips(page)).toEqual(["오", "으"]);
  await page.keyboard.press("KeyN");
  await lab(page).getByRole("button", { name: "重播 ㅜ" }).click();
  await page.clock.fastForward(1600);
  await expect.poll(() => clips(page)).toEqual(["오", "으", "우"]);
});

test("an unrelated key replaces a pending prefix, and a repeated prefix starts a fresh composition", async ({ page }) => {
  await start(page);
  await page.clock.install();
  await page.keyboard.press("KeyH");
  await page.keyboard.press("KeyR");
  await expect.poll(async () => (await audioLog(page)).map(describeAudio)).toEqual([{ kind: "name", char: "ㄱ" }]);
  await page.clock.fastForward(1700);
  expect(await audioLog(page)).toHaveLength(1);
  await page.keyboard.press("KeyH");
  await page.clock.fastForward(800);
  await page.keyboard.press("KeyH");
  await page.clock.fastForward(800);
  expect(await audioLog(page)).toHaveLength(1);
  await page.keyboard.press("KeyK");
  await expect.poll(async () => (await clips(page)).slice(1)).toEqual(["와"]);
});

test("changing modes, cancelling, leaving the panel or scene, or blurring the window drops pending audio", async ({ page }) => {
  await start(page);
  await page.clock.install();
  for (const action of ["Digit2", "Digit4", "Digit4", "Escape", "Backspace", "focus-out", "window-blur", "scene"]) {
    await lab(page).focus();
    await page.keyboard.press("KeyH");
    // In split mode the intended first sound was already requested.
    const before = await clips(page);
    if (action === "focus-out") await page.locator("#letter-tab-consonants").focus();
    else if (action === "window-blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else if (action === "scene") {
      await page.evaluate(() => { window.location.hash = "starter"; });
      await expect(page.locator("#learn")).toBeHidden();
    } else await page.keyboard.press(action);
    await page.clock.fastForward(1600);
    expect(await clips(page), action).toEqual(before);
  }
});

test("split listening is opt-in: hardware and on-screen keys both play the prefix then the result", async ({ page }) => {
  await start(page);
  await recordMediaEvents(page);
  const split = lab(page).getByRole("button", { name: "4 拆开听" });
  await expect(split).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Digit4");
  await expect(split).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("KeyH");
  await expect.poll(() => clips(page)).toEqual(["오"]);
  await page.keyboard.press("KeyK");
  await expectFinishedPairs(page, ["오", "와"]);
  await lab(page).locator("summary").click();
  await lab(page).getByRole("button", { name: "N，ㅜ" }).click();
  await expect.poll(() => clips(page)).toEqual(["오", "와", "우"]);
  await lab(page).getByRole("button", { name: "L，ㅣ" }).click();
  await expectFinishedPairs(page, ["오", "와", "우", "위"]);
});

test("turning split mode off while the first clip plays never starts the queued result", async ({ page }) => {
  await start(page);
  await recordMediaEvents(page);
  await page.keyboard.press("Digit4");
  await page.keyboard.press("KeyH");
  await page.keyboard.press("KeyK");
  await expect(lab(page).locator(".letter-keyboard-result strong")).toHaveText("ㅘ");
  expect(await timeline(page)).toEqual(["play:오"]);
  await page.keyboard.press("Digit4");
  // Wait until the first clip has really completed, when stale code would start the second.
  await expect.poll(() => timeline(page)).toEqual(["play:오", "ended:오"]);
  expect(await clips(page)).toEqual(["오"]);
});
