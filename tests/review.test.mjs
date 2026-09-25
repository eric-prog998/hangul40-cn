import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { addLocalDays, createDailyReviewQueue, localDateKey, parseReviewRecord, rateReview, readReviewRecords, REVIEW_STORAGE_PREFIX, reviewStorageKey } from "../app/review-logic.ts";

const TODAY = "2000-03-10";
const NOW = Date.UTC(2000, 2, 10, 12);
const initial = (id = "word-1", day = TODAY) => rateReview(undefined, id, "remembered", day, NOW);
const parse = (record, id = record.id) => parseReviewRecord(JSON.stringify(record), id);

test("local date keys use local calendar fields and reject invalid dates", () => {
  assert.equal(localDateKey(new Date(2000, 2, 10, 23, 59)), TODAY);
  assert.equal(localDateKey(new Date(2000, 0, 1)), "2000-01-01");
  assert.throws(() => localDateKey(new Date(NaN)), RangeError);
  assert.throws(() => localDateKey(new Date("+010000-01-01T00:00:00Z")), RangeError);
});

test("calendar arithmetic handles month/year boundaries and actual leap years", () => {
  assert.equal(addLocalDays("2000-02-28", 1), "2000-02-29");
  assert.equal(addLocalDays("2000-02-29", 1), "2000-03-01");
  assert.equal(addLocalDays("1900-02-28", 1), "1900-03-01");
  assert.equal(addLocalDays("1999-12-31", 1), "2000-01-01");
  assert.equal(addLocalDays("2000-01-01", -1), "1999-12-31");
  assert.equal(addLocalDays("0099-12-31", 1), "0100-01-01");
  for (const value of ["2000-2-01", "2000-02-30", "1900-02-29", "2000-13-01", "0000-01-01", "invalid"]) assert.throws(() => addLocalDays(value, 1), RangeError);
  for (const count of [NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER]) assert.throws(() => addLocalDays(TODAY, count), RangeError);
  assert.throws(() => addLocalDays("9999-12-31", 1), RangeError);
});

test("DST transitions and east/west timezones do not shift scheduled calendar days", () => {
  const moduleUrl = new URL("../app/review-logic.ts", import.meta.url).href;
  const script = `import { addLocalDays, localDateKey } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify([addLocalDays('2024-03-09',1),addLocalDays('2024-03-10',1),addLocalDays('2024-11-03',1),localDateKey(new Date(2000,2,10,23,30))]));`;
  for (const TZ of ["America/New_York", "Asia/Seoul", "Pacific/Honolulu"]) {
    const result = execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TZ }, encoding: "utf8" });
    assert.deepEqual(JSON.parse(result), ["2024-03-10", "2024-03-11", "2024-11-04", TODAY], TZ);
  }
});

test("remembered schedules 1, 3, then 7 calendar days, with a seven-day ceiling", () => {
  const first = initial();
  assert.equal(first.stage, 1);
  assert.equal(first.due, "2000-03-11");
  const second = rateReview(first, first.id, "remembered", first.due, NOW + 1);
  assert.equal(second.stage, 2);
  assert.equal(second.due, "2000-03-14");
  const third = rateReview(second, first.id, "remembered", second.due, NOW + 2);
  assert.equal(third.stage, 3);
  assert.equal(third.due, "2000-03-21");
  const fourth = rateReview(third, first.id, "remembered", third.due, NOW + 3);
  assert.equal(fourth.stage, 3);
  assert.equal(fourth.due, "2000-03-28");
});

test("again resets to tomorrow and repeated same-day ratings cannot inflate progress", () => {
  const first = initial();
  const secondClick = rateReview(first, first.id, "remembered", TODAY, NOW + 1);
  assert.equal(secondClick.stage, 1);
  assert.equal(secondClick.due, first.due);
  const again = rateReview(secondClick, first.id, "again", TODAY, NOW + 2);
  assert.equal(again.stage, 0);
  assert.equal(again.due, "2000-03-11");
  const afterAgain = rateReview(again, first.id, "remembered", TODAY, NOW + 3);
  assert.equal(afterAgain.stage, 0);
  assert.equal(afterAgain.due, "2000-03-11");
  assert.ok(parse(afterAgain), "same-day remembered after again is a valid stage-zero record");
  const tomorrow = rateReview(afterAgain, first.id, "remembered", "2000-03-11", NOW + 4);
  assert.equal(tomorrow.stage, 1);
  assert.equal(tomorrow.due, "2000-03-12");
  const laterStage = rateReview(first, first.id, "remembered", "2000-03-11", NOW + 5);
  const repeatLater = rateReview(laterStage, first.id, "remembered", "2000-03-11", NOW + 6);
  assert.equal(repeatLater.stage, 2);
  assert.equal(repeatLater.due, laterStage.due);
});

test("rating inputs are validated and invalid/mismatched previous records cannot advance progress", () => {
  const previous = initial("other");
  assert.equal(rateReview(previous, "word-1", "remembered", TODAY, NOW).stage, 1);
  assert.equal(rateReview({ ...initial(), stage: 20 }, "word-1", "remembered", TODAY, NOW).stage, 1);
  assert.throws(() => rateReview(undefined, "", "remembered", TODAY, NOW), RangeError);
  assert.throws(() => rateReview(undefined, "word-1", "mastered", TODAY, NOW), RangeError);
  assert.throws(() => rateReview(undefined, "word-1", "again", "2000-02-30", NOW), RangeError);
  assert.throws(() => rateReview(undefined, "word-1", "again", TODAY, Infinity), RangeError);
  assert.throws(() => rateReview(initial(), "word-1", "remembered", "2000-03-09", NOW), /Device date/);
});

test("valid JSON round-trips only the approved record fields", () => {
  const record = initial();
  assert.deepEqual(parse({ ...record, extra: "discard me" }), record);
  assert.equal(parseReviewRecord(null, record.id), null);
  assert.equal(parseReviewRecord("", record.id), null);
  assert.equal(parseReviewRecord("{" + " ".repeat(3000) + "}", record.id), null);
  for (const raw of ["null", "[]", '"text"', "false", "{bad}"]) assert.equal(parseReviewRecord(raw, record.id), null);
});

test("malformed IDs, stages, ratings, dates, intervals, and huge timestamps are rejected", () => {
  const record = initial();
  const badPatches = [
    { id: "other" }, { stage: -1 }, { stage: 4 }, { stage: 1.5 }, { stage: "1" },
    { rating: "mastered" }, { rating: "again", stage: 1 }, { lastReviewed: "2000-02-30" },
    { due: "2000-03-10" }, { due: "2000-03-12" }, { due: "2000-3-11" },
    { updatedAt: -1 }, { updatedAt: 2.5 }, { updatedAt: "123" }, { updatedAt: Number.MAX_SAFE_INTEGER },
    { updatedAt: 253402300800000 }, { updatedAt: null },
  ];
  for (const patch of badPatches) assert.equal(parse({ ...record, ...patch }, record.id), null, JSON.stringify(patch));
  for (const id of ["", " word", "word\n", "a".repeat(201)]) assert.throws(() => reviewStorageKey(id), RangeError);
  assert.equal(reviewStorageKey("word-1"), `${REVIEW_STORAGE_PREFIX}word-1`);
});

test("future valid records survive clock rollback but stay out of today's queue", () => {
  const future = rateReview(undefined, "future", "remembered", "2099-01-01", Date.UTC(2099, 0, 1));
  assert.deepEqual(parse(future), future);
  assert.deepEqual(createDailyReviewQueue(["future", "new"], { future }, TODAY), ["new"]);
});

test("queue prioritizes oldest due dates, catalog-order ties, then unseen catalog items", () => {
  const records = {
    dueToday: initial("dueToday", "2000-03-09"),
    oldB: initial("oldB", "2000-03-05"),
    oldA: initial("oldA", "2000-03-05"),
    future: initial("future", TODAY),
  };
  const ids = ["newB", "dueToday", "oldB", "newA", "oldA", "future"];
  assert.deepEqual(createDailyReviewQueue(ids, records, TODAY), ["oldB", "oldA", "dueToday", "newB", "newA"]);
  assert.deepEqual(ids, ["newB", "dueToday", "oldB", "newA", "oldA", "future"], "input catalog is not mutated");
});

test("today's again and remembered ratings leave the queue and future due dates stay out", () => {
  const records = {
    again: rateReview(undefined, "again", "again", TODAY, NOW),
    remembered: initial("remembered"),
    futureDue: rateReview(initial("futureDue", "2000-03-06"), "futureDue", "remembered", "2000-03-09", NOW),
  };
  assert.deepEqual(createDailyReviewQueue(["again", "remembered", "futureDue"], records, TODAY), []);
  assert.deepEqual(createDailyReviewQueue(["again", "remembered", "futureDue"], records, "2000-03-11"), ["again", "remembered"]);
});

test("queue deduplicates, defaults to ten items, honors explicit limits and rejects invalid limits", () => {
  const ids = Array.from({ length: 15 }, (_, index) => `word-${index}`);
  assert.deepEqual(createDailyReviewQueue([ids[0], ...ids, ids[0]], {}, TODAY), ids.slice(0, 10));
  assert.deepEqual(createDailyReviewQueue(ids, {}, TODAY, 3), ids.slice(0, 3));
  assert.deepEqual(createDailyReviewQueue(ids, {}, TODAY, 12), ids.slice(0, 12));
  assert.deepEqual(createDailyReviewQueue(ids, {}, TODAY, 2.9), ids.slice(0, 2));
  for (const limit of [0, -1, NaN, Infinity, 0.3]) assert.deepEqual(createDailyReviewQueue(ids, {}, TODAY, limit), []);
  assert.deepEqual(createDailyReviewQueue(ids, {}, "not-a-date"), []);
  assert.deepEqual(createDailyReviewQueue(["", "valid", "valid"], {}, TODAY), ["valid"]);
});

test("storage reads isolate malformed records and failures without writing or deleting", () => {
  const calls = [];
  const good = initial("good");
  const later = initial("later");
  const data = new Map([[reviewStorageKey("good"), JSON.stringify(good)], [reviewStorageKey("bad"), "{broken"], [reviewStorageKey("later"), JSON.stringify(later)]]);
  const storage = {
    getItem(key) { calls.push(key); if (key === reviewStorageKey("denied")) throw new Error("blocked"); return data.get(key) ?? null; },
    setItem() { assert.fail("reading must never replace corrupt data"); },
    removeItem() { assert.fail("reading must never delete data"); },
  };
  const result = readReviewRecords(storage, ["good", "bad", "missing", "denied", "later", "good"]);
  assert.equal(result.failed, true);
  assert.equal(result.invalidCount, 1);
  assert.deepEqual(Object.values(result.records), [good, later]);
  assert.equal(calls.length, 5, "catalog duplicates are read only once");
  assert.equal(data.get(reviewStorageKey("bad")), "{broken");
});

test("record maps are prototype-safe and readers only touch requested catalog IDs", () => {
  const ids = ["__proto__", "constructor", "toString"];
  const calls = [];
  const storage = { getItem(key) { calls.push(key); const id = key.slice(REVIEW_STORAGE_PREFIX.length); return JSON.stringify(initial(id)); } };
  const result = readReviewRecords(storage, ids);
  assert.equal(Object.getPrototypeOf(result.records), null);
  assert.equal(result.failed, false);
  assert.equal(result.invalidCount, 0);
  assert.deepEqual(Object.keys(result.records), ids);
  assert.deepEqual(calls, ids.map(reviewStorageKey));
  assert.deepEqual(createDailyReviewQueue(ids, result.records, "2000-03-11"), ids);
  assert.deepEqual(createDailyReviewQueue(["toString"], {}, TODAY), ["toString"], "inherited properties are not records");
});
