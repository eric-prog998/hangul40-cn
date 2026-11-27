import { audioLog, describeAudio, expect, lastAudio, openApp, test } from "./support/app.ts";
import { beginDay, emptyBook, gradeLetter, MY_DAY_KEY } from "../app/my-day-state.ts";

test.describe("中文零基础学习增强专项", () => {
  test("my-day shows first-time articulatory guide, virtual Korean keyboard on keys card, and syncs home skills", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-21T12:00:00+09:00"));
    await openApp(page, "/#my-day");
    const card = page.getByTestId("day-letter-card");
    await expect(card).toHaveAttribute("data-skill", "read");
    await expect(card.locator(".day-first-guide")).toContainText("首次见");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Digit2");

    // Return home and confirm MyDay real-time skill summary appears on the home sheet.
    await page.locator("#day-pause").click();
    await expect(page.locator(".study-home-day-skills")).toContainText("看字读");
  });

  test("my-day keys card can be completed purely by tapping the virtual Korean keyboard", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-21T12:00:00+09:00"));
    let book = beginDay(emptyBook(), "2026-11-21", []);
    while (book.session!.cards[book.session!.marks.length].skill !== "keys") {
      book = gradeLetter(book, "good", false);
    }
    await page.addInitScript(([key, raw]) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    }, [MY_DAY_KEY, JSON.stringify(book)]);
    await openApp(page, "/#my-day");

    const card = page.getByTestId("day-letter-card");
    await expect(card).toHaveAttribute("data-skill", "keys");
    const target = (await page.getByTestId("day-letter-prompt").innerText()).trim();
    await card.locator(".hangul-keyboard summary").click();
    await card.locator(`.hangul-key-row button[aria-label$="，${target}"]`).click();
    await expect(page.getByTestId("day-letter-input")).toHaveValue(target);
    await page.getByTestId("day-letter-reveal").click();
    await expect(page.getByTestId("day-letter-good")).toBeEnabled();
  });

  test("40-sound mnemonics switch between consonant organ families and vowel rules and play demo syllables", async ({ page }) => {
    await openApp(page, "/#learn");
    const mnemonics = page.getByTestId("hangul-mnemonics");
    await mnemonics.locator("summary").click();
    await expect(mnemonics.getByLabel("辅音五大家族造字规律")).toBeVisible();
    const before = (await audioLog(page)).length;
    await mnemonics.locator(".mnemonic-member-row button").first().click();
    await expect.poll(async () => (await audioLog(page)).length).toBe(before + 1);
    expect(describeAudio((await audioLog(page)).at(-1)!)).toMatchObject({ kind: "syllable", syllable: "가" });

    await page.locator("#letter-tab-vowels").click();
    await expect(mnemonics.getByLabel("元音天地人造字规律")).toBeVisible();
  });

  test("consonant contrast lab plays s/ss pair and completes an 8-question blind listening challenge", async ({ page }) => {
    await openApp(page, "/#compare");
    await expect(page.locator(".compare-pitch-tip")).toContainText("音高");
    const lab = page.getByTestId("consonant-contrast-lab");
    await expect(lab.locator(".local-voice-recorder")).toBeVisible();
    await lab.locator(".compare-pair-buttons button").nth(1).click();
    await expect.poll(async () => lastAudio(page)).toMatchObject({ kind: "syllable", syllable: "싸" });

    await lab.getByRole("button", { name: /开始 8 题盲听/ }).click();
    for (let q = 1; q <= 8; q += 1) {
      await expect(lab.locator(".compare-blind-progress span")).toContainText(`第 ${q} / 8 题`);
      const firstChoice = lab.locator(".compare-choice-grid button").first();
      await expect(firstChoice).toBeEnabled();
      await expect(lab.locator(".compare-blind-status")).toHaveText("示范已播完，请判断刚才是松音、紧音还是送气音。");
      const played = await lastAudio(page);
      expect(played.kind).toBe("syllable");
      if (played.kind === "syllable") {
        const texts = await lab.locator(".compare-choice-grid button strong").allTextContents();
        await lab.locator(".compare-choice-grid button").nth(texts.indexOf(played.syllable)).click();
      }
      // Manual fixture mode waits for explicit click/Enter.
      await lab.locator(".compare-next-btn").click();
    }
    await expect(lab.locator(".compare-blind-finish strong")).toHaveText("8 / 8");
  });

  test.describe("辅音盲听 · 自动下一题", () => {
    test.use({ autoAdvance: "site-default" });

    test("automatically advances to question 2 after feedback, and Esc pauses pending auto-advance", async ({ page }) => {
      await openApp(page, "/#compare");
      const lab = page.getByTestId("consonant-contrast-lab");
      await lab.getByRole("button", { name: /开始 8 题盲听/ }).click();
      await expect(lab.locator(".compare-choice-grid button").first()).toBeEnabled();
      await lab.locator(".compare-choice-grid button").first().click();
      await expect(lab.locator(".compare-blind-progress span")).toContainText("第 2 / 8 题");
      await expect(lab.locator(".compare-choice-grid button").first()).toBeEnabled();
      await expect(lab.locator(".compare-blind-status")).toHaveText("示范已播完，请判断刚才是松音、紧音还是送气音。");
      await page.keyboard.press("Digit1");
      await page.keyboard.press("Escape");
      await expect(lab.locator(".compare-blind-status")).toContainText("自动下一题已暂停");
    });
  });

  test("phrase breakdown shows actual pronunciation, etymology, sentence chunks, and routes pharmacy to stop-batchim lesson", async ({ page }) => {
    await openApp(page, "/#phrases");
    const thanksCard = page.locator(".phrase-grid article").filter({ has: page.locator("#phrase-master-word-thanks") });
    await thanksCard.locator("#phrase-block-toggle-word-thanks").click();
    await expect(thanksCard.locator(".phrase-actual-reading")).toContainText("[감사함니다]");
    await expect(thanksCard.locator(".phrase-study-notes")).toContainText("感謝");

    const pharmacyCard = page.locator(".phrase-grid article").filter({ has: page.locator("#phrase-master-word-pharmacy") });
    await pharmacyCard.locator("#phrase-block-toggle-word-pharmacy").click();
    await pharmacyCard.locator(".phrase-batchim-link").click();
    await expect(page.locator("#batchim-lesson")).toBeVisible();
    await expect(page.locator("#batchim-lesson .batchim-heading")).toContainText("第 2 小课");
    await expect(page.locator("#batchim-lesson .batchim-word h3")).toHaveText("약국");

    await page.locator("#phrase-tab-sentence").evaluate(() => { location.hash = "phrase-tab-sentence"; });
    const studySentence = page.locator(".phrase-grid article").filter({ has: page.locator("#phrase-master-sentence-study") });
    await studySentence.locator("#phrase-block-toggle-sentence-study").click();
    await expect(studySentence.locator(".phrase-actual-reading")).toContainText("[저는 한구거를 공부해요]");
    await expect(studySentence.locator(".phrase-chunk-list")).toContainText("宾语");
  });
});
