import { readFileSync } from "node:fs";
import { test as base, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { INITIAL_ORDER, VOWEL_ORDER } from "../../app/learning-logic.ts";
import { COMPOUND_VOWELS, KOREAN_KEY_MAP, KOREAN_SHIFT_MAP } from "../../app/keyboard-logic.ts";
import { AUTO_ADVANCE_KEY } from "../../app/learning-settings.ts";

declare global {
  interface Window {
    /** Every audio source the page started playing, in order (test-only spy). */
    __audioLog: string[];
    /** Playback rate of each started clip, parallel to __audioLog. */
    __audioRates: number[];
    /** The media elements themselves, to check that only one is audible at a time. */
    __audioElements: HTMLMediaElement[];
  }
}

type ConsonantName = { char: string; name: string; id: string; audioFile: string | null };
export type Phrase = { id: string; type: "word" | "sentence"; korean: string; chinese: string; roman: string; group: string };

function readData<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), "utf8")) as T;
}

export const consonantNames = readData<ConsonantName[]>("consonant-names.json");
export const phrases = readData<Phrase[]>("phrases.json");
const onsetFileToChar = new Map(consonantNames.filter((item) => item.audioFile).map((item) => [item.audioFile as string, item.char]));
const nameIdToChar = new Map(consonantNames.map((item) => [item.id, item.char]));
const phraseById = new Map(phrases.map((item) => [item.id, item]));

export type AudioClip =
  | { kind: "onset"; char: string }
  | { kind: "syllable"; syllable: string; initial: string; vowel: string }
  | { kind: "name"; char: string }
  | { kind: "phrase"; phrase: Phrase }
  | { kind: "unknown"; src: string };

/** Splits a syllable without a final consonant into its two letters; null for anything else. */
function splitOpenSyllable(text: string) {
  if (!/^[가-힣]$/.test(text)) return null;
  const offset = (text.codePointAt(0) ?? 0) - 0xac00;
  if (offset % 28 !== 0) return null;
  return { syllable: text, initial: INITIAL_ORDER[Math.floor(offset / (21 * 28))], vowel: VOWEL_ORDER[Math.floor((offset % (21 * 28)) / 28)] };
}

/** Works out what a played audio file stands for, from its URL alone. */
export function describeAudio(src: string | null): AudioClip {
  const url = decodeURIComponent(src ?? "");
  let match = /\/audio\/consonant-human-(?:onset|clarity)\/([a-z-]+\.wav)/.exec(url);
  if (match) {
    const char = onsetFileToChar.get(match[1]);
    if (char) return { kind: "onset", char };
  }
  match = /\/audio\/hangul-natural\/s-([0-9a-f]+)\.mp3/.exec(url);
  if (match) {
    const parts = splitOpenSyllable(String.fromCodePoint(Number.parseInt(match[1], 16)));
    if (parts) return { kind: "syllable", ...parts };
  }
  match = /\/audio\/consonant-names\/([a-z-]+)\.mp3/.exec(url);
  if (match) {
    const char = nameIdToChar.get(match[1]);
    if (char) return { kind: "name", char };
  }
  match = /\/audio\/phrases\/([a-z-]+)\.mp3/.exec(url);
  if (match) {
    const phrase = phraseById.get(match[1]);
    if (phrase) return { kind: "phrase", phrase };
  }
  return { kind: "unknown", src: url };
}

/**
 * The syllable a clip says, or null if it is something else. Two everyday words, 네 and 뭐, are
 * a single open syllable; wherever that syllable is needed the site plays the word's own
 * recording, so those two clips count as syllables here as well.
 */
export function syllableOf(clip: AudioClip) {
  if (clip.kind === "syllable") return { syllable: clip.syllable, initial: clip.initial, vowel: clip.vowel };
  return clip.kind === "phrase" ? splitOpenSyllable(clip.phrase.korean) : null;
}

/** The letter a listening or matching clip stands for: a consonant onset, or the vowel of a syllable. */
export function letterOf(clip: AudioClip) {
  return clip.kind === "onset" ? clip.char : syllableOf(clip)?.vowel ?? "";
}

/** Records which audio the page plays. The learner only hears it; the test needs to know what it was. */
export async function installAudioSpy(context: BrowserContext) {
  await context.addInitScript(() => {
    const log: string[] = [];
    const rates: number[] = [];
    const elements: HTMLMediaElement[] = [];
    window.__audioLog = log;
    window.__audioRates = rates;
    window.__audioElements = elements;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function patchedPlay(this: HTMLMediaElement) {
      log.push(this.currentSrc || this.src);
      rates.push(this.playbackRate);
      elements.push(this);
      return play.call(this);
    };
  });
}

/**
 * Step-by-step tests press "next" themselves. With the site default the next
 * question would also arrive on its own a few seconds later and race the test,
 * so those tests start in the site's manual mode unless they ask otherwise.
 */
export async function disableAutoAdvance(context: BrowserContext) {
  await context.addInitScript((key) => {
    try {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, "0");
    } catch {
      // The blank page a tab starts on has no storage; the site's own page does.
    }
  }, AUTO_ADVANCE_KEY);
}

export const audioLog = (page: Page) => page.evaluate(() => [...window.__audioLog]);
export const lastAudioRate = (page: Page) => page.evaluate(() => window.__audioRates.at(-1) ?? null);
/** How many clips are audible right now. The site promises this never exceeds one. */
export const audibleClips = (page: Page) => page.evaluate(() => window.__audioElements.filter((audio) => !audio.paused && !audio.ended).length);
export const lastAudio = async (page: Page) => describeAudio((await audioLog(page)).at(-1) ?? null);

/** Opens the site and waits until React has hydrated and local progress has been read. */
export async function openApp(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.locator("#daily-review")).not.toContainText("正在读取", { timeout: 30_000 });
}

/**
 * Gives the page the moment a person always gives it between two key presses: the browser
 * reports what is now on screen and the page re-attaches its key handlers. A test types the
 * next key within a millisecond, and a key that arrives that early can be ignored.
 */
export async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(resolve, 60)));
  }));
}

/** F2 puts the keyboard in the training area from anywhere on the page. */
export async function goToTraining(page: Page) {
  await page.keyboard.press("F2");
  await expect(page.locator("#keyboard-game-console")).toBeFocused();
  await settle(page);
}

export async function totalXp(page: Page) {
  const text = await page.locator(".game-profile strong").innerText();
  return Number(text.replace(/[^\d]/g, ""));
}

export async function todayXp(page: Page) {
  return Number(await page.locator(".header-progress span").innerText());
}

export const expectTotalXp = (page: Page, xp: number) => expect(page.locator(".game-profile strong")).toHaveText(`${xp} XP`);

/** The physical key presses (standard Korean 두벌식 layout) that type one letter. */
export function keysFor(char: string): string[] {
  const plain = Object.entries(KOREAN_KEY_MAP).find(([, value]) => value === char);
  if (plain) return [`Key${plain[0]}`];
  const shifted = Object.entries(KOREAN_SHIFT_MAP).find(([, value]) => value === char);
  if (shifted) return [`Shift+Key${shifted[0]}`];
  const compound = Object.entries(COMPOUND_VOWELS).find(([, value]) => value === char);
  if (compound) return [...compound[0]].flatMap(keysFor);
  throw new Error(`No Korean key for ${char}`);
}

/**
 * After typing a letter on the Korean layout: ㅗ, ㅜ and ㅡ can start a compound
 * vowel, so the game waits for a second key when one is on offer. Enter confirms.
 */
export async function confirmPendingKoreanKey(page: Page, verdict: Locator) {
  const status = page.locator(".korean-key-status");
  await expect(async () => {
    if (await verdict.isVisible()) return;
    if ((await status.innerText()).includes("已按出")) await page.keyboard.press("Enter");
    await expect(verdict).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Listen game
// ---------------------------------------------------------------------------

export const listenPanel = (page: Page) => page.locator("#game-panel-listen");

/**
 * Letters a learner cannot tell apart from the recording alone: vowels that sound the same in
 * modern Korean, and plain / tense / aspirated consonants once the vowel is cut off.
 * A question that offered two of them would have no single right answer.
 */
const SOUND_ALIKE_GROUPS = [
  ["ㅐ", "ㅔ"], ["ㅒ", "ㅖ"], ["ㅙ", "ㅚ", "ㅞ"],
  ["ㄱ", "ㄲ", "ㅋ"], ["ㄷ", "ㄸ", "ㅌ"], ["ㅂ", "ㅃ", "ㅍ"], ["ㅈ", "ㅉ", "ㅊ"], ["ㅅ", "ㅆ"],
];
export const soundsAlike = (left: string, right: string) => left !== right && SOUND_ALIKE_GROUPS.some((group) => group.includes(left) && group.includes(right));

/** Waits for the question audio to finish and returns the hidden target with the visible choices. */
export async function readListenQuestion(page: Page) {
  await expect(page.getByTestId("listen-choice-0")).toBeEnabled();
  const clip = await lastAudio(page);
  const target = letterOf(clip);
  expect(target, `the question audio should be a consonant onset or a vowel, got ${JSON.stringify(clip)}`).not.toBe("");
  const choices = await page.locator('[data-testid^="listen-choice-"] strong').allTextContents();
  expect(choices, "four distinct choices").toHaveLength(4);
  expect(new Set(choices).size, "choices must not repeat").toBe(4);
  expect(choices, `the correct letter ${target} must be offered`).toContain(target);
  expect(choices.filter((choice) => soundsAlike(choice, target)), `no other choice may sound the same as ${target}`).toEqual([]);
  return { target, choices, index: choices.indexOf(target) };
}

export async function answerListen(page: Page, correct = true) {
  const question = await readListenQuestion(page);
  const index = correct ? question.index : (question.index + 1) % 4;
  await page.getByTestId(`listen-choice-${index}`).click();
  const verdict = listenPanel(page).locator(".game-feedback strong");
  await expect(verdict).toContainText(correct ? "正确！" : `正确答案是 ${question.target}`);
  return question;
}

export const nextListen = (page: Page) => listenPanel(page).locator(".game-feedback button").click();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const test = base.extend<{ autoAdvance: "manual" | "site-default"; audioSpy: void; browserProblems: string[] }>({
  autoAdvance: ["manual", { option: true }],
  audioSpy: [async ({ context, autoAdvance }, provide) => {
    await installAudioSpy(context);
    if (autoAdvance === "manual") await disableAutoAdvance(context);
    await provide();
  }, { auto: true }],
  // Catch transport failures too. Navigation/media cancellation is expected when
  // the user changes sections; HTTP errors and other transport failures are not.
  browserProblems: [async ({ context }, provide) => {
    const problems: string[] = [];
    const watch = (page: Page) => {
      page.on("console", (message) => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
      page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));
      page.on("response", (response) => { if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`); });
      page.on("requestfailed", request => {
        const error = request.failure()?.errorText ?? "unknown network failure";
        if (/^(?:net::ERR_ABORTED|cancelled|Load request cancelled)$/.test(error)) return;
        problems.push(`network: ${error}: ${request.url()}`);
      });
    };
    context.pages().forEach(watch);
    context.on("page", watch);
    await provide(problems);
    expect(problems, "the browser reported errors while the test ran").toEqual([]);
  }, { auto: true }],
});

export { expect };
