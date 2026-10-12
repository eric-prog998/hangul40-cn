import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { emptyProgressStats } from "../app/progress-ledger.ts";
import { parseAutoAdvance } from "../app/learning-settings.ts";
import { parsePortableBackup, mergePortableProgress, backupFileName, BACKUP_MAX_BYTES } from "../app/portable-backup.ts";
import { createVowelAttemptId, VOWEL_HISTORY_PREFIX, VOWEL_HISTORY_LIMIT, mergeVowelHistory, readVowelHistory, writeVowelHistory, pendingVowelQuestions, recentVowelResults, parseVowelHistoryEntry } from "../app/vowel-history.ts";
import { DailyReviewRepository } from "../app/review-storage.ts";
import { rateReview, reviewStorageKey } from "../app/review-logic.ts";

const validation = { allowedLetters: new Set(["ㄱ", "ㅏ"]), allowedPhraseIds: new Set(["word-water"]), allowedRouteIds: new Set(["daily"]) };
function backup() { return { format: "hangul40-progress", version: 1, createdAt: "2026-10-11T12:00:00.000Z", progress: { stats: emptyProgressStats("2026-10-11"), mastered: ["ㄱ"], masteredPhrases: [] }, reviews: {}, typing: {}, vowelHistory: [], preferences: { autoAdvanceMs: 0, audioSpeed: 1, showRomanization: true, keyboardMode: "hangul", beginnerBlendCompleted: false, fullReviewCompleted: false } }; }
function memory() {
  const data = new Map();
  return { data, get length() { return data.size; }, key(index) { return [...data.keys()][index] ?? null; }, getItem(key) { return data.get(key) ?? null; }, setItem(key, value) { data.set(key, value); }, removeItem(key) { data.delete(key); } };
}
function entry(index, choice = 1, questionId = "0-isolated-0") { return { id: `attempt-00000000-${String(index).padStart(5, "0")}`, questionId, choice, at: 1791720000000 + index }; }

test("v41 manual advance survives parsing and only supported timings are accepted", () => {
  assert.equal(parseAutoAdvance("0"), 0);
  assert.equal(parseAutoAdvance("2000"), 2000);
  assert.equal(parseAutoAdvance("5000"), 5000);
  for (const value of [null, "", " ", "-1", "100", "NaN", "true"]) assert.equal(parseAutoAdvance(value), 3000);
});

test("v41 backup round trip validates all categories and manual settings", () => {
  const source = backup();
  source.reviews["word-water"] = rateReview(undefined, "word-water", "remembered", "2026-10-11", 1791720000000);
  source.typing.daily = { elapsedMs: 10000, accuracy: 90, cpm: 30 };
  source.vowelHistory = [entry(1)];
  assert.deepEqual(parsePortableBackup(JSON.stringify(source), validation), source);
});

test("v41 rejects corrupt, oversized and unsupported backup files", () => {
  assert.throws(() => parsePortableBackup("<html>not a backup</html>", validation), /JSON/);
  assert.throws(() => parsePortableBackup(" ".repeat(BACKUP_MAX_BYTES + 1), validation), /2 MB/);
  for (const change of [{ version: 2 }, { format: "other-app" }, { createdAt: "invalid" }, { extra: "not allowed" }]) {
    assert.throws(() => parsePortableBackup(JSON.stringify({ ...backup(), ...change }), validation));
  }
});

test("v41 rejects invalid IDs, dates, numbers and nested payloads before any import", () => {
  for (const mutate of [
    b => { b.progress.mastered = ["not-a-letter"]; },
    b => { b.progress.stats.totalXp = -1; },
    b => { b.reviews.unknown = {}; },
    b => { b.typing.daily = { elapsedMs: 5, accuracy: 999, cpm: 9 }; },
    b => { b.vowelHistory = [entry(1, 9)]; },
    b => { b.vowelHistory = [entry(1), entry(1)]; },
    b => { b.preferences.autoAdvanceMs = 1; },
  ]) {
    const source = backup(); mutate(source);
    assert.throws(() => parsePortableBackup(JSON.stringify(source), validation));
  }
  const source = JSON.stringify(backup()).replace('"reviews":{}', '"reviews":{"__proto__":{"polluted":true}}');
  assert.throws(() => parsePortableBackup(source, validation));
  assert.equal({}.polluted, undefined);
});

test("v41 progress import uses a union and high-water counts, so repeats are idempotent", () => {
  const current = backup().progress; current.stats.totalXp = 30; current.stats.games = 2; current.stats.mistakes = { "ㄱ": 5 };
  const incoming = backup().progress; incoming.mastered = ["ㅏ"]; incoming.masteredPhrases = ["word-water"]; incoming.stats.totalXp = 20; incoming.stats.games = 4; incoming.stats.mistakes = { "ㄱ": 2 };
  const merged = mergePortableProgress(current, incoming, "2026-10-11");
  assert.equal(merged.stats.totalXp, 30); assert.equal(merged.stats.games, 4); assert.equal(merged.stats.mistakes["ㄱ"], 5);
  assert.deepEqual(merged.mastered, ["ㄱ", "ㅏ"]); assert.deepEqual(merged.masteredPhrases, ["word-water"]);
  assert.deepEqual(mergePortableProgress(merged, incoming, "2026-10-11"), merged);
});

test("v41 history survives reload and independent writers, and duplicate import does not add answers", () => {
  const storage = memory(); storage.setItem("unrelated", "preserve");
  writeVowelHistory(storage, [entry(1)]); writeVowelHistory(storage, [entry(2)]); writeVowelHistory(storage, [entry(1)]);
  assert.equal(readVowelHistory(storage).records.length, 2);
  assert.equal(storage.getItem("unrelated"), "preserve");
  assert.equal(recentVowelResults(readVowelHistory(storage).records).total, 2);
});

test("v41 wrong sounds need two consecutive correct attempts before leaving review", () => {
  assert.equal(pendingVowelQuestions([entry(1)]).length, 1);
  assert.equal(pendingVowelQuestions([entry(1), entry(2, 0)]).length, 1);
  assert.equal(pendingVowelQuestions([entry(1), entry(2, 0), entry(3, 0)]).length, 0);
  assert.equal(pendingVowelQuestions([entry(1), entry(2, 0), entry(3, 1), entry(4, 0)]).length, 1);
  assert.equal(pendingVowelQuestions([entry(1, 0)]).length, 0);
});

test("v41 history keeps the newest 200 and reports only the most recent 20", () => {
  const storage = memory();
  for (let index = 0; index < 205; index++) storage.setItem(VOWEL_HISTORY_PREFIX + entry(index).id, JSON.stringify(entry(index, index > 199 ? 0 : 1)));
  const result = writeVowelHistory(storage, [entry(205, 0)]);
  assert.equal(result.length, VOWEL_HISTORY_LIMIT);
  assert.equal(storage.length, VOWEL_HISTORY_LIMIT);
  assert.deepEqual(recentVowelResults(result), { total: 20, correct: 6 });
});

test("v41 conflicting IDs cannot rewrite saved answers and malformed records remain untouched", () => {
  assert.equal(mergeVowelHistory([entry(1)], [entry(1, 0)])[0].choice, 1);
  const storage = memory(); storage.setItem(VOWEL_HISTORY_PREFIX + entry(1).id, "broken");
  assert.equal(readVowelHistory(storage).invalid, true);
  assert.throws(() => writeVowelHistory(storage, [entry(1)]));
  assert.equal(storage.getItem(VOWEL_HISTORY_PREFIX + entry(1).id), "broken");
  assert.equal(parseVowelHistoryEntry({ ...entry(1), questionId: "evil" }), null);
});

test("v41 silent history storage failures are not reported as saved", () => {
  const storage = memory(); storage.setItem = () => {};
  assert.throws(() => writeVowelHistory(storage, [entry(1)]), /未能保存/);
  assert.equal(readVowelHistory(storage).records.length, 0);
});

test("v41 review import preserves the newest schedule and is repeatable", () => {
  const storage = memory(); const repo = new DailyReviewRepository(["word-water"], () => storage, () => new Date("2026-10-11T12:00:00Z"));
  const old = rateReview(undefined, "word-water", "again", "2026-10-10", 1791630000000);
  const recent = rateReview(old, "word-water", "remembered", "2026-10-11", 1791720000000);
  storage.setItem(reviewStorageKey("word-water"), JSON.stringify(recent)); repo.refresh();
  assert.equal(repo.restore({ "word-water": old }), true);
  assert.deepEqual(repo.snapshot().records["word-water"], recent);
  assert.equal(repo.restore({ "word-water": recent }), true);
  assert.deepEqual(repo.snapshot().records["word-water"], recent);
});

test("v41 review import reports denied writes and never overwrites on a failed read", () => {
  let writes = 0;
  const repo = new DailyReviewRepository(["word-water"], () => ({ getItem() { throw new Error("denied"); }, setItem() { writes++; } }));
  const item = rateReview(undefined, "word-water", "remembered", "2026-10-11", 1791720000000);
  assert.equal(repo.restore({ "word-water": item }), false); assert.equal(writes, 0);
});

test("v41 all five auto-next modes use the shared setting and backup keys stay scoped", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.equal((page.match(/if \(autoAdvanceMs === 0 \|\| !pageVisible/g) ?? []).length, 3);
  assert.match(page, /navigator\.locks\.request\("hangul-portable-import-v41"/);
  assert.match(page, /data-keyboard-scope="settings"/);
  assert.doesNotMatch(page, /localStorage\.clear\(/);
  for (const filename of ["batchim-lesson.tsx", "vowel-listening-challenge.tsx"]) {
    const source = await readFile(new URL(`../app/${filename}`, import.meta.url), "utf8");
    assert.match(source, /if \(autoAdvanceMs === 0\) return/);
    assert.match(source, /useEffect\(\(\) => \{ stop\(\); \}, \[autoAdvanceMs, stop\]\)/);
    assert.match(source, /\}, autoAdvanceMs\)/);
  }
});

test("backup files are named after the learner's local calendar day, whatever the UTC date is", () => {
  // Half past midnight and half past eleven at night, local time: in most time zones one of them falls on another UTC day.
  assert.equal(backupFileName(new Date(2026, 9, 12, 0, 30).toISOString()), "hangul40-progress-2026-10-12.json");
  assert.equal(backupFileName(new Date(2026, 9, 12, 23, 30).toISOString()), "hangul40-progress-2026-10-12.json");
  assert.equal(backupFileName(new Date(2027, 0, 1, 0, 5).toISOString()), "hangul40-progress-2027-01-01.json");
});

test("attempt ids are valid and unique even where crypto.randomUUID does not exist", () => {
  const withUuid = createVowelAttemptId();
  const fallbackIds = new Set(Array.from({ length: 200 }, () => createVowelAttemptId(null)));
  assert.equal(fallbackIds.size, 200);
  for (const id of [withUuid, ...fallbackIds, createVowelAttemptId({}), createVowelAttemptId({ randomUUID: () => "NOT A VALID ID" })]) {
    assert.ok(parseVowelHistoryEntry({ id, questionId: "0-isolated-0", choice: 0, at: 1 }), `${id} must pass history validation`);
  }
  // Deterministic sources still produce a well-formed id.
  assert.equal(createVowelAttemptId(null, () => 0, () => 0), "attempt-0-00000000-00000000");
});
