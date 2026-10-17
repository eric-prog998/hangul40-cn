import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { createAudioCatalog, filterAudioCatalog, audioFeedback, audioReviewChecklist } from "../app/audio-catalog.ts";
const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const names = await json("../data/consonant-names.json");
const phrases = await json("../data/phrases.json");
const fingerprints = await json("../data/audio-fingerprints.json");
const catalog = createAudioCatalog(names, phrases, fingerprints);

test("catalog maps every packaged audio exactly once with matching file fingerprint", async () => {
  const files = (await readdir(new URL("../public/audio/", import.meta.url), { recursive: true })).filter(path => /\.(mp3|wav)$/.test(path)).map(path => `/audio/${path}`);
  assert.equal(catalog.length, 492);
  assert.equal(new Set(catalog.map(entry => entry.id)).size, 492);
  assert.deepEqual(catalog.map(entry => entry.path).sort(), files.sort());
  assert.deepEqual(Object.keys(fingerprints).sort(), files.sort());
  for (const entry of catalog) {
    const bytes = await readFile(new URL(`../public${entry.path}`, import.meta.url));
    assert.ok(bytes.length > 100, entry.id);
    assert.equal(entry.fingerprint.bytes, bytes.length, entry.id);
    assert.equal(entry.fingerprint.sha256, createHash("sha256").update(bytes).digest("hex"), entry.id);
    assert.equal(entry.reviewStatus, "pending");
  }
});
test("silent ㅇ has a name but no fabricated onset; clarity clips are explicitly repeated", () => {
  assert.ok(catalog.some(entry => entry.id === "name-ieung"));
  assert.ok(!catalog.some(entry => entry.id === "onset-ieung"));
  assert.equal(catalog.filter(entry => entry.category === "clarity").length, 4);
  assert.ok(catalog.filter(entry => entry.category === "clarity").every(entry => entry.explanation.includes("重复两次")));
  assert.equal(catalog.filter(entry => entry.category === "vowel").length, 21);
  assert.equal(catalog.filter(entry => entry.category === "phrase").length, 52);
});
test("search supports Korean, Chinese, empty matches and exact category restrictions", () => {
  assert.equal(filterAudioCatalog(catalog, "phrase", "收据")[0].id, "word-receipt");
  assert.ok(filterAudioCatalog(catalog, "onset", "ㄹ").every(entry => entry.category === "onset"));
  assert.deepEqual(filterAudioCatalog(catalog, "all", "没有这个条目xyz"), []);
});
test("feedback identifies the selected file without exporting learning data or asserting verification", () => {
  const item = catalog.find(entry => entry.id === "word-water");
  const report = audioFeedback(item, "怀疑读音不准确", "有点模糊\0", "43");
  assert.ok(report.includes(item.path) && report.includes(item.fingerprint.sha256));
  assert.ok(report.includes("未发送") && report.includes("待逐条听审"));
  assert.ok(!report.includes("\0"));
  assert.ok(!audioFeedback(item, "other", "x".repeat(501), "43").includes("x".repeat(501)));
});
test("review checklist starts entirely pending and is tied to exact audio bytes", () => {
  const checklist = audioReviewChecklist(catalog, "43");
  assert.equal(checklist.items.length, 492);
  assert.ok(checklist.items.every(item => item.reviewStatus === "pending" && item.reviewedAt === null && item.reviewer === "" && /^[0-9a-f]{64}$/.test(item.sha256)));
});
