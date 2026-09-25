import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { BATCHIM_GROUPS, BATCHIM_WORDS, batchimExampleIndex, isBatchimAnswerCorrect } from "../app/batchim-data.ts";
import { decomposeHangulSyllable } from "../app/learning-logic.ts";

test("batchim lesson uses five existing complete-word recordings and correct word-final blocks", async () => {
  const catalog = JSON.parse(await readFile(new URL("../data/phrases.json", import.meta.url), "utf8"));
  assert.equal(BATCHIM_WORDS.length, 5);
  assert.deepEqual(BATCHIM_GROUPS.map((item) => item.final), ["ㄹ", "ㅁ", "ㅇ"]);
  for (const item of BATCHIM_WORDS) {
    const word = catalog.find((entry) => entry.id === item.id);
    assert.ok(word);
    assert.equal(Array.from(word.korean).at(-1), item.last);
    assert.equal(decomposeHangulSyllable(item.last).final, item.final);
    assert.ok((await stat(new URL(`../public/audio/phrases/${item.id}.mp3`, import.meta.url))).size > 100);
    assert.match(item.source, /^https:\/\/krdict\.korean\.go\.kr\//);
  }
  assert.equal(BATCHIM_WORDS.find((item) => item.id === "word-person").pronunciation, "사ː람");
  assert.equal(BATCHIM_WORDS.find((item) => item.id === "word-receipt").pronunciation, "영수증");
});

test("word-card entry selects the matching example and all exercise choices have one correct answer", () => {
  BATCHIM_WORDS.forEach((word, index) => {
    assert.equal(batchimExampleIndex(word.id), index);
    assert.equal(BATCHIM_GROUPS.filter((group) => isBatchimAnswerCorrect(index, group.final)).length, 1);
  });
  assert.equal(batchimExampleIndex("word-without-lesson"), 0);
  assert.equal(isBatchimAnswerCorrect(-1, "ㄹ"), false);
  assert.equal(isBatchimAnswerCorrect(5, "ㄹ"), false);
});

test("batchim keyboard and auto-advance cancel safely without changing mastery", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const lesson = await readFile(new URL("../app/batchim-lesson.tsx", import.meta.url), "utf8");
  assert.match(page, /data-keyboard-scope="batchim"/);
  assert.match(page, /openBatchimLesson\(item\.id\)/);
  assert.match(lesson, /clearTimeout\(timer\.current\)/);
  assert.match(lesson, /alive\.current && request === token\.current/);
  assert.match(lesson, /mode !== "quiz" \|\| answered\.current/);
  assert.match(lesson, /button, a\[href\], summary/);
  assert.match(lesson, /playSample\(word\.korean\)/);
  assert.doesNotMatch(lesson, /localStorage|fetch\(|getUserMedia|setMastered|setGameStats/);
});
