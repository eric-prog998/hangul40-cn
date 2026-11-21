import { audioLog, confirmPendingKoreanKey, describeAudio, expect, keysFor, openApp, readListenQuestion, test } from "./support/app.ts";

test.describe("桌面 · 聚焦学习", () => {
  test("four destinations expose only the selected activity; browser history restores the view", async ({ page }) => {
    await openApp(page);
    const nav = page.getByRole("navigation", { name: "主要导航" });
    await expect(nav.getByRole("link")).toHaveText(["今天", "40 音", "练习", "复习"]);
    const welcome = page.locator("#home-day");
    await expect(welcome).toBeVisible();
    for (const id of ["my-day", "learn", "games", "daily-review", "learning-tools"]) await expect(page.locator("#" + id)).toBeHidden();
    await nav.getByRole("link", { name: "40 音" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#learn")).toBeVisible();
    await expect(welcome).toBeHidden();
    await nav.getByRole("link", { name: "练习" }).click();
    await expect(page.locator("#games")).toBeVisible();
    await expect(page.locator("#learn")).toBeHidden();
    await page.goBack();
    await expect(page.locator("#learn")).toBeVisible();
    await expect(page.locator("#games")).toBeHidden();
    await page.goForward();
    await expect(page.locator("#games")).toBeVisible();
    await nav.getByRole("link", { name: "复习" }).click();
    await expect(page.locator("#daily-review")).toBeVisible();
    await expect(page.locator("#games")).toBeHidden();
    expect(await audioLog(page), "routing alone never plays a sound").toEqual([]);
  });

  test("an old shared link survives reload, home and a returning visit without losing progress", async ({ page }) => {
    await openApp(page, "/#learn");
    await page.locator("#letter-master-ㄱ").click();
    await openApp(page, "/#batchim-lesson");
    await expect(page.locator("#batchim-lesson")).toBeVisible();
    await page.reload();
    await expect(page.locator("#batchim-lesson")).toBeVisible();
    await openApp(page, "/");
    await page.locator("#home-continue").click();
    await expect(page.locator("#batchim-lesson")).toBeVisible();
    await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "40 音" }).click();
    await expect(page.locator("#letter-master-ㄱ")).toHaveAttribute("aria-pressed", "true");
    expect(await audioLog(page)).toEqual([]);
  });

  test("a hearing question accepts Korean physical keys after routing, without IME or repeats answering", async ({ page }) => {
    await openApp(page);
    await page.keyboard.press("F2");
    const controls = page.locator("#keyboard-game-console");
    await expect(controls).toBeFocused();
    await page.keyboard.press("Enter");
    const q = await readListenQuestion(page);
    const verdict = page.locator("#game-panel-listen .game-feedback strong");
    const choice = { code: "Digit" + (q.index + 1), key: String(q.index + 1) };
    await controls.dispatchEvent("keydown", { ...choice, isComposing: true, keyCode: 229 });
    await controls.dispatchEvent("keydown", { ...choice, repeat: true });
    await expect(page.getByTestId("listen-choice-0")).toBeEnabled();
    const before = (await audioLog(page)).length;
    await page.keyboard.press("Space");
    await expect.poll(async () => (await audioLog(page)).length).toBe(before + 1);
    await expect(page.getByTestId("listen-choice-0")).toBeEnabled();
    for (const key of keysFor(q.target)) await page.keyboard.press(key);
    await confirmPendingKoreanKey(page, verdict);
    await expect(verdict).toContainText("正确！");
  });

  test("each formerly doubled onset uses a single original WAV; names, examples and silent ㅇ stay distinct", async ({ page }) => {
    await openApp(page, "/#learn");
    const card = (char: string) => page.locator(".letter-card").filter({ has: page.locator("#letter-master-" + char) });
    let expected = 0;
    for (const letter of ["ㄹ", "ㄲ", "ㄸ", "ㅃ"]) {
      const current = card(letter);
      await current.locator("summary").click();
      await current.locator(".onset-audio").click();
      await expect.poll(async () => (await audioLog(page)).length).toBe(++expected);
      const file = (await audioLog(page)).at(-1)!;
      expect(new URL(file).pathname).toContain("/consonant-human-onset/");
      expect(describeAudio(file)).toEqual({ kind: "onset", char: letter });
    }
    const initial = card("ㄱ");
    await initial.locator(".name-audio").focus();
    await page.keyboard.down("Enter");
    await page.keyboard.down("Enter"); // a held activation key must not replay the clip
    await page.keyboard.up("Enter");
    await expect.poll(async () => (await audioLog(page)).length).toBe(++expected);
    for (const [selector, audio] of [[".name-audio", { kind: "name", char: "ㄱ" }], [".syllable-audio", { kind: "syllable", syllable: "가" }]] as const) {
      await initial.locator(selector).click();
      await expect.poll(async () => (await audioLog(page)).length).toBe(++expected);
      expect(describeAudio((await audioLog(page)).at(-1)!)).toMatchObject(audio);
    }
    const silent = card("ㅇ");
    await expect(silent.locator(".onset-audio")).toHaveCount(0);
    await expect(silent.locator(".silent-initial")).toContainText(/不发音|无声|不发声|静音/);
    expect((await audioLog(page)).length).toBe(expected);
    await initial.locator(".letter-audio-feedback").click();
    await expect(page.locator("#audio-guide")).toBeVisible();
    await expect(page.locator("#audio-selection")).toHaveValue("syllable-ac00");
    await expect(page.locator("#audio-guide .audio-guide-badges")).toContainText("待人工听审");
    expect((await audioLog(page)).length, "opening feedback does not play the clip again").toBe(expected);
  });
});
