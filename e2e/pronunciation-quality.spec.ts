import { audioLog, expect, openApp, test } from "./support/app";
import { readFileSync } from "node:fs";

const trimRevisions = JSON.parse(readFileSync(new URL("../data/core-tail-trims.json", import.meta.url), "utf8")) as Record<string, string>;

const syllablePath = (text: string) => "/audio/hangul-natural/s-" + text.codePointAt(0)!.toString(16) + ".mp3";
const sharedRecording = /同一|相同|同一份|同一段|重复录音|共用/;

test("the two quarantined combinations cannot play as teaching models, but the learner can choose a safe contrast by keyboard", async ({page}) => {
  await openApp(page, "/#builder");
  const panel = page.locator("#builder");
  const result = panel.locator(".syllable-result");
  const expected: string[] = [];
  for (const [initial, syllable, fallback] of [["ㅅ", "쇼", "사"], ["ㅆ", "쑈", "싸"]]) {
    await panel.getByLabel("选择辅音").selectOption(initial);
    await panel.getByLabel("选择元音").selectOption("ㅛ");
    await expect(result.locator("strong")).toHaveText(syllable);
    await expect(result).toBeDisabled();
    await expect(result).not.toContainText("标准原音");
    await expect(panel).toContainText(sharedRecording);
    // Native disabled controls ignore clicks even if invoked from an accessibility tool.
    await result.evaluate((button: HTMLButtonElement) => button.click());
    const alternative = panel.getByRole("button", {name: new RegExp(fallback)});
    await alternative.focus();
    await expect(alternative).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(result.locator("strong")).toHaveText(fallback);
    expect((await audioLog(page)).map(src => new URL(src).pathname)).toEqual(expected);
    await expect(result).toBeFocused();
    await page.keyboard.press("Enter");
    expected.push(syllablePath(fallback));
    await expect.poll(async () => (await audioLog(page)).map(src => new URL(src).pathname)).toEqual(expected);
  }
});

test("the syllable builder plays the isolated 네 recording, not the vocabulary word for yes", async ({page}) => {
  await openApp(page, "/#builder");
  const panel = page.locator("#builder");
  await panel.getByLabel("选择辅音").selectOption("ㄴ");
  await panel.getByLabel("选择元音").selectOption("ㅔ");
  await expect(panel.locator(".syllable-result strong")).toHaveText("네");
  await panel.locator(".syllable-result").click();
  await expect.poll(async () => (await audioLog(page)).map(src => new URL(src).pathname)).toEqual([syllablePath("네")]);
  // Changing the builder should not change which recording vocabulary learners hear.
  await page.evaluate(() => { location.hash = "phrase-tab-word"; });
  const word = page.locator(".phrase-grid article").filter({has: page.locator("#phrase-block-toggle-word-yes")});
  await word.locator(".phrase-audio").click();
  await expect.poll(async () => (await audioLog(page)).map(src => new URL(src).pathname))
    .toEqual([syllablePath("네"), "/audio/phrases/word-yes.mp3"]);
  expect(new URL((await audioLog(page)).at(-1)!).searchParams.get("v")).toBe("21");
});

test("playing revised 가 requests its new cache key and retrieves the exact audited bytes", async ({page}) => {
  await openApp(page, "/#builder");
  const panel = page.locator("#builder");
  await panel.getByLabel("选择辅音").selectOption("ㄱ");
  await panel.getByLabel("选择元音").selectOption("ㅏ");
  await panel.locator(".syllable-result").click();
  const expected = trimRevisions["/audio/hangul-natural/s-ac00.mp3"];
  await expect.poll(async () => (await audioLog(page)).map(src => new URL(src).pathname + new URL(src).search))
    .toEqual([syllablePath("가") + "?v=" + expected.slice(0, 16)]);
  // Check the actual bytes served at the played URL, not just the existence of a query parameter.
  const digest = await page.evaluate(async () => {
    const response = await fetch(window.__audioLog[0]);
    if (!response.ok) throw Error("Revised audio HTTP " + response.status);
    const buffer = await crypto.subtle.digest("SHA-256", await response.arrayBuffer());
    return Array.from(new Uint8Array(buffer), x => x.toString(16).padStart(2, "0")).join("");
  });
  expect(digest).toBe(expected);
});

test("the source guide discloses the shared recording on both entries without suggesting that they are normally homophones", async ({page}) => {
  await openApp(page, "/#audio-guide");
  const panel = page.locator("#audio-guide");
  await panel.locator("#audio-category").selectOption("syllable");
  for (const syllable of ["쇼","쑈"]) {
    await panel.locator("#audio-search").fill(syllable);
    await expect(panel.locator("#audio-selection")).toHaveValue("syllable-"+syllable.codePointAt(0)!.toString(16));
    const warning = panel.locator(".audio-guide-explanation");
    await expect(warning).toContainText(sharedRecording);
    await expect(warning).toContainText("쇼");
    await expect(warning).toContainText("쑈");
    expect(await audioLog(page)).toEqual([]);
  }
});
