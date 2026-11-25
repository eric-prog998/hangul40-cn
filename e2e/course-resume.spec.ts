import { audioLog, expect, goToTraining, lastAudio, openApp, readListenQuestion, test } from "./support/app.ts";

for (const [initial, selected, section, detail] of [
  ["phrase-tab-sentence", "phrase-tab-word", "phrases", "word"],
  ["game-tab-typing", "game-tab-shadow", "games", "shadow"],
] as const) {
  test(`changing the shared ${initial} link keeps the new tab on reload, back and forward`, async ({ page }) => {
    await openApp(page, "/#top");
    await page.evaluate(id => { location.hash = id; }, initial);
    const first = page.locator("#" + initial);
    const next = page.locator("#" + selected);
    await expect(first).toBeFocused();
    const historyBefore = await page.evaluate(() => history.length);
    if (section === "phrases") await page.keyboard.press("ArrowLeft");
    else await next.click();
    await expect(next).toHaveAttribute("aria-selected", "true");
    const hash = "#" + selected;
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(hash);
    expect(await page.evaluate(() => history.length)).toBe(historyBefore);
    const sharedUrl = page.url();
    await page.evaluate(() => Object.defineProperty(navigator, "share", { configurable: true,
      value: async (data: ShareData) => { document.documentElement.dataset.sharedPractice = data.url; },
    }) && undefined);
    await page.getByRole("button", { name: "分享这个韩语学习网页" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-shared-practice", sharedUrl);

    await page.reload();
    await expect(next).toHaveAttribute("aria-selected", "true");
    const bookmark = await page.evaluate(() => JSON.parse(localStorage.getItem("hangul-last-study-v48") || "{}"));
    expect(bookmark).toMatchObject({ scene: section, detail });
    await page.goBack();
    await expect(page.locator("#top")).toBeVisible();
    await page.goForward();
    await expect(next).toBeFocused();
    await expect(next).toHaveAttribute("aria-selected", "true");
    expect(page.url()).toBe(sharedUrl);
    expect(await audioLog(page)).toEqual([]);
  });
}

test("a course bookmark still works within the page if persistent writes fail", async ({ page }) => {
  await page.addInitScript(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "hangul-last-study-v48") throw new DOMException("Full", "QuotaExceededError");
      return save.call(this, key, value);
    };
  });
  await openApp(page);
  await page.locator("#home-continue").click();
  await expect(page.locator("#learn .letter-card")).toHaveCount(6);
  await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "今天" }).click();
  await expect(page.locator("#top")).toContainText("继续学「核心元音 6 音」");
  await page.locator("#home-continue").click();
  await expect(page.locator("#learn .letter-card")).toHaveCount(6);
  expect(await page.evaluate(() => localStorage.getItem("hangul-last-study-v48"))).toBeNull();
});

test("a keyboard side trip and a quiz preserve the six-vowel course, markings and filter", async ({ page }) => {
  await openApp(page);
  await page.locator("#home-continue").focus();
  await page.keyboard.press("Enter");
  const cards = page.locator("#learn .letter-card");
  await expect(cards).toHaveCount(6);
  await page.locator("#letter-master-ㅏ").click();
  const filter = page.locator("#letter-filter-learning");
  await filter.click();
  await expect(cards).toHaveCount(5);

  await page.keyboard.press("Shift+Digit2");
  await expect(page.locator("#letter-keyboard-console")).toBeFocused();
  await page.keyboard.press("j"); // ㅓ belongs to the current course.
  await expect.poll(() => lastAudio(page)).toMatchObject({ kind: "syllable", syllable: "어" });
  await page.keyboard.press("r"); // ㄱ is outside both the course and the current tab.
  await expect.poll(() => lastAudio(page)).toMatchObject({ kind: "name", char: "ㄱ" });
  await expect(page.locator("#letter-tab-vowels")).toHaveAttribute("aria-selected", "true");
  await expect(filter).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(5);

  await goToTraining(page);
  await page.keyboard.press("Enter");
  const question = await readListenQuestion(page);
  await page.keyboard.press(String(question.index + 1));
  await expect(page.locator("#game-panel-listen .game-feedback strong")).toContainText("正确！");
  // Reload the side trip too: it must not overwrite the saved course during hydration.
  await page.reload();
  await expect(page.locator("#games")).toBeVisible();
  await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "今天" }).click();
  await expect(page.locator("#top")).toContainText("继续学「核心元音 6 音」");
  await page.locator("#home-continue").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#learn")).toBeVisible();
  await expect(filter).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(5);
  await expect(page.locator("#letter-master-ㅏ")).toHaveCount(0);
  await filter.click();
  await expect(page.locator("#letter-master-ㅏ")).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /核心元音 6 音.*退出本课/ }).click();
  await expect(cards).toHaveCount(21);
  await goToTraining(page);
  await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "今天" }).click();
  await expect(page.locator("#top")).toContainText("上次打开了「闯关训练」");
  await page.locator("#home-continue").click();
  await expect(page.locator("#games")).toBeVisible();
});

test("a v48 course bookmark without filter metadata resumes from a shared practice link", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => localStorage.setItem("hangul-last-study-v48", JSON.stringify({
    scene: "learn", detail: "consonants", subset: "advanced-consonants",
  })));
  // Changing only the hash would keep the pre-seed React tree alive.
  await page.goto("about:blank");
  await openApp(page, "/#games");
  await expect(page.locator("#games")).toBeVisible();
  await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "今天" }).click();
  await expect(page.locator("#top")).toContainText("继续学「进阶辅音 9 音」");
  await page.locator("#home-continue").click();
  await expect(page.locator("#learn .letter-card")).toHaveCount(9);
  await expect(page.locator("#letter-filter-learning")).toHaveAttribute("aria-pressed", "false");
});
