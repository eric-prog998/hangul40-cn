import test from "node:test";
import assert from "node:assert/strict";
import { beginDay, currentStep, dayAttemptKey, emptyBook, gradeDialogue, gradeLetter, noteDayAttempt, readBook } from "../app/my-day-state.ts";
import { daySkillTotals } from "../app/day-letters.ts";
import { addLocalDays } from "../app/review-logic.ts";

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

test("card evidence is bounded, survives a round trip, and cannot transfer to another card", () => {
  let b = beginDay(emptyBook(), "2026-11-21", []);
  while (b.session.cards[b.session.marks.length].skill !== "listen") b = gradeLetter(b, "good", false);
  const key = dayAttemptKey(b.session);
  for (const action of ["heard","incorrect","heard"]) b = noteDayAttempt(b, key, action);
  assert.equal(noteDayAttempt(b, key, "correct"), b);
  assert.equal(noteDayAttempt(b, key, "heard"), b);
  assert.deepEqual(readBook(JSON.stringify(b)), b);
  assert.equal(gradeLetter(b, "good", false), b);
  assert.throws(() => readBook(JSON.stringify({...b,session:{...b.session,attempt:{...b.session.attempt,key:"wrong card"}}})));
  const next = gradeLetter(b,"again",false);
  assert.deepEqual(next.session.marks.at(-1), {result:"again",replayed:true});
  assert.equal(next.session.attempt, undefined);
  assert.notEqual(dayAttemptKey(next.session), key);
  assert.equal(noteDayAttempt(next,key,"heard"),next);
  assert.equal(beginDay(b,"2026-11-22",[]).session.attempt, undefined);
});

test("long-running daily recall covers every learned dialogue and gives weak ones bounded priority", () => {
  for (const weak of [null, 0, 1, 2]) {
    let b = emptyBook();
    const count = [0, 0, 0];
    for (let n = 0; n < 120; n++) {
      b = finishLetters(beginDay(readBook(JSON.stringify(b)), addLocalDays("2026-11-21", n), []));
      const { scene, recall } = b.session;
      if (n > 0) {
        assert.notEqual(recall, null);
        assert.notEqual(recall, scene);
        count[recall]++;
        b = gradeDialogue(b, weak === recall ? "again" : "good");
      }
      b = gradeDialogue(b, weak === scene ? "again" : "good");
    }
    assert.ok(count.every(n => n > 20), count.join("/"));
    if (weak === null) assert.ok(Math.max(...count) - Math.min(...count) <= 1);
    else assert.ok(count[weak] > Math.max(...count.filter((_, index) => index !== weak)));
  }
});

test("v51 saves without recall metadata open unchanged, including an already planned recall", () => {
  let b = beginDay(emptyBook(), "2026-11-21", []);
  b = gradeDialogue(finishLetters(b), "good");
  b = beginDay(b, "2026-11-22", []);
  b.conversations = b.conversations.map(m => m && { day: m.day, result: m.result });
  const resumed = readBook(JSON.stringify(b));
  assert.deepEqual(resumed, b);
  assert.equal(beginDay(resumed, "2026-11-22", []), resumed);
  const recalled = gradeDialogue(finishLetters(resumed), "good");
  assert.equal(recalled.conversations[0].lastRecall, "2026-11-22");
  const done = gradeDialogue(recalled, "again");
  const extra = gradeDialogue({ ...done, session: { ...done.session, extra: 0 } }, "good");
  assert.equal(extra.conversations[0].lastRecall, "2026-11-22", "extra practice preserves the previous recall");
  assert.equal(extra.conversations[1].lastRecall, undefined, "a main lesson is not an independent recall");
  assert.deepEqual(readBook(JSON.stringify(extra)), extra);
});

test("earlier local dates do not create a session, discard cards, or unfinish a later lesson", () => {
  let b = beginDay(emptyBook(), "2027-01-01", []);
  b = gradeLetter(gradeLetter(b, "good", false), "again", true);
  for (const saved of [b, gradeDialogue(finishLetters(b), "good")]) {
    const raw = JSON.stringify(saved);
    const resumed = readBook(raw);
    assert.equal(beginDay(resumed, "2026-12-31", []), resumed);
    assert.equal(beginDay(resumed, "2027-01-01", []), resumed);
    assert.deepEqual(resumed, saved);
    assert.equal(beginDay(resumed, "2027-01-02", []).session.scene, (saved.session.scene + 1) % 3);
  }
});
