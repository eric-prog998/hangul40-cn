import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { INITIAL_ORDER, VOWEL_ORDER } from "../app/learning-logic.ts";
import { PHRASE_STUDY_NOTES } from "../app/phrase-study-notes.ts";
import { CONSONANT_CONTRAST_FAMILIES, JAMO_HINTS, buildConsonantContrastQuestions } from "../app/jamo-study-data.ts";
import { LIAISON_WORDS, STOP_BATCHIM_WORDS, resolveBatchimTarget } from "../app/batchim-data.ts";
import { beginDay, emptyBook, gradeDialogue, gradeLetter, mergeNotebooks } from "../app/my-day-state.ts";
import { parsePortableBackup } from "../app/portable-backup.ts";
import { emptyProgressStats } from "../app/progress-ledger.ts";

test("all 52 built-in phrases have verified pronunciation, etymology, and sentence structure notes", async () => {
  const catalog = JSON.parse(await readFile(new URL("../data/phrases.json", import.meta.url), "utf8"));
  assert.equal(Object.keys(PHRASE_STUDY_NOTES).length, catalog.length);
  for (const item of catalog) {
    const note = PHRASE_STUDY_NOTES[item.id];
    assert.ok(note, `${item.id} is missing study notes`);
    assert.ok(note.soundNote.length >= 8, `${item.id} soundNote is too short`);
    assert.ok(note.originBadge.length > 0 && note.originNote.length >= 8, `${item.id} originNote is incomplete`);
    assert.equal(note.soundNote, note.soundNote.normalize("NFC"));
    assert.equal(note.originNote, note.originNote.normalize("NFC"));
    if (note.actualReading) {
      assert.equal(note.actualReading, note.actualReading.normalize("NFC"));
      assert.match(note.actualReading, /[가-힣]/u);
    }
    if (item.type === "sentence") {
      assert.ok(Array.isArray(note.chunks) && note.chunks.length >= 2, `${item.id} sentence needs word-order chunks`);
      assert.ok(note.grammarNote && note.grammarNote.length >= 8, `${item.id} sentence needs grammarNote`);
    }
  }
  assert.equal(PHRASE_STUDY_NOTES["word-thanks"].actualReading, "감사함니다");
  assert.equal(PHRASE_STUDY_NOTES["word-school"].actualReading, "학꾜");
  assert.equal(PHRASE_STUDY_NOTES["word-good"].actualReading, "조아요");
  assert.equal(PHRASE_STUDY_NOTES["sentence-subway"].actualReading, "지하철려기 어디예요");
});

test("all 40 Hangul letters have articulatory and Hunminjeongeum stroke-origin hints", () => {
  const all40 = [...INITIAL_ORDER, ...VOWEL_ORDER];
  assert.equal(all40.length, 40);
  assert.equal(Object.keys(JAMO_HINTS).length, 40);
  for (const char of all40) {
    const hint = JAMO_HINTS[char];
    assert.ok(hint, `${char} is missing JAMO_HINTS`);
    assert.ok(hint.group.length > 0 && hint.cue.length >= 8 && hint.shapeTip.length >= 5, `${char} hint is incomplete`);
  }
});

test("progressive batchim courses link to whole-word recordings and route word cards accurately", async () => {
  const catalog = JSON.parse(await readFile(new URL("../data/phrases.json", import.meta.url), "utf8"));
  for (const item of [...STOP_BATCHIM_WORDS, ...LIAISON_WORDS]) {
    const entry = catalog.find((row) => row.id === item.id);
    assert.ok(entry, `${item.id} must exist in phrases.json`);
    const audioInfo = await stat(new URL(`../public/audio/phrases/${item.id}.mp3`, import.meta.url));
    assert.ok(audioInfo.size > 3_000, `${item.id}.mp3 must exist`);
    assert.match(item.source, /^https:\/\/krdict\.korean\.go\.kr\//);
  }
  assert.deepEqual(resolveBatchimTarget("word-water"), { course: "sonorant", index: 0 });
  assert.deepEqual(resolveBatchimTarget("word-home"), { course: "stop", index: 0 });
  assert.deepEqual(resolveBatchimTarget("word-pharmacy"), { course: "stop", index: 3 });
  assert.deepEqual(resolveBatchimTarget("word-thanks"), { course: "liaison", index: 2 });
});

test("consonant contrast families include s/ss and build 8 distinct playable questions", async () => {
  assert.equal(CONSONANT_CONTRAST_FAMILIES.length, 5);
  assert.equal(CONSONANT_CONTRAST_FAMILIES[4].title, "사 · 싸");
  for (const family of CONSONANT_CONTRAST_FAMILIES) {
    for (const item of family.items) {
      const file = new URL(`../public/audio/hangul-natural/s-${item.text.codePointAt(0).toString(16)}.mp3`, import.meta.url);
      const info = await stat(file);
      assert.ok(info.size > 3_000, `${item.text} syllable clip must exist`);
    }
  }
  const questions = buildConsonantContrastQuestions(() => 0.42);
  assert.equal(questions.length, 8);
  assert.equal(new Set(questions.map((q) => `${q.familyIndex}:${q.targetIndex}`)).size, 8);
});

test("portable backup optionally round-trips myDay notebook and merges cross-device progress idempotently", () => {
  const validation = { allowedLetters: new Set(["ㄱ", "ㅏ"]), allowedPhraseIds: new Set(["word-water"]), allowedRouteIds: new Set(["daily"]) };
  let dayA = beginDay(emptyBook(), "2026-11-21", []);
  dayA = gradeLetter(dayA, "good", false);
  let dayB = beginDay(emptyBook(), "2026-11-22", []);
  while (dayB.session.marks.length < dayB.session.cards.length) dayB = gradeLetter(dayB, "good", false);
  dayB = gradeDialogue(dayB, "good");

  const merged = mergeNotebooks(dayA, dayB);
  assert.equal(merged.session.day, "2026-11-22");
  assert.equal(merged.session.done, "good");
  assert.deepEqual(mergeNotebooks(merged, dayA), merged);
  assert.deepEqual(mergeNotebooks(merged, dayB), merged);

  const payload = {
    format: "hangul40-progress",
    version: 1,
    createdAt: "2026-11-22T12:00:00.000Z",
    progress: { stats: emptyProgressStats("2026-11-22"), mastered: ["ㄱ"], masteredPhrases: [] },
    reviews: {},
    typing: {},
    vowelHistory: [],
    preferences: { autoAdvanceMs: 3000, audioSpeed: 1, showRomanization: true, keyboardMode: "hangul", beginnerBlendCompleted: false, fullReviewCompleted: false },
    myDay: merged,
  };
  assert.deepEqual(parsePortableBackup(JSON.stringify(payload), validation), payload);
  assert.throws(() => parsePortableBackup(JSON.stringify({ ...payload, myDay: { version: 99 } }), validation));
});
