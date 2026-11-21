import test from "node:test";
import assert from "node:assert/strict";
import { beginDay, currentStep, emptyBook, gradeDialogue, gradeLetter, readBook } from "../app/my-day-state.ts";
import { daySkillTotals } from "../app/day-letters.ts";

function finishLetters(b) { while (currentStep(b.session) === "letters") b = gradeLetter(b, "good", false); return b; }
test("a saved day round-trips at every boundary; old conversations become retrieval, not a new score", () => {
  let book = beginDay(emptyBook(), "2026-11-21", ["ㅏ"]);
  assert.equal(gradeDialogue(book, "good"), book);
  book = gradeLetter(book, "again", false);
  assert.deepEqual(readBook(JSON.stringify(book)), book);
  assert.equal(beginDay(book, "2026-11-21", []), book);
  book = finishLetters(book);
  assert.equal(currentStep(book.session), "dialogue");
  book = gradeDialogue(book, "again");
  assert.equal(currentStep(book.session), "finish");
  assert.equal(gradeDialogue(book, "again"), book);
  book = finishLetters(beginDay(book, "2026-11-22", []));
  assert.equal(currentStep(book.session), "recall");
  assert.equal(book.session.recall, 0);
  assert.equal(book.session.scene, 1);
  book = gradeDialogue(book, "good");
  assert.equal(currentStep(book.session), "dialogue");
  book = gradeDialogue(book, "good");
  assert.deepEqual(readBook(JSON.stringify(book)), book);
  assert.equal(currentStep(book.session), "finish");
  const stats = daySkillTotals(book.history);
  assert.deepEqual(stats.map(s => s.total), [40,32,40]);
  assert.ok(stats.every(s => s.practiced >= s.confirmed && s.practiced > 0));
});
test("corrupt or newer bookmarks are rejected without silently advancing or converting progress", () => {
  const b = beginDay(emptyBook(), "2026-11-21", []);
  assert.throws(() => readBook(JSON.stringify({...b, version:2})));
  assert.throws(() => readBook(JSON.stringify({...b, session:{...b.session,done:"good"}})));
  assert.throws(() => readBook(JSON.stringify({...b, session:{...b.session,cards:[{char:"ㅏ"}]}})));
  assert.deepEqual(readBook(null), emptyBook());
});
