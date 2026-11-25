import type { Page } from "@playwright/test";
import { audioLog, audibleClips, expect, keysFor, openApp, test } from "./support/app.ts";
import { beginDay, emptyBook, gradeDialogue, gradeLetter, MY_DAY_KEY } from "../app/my-day-state.ts";

declare global { interface Window { __daySpeechAttempts: number } }

test("all three situations can be revisited; a new line explicitly uses a Korean local voice and stops on exit", async ({page}) => {
  await page.clock.setFixedTime(new Date("2026-11-21T12:00:00+09:00"));
  let book = beginDay(emptyBook(), "2026-11-21", []);
  while (book.session!.marks.length < book.session!.cards.length) book = gradeLetter(book,"good",false);
  book = gradeDialogue(book,"good");
  await page.addInitScript(({key,raw}) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key,raw);
    const log: string[] = [];
    const voice = { name:"Fixture local Korean", lang:"ko-KR", localService:true };
    Object.defineProperty(window, "SpeechSynthesisUtterance", {configurable:true,value:class {constructor(public text:string) {}}});
    Object.defineProperty(window, "speechSynthesis", {configurable:true,value:Object.assign(new EventTarget(),{
      getVoices: () => [voice],
      speak(u:{text:string;voice:unknown}) { log.push(u.voice === voice ? u.text : "INVALID VOICE"); document.documentElement.dataset.fixtureSpeech=JSON.stringify(log); },
      cancel() { if (log.length) document.documentElement.dataset.fixtureCancelled="yes"; }
    })});
  },{key:MY_DAY_KEY,raw:JSON.stringify(book)});
  await openApp(page,"/#my-day");
  const finish = page.getByTestId("day-finish");
  for (const title of ["没听懂，请再说一遍","餐厅点餐"]) {
    await finish.getByRole("button",{name:title}).click();
    await expect(page.getByTestId("day-dialogue").getByRole("heading",{name:title})).toBeVisible();
    expect(await audioLog(page)).toHaveLength(0);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Digit2");
    await expect(finish).toBeVisible();
  }
  await finish.getByRole("button",{name:"便利店结账"}).click();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-fixture-speech",JSON.stringify(["봉투 필요하세요?"]));
  await page.locator("#day-pause").click();
  await expect(page.locator("html")).toHaveAttribute("data-fixture-cancelled","yes");
});

const letter = (page: Page) => page.getByTestId("day-letter-card");
const dialogue = (page: Page) => page.getByTestId("day-dialogue");
const good = (page: Page) => page.getByTestId("day-letter-good");
const firstDay = new Date("2026-11-21T12:00:00+09:00");

test("two open day lessons display a grade once and can resume from either tab", async ({ page, context }) => {
  await page.clock.setFixedTime(firstDay);
  await openApp(page, "/#my-day");
  const position = (p: Page) => p.locator("#my-day .day-eyebrow span");
  await expect(position(page)).toHaveText("1 / 6");
  const other = await context.newPage();
  await other.clock.setFixedTime(firstDay);
  await openApp(other, "/#my-day");
  await expect(position(other)).toHaveText("1 / 6");
  await page.getByTestId("day-letter-reveal").click();
  await page.getByTestId("day-letter-good").click();
  await expect(position(other)).toHaveText("2 / 6");
  await other.getByTestId("day-letter-reveal").click();
  await other.getByTestId("day-letter-again").click();
  await expect(position(page)).toHaveText("3 / 6");
  await page.reload();
  await expect(position(page)).toHaveText("3 / 6");
});

test("a blocked notebook write keeps the graded card when pausing and resuming in the same tab", async ({ page }) => {
  await page.clock.setFixedTime(firstDay);
  await page.addInitScript(key => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) throw new DOMException("Full", "QuotaExceededError");
      return write.call(this, k, v);
    };
  }, MY_DAY_KEY);
  await openApp(page, "/#my-day");
  await page.getByTestId("day-letter-reveal").click();
  await page.getByTestId("day-letter-good").click();
  await expect(page.locator("#my-day .day-notice")).toBeVisible();
  await page.locator("#day-pause").click();
  await page.locator("#home-day").click();
  await expect(page.locator("#my-day .day-eyebrow span")).toHaveText("2 / 6");
  expect(await page.evaluate(key => localStorage.getItem(key), MY_DAY_KEY)).toBeNull();
});

async function startFromHome(page: Page) {
  await openApp(page);
  await expect(page.locator("#top")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#my-day")).toBeVisible();
}

/** The bounded loop also catches a stalled card or an accidental skip/repeat. */
async function finishLetters(page: Page) {
  const visited: string[] = [];
  for (let i = 0; i < 6; i++) {
    const card = letter(page);
    await expect(card).toBeFocused();
    const skill = await card.getAttribute("data-skill");
    if (skill === "keys") {
      const prompt = (await page.getByTestId("day-letter-prompt").innerText()).match(/[ㄱ-ㅎㅏ-ㅣ]/u)?.[0];
      if (!prompt) throw new Error("The keyboard practice does not show which jamo to enter.");
      for (const key of keysFor(prompt)) await page.keyboard.press(key);
      await page.keyboard.press("Enter");
      await expect(good(page)).toBeEnabled();
    } else if (skill === "listen") {
      const count = (await audioLog(page)).length;
      await page.keyboard.press("Space");
      await expect.poll(async () => (await audioLog(page)).length).toBe(count + 1);
      // The media ended flag can flip before WebKit delivers its completion
      // callback. Learners see enabled choices only after that callback.
      await expect(card.getByRole("group", {name:"选择听到的音节"}).getByRole("button").first()).toBeEnabled();
      await page.keyboard.press("Digit1");
    } else {
      expect(skill).toBe("read");
      await page.keyboard.press("Enter");
      await expect(good(page)).toBeEnabled();
    }
    visited.push(skill!);
    // A listen choice may deliberately mark a miss. Do not override it as good.
    await expect(page.getByTestId("day-letter-again")).toBeEnabled();
    await page.keyboard.press(skill === "listen" ? "Digit1" : "Digit2");
  }
  await expect(dialogue(page)).toBeVisible();
  return visited;
}

test("a Mac learner can finish the entire day by keyboard and recall the preceding scene on another date", async ({ page }) => {
  await page.clock.setFixedTime(firstDay);
  await page.addInitScript(() => {
    // This Mac has voices, but no local Korean voice: it must not pronounce
    // Korean with English or silently switch to a network speech service.
    window.__daySpeechAttempts = 0;
    const synth = Object.assign(new EventTarget(), {
      getVoices: () => [
        { name: "Fixture English", lang: "en-US", localService: true },
        { name: "Fixture online", lang: "ko-KR", localService: false },
      ],
      cancel() {}, speak() { window.__daySpeechAttempts++; },
    });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synth });
  });
  await startFromHome(page);
  expect(await audioLog(page), "entering the day must not start audio").toEqual([]);
  const skills = await finishLetters(page);
  expect(new Set(skills)).toEqual(new Set(["read", "listen", "keys"]));
  await expect(dialogue(page)).toHaveAttribute("data-recall", "false");
  const count = (await audioLog(page)).length;
  await page.keyboard.press("Space");
  await expect(dialogue(page)).toContainText("韩语语音");
  expect(await page.evaluate(() => window.__daySpeechAttempts)).toBe(0);
  await expect(page.getByTestId("day-dialogue-good")).toBeHidden();
  await page.keyboard.press("Enter"); // Learner can speak off-mic first; no microphone required.
  await expect(page.getByTestId("day-dialogue-good")).toBeEnabled();
  await page.keyboard.press("Digit2");
  await expect(page.getByTestId("day-finish")).toBeVisible();
  expect(await audioLog(page)).toHaveLength(count);
  await page.reload();
  await expect(page.getByTestId("day-finish")).toBeVisible();

  // A returning learner opens a fresh page in the same browser profile.
  // Keep persisted storage, not the previous tab's simulated clock/history.
  const nextVisit = await page.context().newPage();
  await page.close();
  await nextVisit.clock.setFixedTime(new Date("2026-11-22T12:00:00+09:00"));
  await startFromHome(nextVisit);
  await finishLetters(nextVisit);
  await expect(dialogue(nextVisit)).toHaveAttribute("data-recall", "true");
  await nextVisit.keyboard.press("Enter");
  await expect(nextVisit.getByTestId("day-dialogue-good")).toBeEnabled();
  await nextVisit.keyboard.press("Digit2");
  await expect(dialogue(nextVisit)).toHaveAttribute("data-recall", "false");
});

test("pause, reload and an explicitly saved free-study bookmark remain independent", async ({ page }) => {
  await page.clock.setFixedTime(firstDay);
  await openApp(page, "/#learn");
  await page.locator("#letter-master-ㄱ").click();
  await expect(page.locator("#letter-master-ㄱ")).toHaveAttribute("aria-pressed", "true");
  const bookmark = await page.evaluate(() => localStorage.getItem("hangul-last-study-v48"));
  expect(bookmark).not.toBeNull();
  await startFromHome(page);
  await expect(letter(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Digit1");
  const nextPrompt = await page.getByTestId("day-letter-prompt").innerText();
  await page.locator("#day-pause").click();
  await expect(page.locator("#top")).toBeVisible();
  await page.reload();
  await page.locator("#home-day").click();
  await expect(page.getByTestId("day-letter-prompt")).toHaveText(nextPrompt);
  expect(await page.evaluate(() => localStorage.getItem("hangul-last-study-v48"))).toBe(bookmark);
  await page.keyboard.press("Space");
  await expect.poll(() => audibleClips(page)).toBe(1);
  await page.locator("#day-pause").click();
  await expect.poll(() => audibleClips(page)).toBe(0);
  await page.locator("#home-continue").click();
  await expect(page.locator("#learn")).toBeVisible();
  await expect(page.locator("#letter-master-ㄱ")).toHaveAttribute("aria-pressed", "true");
});

async function openKeyboardCard(page: Page) {
  await page.clock.setFixedTime(firstDay);
  let book = beginDay(emptyBook(), "2026-11-21", []);
  while (book.session!.cards[book.session!.marks.length].skill !== "keys") book = gradeLetter(book, "good", false);
  await page.addInitScript(([key, raw]) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
  }, [MY_DAY_KEY, JSON.stringify(book)]);
  await openApp(page, "/#my-day");
  await expect(letter(page)).toHaveAttribute("data-skill", "keys");
}

test("a revealed key hint survives pausing, reloading and opening a second lesson tab", async ({page, context}) => {
  await openKeyboardCard(page);
  await letter(page).press("Enter");
  await expect(good(page)).toBeDisabled();
  await page.locator("#day-pause").click();
  await page.locator("#home-day").click();
  await expect(page.getByTestId("day-letter-feedback")).toBeVisible({timeout:3000});
  await page.reload();
  await expect(good(page)).toBeDisabled();
  const second = await context.newPage();
  await second.clock.setFixedTime(firstDay);
  await openApp(second, "/#my-day");
  await expect(good(second)).toBeDisabled();
  await second.getByTestId("day-letter-again").click();
  await expect(dialogue(page)).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).session.marks.at(-1).result, MY_DAY_KEY)).toBe("again");
});

test("reloading after two successful examples retains replay evidence without autoplay", async ({page}) => {
  await page.clock.setFixedTime(firstDay);
  await openApp(page, "/#my-day");
  const play = page.getByTestId("day-letter-play");
  for (let i = 0; i < 2; i++) {
    await play.click();
    await expect(play).toContainText("再听一次");
  }
  await page.reload();
  await expect(play).toContainText("再听一次");
  expect(await audioLog(page)).toHaveLength(0);
  await letter(page).press("Enter");
  await good(page).click();
  await expect(page.locator("#my-day .day-eyebrow span")).toHaveText("2 / 6");
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).session.marks[0], MY_DAY_KEY)).toEqual({result:"good",replayed:true});
  await expect(play).toContainText("听示范");
});

test("IME Enter is not an answer; a revealed wrong jamo remains wrong after shortcut help", async ({ page }) => {
  await openKeyboardCard(page);
  const input = page.getByTestId("day-letter-input");
  const target = await page.getByTestId("day-letter-prompt").innerText();
  await input.fill(target.trim() === "ㄱ" ? "ㄴ" : "ㄱ");
  await input.dispatchEvent("compositionstart");
  await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true, keyCode: 229, bubbles: true });
  await expect(good(page)).toBeHidden();
  await input.dispatchEvent("compositionend");
  await input.press("Enter");
  await expect(good(page)).toBeDisabled();
  await page.keyboard.press("Shift+Slash");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Digit2");
  await page.keyboard.press("F8"); // the help overlay must not play the inactive card
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(letter(page)).toBeFocused();
  await expect(page.getByTestId("day-letter-feedback")).toContainText("这次输入与目标不同");
  await expect(input).toHaveCount(0);
  await expect(good(page)).toBeDisabled();
  await page.keyboard.press("Digit2");
  await expect(letter(page)).toHaveAttribute("data-skill", "keys");
  await page.keyboard.press("Digit1");
  await expect(dialogue(page)).toBeVisible();
  expect(await audioLog(page)).toEqual([]);
});

for (const from of ["panel","input"] as const) {
  test(`an empty Enter from the ${from} shows the hinted key but cannot earn mastery`, async ({ page }) => {
    await openKeyboardCard(page);
    const target = from === "panel" ? letter(page) : page.getByTestId("day-letter-input");
    await target.focus();
    await target.press("Enter");
    await expect(page.getByTestId("day-letter-feedback")).toContainText("这次先看键位");
    await expect(good(page)).toBeDisabled();
    await page.keyboard.press("Digit2");
    await expect(letter(page)).toHaveAttribute("data-skill", "keys");
    await page.keyboard.press("Digit1");
    await expect(dialogue(page)).toBeVisible();
    const mark = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).session.marks.at(-1), MY_DAY_KEY);
    expect(mark.result).toBe("again");
  });
}

test("a hidden tab keeps replay evidence without playing a clip on return", async ({page}) => {
  await page.clock.setFixedTime(firstDay);
  await openApp(page, "/#my-day");
  const listen = page.getByTestId("day-letter-play");
  await expect(letter(page)).toHaveAttribute("data-skill", "read");
  for (let i = 0; i < 2; i++) {
    await listen.click();
    await expect(listen).toBeEnabled();
    await expect(listen).toContainText("再听一次");
  }
  const setVisibility = (hidden: boolean) => page.evaluate(value => {
    Object.defineProperty(document, "visibilityState", {configurable:true, get:() => value ? "hidden" : "visible"});
    Object.defineProperty(document, "hidden", {configurable:true, get:() => value});
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
  await setVisibility(true);
  await expect(letter(page)).toHaveAttribute("inert", "");
  await setVisibility(false);
  await expect(letter(page)).not.toHaveAttribute("inert", "");
  await expect(listen).toContainText("再听一次");
  await letter(page).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Digit2");
  await expect(page.locator("#my-day .day-eyebrow span")).toHaveText("2 / 6");
  const mark = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).session.marks[0], MY_DAY_KEY);
  expect(mark).toEqual({result:"good",replayed:true});
  expect(await audioLog(page)).toHaveLength(2);
});

test("an unrecognised notebook can be used in memory without replacing it or the free-study bookmark", async ({ page }) => {
  await page.clock.setFixedTime(firstDay);
  await openApp(page, "/#learn");
  await expect(page.locator("#learn")).toBeVisible();
  const raw = JSON.stringify({ version: 999, original: "unrecognised version" });
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [MY_DAY_KEY, raw]);
  await page.goto("about:blank");
  await startFromHome(page);
  await expect(letter(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Digit1");
  await expect(letter(page)).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), MY_DAY_KEY)).toBe(raw);
  await page.locator("#day-pause").click();
  await page.locator("#home-continue").click();
  await expect(page.locator("#learn")).toBeVisible();
});

test("clicking inside day-letter-input still accepts physical Dubeolsik keys without an OS Korean IME", async ({ page }) => {
  await openKeyboardCard(page);
  const prompt = (await page.getByTestId("day-letter-prompt").innerText()).match(/[ㄱ-ㅎㅏ-ㅣ]/u)?.[0];
  if (!prompt) throw new Error("Missing jamo prompt");
  const input = page.getByTestId("day-letter-input");
  await input.click();
  await expect(input).toBeFocused();
  for (const key of keysFor(prompt)) await page.keyboard.press(key);
  await expect(input).toHaveValue(prompt);
  await input.press("Enter");
  await expect(good(page)).toBeEnabled();
  await expect(page.getByTestId("day-letter-feedback")).toContainText("示范音节：");
});

