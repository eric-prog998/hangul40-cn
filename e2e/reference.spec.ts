import { audioLog, describeAudio, expect, lastAudio, openApp, syllableOf, test } from "./support/app.ts";
import type { Page } from "@playwright/test";

/** The clips played since `from`, described by what they stand for. */
async function clipsSince(page: Page, from: number) {
  return (await audioLog(page)).slice(from).map((src) => {
    const clip = describeAudio(src);
    return clip.kind === "onset" ? `onset ${clip.char}` : clip.kind === "syllable" ? `syllable ${clip.syllable}` : clip.kind === "phrase" ? `phrase ${clip.phrase.id}` : clip.kind;
  });
}
const playedSoFar = async (page: Page) => (await audioLog(page)).length;

test.describe("起音与音节对照器", () => {
  const consonant = (page: Page) => page.locator(".onset-lab-controls select").nth(0);
  const vowel = (page: Page) => page.locator(".onset-lab-controls select").nth(1);
  const demo = (page: Page) => page.locator(".onset-lab-demo button");
  const sequence = (page: Page) => page.locator(".onset-lab-actions button");
  const status = (page: Page) => page.locator(".onset-lab-actions p");

  test("the onset, the full syllable and the ordered comparison each play exactly what they announce", async ({ page }) => {
    await openApp(page);
    await consonant(page).selectOption("ㄴ");
    await vowel(page).selectOption("ㅗ");
    await expect(demo(page).nth(1).locator("strong")).toHaveText("노");

    await demo(page).nth(0).click();
    await expect(status(page)).toHaveText("刚才只有 ㄴ 的起音，没有读出元音。");
    expect(await lastAudio(page)).toEqual({ kind: "onset", char: "ㄴ" });

    await demo(page).nth(1).click();
    await expect(status(page)).toHaveText("刚才是完整音节 노，其中包含元音 ㅗ。");
    expect(await lastAudio(page)).toMatchObject({ kind: "syllable", syllable: "노" });

    const before = await playedSoFar(page);
    await sequence(page).click();
    await expect(sequence(page)).toBeDisabled();
    await expect(status(page)).toHaveText("ㄴ 起音 → 노 完整音节；后者才包含 ㅗ。");
    await expect(sequence(page)).toBeEnabled();
    expect(await clipsSince(page, before)).toEqual(["onset ㄴ", "syllable 노"]);
  });

  test("ㅇ has no onset to play: it is explained, and the comparison goes straight to the syllable", async ({ page }) => {
    await openApp(page);
    await consonant(page).selectOption("ㅇ");
    await vowel(page).selectOption("ㅜ");
    const before = await playedSoFar(page);
    await demo(page).nth(0).click();
    await expect(status(page)).toHaveText("ㅇ 作初声时没有辅音声；右边完整音节从元音直接开始。");
    await sequence(page).click();
    await expect(status(page)).toHaveText("初声静音 → 우 完整音节；后者才包含 ㅜ。");
    expect(await clipsSince(page, before)).toEqual(["syllable 우"]);
  });

  test("changing the consonant in the middle of a comparison stops it; the old syllable never plays", async ({ page }) => {
    await openApp(page);
    await consonant(page).selectOption("ㅁ");
    const before = await playedSoFar(page);
    await sequence(page).click();
    await expect(sequence(page)).toBeDisabled();
    await consonant(page).selectOption("ㅂ");
    await expect(status(page)).toHaveText("已换辅音；可分别试听或做顺序对照。");
    await expect(sequence(page)).toBeEnabled();
    await page.waitForTimeout(1_500); // longer than the pause between the two halves
    expect(await clipsSince(page, before)).toEqual(["onset ㅁ"]);
    await expect(status(page)).toHaveText("已换辅音；可分别试听或做顺序对照。");
  });
});

test.describe("拼音节与字块", () => {
  test("the syllable builder joins the chosen letters and plays that syllable", async ({ page }) => {
    await openApp(page);
    const result = page.locator(".syllable-result");
    // 네 is also an everyday word ("yes"); the site may play that word's recording for it.
    for (const [initial, vowel, syllable] of [["ㅎ", "ㅘ", "화"], ["ㅇ", "ㅢ", "의"], ["ㅉ", "ㅞ", "쮀"], ["ㄴ", "ㅔ", "네"], ["ㄱ", "ㅏ", "가"]]) {
      await page.getByLabel("选择辅音", { exact: true }).selectOption(initial);
      await page.getByLabel("选择元音", { exact: true }).selectOption(vowel);
      await expect(result.locator("strong")).toHaveText(syllable);
      await result.click();
      await expect.poll(async () => syllableOf(await lastAudio(page))).toEqual({ syllable, initial, vowel });
    }
  });

  test("the three block examples show their parts, play their own sound and lead on to the final-consonant lesson", async ({ page }) => {
    await openApp(page);
    const lab = page.locator(".block-lab");
    const tabs = lab.locator(".block-example-tabs button");
    await expect(tabs).toHaveCount(3);
    const expected = [
      { parts: ["ㄱ", "ㅏ"], clip: "syllable 가" },
      { parts: ["ㅇ", "ㅏ"], clip: "syllable 아" },
      { parts: ["ㅂ", "ㅏ", "ㅂ"], clip: "phrase word-meal" }, // 밥 has a final consonant, so the whole word is played
    ];
    for (const [index, example] of expected.entries()) {
      await tabs.nth(index).click();
      await expect(lab.locator(".block-equation > div strong")).toHaveText(example.parts);
      const before = await playedSoFar(page);
      await lab.locator(".block-result").click();
      await expect.poll(() => clipsSince(page, before)).toEqual([example.clip]);
    }
    await lab.locator(".phrase-batchim-link").click();
    await expect(page.locator("#batchim-lesson")).toBeFocused();
    await expect(page.locator("#batchim-lesson")).toBeInViewport();
  });
});

test.describe("元音口型对比", () => {
  const section = (page: Page) => page.locator("#pronunciation-practice");
  const cards = (page: Page) => page.locator(".vowel-contrast-card");
  const status = (page: Page) => page.locator(".vowel-playback-status");
  const done = "示范播放完成。模仿两次，再录下自己，交替回听比较。";

  test("A, B and the A → B order play the pair on show, alone or inside a ㄱ syllable", async ({ page }) => {
    await openApp(page);
    let before = await playedSoFar(page);
    await cards(page).nth(0).click();
    await expect(status(page)).toHaveText(done);
    await cards(page).nth(1).click();
    await expect(status(page)).toHaveText(done);
    expect(await clipsSince(page, before)).toEqual(["syllable 어", "syllable 오"]);

    await section(page).getByRole("button", { name: "放进 ㄱ 音节" }).click();
    before = await playedSoFar(page);
    await section(page).getByRole("button", { name: "顺序听 A → B" }).click();
    await expect(status(page)).toHaveText(done);
    expect(await clipsSince(page, before)).toEqual(["syllable 거", "syllable 고"]);

    // Another pair brings its own two sounds.
    await page.locator(".vowel-pair-picker button").nth(1).click();
    before = await playedSoFar(page);
    await section(page).getByRole("button", { name: "顺序听 A → B" }).click();
    await expect(status(page)).toHaveText(done);
    expect(await clipsSince(page, before)).toEqual(["syllable 그", "syllable 구"]);
  });

  test("with the section focused, A / B / Space play and Esc stops", async ({ page }) => {
    await openApp(page);
    await section(page).focus();
    let before = await playedSoFar(page);
    await page.keyboard.press("KeyB");
    await expect(status(page)).toHaveText(done);
    expect(await clipsSince(page, before)).toEqual(["syllable 오"]);

    before = await playedSoFar(page);
    await page.keyboard.press("Space");
    await expect(status(page)).toHaveText(done);
    expect(await clipsSince(page, before)).toEqual(["syllable 어", "syllable 오"]);

    before = await playedSoFar(page);
    await page.keyboard.press("Space");
    await expect(status(page)).toContainText("正在播放 A");
    await page.keyboard.press("Escape");
    await expect(status(page)).toHaveText("对比播放已停止，可重新试听。");
    await page.waitForTimeout(1_500);
    expect(await clipsSince(page, before), "B must not start after Esc").toEqual(["syllable 어"]);
  });
});

test.describe("分享", () => {
  test("the share button copies a short invitation with the page address", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openApp(page);
    await page.locator(".header-share").click();
    await expect(page.locator(".share-toast")).toHaveText("分享链接已复制");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("韩语 40 音");
    expect(copied.trim().endsWith(new URL(page.url()).origin + "/")).toBe(true);
  });
});
