import assert from "node:assert/strict";
import test from "node:test";
import { DailyReviewRepository } from "../app/review-storage.ts";
import { reviewStorageKey, parseReviewRecord } from "../app/review-logic.ts";

function fixture() {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  let now = new Date(2020, 1, 28, 12);
  return { values, storage, get now() { return now; }, set now(value) { now = value; }, repository: new DailyReviewRepository(["a", "b"], () => storage, () => now) };
}

test("daily review stores one card without touching mastery or another card", () => {
  const f = fixture();
  f.values.set("hangul-mastered", "preserve-me");
  f.repository.refresh();
  assert.equal(f.repository.rate("a", "remembered", "2020-02-28").ok, true);
  assert.equal(f.repository.snapshot().records.a.due, "2020-02-29");
  assert.equal(f.values.get("hangul-mastered"), "preserve-me");
  assert.equal(f.values.has(reviewStorageKey("b")), false);
  const reloaded = new DailyReviewRepository(["a", "b"], () => f.storage, () => f.now);
  assert.deepEqual(reloaded.refresh().records, f.repository.snapshot().records);
});

test("same-day stale submission is blocked after reading another tab's latest result", () => {
  const f = fixture();
  const second = new DailyReviewRepository(["a", "b"], () => f.storage, () => f.now);
  f.repository.refresh(); second.refresh();
  f.repository.rate("a", "again", "2020-02-28");
  assert.equal(second.rate("a", "remembered", "2020-02-28").ok, false);
  assert.equal(second.snapshot().records.a.rating, "again");
  second.rate("b", "remembered", "2020-02-28");
  assert.equal(Object.keys(f.repository.refresh().records).length, 2);
});

test("blocked storage keeps a usable in-memory session and does not pretend to save", () => {
  const repo = new DailyReviewRepository(["a"], () => { throw new Error("SecurityError"); }, () => new Date(2020, 1, 28, 12));
  assert.match(repo.refresh().storageMessage, /无法读取/);
  const result = repo.rate("a", "remembered", "2020-02-28");
  assert.equal(result.ok, true);
  assert.match(result.message, /仅本页/);
  assert.equal(repo.refresh().records.a.stage, 1);
});

test("read failure never triggers a blind write to an existing card", () => {
  let writes = 0;
  const storage = { getItem() { throw new Error("read blocked"); }, setItem() { writes++; } };
  const repo = new DailyReviewRepository(["a"], () => storage, () => new Date(2020, 1, 28, 12));
  repo.rate("a", "again", "2020-02-28");
  assert.equal(writes, 0);
  assert.match(repo.snapshot().storageMessage, /未能保存/);
});

test("silent storage write failure is detected and unsaved answers survive a refresh", () => {
  const storage = { getItem: () => null, setItem() {} };
  const repo = new DailyReviewRepository(["a"], () => storage, () => new Date(2020, 1, 28, 12));
  repo.rate("a", "remembered", "2020-02-28");
  assert.equal(repo.refresh().records.a.stage, 1);
  assert.match(repo.snapshot().storageMessage, /仅本页/);
  assert.deepEqual(repo.refresh(true).records, {});
});

test("midnight invalidates a stale displayed-day submission without recording an unseen card", () => {
  const f = fixture(); f.repository.refresh();
  f.now = new Date(2020, 1, 29, 0, 1);
  const result = f.repository.rate("a", "remembered", "2020-02-28");
  assert.equal(result.ok, false);
  assert.match(result.message, /日期已变化/);
  assert.equal(f.repository.snapshot().today, "2020-02-29");
  assert.equal(f.values.size, 0);
});

test("invalid stored record is not overwritten merely by visiting the review page", () => {
  const f = fixture(); f.values.set(reviewStorageKey("a"), "corrupted");
  assert.match(f.repository.refresh().storageMessage, /格式异常/);
  assert.equal(f.values.get(reviewStorageKey("a")), "corrupted");
  assert.equal(f.repository.rate("a", "again", "2020-02-28").ok, true);
  assert.equal(parseReviewRecord(f.values.get(reviewStorageKey("a")), "a").stage, 0);
});

test("catalog removal and storage clearing do not resurrect stale saved reviews", () => {
  const f = fixture(); f.repository.rate("a", "remembered", "2020-02-28");
  assert.equal(f.repository.rate("removed-id", "remembered", "2020-02-28").ok, false);
  assert.equal(f.repository.rate("a", "invalid-rating", "2020-02-28").ok, false);
  f.values.clear();
  assert.deepEqual(f.repository.refresh(true).records, {});
});

test("device clock rollback preserves the previous card and explains the date mismatch", () => {
  const f = fixture(); f.repository.rate("a", "remembered", "2020-02-28");
  const before = f.values.get(reviewStorageKey("a"));
  f.now = new Date(2020, 1, 27, 12);
  const result = f.repository.rate("a", "again", "2020-02-27");
  assert.equal(result.ok, false);
  assert.match(result.message, /系统日期/);
  assert.equal(f.values.get(reviewStorageKey("a")), before);
});
