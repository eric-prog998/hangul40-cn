import { audioLog, describeAudio, expect, openApp, test } from "./support/app.ts";

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
