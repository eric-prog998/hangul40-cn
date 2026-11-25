import { audioLog, describeAudio, expect, openApp, test } from "./support/app.ts";

test("batchim quiz leaves IME candidates alone but accepts a physical Korean key", async ({ page }) => {
  await openApp(page, "/#batchim-lesson");
  const panel = page.locator("#batchim-lesson");
  await panel.focus();
  await panel.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true });
  await expect(panel.locator(".batchim-question")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(panel.locator(".batchim-question")).toBeVisible();
  await panel.dispatchEvent("keydown", { key: "Process", code: "Digit1", keyCode: 229 });
  await panel.dispatchEvent("keydown", { key: "Process", code: "KeyF", keyCode: 229, isComposing: true });
  await expect(panel.locator(".batchim-result")).toHaveCount(0);
  // On a non-text panel, Process + a physical letter without active IME composition is an ordinary 두벌식 answer.
  await panel.dispatchEvent("keydown", { key: "Process", code: "KeyF", keyCode: 229 });
  await expect(panel.locator(".batchim-result")).toBeVisible();
  await panel.dispatchEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229 });
  await expect(panel.locator(".batchim-mode-controls span")).toHaveText("第 1 / 5 题");
  await page.keyboard.press("Enter");
  await expect(panel.locator(".batchim-mode-controls span")).toHaveText("第 2 / 5 题");
});

test("vowel comparison never plays a clip from active IME composition", async ({ page }) => {
  await openApp(page, "/#pronunciation-practice");
  const panel = page.locator("#pronunciation-practice");
  await panel.focus();
  await panel.dispatchEvent("keydown", { key: "Process", code: "KeyA", keyCode: 229, isComposing: true });
  await panel.dispatchEvent("keydown", { key: " ", code: "Space", keyCode: 229 });
  expect(await audioLog(page)).toHaveLength(0);
  await panel.dispatchEvent("keydown", { key: "Process", code: "KeyA", keyCode: 229 });
  await expect.poll(async () => (await audioLog(page)).length).toBe(1);
});

test("vowel listening quiz ignores IME candidate digits and Enter without recording an answer", async ({ page }) => {
  await openApp(page, "/#pronunciation-practice");
  await page.locator(".vowel-practice-views button").nth(1).click();
  const panel = page.locator("#vowel-listening");
  await panel.focus();
  await panel.dispatchEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229 });
  await expect(panel.locator(".vowel-challenge-intro")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(panel.locator(".vowel-challenge-choices button").first()).toBeEnabled();
  await panel.dispatchEvent("keydown", { key: "Process", code: "Digit1", keyCode: 229 });
  await panel.dispatchEvent("keydown", { key: "2", code: "Digit2", isComposing: true });
  await expect(panel.locator(".vowel-challenge-feedback")).toHaveCount(0);
  await page.keyboard.press("Digit1");
  await expect(panel.locator(".vowel-challenge-feedback")).toBeVisible();
  await panel.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true });
  await expect(panel.locator(".vowel-challenge-header > span")).toHaveText("盲听 1 / 8");
  await page.keyboard.press("Enter");
  await expect(panel.locator(".vowel-challenge-header > span")).toHaveText("盲听 2 / 8");
});

test("all 40 physical keyboard spellings select their matching name or vowel recording, once", async ({ page }) => {
  // Independent two-set layout fixture, not derived from the application's key map.
  const consonants = [
    ["ㄱ","r"],["ㄲ","R"],["ㄴ","s"],["ㄷ","e"],["ㄸ","E"],["ㄹ","f"],["ㅁ","a"],
    ["ㅂ","q"],["ㅃ","Q"],["ㅅ","t"],["ㅆ","T"],["ㅇ","d"],["ㅈ","w"],["ㅉ","W"],
    ["ㅊ","c"],["ㅋ","z"],["ㅌ","x"],["ㅍ","v"],["ㅎ","g"],
  ];
  const vowels = [
    ["ㅏ","k"],["ㅐ","o"],["ㅑ","i"],["ㅒ","O"],["ㅓ","j"],["ㅔ","p"],["ㅕ","u"],
    ["ㅖ","P"],["ㅗ","h"],["ㅘ","hk"],["ㅙ","ho"],["ㅚ","hl"],["ㅛ","y"],["ㅜ","n"],
    ["ㅝ","nj"],["ㅞ","np"],["ㅟ","nl"],["ㅠ","b"],["ㅡ","m"],["ㅢ","ml"],["ㅣ","l"],
  ];
  await openApp(page, "/#learn");
  await page.keyboard.press("Shift+Digit2");
  const lab = page.locator("#letter-keyboard-console");
  await expect(lab).toBeFocused();
  let count = 0;
  for (const [char, keys] of [...consonants, ...vowels]) {
    for (const key of keys) {
      await page.keyboard.press((key === key.toUpperCase() ? "Shift+" : "") + "Key" + key.toUpperCase());
    }
    if (["ㅗ", "ㅜ", "ㅡ"].includes(char)) await page.keyboard.press("Enter");
    await expect(lab.locator(".letter-keyboard-result strong")).toHaveText(char);
    const expected = ++count <= consonants.length ? {kind: "name", char} : {kind: "syllable", initial: "ㅇ", vowel: char};
    const log = await audioLog(page);
    expect(log, char).toHaveLength(count);
    expect(describeAudio(log.at(-1)!), char).toMatchObject(expected);
  }
  expect(count).toBe(40);
});

test("waiting for a compound silences the previous letter before showing the next one", async ({ page }) => {
  await openApp(page, "/#learn");
  await page.keyboard.press("Shift+Digit2");
  const lab = page.locator("#letter-keyboard-console");
  await expect(lab).toBeFocused();
  await page.keyboard.press("r");
  // Start from actual media playback (not just a play() request).
  await page.waitForFunction(() => window.__audioElements.some((el) => !el.paused && !el.ended && el.currentTime > 0));
  await page.keyboard.press("h");
  await expect(lab.getByRole("status")).toContainText("正在等第二键");
  expect((await audioLog(page)).map(describeAudio)).toEqual([{ kind: "name", char: "ㄱ" }]);
  // Read synchronously: polling this would pass when the old clip ends on its own.
  expect(await page.evaluate(() => window.__audioElements[0].paused)).toBe(true);
  await page.keyboard.press("k");
  await expect.poll(async () => (await audioLog(page)).map(describeAudio)).toMatchObject([
    { kind: "name", char: "ㄱ" }, { kind: "syllable", syllable: "와" },
  ]);
});
