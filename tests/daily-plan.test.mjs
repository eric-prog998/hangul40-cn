import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { dailyPlanSummary } from "../app/daily-plan-logic.ts";
import { rateReview } from "../app/review-logic.ts";
import { makeVowelQuestions } from "../app/vowel-challenge-logic.ts";

const today = "2000-03-10";
const at = new Date(2000, 2, 10, 12).getTime();
const ids = Array.from({ length: 12 }, (_, index) => `word-${index}`);
const question = makeVowelQuestions(() => .5)[0];
const review = (id, date = today, rating = "remembered") => rateReview(undefined, id, rating, date, at);
const attempt = (index, timestamp = at, choice = question.answer) => ({ id: `attempt-${String(index).padStart(16, "0")}`, questionId: question.id, choice, at: timestamp });

test("a fresh plan is read-only, starts at zero, and requires a real local calendar date", () => {
  const summary = dailyPlanSummary(ids, {}, [], today);
  assert.equal(summary.review.target, 5);
  assert.equal(summary.review.remaining, 5);
  assert.equal(summary.listening.target, 8);
  assert.equal(summary.completedGoals, 0);
  for (const day of ["", "2000-02-30", "not-a-date"]) assert.equal(dailyPlanSummary(ids, {}, [], day), null);
});

test("same-day self-ratings count once including again, regardless of catalog duplicates", () => {
  const records = Object.fromEntries(ids.slice(0, 5).map(id => [id, review(id, today, "again")]));
  const before = JSON.stringify(records);
  const result = dailyPlanSummary([...ids, ids[0]], records, [], today);
  assert.equal(result.review.reviewed, 5);
  assert.equal(result.review.remaining, 0);
  assert.equal(result.review.complete, true);
  assert.equal(result.completedGoals, 1);
  assert.equal(JSON.stringify(records), before);
});

test("short goals shrink to available items, never bringing future reviews forward", () => {
  const records = Object.fromEntries(ids.map(id => [id, review(id, "2000-03-11")]));
  records[ids[0]] = review(ids[0], "2000-03-09");
  delete records[ids[1]];
  const result = dailyPlanSummary(ids, records, [], today);
  assert.equal(result.review.target, 2);
  assert.equal(result.review.due, 1);
  assert.equal(result.review.remaining, 2);
  assert.equal(result.review.nextDue, "2000-03-12");
});

test("no due or unseen items is explicitly no review needed, not five imaginary ratings", () => {
  const records = Object.fromEntries(ids.map(id => [id, review(id, "2000-03-11")]));
  const result = dailyPlanSummary(ids, records, [], today);
  assert.equal(result.review.target, 0);
  assert.equal(result.review.reviewed, 0);
  assert.equal(result.review.complete, true);
  assert.equal(result.review.nextDue, "2000-03-12");
  assert.equal(result.complete, false);
});

test("eight distinct attempts count practice, including wrong answers; duplicate IDs do not", () => {
  const history = Array.from({ length: 8 }, (_, index) => attempt(index, at, 1 - question.answer));
  const result = dailyPlanSummary(ids, {}, [...history, history[0]], today);
  assert.equal(result.listening.attempts, 8);
  assert.equal(result.listening.pending, 1);
  assert.equal(result.listening.complete, true);
  assert.equal(result.completedGoals, 1);
});

test("both practice goals complete independently of XP, mastery or merely opening a lesson", () => {
  const records = Object.fromEntries(ids.slice(0, 5).map(id => [id, review(id)]));
  const history = Array.from({ length: 8 }, (_, index) => attempt(index));
  const result = dailyPlanSummary(ids, records, history, today);
  assert.equal(result.complete, true);
  assert.equal(result.completedGoals, 2);
  const tomorrow = dailyPlanSummary(ids, records, history, "2000-03-11");
  assert.equal(tomorrow.completedGoals, 0);
  assert.equal(tomorrow.review.due, 5);
  assert.equal(tomorrow.listening.attempts, 0);
});

test("invalid, unlisted and inherited records cannot fabricate completion", () => {
  const records = Object.create({ [ids[0]]: review(ids[0]) });
  records[ids[1]] = { ...review(ids[1]), due: "invalid" };
  records.foreign = review("foreign");
  const history = [attempt(0), { ...attempt(1), questionId: "unknown" }, { ...attempt(2), at: NaN }, { ...attempt(3), choice: 9 }];
  const result = dailyPlanSummary(ids, records, history, today);
  assert.equal(result.review.reviewed, 0);
  assert.equal(result.listening.attempts, 1);
});

test("calendar rollovers use the browser timezone, including dates beyond UTC's day", () => {
  const moduleUrl = new URL("../app/daily-plan-logic.ts", import.meta.url).href;
  const entry = attempt(0, Date.parse("2000-03-09T16:00:00.000Z"));
  const extreme = attempt(1, 253402300799999);
  const source = `import { dailyPlanSummary } from ${JSON.stringify(moduleUrl)}; console.log(dailyPlanSummary([],{},${JSON.stringify([entry, extreme])},'2000-03-10').listening.attempts);`;
  for (const [TZ, expected] of [["Asia/Seoul", "1"], ["America/New_York", "0"]]) {
    assert.equal(execFileSync(process.execPath, ["--input-type=module", "-e", source], { encoding: "utf8", env: { ...process.env, TZ } }).trim(), expected);
  }
});
