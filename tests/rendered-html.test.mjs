import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";
import {
  INITIAL_ORDER,
  VOWEL_ORDER,
  areBlendPartsEquivalent,
  areBlindLettersConfusable,
  decomposeHangulSyllable,
  decomposeHangulText,
  fairBlendInitialCandidates,
  fairBlendVowelCandidates,
  hasOnlyOpenHangulSyllables,
  isFairBlendTarget,
  makeSyllable,
  selectFairBlindLetters,
  usesOnlyOpenSyllablesFromSets,
} from "../app/learning-logic.ts";
import {
  LEGACY_MASTERY_SNAPSHOT_KEY,
  MAX_PROGRESS_CLOCK_DIGITS,
  PROGRESS_CHECKPOINT_BACKUP_KEY,
  PROGRESS_CHECKPOINT_KEY,
  PROGRESS_EPOCH_META_KEY,
  PROGRESS_EPOCH_NAMESPACE_PREFIX,
  PROGRESS_LEDGER_KEY_PREFIX,
  PROGRESS_SESSION_LEDGER_ID_KEY,
  applyProgressLedgerOperation,
  compactProgressLedgers,
  createLegacyMasteryOperations,
  createProgressLedger,
  emptyProgressStats,
  finalizeProgressCheckpoint,
  isProgressEpochMetaTransitionAllowed,
  mergeProgress,
  mergeLegacyProgressStatsHighWater,
  nextProgressLedgerClock,
  parseLegacyMasterySnapshot,
  parseLegacyProgressStats,
  parseProgressCheckpoint,
  parseProgressEpochBaseline,
  parseProgressEpochMeta,
  parseProgressLedger,
  parseProgressLedgerSeal,
  parseLegacyProgress,
  resolveLegacyProgressBackupSnapshot,
  progressEpochBaselineBackupKey,
  progressEpochBaselineKey,
  progressEpochCheckpointBackupKey,
  progressEpochCheckpointKey,
  progressEpochLedgerIdFromKey,
  progressEpochLedgerIdFromSealKey,
  progressEpochLedgerKey,
  progressEpochLedgerSealKey,
  progressEpochLegacyMasterySnapshotKey,
  progressEpochRollbackGuardKey,
  serializeProgressCheckpoint,
  serializeProgressEpochBaseline,
  serializeProgressEpochMeta,
  serializeProgressLedger,
} from "../app/progress-ledger.ts";
import {
  calculateTypingAccuracy,
  calculateTypingCpm,
  chooseTypingBest,
  formatTypingTime,
  isTypingAnswerCorrect,
  mergeTypingBestRecords,
  normalizeTypingInput,
  parseTypingBestRecords,
  typingBestRecordsCover,
  typingErrorDistance,
} from "../app/typing-logic.ts";
import { keyboardShortcutKey } from "../app/keyboard-logic.ts";
import { millisecondsUntilNextLocalMidnight } from "../app/date-logic.ts";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function audioFileFor(syllable) {
  return new URL(`../public/audio/hangul-natural/s-${syllable.codePointAt(0).toString(16)}.mp3`, import.meta.url);
}

function builtAudioFileFor(syllable) {
  return new URL(`../dist/client/audio/hangul-natural/s-${syllable.codePointAt(0).toString(16)}.mp3`, import.meta.url);
}

const initialOrder = INITIAL_ORDER;
const vowelOrder = VOWEL_ORDER;
const comparisonVowels = ["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ"];

test("validates Korean typing answers and keeps the strongest route records", () => {
  assert.equal(normalizeTypingInput("  화장실  "), "화장실");
  assert.equal(isTypingAnswerCorrect("  화장실 ", "화장실"), true);
  assert.equal(isTypingAnswerCorrect("화장실이", "화장실"), false);
  assert.equal(typingErrorDistance("지하철", "지하철"), 0);
  assert.equal(typingErrorDistance("지하철", "지하절"), 1);
  assert.equal(calculateTypingAccuracy(8, 2), 80);
  assert.equal(calculateTypingAccuracy(0, 0), 100);
  assert.equal(calculateTypingCpm(20, 30_000), 40);
  assert.equal(formatTypingTime(65_490), "1:05.4");

  const accurate = { elapsedMs: 12_000, accuracy: 100, cpm: 40 };
  const fastButWrong = { elapsedMs: 7_000, accuracy: 80, cpm: 70 };
  const fasterAccurate = { elapsedMs: 10_000, accuracy: 100, cpm: 48 };
  assert.equal(chooseTypingBest(accurate, fastButWrong), accurate,
    "accuracy must beat rushing through a route with errors");
  assert.equal(chooseTypingBest(accurate, fasterAccurate), fasterAccurate);

  const allowed = new Set(["survival", "time-travel"]);
  const parsed = parseTypingBestRecords(JSON.stringify({
    survival: accurate,
    unknown: fasterAccurate,
    "time-travel": { elapsedMs: 0, accuracy: 101, cpm: -1 },
  }), allowed);
  assert.deepEqual(parsed, { survival: accurate });
  assert.deepEqual(parseTypingBestRecords("not-json", allowed), {});
  const merged = mergeTypingBestRecords(parsed, { survival: fasterAccurate, "time-travel": accurate });
  assert.deepEqual(merged, { survival: fasterAccurate, "time-travel": accurate });
  assert.equal(typingBestRecordsCover(merged, parsed), true);
  assert.equal(typingBestRecordsCover(parsed, merged), false);
});

test("schedules a refresh immediately after the next local midnight", () => {
  assert.equal(millisecondsUntilNextLocalMidnight(new Date(2026, 6, 18, 23, 59, 59, 900)), 150);
  const noonDelay = millisecondsUntilNextLocalMidnight(new Date(2026, 6, 18, 12, 0, 0, 0));
  assert.equal(noonDelay, 12 * 60 * 60 * 1_000 + 50);
});

test("keeps valid progress when obsolete phrase ids are removed", () => {
  const validation = { allowedLetters: new Set(["ㄱ"]), allowedPhraseIds: new Set(["phrase-current"]) };
  const ledgerId = "page-obsolete-phrase";
  const raw = JSON.stringify({
    version: 1,
    ledgerId,
    clock: 20,
    stats: {
      totalXp: 40,
      bestCombo: 3,
      games: 2,
      mistakes: {},
      phraseMistakes: { "phrase-current": 2, "phrase-retired": 7 },
      history: { "2026-07-27": 40 },
    },
    mastered: { "ㄱ": { value: true, clock: 10 } },
    masteredPhrases: {
      "phrase-current": { value: true, clock: 11 },
      "phrase-retired": { value: true, clock: 12 },
    },
  });

  const parsed = parseProgressLedger(raw, validation, ledgerId);
  assert.ok(parsed, "an obsolete phrase id must not invalidate unrelated progress");
  assert.equal(parsed.stats.totalXp, 40);
  assert.deepEqual(parsed.stats.phraseMistakes, { "phrase-current": 2 });
  assert.deepEqual(parsed.masteredPhrases, { "phrase-current": { value: true, clock: "11" } });

  const badLetter = JSON.parse(raw);
  badLetter.mastered["retired-letter"] = { value: true, clock: 13 };
  assert.equal(parseProgressLedger(JSON.stringify(badLetter), validation, ledgerId), null,
    "unknown structural letter data remains a hard validation failure");

  const legacy = parseLegacyProgress({
    stats: JSON.stringify({
      date: "2026-07-29",
      dailyXp: 15,
      totalXp: 40,
      bestCombo: 3,
      games: 2,
      mistakes: { "ㄱ": 1 },
      phraseMistakes: { "phrase-current": 2, "phrase-retired": 7 },
      history: { "2026-07-29": 15 },
    }),
    mastered: JSON.stringify(["ㄱ"]),
    masteredPhrases: JSON.stringify(["phrase-current", "phrase-retired"]),
  }, "2026-07-29", validation);
  assert.equal(legacy.stats.totalXp, 40, "an obsolete legacy phrase id must not discard XP and history");
  assert.deepEqual(legacy.stats.phraseMistakes, { "phrase-current": 2 });
  assert.deepEqual(legacy.masteredPhrases, ["phrase-current"], "only the retired phrase mastery entry is removed");

  const validLegacyStats = {
    date: "2026-07-29",
    dailyXp: 15,
    totalXp: 40,
    bestCombo: 3,
    games: 2,
    mistakes: { "ㄱ": 1 },
    phraseMistakes: { "phrase-current": 2 },
    history: { "2026-07-29": 15 },
  };
  assert.equal(parseLegacyProgressStats(JSON.stringify({ ...validLegacyStats, totalXp: "40" }), validation), null,
    "a malformed scalar count must not be silently converted to zero");
  assert.equal(parseLegacyProgressStats(JSON.stringify({ ...validLegacyStats, mistakes: { "ㄱ": "1" } }), validation), null,
    "a malformed map count must not replace the last validated legacy baseline");
  const v3LegacyStats = { ...validLegacyStats };
  delete v3LegacyStats.phraseMistakes;
  assert.deepEqual(parseLegacyProgressStats(JSON.stringify(v3LegacyStats), validation), {
    ...validLegacyStats,
    phraseMistakes: {},
  }, "v3-v5 progress without phrase mistakes must still migrate");
  const earlyLegacyStats = { ...v3LegacyStats };
  delete earlyLegacyStats.history;
  assert.deepEqual(parseLegacyProgressStats(JSON.stringify(earlyLegacyStats), validation), {
    ...validLegacyStats,
    phraseMistakes: {},
    history: { "2026-07-29": 15 },
  }, "early progress without history must rebuild its current-day XP entry");
  assert.equal(parseLegacyProgressStats(JSON.stringify({ ...v3LegacyStats, phraseMistakes: "bad" }), validation), null,
    "an optional legacy field that exists with the wrong type must still be rejected");
  assert.equal(parseLegacyProgressStats(JSON.stringify({ ...v3LegacyStats, history: { "2026-07-29": "15" } }), validation), null,
    "malformed optional history must not be treated as missing history");
  assert.equal(parseLegacyProgressStats(JSON.stringify({ ...validLegacyStats, unexpected: 1 }), validation), null,
    "unknown legacy fields must remain a hard validation failure");
  const protectedLegacyStats = mergeLegacyProgressStatsHighWater(
    { ...validLegacyStats, totalXp: 80, games: 1, history: { "2026-07-29": 8 } },
    { ...validLegacyStats, totalXp: 120, games: 4, mistakes: { "ㄱ": 3 }, history: { "2026-07-29": 12 } },
    "2026-07-29",
  );
  assert.equal(protectedLegacyStats.totalXp, 120);
  assert.equal(protectedLegacyStats.games, 4);
  assert.equal(protectedLegacyStats.mistakes["ㄱ"], 3);
  assert.equal(protectedLegacyStats.dailyXp, 12);

  assert.equal(parseLegacyMasterySnapshot(JSON.stringify({
    version: 1,
    mastered: [123],
    masteredPhrases: ["phrase-current"],
  }), validation), null, "malformed mastery values must not be migrated as an empty list");
  assert.deepEqual(parseLegacyMasterySnapshot(JSON.stringify({
    version: 1,
    mastered: ["ㄱ"],
    masteredPhrases: ["phrase-current", "phrase-retired"],
  }), validation), { version: 1, mastered: ["ㄱ"], masteredPhrases: ["phrase-current"] });
});

test("extends progress clocks beyond the safe-integer boundary", () => {
  const validation = { allowedLetters: new Set(["ㄱ"]), allowedPhraseIds: new Set(["phrase-current"]) };
  const emptyDelta = { totalXp: 0, bestCombo: 0, games: 0, mistakes: {}, phraseMistakes: {}, history: {} };
  for (const [index, boundary] of [Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER].entries()) {
    const ledgerId = `page-boundary-clock-${index}`;
    const parsed = parseProgressLedger(JSON.stringify({
      version: 1,
      ledgerId,
      clock: boundary,
      stats: emptyDelta,
      mastered: {},
      masteredPhrases: {},
    }), validation, ledgerId);
    assert.ok(parsed, "legacy numeric clocks at the old boundary must remain readable");
    assert.equal(parsed.clock, String(boundary));
    const nextClock = nextProgressLedgerClock([parsed]);
    assert.equal(nextClock, (BigInt(boundary) + 1n).toString());
    const updated = applyProgressLedgerOperation(parsed, {
      kind: "stats",
      delta: { ...emptyDelta, totalXp: 10, bestCombo: 1, history: { "2026-08-01": 10 } },
    }, nextClock, validation);
    const reloaded = parseProgressLedger(serializeProgressLedger(updated), validation, ledgerId);
    assert.ok(reloaded);
    assert.equal(reloaded.clock, nextClock);
    const merged = mergeProgress(
      { stats: emptyProgressStats("2026-08-01"), mastered: [], masteredPhrases: [] },
      [reloaded],
      "2026-08-01",
      validation,
    );
    assert.equal(merged.stats.totalXp, 10);
    assert.equal(merged.stats.dailyXp, 10, "the next click must survive serialization and reload");
  }

  const boundaryCheckpoint = {
    version: 1,
    clock: Number.MAX_SAFE_INTEGER,
    stats: emptyDelta,
    mastered: {},
    masteredPhrases: {},
    included: {},
  };
  const parsedCheckpoint = parseProgressCheckpoint(JSON.stringify(boundaryCheckpoint), validation);
  assert.ok(parsedCheckpoint);
  assert.equal(nextProgressLedgerClock([], parsedCheckpoint.clock), "9007199254740992");
  const parsedSeal = parseProgressLedgerSeal(JSON.stringify({
    version: 1,
    ledgerId: "page-boundary-seal",
    clock: Number.MAX_SAFE_INTEGER,
    sealedAt: 1,
  }), "page-boundary-seal");
  assert.equal(parsedSeal?.clock, String(Number.MAX_SAFE_INTEGER));

  const hugeClock = "9".repeat(80);
  assert.equal(nextProgressLedgerClock([], hugeClock), `1${"0".repeat(80)}`,
    "decimal clocks must continue without moving the dead boundary to another finite integer");

  const oversizedClock = "1".repeat(MAX_PROGRESS_CLOCK_DIGITS + 1);
  const oversizedLedger = {
    version: 1,
    ledgerId: "page-oversized-clock",
    clock: oversizedClock,
    stats: emptyDelta,
    mastered: {},
    masteredPhrases: {},
  };
  assert.equal(parseProgressLedger(JSON.stringify(oversizedLedger), validation, oversizedLedger.ledgerId), null,
    "untrusted clocks must be bounded before comparison and increment work");
  assert.throws(() => nextProgressLedgerClock([], "9".repeat(MAX_PROGRESS_CLOCK_DIGITS)),
    /digit limit reached/,
    "the largest bounded clock must never generate an over-limit persisted value");
});

test("checkpoints sealed ledgers without double-counting crash leftovers", () => {
  const validation = { allowedLetters: new Set(["ㄱ"]), allowedPhraseIds: new Set(["phrase-current"]) };
  const today = "2026-07-27";
  const statsDelta = (xp, games) => ({
    totalXp: xp,
    bestCombo: games,
    games,
    mistakes: {},
    phraseMistakes: {},
    history: { [today]: xp },
  });
  let first = createProgressLedger("page-checkpoint-a");
  first = applyProgressLedgerOperation(first, { kind: "stats", delta: statsDelta(10, 1) }, 100, validation);
  first = applyProgressLedgerOperation(first, { kind: "mastered", key: "ㄱ", value: true }, 101, validation);
  let second = createProgressLedger("page-checkpoint-b");
  second = applyProgressLedgerOperation(second, { kind: "stats", delta: statsDelta(20, 2) }, 200, validation);
  second = applyProgressLedgerOperation(second, { kind: "mastered", key: "ㄱ", value: false }, 201, validation);

  const provisional = compactProgressLedgers(null, [first, second]);
  assert.deepEqual(provisional.included, { "page-checkpoint-a": "101", "page-checkpoint-b": "201" });
  assert.equal(provisional.clock, "201");
  assert.deepEqual(parseProgressCheckpoint(serializeProgressCheckpoint(provisional), validation), provisional);

  const baseline = { stats: emptyProgressStats(today), mastered: [], masteredPhrases: [] };
  const duringCrashRecovery = mergeProgress(baseline, [first, second], today, validation, provisional);
  assert.equal(duringCrashRecovery.stats.totalXp, 30, "checkpoint plus undeleted source keys must count once");
  assert.equal(duringCrashRecovery.stats.games, 3);
  assert.deepEqual(duringCrashRecovery.mastered, [], "the later compacted mastery write must win");

  const finalized = finalizeProgressCheckpoint(provisional, new Set());
  assert.deepEqual(finalized.included, {});
  const afterDeletion = mergeProgress(baseline, [], today, validation, finalized);
  assert.deepEqual(afterDeletion, duringCrashRecovery);
});

test("translates legacy mastery changes observed while v19 was closed", () => {
  const validation = {
    allowedLetters: new Set(["ㄱ", "ㄴ"]),
    allowedPhraseIds: new Set(["phrase-a", "phrase-b"]),
  };
  const operations = createLegacyMasteryOperations(
    { mastered: ["ㄱ"], masteredPhrases: ["phrase-a"] },
    { mastered: ["ㄴ"], masteredPhrases: ["phrase-a", "phrase-b"] },
    validation,
  );
  assert.deepEqual(operations, [
    { kind: "mastered", key: "ㄱ", value: false },
    { kind: "mastered", key: "ㄴ", value: true },
    { kind: "masteredPhrase", key: "phrase-b", value: true },
  ]);
});

test("rebuilds legacy backups from the latest replaceable mastery state", () => {
  const today = "2026-08-31";
  const stats = {
    date: today,
    dailyXp: 4,
    totalXp: 9,
    bestCombo: 2,
    games: 1,
    mistakes: {},
    phraseMistakes: {},
    history: { [today]: 4 },
  };
  const captured = { stats, mastered: [], masteredPhrases: [] };
  const existing = { stats, mastered: ["ㄱ"], masteredPhrases: ["phrase-a"] };

  const latest = resolveLegacyProgressBackupSnapshot(captured, existing, {
    stats,
    mastered: ["ㄱ", "ㄴ"],
    masteredPhrases: ["phrase-a", "phrase-b"],
  }, today);
  assert.deepEqual(latest?.mastered, ["ㄱ", "ㄴ"], "a queued stale capture must not replace a newer live mastery list");
  assert.deepEqual(latest?.masteredPhrases, ["phrase-a", "phrase-b"]);

  const cancelled = resolveLegacyProgressBackupSnapshot(captured, existing, {
    stats,
    mastered: [],
    masteredPhrases: [],
  }, today);
  assert.deepEqual(cancelled?.mastered, [], "a valid empty list is an intentional unmaster-all operation");
  assert.deepEqual(cancelled?.masteredPhrases, []);

  const damaged = resolveLegacyProgressBackupSnapshot(captured, existing, {
    stats: null,
    mastered: null,
    masteredPhrases: null,
  }, today);
  assert.deepEqual(damaged?.mastered, ["ㄱ"], "missing or damaged fields must retain the validated backup");
  assert.equal(resolveLegacyProgressBackupSnapshot(captured, null, {
    stats: null,
    mastered: null,
    masteredPhrases: null,
  }, today), null, "fresh or cleared storage must not be rebuilt from a queued captured snapshot");
});

test("namespaces every v31 progress record under one validated reset epoch", () => {
  const epoch = "epoch-20260831-test";
  const ledgerId = "page-20260831-test";
  const meta = { version: 1, epoch, state: "ready", source: "legacy" };
  const serialized = serializeProgressEpochMeta(meta);
  assert.deepEqual(parseProgressEpochMeta(serialized), meta);
  assert.equal(parseProgressEpochMeta(JSON.stringify({ ...meta, state: "done" })), null);
  assert.equal(parseProgressEpochMeta(JSON.stringify({ ...meta, source: "dynamic" })), null);
  assert.equal(parseProgressEpochMeta(JSON.stringify({ ...meta, extra: true })), null);

  const migrating = { ...meta, state: "migrating" };
  const nextEmpty = { ...meta, epoch: "epoch-20260831-empty", source: "empty" };
  assert.equal(isProgressEpochMetaTransitionAllowed(null, meta), true);
  assert.equal(isProgressEpochMetaTransitionAllowed(migrating, meta), true,
    "one migration may advance to ready without changing its epoch or source");
  assert.equal(isProgressEpochMetaTransitionAllowed(meta, migrating), false,
    "a committed epoch must never move back to migrating");
  assert.equal(isProgressEpochMetaTransitionAllowed(meta, { ...meta, source: "empty" }), false,
    "an epoch source is immutable after it is accepted");
  assert.equal(isProgressEpochMetaTransitionAllowed(meta, nextEmpty), false,
    "a different epoch must be rejected without an explicit clear");
  assert.equal(isProgressEpochMetaTransitionAllowed(meta, nextEmpty, true), true,
    "an explicit clear may adopt a different empty epoch");

  const validation = { allowedLetters: new Set(["ㄱ"]), allowedPhraseIds: new Set(["word-water"]) };
  const migratedBaseline = {
    version: 1,
    snapshot: {
      stats: {
        date: "2026-08-31",
        dailyXp: 100,
        totalXp: 100,
        bestCombo: 4,
        games: 2,
        mistakes: { "ㄱ": 1 },
        phraseMistakes: {},
        history: { "2026-08-31": 100 },
      },
      mastered: ["ㄱ"],
      masteredPhrases: [],
    },
  };
  const baselineSerialized = serializeProgressEpochBaseline(migratedBaseline);
  assert.deepEqual(parseProgressEpochBaseline(baselineSerialized, validation), migratedBaseline);
  assert.equal(parseProgressEpochBaseline(JSON.stringify({ ...migratedBaseline, extra: true }), validation), null);

  const scopedIncrement = applyProgressLedgerOperation(createProgressLedger(ledgerId), {
    kind: "stats",
    delta: { totalXp: 10, bestCombo: 0, games: 1, mistakes: {}, phraseMistakes: {}, history: { "2026-08-31": 10 } },
  }, "1", validation);
  const afterOldKeysDisappear = mergeProgress(
    parseProgressEpochBaseline(baselineSerialized, validation).snapshot,
    [scopedIncrement],
    "2026-08-31",
    validation,
  );
  assert.equal(afterOldKeysDisappear.stats.totalXp, 110,
    "the migrated 100 XP must survive independently of every old unscoped key");

  const prefix = `${PROGRESS_EPOCH_NAMESPACE_PREFIX}${epoch}:`;
  const ledgerKey = progressEpochLedgerKey(epoch, ledgerId);
  const sealKey = progressEpochLedgerSealKey(epoch, ledgerId);
  for (const key of [
    ledgerKey,
    sealKey,
    progressEpochBaselineKey(epoch),
    progressEpochBaselineBackupKey(epoch),
    progressEpochCheckpointKey(epoch),
    progressEpochCheckpointBackupKey(epoch),
    progressEpochRollbackGuardKey(epoch),
    progressEpochLegacyMasterySnapshotKey(epoch),
  ]) assert.ok(key.startsWith(prefix), `${key} must stay inside the active reset epoch`);
  assert.equal(progressEpochLedgerIdFromKey(ledgerKey, epoch), ledgerId);
  assert.equal(progressEpochLedgerIdFromSealKey(sealKey, epoch), ledgerId);
  assert.equal(progressEpochLedgerIdFromKey(progressEpochLedgerKey("epoch-other-test", ledgerId), epoch), null,
    "a late write from an old epoch must be invisible to the current reader");
  assert.equal(PROGRESS_EPOCH_META_KEY, "hangul-progress-epoch-meta-v31");
});

test("renders the real Korean learning product", async () => {
  const phraseItems = JSON.parse(await readFile(new URL("../data/phrases.json", import.meta.url), "utf8"));
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /韩语 40 音｜中文闯关版/);
  assert.match(html, /中文闯关版 · v37/);
  assert.match(html, /用自己的韩文键盘作答/);
  assert.doesNotMatch(html, /v24 把零基础路线/);
  assert.match(html, /中文零基础 · 10 分钟起步/);
  assert.match(html, /韩文字块第一课/);
  assert.match(html, /已学字母首读/);
  assert.match(html, /어디 · 버스/);
  assert.match(html, /生存 6 句/);
  assert.match(html, /先播放，再作答/);
  assert.match(html, /韩国真人起音/);
  assert.match(html, /真人起音 ↔ 完整音节对照器/);
  assert.match(html, /顺序播放：起音 → 完整音节/);
  assert.match(html, /当前范围专项闯关/);
  assert.match(html, /ㄹ、ㄲ、ㄸ、ㅃ 以同一裸起音原样重复两次/);
  assert.match(html, /韩语 40 音表 · 真人起音版/);
  assert.match(html, /韩国母语者真人起音 · 已截去完整元音/);
  assert.match(html, /生活词语/);
  assert.match(html, /지하철/);
  assert.match(html, /영수증/);
  assert.match(html, new RegExp(`${phraseItems.length}(?:<!-- -->)? 条词句现在全部使用网站内置完整韩语合成音频`));
  assert.match(html, /9 个可听起音；ㅇ 作初声只占位置，本来不发音/);
  assert.doesNotMatch(html, /Your site is taking shape|Codex is working|codex-preview/);
});

test("ships four complete typing lines with IME-safe mobile controls", async () => {
  const [routes, phrases, page, css] = await Promise.all([
    readFile(new URL("../data/typing-routes.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/phrases.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const words = new Map(phrases.filter((item) => item.type === "word").map((item) => [item.id, item]));
  const routedIds = routes.flatMap((route) => route.wordIds);
  assert.equal(routes.length, 4);
  assert.ok(routes.every((route) => route.wordIds.length === 8));
  assert.equal(routedIds.length, 32);
  assert.equal(new Set(routedIds).size, 32, "typing routes must not repeat life words");
  assert.deepEqual(new Set(routedIds), new Set(words.keys()), "all existing life words must appear exactly once");
  for (const id of routedIds) {
    const item = words.get(id);
    assert.ok(item, `${id} must resolve to a word`);
    assert.equal(item.korean, item.korean.normalize("NFC"));
    const audio = await stat(new URL(`../public/audio/phrases/${id}.mp3`, import.meta.url));
    assert.ok(audio.size > 3_000, `${id} must retain packaged complete audio`);
  }

  assert.match(page, /const gameModes = \["listen", "shadow", "match", "blend", "speed", "typing"\] as const/);
  assert.match(page, /id="game-tab-typing"[\s\S]{0,420}aria-selected=\{gameMode === "typing"\}/);
  assert.match(page, /id="game-panel-typing"[\s\S]{0,180}role="tabpanel" aria-labelledby="game-tab-typing"/);
  assert.match(page, /id="typing-input" type="text" lang="ko" inputMode="text" enterKeyHint="done"/);
  assert.match(page, /id="typing-target-korean" lang="ko"/);
  assert.match(page, /id="typing-target-chinese"/);
  assert.match(page, /aria-describedby="typing-target-korean typing-target-chinese typing-input-help"/,
    "the focused typing input must expose the current Korean target and Chinese meaning");
  assert.match(page, /autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck=\{false\}/);
  assert.match(page, /event\.nativeEvent\.isComposing \|\| typingCompositionRef\.current \|\| event\.keyCode === 229/);
  assert.match(page, /if \(typingPhaseRef\.current !== "typing" \|\| typingCompositionRef\.current \|\| typingSubmissionLockedRef\.current\) return/);
  assert.match(page, /const draft = typingInputRef\.current\?\.value \?\? typingInput/);
  assert.match(page, /typingSubmissionLockedRef\.current = true/);
  assert.match(page, /const replayToken = \+\+typingReplayTokenRef\.current/);
  assert.match(page, /replayToken !== typingReplayTokenRef\.current[\s\S]{0,120}stopIndex !== typingStopIndexRef\.current/,
    "an old replay callback must not restart the timer for a newer station");
  assert.match(page, /disabled=\{typingAudioBusy\}[\s\S]{0,180}正在播放/);
  assert.match(page, /id="typing-input"[\s\S]{0,300}disabled=\{typingAudioBusy\}/);
  assert.match(page, /type="submit" disabled=\{typingAudioBusy\}/,
    "listening must lock the input and submit button so uncounted typing cannot inflate CPM");
  assert.match(page, /typingErrorCharactersRef\.current/);
  assert.match(page, /typingCompletedCharactersRef\.current/);
  assert.match(page, /typingComboRef\.current = hadMistake \? 0 : addSafeCount/);
  assert.match(page, /if \(!typingMissedIdsRef\.current\.includes\(target\.id\)\)[\s\S]{0,260}recordPhraseMistake\(target\.id\)/);
  assert.match(page, /function leaveTypingForMode\(mode: GameMode\)/);
  assert.ok((page.match(/leaveTypingForMode\("(?:listen|blend)"\)/g) ?? []).length >= 4,
    "every direct specialist entry must stop an active typing trip");
  assert.match(page, /for \(let attempt = 0; attempt < 4; attempt \+= 1\)/,
    "browsers without Web Locks must retry compare-write-verify");
  assert.match(page, /typingBestRecordsCover\(verified, expected\)/);
  assert.match(page, /if \(event\.newValue !== null && !typingBestRecordsCover\(storedTypingBest, nextTypingBest\)\) \{\s*void persistTypingBestRecords\(nextTypingBest\)/,
    "storage-event repairs must use the shared locked compare-write-verify path");
  assert.match(page, /const persistenceGeneration = typingBestPersistenceGenerationRef\.current[\s\S]*?if \(persistenceGeneration !== typingBestPersistenceGenerationRef\.current\) return true/,
    "a queued best-record save must stop after another tab clears the records");
  assert.match(page, /if \(event\.key === TYPING_BEST_KEY\) \{\s*if \(event\.newValue === null\) \{\s*typingBestPersistenceGenerationRef\.current \+= 1/);
  assert.match(page, /if \(event\.key === null\) \{\s*progressPersistenceGenerationRef\.current \+= 1;[\s\S]{0,260}?typingBestPersistenceGenerationRef\.current \+= 1/);
  assert.match(page, /pauseTypingRun\("页面切到后台/);
  assert.match(page, /pauseTypingRun\("训练区已离开画面/);
  assert.match(page, /pauseTypingRun\("快捷键帮助已打开/);
  assert.match(page, /if \(audioActivityRef\.current === "game"\) activeAudio\?\.pause\(\)/,
    "resetting a route must stop old route audio");
  const submitSource = page.match(/function submitTypingStop\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.doesNotMatch(submitSource, /playGameAudio\(/,
    "a correct answer must not play the previous word over the next station prompt");

  assert.match(css, /\.game-tabs \{[^}]*grid-template-columns: repeat\(6,1fr\);/);
  assert.match(css, /\.game-tabs > button:nth-child\(6\) > span/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.game-tabs \{ grid-template-columns: repeat\(3,minmax\(0,1fr\)\);/,
    "the six game tabs must switch to 3 × 2 before the narrow 521–620px range");
  assert.match(css, /button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible/);
  const mobileCss = css.slice(css.indexOf("@media (max-width: 520px)"));
  assert.match(mobileCss, /\.game-tabs \{ grid-template-columns: repeat\(3,minmax\(0,1fr\)\);/);
  assert.match(mobileCss, /\.game-tabs > button \{ min-height: 66px;/);
  assert.match(mobileCss, /\.typing-game\.game-board \{ min-height: 0;/);
  assert.match(mobileCss, /\.typing-line \{ grid-template-columns: repeat\(4,minmax\(0,1fr\)\);/);
  assert.match(mobileCss, /\.typing-form input \{ min-height: 48px; font-size: 16px; \}/);
  assert.match(mobileCss, /\.typing-form > button \{ width: 100%; min-height: 48px; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.typing-line li/);
});

test("decomposes Hangul blocks and limits first reading to already learned open syllables", async () => {
  assert.deepEqual(decomposeHangulSyllable("가"), { initial: "ㄱ", vowel: "ㅏ", final: null });
  assert.deepEqual(decomposeHangulSyllable("아"), { initial: "ㅇ", vowel: "ㅏ", final: null });
  assert.deepEqual(decomposeHangulSyllable("밥"), { initial: "ㅂ", vowel: "ㅏ", final: "ㅂ" });
  assert.equal(decomposeHangulSyllable("ㄱ"), null);
  assert.deepEqual(decomposeHangulText("어디"), [
    { syllable: "어", initial: "ㅇ", vowel: "ㅓ", final: null },
    { syllable: "디", initial: "ㄷ", vowel: "ㅣ", final: null },
  ]);
  assert.deepEqual(decomposeHangulText("밥"), [
    { syllable: "밥", initial: "ㅂ", vowel: "ㅏ", final: "ㅂ" },
  ]);
  assert.deepEqual(decomposeHangulText("어디예요? 밥! 123"), [
    { syllable: "어", initial: "ㅇ", vowel: "ㅓ", final: null },
    { syllable: "디", initial: "ㄷ", vowel: "ㅣ", final: null },
    { syllable: "예", initial: "ㅇ", vowel: "ㅖ", final: null },
    { syllable: "요", initial: "ㅇ", vowel: "ㅛ", final: null },
    { syllable: "밥", initial: "ㅂ", vowel: "ㅏ", final: "ㅂ" },
  ], "spaces, punctuation, Latin text, and digits must not create fake Hangul blocks");
  assert.equal(hasOnlyOpenHangulSyllables("카드 주세요."), true);
  assert.equal(hasOnlyOpenHangulSyllables("안녕하세요."), false);
  assert.equal(hasOnlyOpenHangulSyllables("밥"), false);

  const beginnerInitials = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅎ"];
  const beginnerVowels = ["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ"];
  assert.equal(usesOnlyOpenSyllablesFromSets("어디", beginnerInitials, beginnerVowels), true);
  assert.equal(usesOnlyOpenSyllablesFromSets("버스", beginnerInitials, beginnerVowels), true);
  assert.equal(usesOnlyOpenSyllablesFromSets("카드", beginnerInitials, beginnerVowels), false,
    "an open syllable with an unlearned initial must not enter the first-reading group");
  assert.equal(usesOnlyOpenSyllablesFromSets("주세요", beginnerInitials, beginnerVowels), false,
    "an open phrase with unlearned vowels must not enter the first-reading group");
  assert.equal(usesOnlyOpenSyllablesFromSets("밥", beginnerInitials, beginnerVowels), false,
    "batchim must remain outside the first-reading group");

  const phraseItems = JSON.parse(await readFile(new URL("../data/phrases.json", import.meta.url), "utf8"));
  const firstReadingItems = phraseItems.filter((item) =>
    usesOnlyOpenSyllablesFromSets(item.korean, beginnerInitials, beginnerVowels));
  assert.deepEqual(firstReadingItems.map((item) => item.korean).sort(), ["버스", "어디"],
    "the current phrase catalog must expose only 어디 and 버스 after the 10-consonant/6-vowel lesson");
});

test("uses the official 19 Korean consonant names", async () => {
  const actual = JSON.parse(await readFile(new URL("../data/consonant-names.json", import.meta.url), "utf8"));
  const expected = [
    ["ㄱ", "기역"], ["ㄲ", "쌍기역"], ["ㄴ", "니은"], ["ㄷ", "디귿"], ["ㄸ", "쌍디귿"],
    ["ㄹ", "리을"], ["ㅁ", "미음"], ["ㅂ", "비읍"], ["ㅃ", "쌍비읍"], ["ㅅ", "시옷"],
    ["ㅆ", "쌍시옷"], ["ㅇ", "이응"], ["ㅈ", "지읒"], ["ㅉ", "쌍지읒"], ["ㅊ", "치읓"],
    ["ㅋ", "키읔"], ["ㅌ", "티읕"], ["ㅍ", "피읖"], ["ㅎ", "히읗"],
  ];
  assert.deepEqual(actual.map(({ char, name }) => [char, name]), expected);

  const expectedAudioFiles = actual.map(({ id }) => `${id}.mp3`).sort();
  const publicAudioFiles = (await readdir(new URL("../public/audio/consonant-names/", import.meta.url))).sort();
  const builtAudioFiles = (await readdir(new URL("../dist/client/audio/consonant-names/", import.meta.url))).sort();
  assert.deepEqual(publicAudioFiles, expectedAudioFiles, "formal consonant-name audio must exactly match the catalog");
  assert.deepEqual(builtAudioFiles, expectedAudioFiles, "all formal consonant-name audio must ship in the deployment bundle");
  for (const filename of expectedAudioFiles) {
    const info = await stat(new URL(`../public/audio/consonant-names/${filename}`, import.meta.url));
    assert.ok(info.size > 3_000, `${filename} formal-name audio is unexpectedly small`);
  }
});

test("ships 18 distinct native-speaker consonant onsets and treats initial ㅇ as silence", async () => {
  const metadata = JSON.parse(await readFile(new URL("../data/consonant-names.json", import.meta.url), "utf8"));
  const clips = JSON.parse(await readFile(new URL("../data/consonant-human-clips.json", import.meta.url), "utf8"));
  const audible = metadata.filter((item) => item.audioFile);
  const silent = metadata.filter((item) => item.initialSilent);
  const clipById = new Map(clips.map((item) => [item.id, item]));
  const expectedOutputs = new Map([
    ["giyeok", "793526ccd6d19a5c7f5c92a6d1f2ac5ec50c0062cdaa0afea2ef7432dcc211e6"],
    ["ssang-giyeok", "41c45e5bd378d212096db3b5ef602b60cf4d96e58a32b9950ca2fc9332720aa9"],
    ["nieun", "6ea366e5c6b6a325f3c561c0732e9f9fb3ed8132a59930ca44560a9422fd4551"],
    ["digeut", "912ddadfd05c30ebde9c018bae7b3ba9fe4a0d02ea1beb6b34848b3b84f5c5ce"],
    ["ssang-digeut", "87365fde3d8471f36d57c76a967002a6cc3a376070d14c5f174c66dff1868f42"],
    ["rieul", "a99c56c302863669108ab8af2d54e21829775cbaa2c63851486cfab8a82965a2"],
    ["mieum", "7b92041791ea03d63b8052bb7712db059dcde636df55405b9001939d3d302299"],
    ["bieup", "5f01a3e5c72a1ad9c80b833dde889ba059aad29df327f4ffd0ad8ad1c6b0d5a6"],
    ["ssang-bieup", "5bc05ae3aa5836370405404275ef04fc77e8a158d2c2539cd86a201134cb5c8a"],
    ["siot", "b5209a75ffa0a072dc5071150e6ae87cf1ca0853f4509d854c715da3fd3a9ac2"],
    ["ssang-siot", "73d7cfebfe7d68bf06841e2893f0701cfcd07ee90b6429a6088eab1338e8d9d4"],
    ["jieut", "ebe635cc798e920e576de97a0823deca0a6c6dba0fd43b67ce395eb3dc894ff2"],
    ["ssang-jieut", "03df5535f5fedb804384b59ca263825ed7a916cfdcb863d7c4408ca9ab4f99e5"],
    ["chieut", "3a29b1f81044fdc4f36c5f015c34a9b6bcc1b7bd57caaa98effe69f756b912c6"],
    ["kieuk", "63dd8606ba20500ee01fe239b6585596c1903146cbbdbb45f1da90bd1b54c615"],
    ["tieut", "997d4c6478bcce555dea8ef8fe0927895a78217ed699dd8f3606a5185e79c603"],
    ["pieup", "e4cd35f507f8e0f2d5e5c8258157342abcc8be0f1c1708e09a8067d0def307f4"],
    ["hieut", "4c85c3bbab9c5a30e2e0c931aed598f3956bc912f55cc5a3bacf59e816f97674"],
  ]);
  const refinedIds = new Set(["rieul", "ssang-digeut", "ssang-giyeok"]);
  const hashes = [];

  assert.equal(metadata.length, 19);
  assert.equal(audible.length, 18);
  assert.deepEqual(silent.map(({ char, audioFile }) => [char, audioFile]), [["ㅇ", null]]);
  assert.ok(audible.every((item) => item.audioKind === "human-consonant-onset"));
  assert.ok(audible.every((item) => item.sourceWord && item.sourcePage?.startsWith("https://commons.wikimedia.org/wiki/File:")));
  assert.equal(silent[0].audioKind, "silent-initial");
  assert.ok(metadata.every((item) => typeof item.ipa === "string" && item.ipa.length > 0));
  assert.equal(clips.length, 18);
  assert.deepEqual(clips.map((item) => item.id), audible.map((item) => item.id));
  assert.ok(clips.every((item) => !("transitionTailMs" in item)), "manifest must not claim an unmeasured universal transition tail");
  assert.ok(clips.every((item) => item.endMs > item.startMs));
  assert.ok(clips.every((item) => /^[a-f0-9]{64}$/.test(item.sourceSha256)));
  assert.ok(clips.every((item) => item.sourcePage.startsWith("https://commons.wikimedia.org/wiki/File:")));
  assert.deepEqual(
    clips.map(({ id, sourceWord, sourcePage }) => [id, sourceWord, sourcePage]),
    audible.map(({ id, sourceWord, sourcePage }) => [id, sourceWord, sourcePage]),
  );
  assert.deepEqual(
    clips.filter((item) => refinedIds.has(item.id)).map((item) => [item.char, item.sourceWord, item.startMs, item.endMs, item.fadeOutMs, item.silenceTailMs, item.targetPeak]),
    [
      ["ㄲ", "까다", 195, 270, 24, 12, 26_000],
      ["ㄸ", "따르다", 202, 277, 24, 12, 26_000],
      ["ㄹ", "라오스", 210, 273, 25, 12, 26_000],
    ],
  );

  for (const item of audible) {
    const clip = clipById.get(item.id);
    assert.ok(clip, `${item.char} is missing extraction metadata`);
    const file = new URL(`../public/audio/consonant-human-onset/${item.audioFile}`, import.meta.url);
    const builtFile = new URL(`../dist/client/audio/consonant-human-onset/${item.audioFile}`, import.meta.url);
    const info = await stat(file);
    const builtInfo = await stat(builtFile);
    const bytes = await readFile(file);
    assert.ok(info.size > 5_000, `${item.char} human onset is unexpectedly small`);
    assert.equal(builtInfo.size, info.size, `${item.char} human onset is missing or changed in the deployment bundle`);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WAVE");
    assert.equal(bytes.readUInt16LE(20), 1, `${item.char} is not PCM`);
    assert.equal(bytes.readUInt16LE(22), 1, `${item.char} is not mono`);
    assert.equal(bytes.readUInt32LE(24), 48_000, `${item.char} has an unexpected sample rate`);
    assert.equal(bytes.readUInt16LE(34), 16, `${item.char} is not 16-bit audio`);
    const duration = bytes.readUInt32LE(40) / bytes.readUInt32LE(28);
    assert.ok(duration >= 0.05 && duration <= 0.30, `${item.char} duration ${duration} is outside the human-onset range`);
    const silenceTailMs = clip.silenceTailMs ?? 8;
    const expectedDurationMs = clip.endMs - clip.startMs + silenceTailMs;
    assert.ok(Math.abs(duration * 1_000 - expectedDurationMs) < 0.01, `${item.char} does not match its deterministic crop duration`);
    let peak = 0;
    for (let offset = 44; offset + 1 < bytes.length; offset += 2) {
      const sample = bytes.readInt16LE(offset);
      peak = Math.max(peak, Math.abs(sample));
    }
    assert.ok(peak >= 25_000, `${item.char} human onset is effectively silent`);
    if (clip.targetPeak) assert.equal(peak, clip.targetPeak, `${item.char} does not match its tuned peak`);
    const silentTail = bytes.subarray(bytes.length - Math.round(48_000 * silenceTailMs / 1_000) * 2);
    assert.ok([...silentTail].every((byte) => byte === 0), `${item.char} is missing its click-free silent tail`);
    const hash = createHash("sha256").update(bytes).digest("hex");
    assert.equal(hash, expectedOutputs.get(item.id), `${item.char} human onset changed unexpectedly`);
    hashes.push(hash);
  }

  assert.equal(expectedOutputs.size, 18);
  assert.equal(new Set(hashes).size, 18, "two human consonant onsets contain identical audio bytes");
  await assert.rejects(stat(new URL("../public/audio/consonant-human-onset/ieung.wav", import.meta.url)), { code: "ENOENT" });
  await assert.rejects(stat(new URL("../public/audio/consonant-synthetic/", import.meta.url)), { code: "ENOENT" });
});

test("builds four vowel-free clarity replays from unchanged human onset PCM", async () => {
  const filenames = ["rieul.wav", "ssang-giyeok.wav", "ssang-digeut.wav", "ssang-bieup.wav"].sort();
  const publicFiles = (await readdir(new URL("../public/audio/consonant-human-clarity/", import.meta.url))).sort();
  const builtFiles = (await readdir(new URL("../dist/client/audio/consonant-human-clarity/", import.meta.url))).sort();
  assert.deepEqual(publicFiles, filenames);
  assert.deepEqual(builtFiles, filenames);

  const silence = Buffer.alloc(Math.round(48_000 * 0.12) * 2);
  for (const filename of filenames) {
    const [source, clarity, built] = await Promise.all([
      readFile(new URL(`../public/audio/consonant-human-onset/${filename}`, import.meta.url)),
      readFile(new URL(`../public/audio/consonant-human-clarity/${filename}`, import.meta.url)),
      readFile(new URL(`../dist/client/audio/consonant-human-clarity/${filename}`, import.meta.url)),
    ]);
    assert.equal(clarity.toString("ascii", 0, 4), "RIFF");
    assert.equal(clarity.toString("ascii", 8, 12), "WAVE");
    assert.equal(clarity.readUInt16LE(20), 1, `${filename} clarity replay is not PCM`);
    assert.equal(clarity.readUInt16LE(22), 1, `${filename} clarity replay is not mono`);
    assert.equal(clarity.readUInt32LE(24), 48_000, `${filename} clarity replay has the wrong sample rate`);
    assert.equal(clarity.readUInt16LE(34), 16, `${filename} clarity replay is not 16-bit`);
    const sourcePcm = source.subarray(44);
    const expectedPcm = Buffer.concat([sourcePcm, silence, sourcePcm]);
    assert.deepEqual(clarity.subarray(44), expectedPcm,
      `${filename} must be the original vowel-free onset, 120ms silence, and the exact same onset again`);
    assert.equal(clarity.readUInt32LE(40), expectedPcm.length);
    assert.deepEqual(built, clarity, `${filename} clarity replay changed in the deployment bundle`);
  }
});

test("keeps critical pronunciation audio present, non-empty, and distinct", async () => {
  const coreSamples = [...new Set([
    "가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타", "파", "하", "까", "따", "빠", "싸", "짜",
    "아", "야", "어", "여", "오", "요", "우", "유", "으", "이", "애", "얘", "에", "예", "와", "왜", "외", "워", "웨", "위", "의",
  ])];
  const hashes = [];

  for (const sample of coreSamples) {
    const file = audioFileFor(sample);
    const info = await stat(file);
    assert.ok(info.size > 3_000, `${sample} audio is unexpectedly small`);
    const bytes = await readFile(file);
    hashes.push(createHash("sha256").update(bytes).digest("hex"));
  }

  assert.equal(new Set(hashes).size, hashes.length, "two critical learning sounds contain identical audio bytes");
});

test("ships the exact 19 × 21 syllable corpus and byte-identical deployment audio", async () => {
  const expectedSyllableFiles = initialOrder
    .flatMap((initial) => vowelOrder.map((vowel) => `s-${makeSyllable(initial, vowel).codePointAt(0).toString(16)}.mp3`))
    .sort();
  assert.equal(expectedSyllableFiles.length, 399);
  assert.equal(new Set(expectedSyllableFiles).size, 399);

  const publicSyllableFiles = (await readdir(new URL("../public/audio/hangul-natural/", import.meta.url))).sort();
  const builtSyllableFiles = (await readdir(new URL("../dist/client/audio/hangul-natural/", import.meta.url))).sort();
  assert.deepEqual(publicSyllableFiles, expectedSyllableFiles, "public must contain exactly the 399 generated syllable files");
  assert.deepEqual(builtSyllableFiles, expectedSyllableFiles, "the deployment bundle must contain exactly the same 399 syllable files");

  for (const directory of ["hangul-natural", "phrases", "consonant-human-onset", "consonant-human-clarity", "consonant-names"]) {
    const publicFiles = (await readdir(new URL(`../public/audio/${directory}/`, import.meta.url))).sort();
    const builtFiles = (await readdir(new URL(`../dist/client/audio/${directory}/`, import.meta.url))).sort();
    assert.deepEqual(builtFiles, publicFiles, `${directory} deployment filenames differ from public assets`);
    for (const filename of publicFiles) {
      const [publicBytes, builtBytes] = await Promise.all([
        readFile(new URL(`../public/audio/${directory}/${filename}`, import.meta.url)),
        readFile(new URL(`../dist/client/audio/${directory}/${filename}`, import.meta.url)),
      ]);
      const publicHash = createHash("sha256").update(publicBytes).digest("hex");
      const builtHash = createHash("sha256").update(builtBytes).digest("hex");
      assert.equal(builtHash, publicHash, `${directory}/${filename} changed in the deployment bundle`);
    }
  }
});

test("ships a normalized phrase catalog with complete packaged audio", async () => {
  const phraseItems = JSON.parse(await readFile(new URL("../data/phrases.json", import.meta.url), "utf8"));
  const requiredTextFields = ["id", "korean", "chinese", "roman", "group"];
  const words = phraseItems.filter((item) => item.type === "word");
  const sentences = phraseItems.filter((item) => item.type === "sentence");

  assert.equal(words.length + sentences.length, phraseItems.length);
  assert.ok(words.length >= 4, "word quizzes need at least four entries");
  assert.ok(sentences.length >= 4, "sentence quizzes need at least four entries");
  assert.ok(phraseItems.length > 0, "the fixed phrase-audio catalog must not be empty");

  for (const item of phraseItems) {
    assert.ok(item && typeof item === "object" && !Array.isArray(item), "each phrase must be an object");
    assert.ok(item.type === "word" || item.type === "sentence", `${item.id ?? "unknown phrase"} has an invalid type`);
    const expectedFields = [...requiredTextFields, "type"].sort();
    assert.deepEqual(Object.keys(item).sort(), expectedFields, `${item.id ?? "unknown phrase"} does not match the phrase schema`);
    for (const field of requiredTextFields) {
      assert.equal(typeof item[field], "string", `${item.id ?? "unknown phrase"}.${field} must be a string`);
      assert.ok(item[field].trim().length > 0, `${item.id ?? "unknown phrase"}.${field} must not be empty`);
      assert.equal(item[field], item[field].normalize("NFC"), `${item.id ?? "unknown phrase"}.${field} must use NFC`);
    }
    assert.match(item.id, new RegExp(`^${item.type}-[a-z0-9]+(?:-[a-z0-9]+)*$`));
    assert.match(item.korean, /[가-힣]/u);
  }

  assert.equal(new Set(phraseItems.map((item) => item.id)).size, phraseItems.length, "phrase ids must be globally unique");
  assert.equal(new Set(phraseItems.map((item) => item.korean)).size, phraseItems.length, "Korean phrases must be globally unique");
  for (const [type, items] of [["word", words], ["sentence", sentences]]) {
    assert.equal(new Set(items.map((item) => item.chinese)).size, items.length, `Chinese choices must be unique within ${type} quizzes`);
    assert.ok(new Set(items.map((item) => item.chinese)).size >= 4, `${type} quizzes need four distinct choices`);
  }

  const expectedStaticFiles = phraseItems.map((item) => `${item.id}.mp3`).sort();
  const phraseFiles = (await readdir(new URL("../public/audio/phrases/", import.meta.url))).filter((name) => name.endsWith(".mp3")).sort();
  const builtPhraseFiles = (await readdir(new URL("../dist/client/audio/phrases/", import.meta.url))).filter((name) => name.endsWith(".mp3")).sort();
  assert.deepEqual(phraseFiles, expectedStaticFiles, "public phrase audio must exactly match static catalog entries");
  assert.deepEqual(builtPhraseFiles, expectedStaticFiles, "built phrase audio must exactly match static catalog entries");

  const hashes = [];
  for (const filename of expectedStaticFiles) {
    const file = new URL(`../public/audio/phrases/${filename}`, import.meta.url);
    const builtFile = new URL(`../dist/client/audio/phrases/${filename}`, import.meta.url);
    const info = await stat(file);
    const builtInfo = await stat(builtFile);
    const bytes = await readFile(file);
    assert.ok(info.size > 3_000, `${filename} is unexpectedly small`);
    assert.equal(builtInfo.size, info.size, `${filename} is missing or changed in the deployment bundle`);
    const hasId3Header = bytes.toString("ascii", 0, 3) === "ID3";
    const hasFrameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    assert.ok(hasId3Header || hasFrameSync, `${filename} does not look like an MP3`);
    hashes.push(createHash("sha256").update(bytes).digest("hex"));
  }
  assert.equal(new Set(hashes).size, hashes.length, "two static phrase clips contain identical audio bytes");

});

test("ships every complete-syllable asset used by the 19 × 6 onset comparator", async () => {
  const syllables = initialOrder.flatMap((initial) => comparisonVowels.map((vowel) => makeSyllable(initial, vowel)));
  const hashes = [];

  assert.equal(syllables.length, 114);
  assert.equal(new Set(syllables).size, 114);

  for (const syllable of syllables) {
    const file = audioFileFor(syllable);
    const builtFile = builtAudioFileFor(syllable);
    const info = await stat(file);
    const builtInfo = await stat(builtFile);
    const bytes = await readFile(file);
    assert.ok(info.size > 3_000, `${syllable} comparison audio is unexpectedly small`);
    assert.equal(builtInfo.size, info.size, `${syllable} comparison audio is missing or changed in the deployment bundle`);
    hashes.push(createHash("sha256").update(bytes).digest("hex"));
  }

  assert.equal(new Set(hashes).size, 114, "two comparator syllables contain identical audio bytes");
});

test("generates fair listen and match selections across all 40 letters", () => {
  const allLetters = [...initialOrder, ...vowelOrder];
  const audibleConsonants = initialOrder.filter((letter) => letter !== "ㅇ");
  const audibleLetters = [...audibleConsonants, ...vowelOrder];
  assert.equal(allLetters.length, 40);
  assert.equal(audibleLetters.length, 39);
  assert.ok(!audibleLetters.includes("ㅇ"), "silent initial ㅇ must stay out of blind audio games");

  for (const target of allLetters) {
    if (target === "ㅇ") continue;
    const pool = initialOrder.includes(target) ? audibleConsonants : vowelOrder;
    const legalDistractors = pool.filter((candidate) => !areBlindLettersConfusable(target, candidate));
    assert.ok(legalDistractors.length >= 3, `${target} cannot build a four-choice listen question`);
    const options = [target, ...legalDistractors.slice(0, 3)];
    assert.equal(options.length, 4);
    assert.equal(new Set(options).size, 4);
    for (const candidate of options.slice(1)) {
      assert.equal(areBlindLettersConfusable(target, candidate), false, `${target}/${candidate} is an unfair blind-listen pair`);
    }
  }

  for (let offset = 0; offset < audibleLetters.length; offset += 1) {
    const candidates = [...audibleLetters.slice(offset), ...audibleLetters.slice(0, offset)];
    const selected = selectFairBlindLetters(candidates, 6);
    assert.equal(selected.length, 6, `matching rotation ${offset} did not produce six letters`);
    for (let left = 0; left < selected.length; left += 1) {
      for (let right = left + 1; right < selected.length; right += 1) {
        assert.equal(
          areBlindLettersConfusable(selected[left], selected[right]),
          false,
          `${selected[left]}/${selected[right]} must not share one matching deck`,
        );
      }
    }
  }
});

test("generates only fair four-choice blend questions", () => {
  const allQuestions = initialOrder.flatMap((initial) => vowelOrder.map((vowel) => ({
    initial,
    vowel,
    syllable: makeSyllable(initial, vowel),
  })));
  const fairQuestions = allQuestions.filter(({ initial, vowel }) => isFairBlendTarget(initial, vowel));
  const fairSyllables = new Set(fairQuestions.map(({ syllable }) => syllable));

  assert.equal(allQuestions.length, 399);
  assert.equal(fairQuestions.length, 376);
  assert.deepEqual(fairQuestions.filter(({ vowel }) => vowel === "ㅢ").map(({ syllable }) => syllable), ["의"]);
  for (const syllable of ["쑈", "져", "쪄", "쳐", "폐"]) assert.ok(!fairSyllables.has(syllable), `${syllable} is a non-preferred duplicate target`);
  for (const syllable of ["쇼", "저", "쩌", "처", "페", "기", "니", "미", "비", "씨", "지", "찌", "키", "티", "히"]) {
    assert.ok(fairSyllables.has(syllable), `${syllable} should remain available as the preferred target`);
  }

  for (const [initial, plain, contracted] of [["ㅈ", "ㅓ", "ㅕ"], ["ㅉ", "ㅓ", "ㅕ"], ["ㅊ", "ㅓ", "ㅕ"]]) {
    const plainSyllable = makeSyllable(initial, plain);
    const contractedSyllable = makeSyllable(initial, contracted);
    assert.equal(areBlendPartsEquivalent(initial, plain, initial, contracted), true, `${plainSyllable}/${contractedSyllable} must be treated as one blind sound`);
    assert.ok(!fairBlendVowelCandidates(initial, plain, vowelOrder).includes(contracted), `${plainSyllable} must not offer ${contracted}`);
    assert.ok(!fairBlendVowelCandidates(initial, contracted, vowelOrder).includes(plain), `${contractedSyllable} must not offer ${plain}`);
  }

  const independentlyEquivalentVowelGroups = [["ㅐ", "ㅔ"], ["ㅒ", "ㅖ"], ["ㅙ", "ㅚ", "ㅞ"]];
  for (const initial of initialOrder) {
    for (const group of independentlyEquivalentVowelGroups) {
      for (const targetVowel of group) {
        const candidates = fairBlendVowelCandidates(initial, targetVowel, vowelOrder);
        for (const equivalentVowel of group.filter((vowel) => vowel !== targetVowel)) {
          assert.ok(
            !candidates.includes(equivalentVowel),
            `${makeSyllable(initial, targetVowel)} must not offer equivalent vowel ${equivalentVowel}`,
          );
        }
      }
    }
  }

  for (const { initial, vowel, syllable } of fairQuestions) {
    assert.equal(initial !== "ㅇ" && vowel === "ㅢ", false, `${syllable} incorrectly keeps non-initial ㅢ`);
    const initialCandidates = fairBlendInitialCandidates(initial, vowel, initialOrder);
    const vowelCandidates = fairBlendVowelCandidates(initial, vowel, vowelOrder);
    assert.ok(initialCandidates.length >= 3, `${syllable} lacks three fair initial distractors`);
    assert.ok(vowelCandidates.length >= 3, `${syllable} lacks three fair vowel distractors`);
    assert.equal(new Set([initial, ...initialCandidates.slice(0, 3)]).size, 4, `${syllable} initial choices are not unique`);
    assert.equal(new Set([vowel, ...vowelCandidates.slice(0, 3)]).size, 4, `${syllable} vowel choices are not unique`);
    for (const candidate of initialCandidates) {
      assert.equal(areBlendPartsEquivalent(initial, vowel, candidate, vowel), false, `${syllable} has equivalent initial ${candidate}`);
    }
    for (const candidate of vowelCandidates) {
      assert.equal(areBlendPartsEquivalent(initial, vowel, initial, candidate), false, `${syllable} has equivalent vowel ${candidate}`);
    }
  }

  const starterInitials = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅎ"];
  const starterVowels = ["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ"];
  for (const initial of starterInitials) {
    for (const vowel of starterVowels) {
      assert.ok(fairBlendInitialCandidates(initial, vowel, starterInitials).length >= 3, `${initial}+${vowel} lacks beginner initial choices`);
      assert.ok(fairBlendVowelCandidates(initial, vowel, starterVowels).length >= 3, `${initial}+${vowel} lacks beginner vowel choices`);
    }
  }
});

test("keeps one preferred target from every byte-identical blend group", async () => {
  const expectedDuplicateGroups = [
    "긔/기", "끠/끼", "늬/니", "띄/띠", "믜/미", "븨/비", "쇼/쑈", "씌/씨",
    "저/져", "즤/지", "쯰/찌", "킈/키", "틔/티", "페/폐", "희/히",
  ].sort();
  const hashGroups = new Map();
  const filenames = (await readdir(new URL("../public/audio/hangul-natural/", import.meta.url))).filter((name) => name.endsWith(".mp3"));

  for (const filename of filenames) {
    const bytes = await readFile(new URL(`../public/audio/hangul-natural/${filename}`, import.meta.url));
    const hash = createHash("sha256").update(bytes).digest("hex");
    const syllable = String.fromCodePoint(Number.parseInt(filename.slice(2, -4), 16));
    hashGroups.set(hash, [...(hashGroups.get(hash) ?? []), syllable]);
  }

  const actualDuplicateGroups = [...hashGroups.values()]
    .filter((group) => group.length > 1)
    .map((group) => group.sort().join("/"))
    .sort();
  assert.deepEqual(actualDuplicateGroups, expectedDuplicateGroups, "the blind-listening exclusion list must be reviewed if syllable audio changes");

  const partsBySyllable = new Map(initialOrder.flatMap((initial) => vowelOrder.map((vowel) => [
    makeSyllable(initial, vowel),
    { initial, vowel },
  ])));
  for (const group of actualDuplicateGroups) {
    const preferredTargets = group.split("/").filter((syllable) => {
      const parts = partsBySyllable.get(syllable);
      return parts && isFairBlendTarget(parts.initial, parts.vowel);
    });
    assert.equal(preferredTargets.length, 1, `${group} must retain exactly one fair blend target`);
  }

  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /filter\(\(question\) => isFairBlendTarget\(question\.initial, question\.vowel\)\)/);
  assert.match(page, /const questionPool = scope === "starter" \? starterBlendQuestionPool : blendQuestionPool/);
  assert.match(page, /const nextQuestion = questionPool/);
  assert.match(page, /同音组合会自动跳过/);
});

test("versions every audio URL and evicts failed cache entries", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /const APP_VERSION = "37"/);
  assert.match(page, /const AUDIO_ASSET_VERSION = "21"/);
  assert.match(page, /return `\$\{phraseSource\}\?v=\$\{AUDIO_ASSET_VERSION\}`/);
  assert.match(page, /\/audio\/hangul-natural\/s-\$\{syllable\.codePointAt\(0\)\?\.toString\(16\)\}\.mp3\?v=\$\{AUDIO_ASSET_VERSION\}/);
  assert.match(page, /function consonantOnsetPath[\s\S]*?`\/audio\/consonant-human-onset\/\$\{audioFile\}\?v=\$\{AUDIO_ASSET_VERSION\}`/);
  assert.match(page, /function consonantReferenceSoundPath[\s\S]*?const directory = clarityReplayConsonants\.has\(letter\.char\) \? "consonant-human-clarity" : "consonant-human-onset"/);
  assert.match(page, /\/audio\/\$\{directory\}\/\$\{audioFile\}\?v=\$\{AUDIO_ASSET_VERSION\}/);
  assert.match(page, /\/audio\/consonant-names\/\$\{item\.id\}\.mp3/);
  assert.match(page, /audio\.addEventListener\("error", \(\) => audioCache\.delete\(source\), \{ once: true \}\)/);
  assert.ok((page.match(/audioCache\.delete\(source\)/g) ?? []).length >= 2, "preload and playback failures must evict the cached source");
  assert.match(page, /async function playAudioSourceToEnd/);
  assert.match(page, /if \(invalidateCache\) audioCache\.delete\(source\)/);
  assert.match(page, /const handlePause = \(\) => finish\(audio\.ended \? "ended" : "interrupted"\)/);
  assert.match(page, /void audio\.play\(\)\.catch\(\(\) => finish\("failed", true\)\)/);
  assert.match(page, /async function playGameAudio[\s\S]*?const played = result === "ended"[\s\S]*?setGameAudioReady\(played\)[\s\S]*?setGameAudioFailed\(result === "failed"\)/);
  assert.match(page, /音频未能播放，请点重播；本题不会自动跳过/);
});

test("routes every phrase and consonant name through packaged complete audio", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(page, /audioKind\?:\s*"system-korean-voice"/);
  assert.doesNotMatch(page, /fallbackPronunciation/);
  assert.doesNotMatch(page, /function isSystemVoicePhrase/);
  assert.match(page, /phraseItemByKorean/);
  const phraseAudioMapSource = page.match(/const phraseAudioPaths\b[\s\S]*?;\n/)?.[0] ?? "";
  assert.match(phraseAudioMapSource, /phraseItems\.map/);
  assert.doesNotMatch(phraseAudioMapSource, /\.filter\(/);

  const audioPathSource = page.match(/function audioPath\b[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(audioPathSource, /phraseItemByKorean\.(?:get|has)\(text\)/);
  assert.match(audioPathSource, /phraseItemByKorean\.(?:get|has)\(text\)[\s\S]{0,120}return ""/, "known phrases must never fall through to a syllable clip");
  const hasSingleSyllableGate = /\^\[가-힣\]\$/u.test(audioPathSource)
    || /match\(\/\[가-힣\]\/g\)[\s\S]{0,200}length !== 1/u.test(audioPathSource);
  assert.ok(hasSingleSyllableGate, "complete-syllable fallback must accept exactly one Korean syllable");
  assert.doesNotMatch(audioPathSource, /text\.match\(\/\[가-힣\]\/[a-z]*\)\?\.\[0\]/, "unknown multi-syllable text must not fall back to its first syllable");

  assert.doesNotMatch(page, /SpeechSynthesisUtterance|makeLocalFallbackSegments|playLocalKoreanFallbackToEnd|finalConsonantSounds/);
  assert.match(page, /function playPhraseItemSource[\s\S]{0,240}playKorean\(item\.korean, speed\)/);
  assert.match(page, /const consonantNameAudioPaths = new Map/);
  assert.match(page, /function playConsonantName[\s\S]{0,260}playAudioSourceToEnd/);
  assert.match(page, /function playPhraseItemWithNotice/);
  assert.match(page, /async function playPhraseAudio\(item: PhraseItem\)/);
  const phrasePoolSource = page.match(/function getPhraseQuizPools\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.doesNotMatch(phrasePoolSource, /koreanVoice/, "every packaged phrase must remain eligible for quizzes");
  assert.match(page, /\{phraseItems\.length\} 条词句现在全部使用网站内置完整韩语合成音频/);
  assert.doesNotMatch(page, /disabled=\{!audioAvailable\}/);

  const choicesSource = page.match(/function makePhraseChoices\b[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(choicesSource, /new (?:Set|Map)/);
  assert.match(choicesSource, /\.chinese/);
  assert.match(choicesSource, /target\.chinese/);
  assert.match(choicesSource, /\.has\([^)]*\.chinese\)/, "phrase choice generation must reject Chinese meanings it has already used");

  const replaySource = page.match(/function replayPhraseQuizAudio\b[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(replaySource, /setPhraseAutoAdvanceCancelled\(false\)[\s\S]*playPhraseAudio/, "replay must re-enable auto-advance before retrying phrase audio");
});

test("implements the v15 onset comparator and scoped review drills", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /const comparisonVowels = \["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ"\]/);
  assert.match(page, /useState\("ㄹ"\)/);
  assert.match(page, /useState\("ㅏ"\)/);
  assert.match(page, /const comparisonSyllable = useMemo\(\(\) => makeSyllable\(comparisonConsonant, comparisonVowel\)/);
  assert.match(page, /async function playComparisonOnset/);
  assert.match(page, /async function playComparisonSyllable/);
  assert.match(page, /async function playComparisonSequence/);
  assert.match(page, /playAudioSourceToEnd\(consonantReferenceSoundPath\(comparisonLetter\), audioSpeed\)/);
  assert.match(page, /playAudioSourceToEnd\(audioPath\(comparisonSyllable\), audioSpeed\)/);
  assert.match(page, /comparisonConsonant === "ㅇ" \? 650 : 420/);
  assert.match(page, /ㅇ 作初声时没有辅音声；右边完整音节从元音直接开始/);
  assert.match(page, /真人起音 ↔ 完整音节对照器/);
  assert.match(page, /role="status" aria-live="polite">\{comparisonStatus\}/);

  assert.match(page, /const \[letterFilter, setLetterFilter\] = useState<"all" \| "learning">\("all"\)/);
  const lessonLettersSource = page.match(/const lessonLetters = currentLetters[\s\S]*?;\n/)?.[0] ?? "";
  assert.match(lessonLettersSource, /\.filter\(\(letter\) => !letterLessonChars \|\| letterLessonChars\.includes\(letter\.char\)\)/);
  assert.match(lessonLettersSource, /\.sort\(\(left, right\) => letterLessonChars \? letterLessonChars\.indexOf\(left\.char\) - letterLessonChars\.indexOf\(right\.char\) : 0\)/,
    "scoped foundation and advanced lessons must retain their intentional teaching order");
  assert.match(page, /const visibleLetters = lessonLetters\.filter\(\(letter\) => letterFilter === "all" \|\| !mastered\.includes\(letter\.char\)\)/);
  assert.match(page, /const \[listenPool, setListenPool\] = useState<Letter\[\]>\(audibleLetters\)/);
  assert.match(page, /function startWeakDrill/);
  assert.match(page, /audibleLetters\.filter\(\(letter\) => weakChars\.includes\(letter\.char\)\)/);
  assert.match(page, /"薄弱音专项"/);
  assert.match(page, /function startUnmasteredDrill/);
  assert.match(page, /const currentDrillPool = lessonLetters\.filter\(\(letter\) => letter\.char !== "ㅇ" && !mastered\.includes\(letter\.char\)\)/);
  assert.match(page, /const pool = currentDrillPool/);
  assert.match(page, /`\$\{letterLessonLabel\} · 未掌握专项`/);
  assert.match(page, /target = pickWeightedLetter\(gameStats\.mistakes, listenPool\)/);
  assert.match(page, /restartListenSession[\s\S]*?resetListenGame\(pickWeightedLetter\(gameStats\.mistakes, pool\), pool, listenSessionLabel\)/);
  assert.match(page, /只看未掌握/);
  assert.match(page, /当前范围专项闯关 →/);
  assert.match(page, /复习累计易错音 →/);
});

test("prevents ambiguous mixed-category questions and advances only after playable visible feedback", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  const listenChoicesSource = page.match(/function makeChoices\b[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(listenChoicesSource, /areBlindLettersConfusable\(target\.char, item\.char\)/);
  assert.match(page, /selectFairBlindLetters\(candidates, 6\)/);
  assert.match(page, /function consonantOnsetPath/);
  assert.match(page, /function consonantReferenceSoundPath/);
  const blindAudioSource = page.match(/function playGameLetterExampleAudio\b[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(blindAudioSource, /consonantOnsetPath\(letter\)/);
  assert.doesNotMatch(blindAudioSource, /clarityReplayConsonants|consonantReferenceSoundPath|consonant-human-clarity/,
    "blind games must never reveal a consonant through the double-replay teaching asset");
  const referenceAudioSource = page.match(/function playReferenceLetterExampleAudio\b[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(referenceAudioSource, /consonantReferenceSoundPath\(letter\)/);
  const visibleLetterAudioSource = page.match(/async function playLetterExample\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(visibleLetterAudioSource, /activity === "reference"[\s\S]*?playReferenceLetterExampleAudio\(letter, speed\)[\s\S]*?: playGameLetterExampleAudio\(letter, speed\)/,
    "only explicit reference teaching controls may use a double-replay clarity asset");
  const sidebarLetterAudioSource = page.match(/function playSidebarLetterExample\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(sidebarLetterAudioSource, /playLetterExample\(letter, audioSpeed, "game"\)/,
    "the visible weak-letter shortcut must still use a single game onset unless it labels clarity replay");
  assert.match(page, /function playGameLetter\(letter: Letter\) \{\s*return playGameAudio\(\(\) => playGameLetterExampleAudio\(letter, audioSpeed\)\)/);
  assert.match(page, /void playGameLetter\(listenTarget\)/);
  assert.match(page, /listenAnswer === null \? "韩国真人起音" : `真人起音/);
  assert.match(page, /playShadowExample\(shadowCurrent\)/);
  assert.match(page, /card\.type === "sound"\)[\s\S]*?const played = await playGameLetter\(card\.letter\)/);
  assert.match(page, /const answeredTarget = speedTarget[\s\S]{0,160}const playback = playGameLetter\(answeredTarget\)/);
  assert.doesNotMatch(page, /playSound\((listenTarget|shadowCurrent|speedTarget|card\.letter)\.sample\)/);
  assert.doesNotMatch(page, /consonant-synthetic|离线数字合成|无元音合成|合成近似/);
  assert.doesNotMatch(page, /ㅏ 组合示范|辅音 \+ ㅏ 示例/);
  assert.match(page, /AUTO_ADVANCE_DELAY_MS/);
  assert.match(page, /!pageVisible \|\| !gameSectionVisible \|\| gameAutoAdvanceCancelled \|\| gameAudioFailed \|\| !gameAudioReady/);
  assert.match(page, /setTimeout\(\(\) => nextListenQuestion\(token\), AUTO_ADVANCE_DELAY_MS\)/);
  assert.equal(page.match(/setTimeout\(\(\) => (nextListenQuestion|nextPhraseQuestion|nextBlendQuestion)\(token\), AUTO_ADVANCE_DELAY_MS\)/g)?.length, 3);
  assert.match(page, /const AUTO_ADVANCE_DELAY_MS = 900/);
  assert.match(page, /const handleEnded = \(\) => finish\("ended"\)/);
  assert.match(page, /const handleError = \(\) => finish\("failed", true\)/);
  assert.doesNotMatch(page, /pickPreferredKoreanVoice|noveltyKoreanVoiceNames|SpeechSynthesisUtterance/);
  assert.match(page, /const replayKey = key === " " \|\| event\.key === "F8"/);
  assert.match(page, /!\(keyboardZone === "games" && directKoreanKeyboard\) && key === "r"/);
  assert.match(page, /event\.key === "Enter" && listenAnswer !== null/);
  assert.match(page, /function replayGameLetter\(letter: Letter\)[\s\S]*?setGameAutoAdvanceCancelled\(false\)[\s\S]*?playGameLetter\(letter\)/);
  assert.match(page, /function replayGameSyllable\(text: string\)[\s\S]*?setGameAutoAdvanceCancelled\(false\)[\s\S]*?playGameSyllable\(text\)/);
  assert.match(page, /onClick=\{\(\) => void replayGameLetter\(listenTarget\)\}/);
  assert.match(page, /onClick=\{\(\) => void replayGameSyllable\(blendTarget\)\}/);
});

test("protects saved progress, timed scoring, phrase automation, and Korean accessibility", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /function parseStoredStringList/);
  assert.match(page, /Array\.isArray\(parsed\)/);
  assert.match(page, /function parseStoredStats/);
  assert.match(page, /parseLegacyProgressStats\(value, progressValidation\)/);
  assert.match(page, /const LEGACY_PROGRESS_BACKUP_KEY = "hangul-legacy-progress-backup-v1"/);
  assert.match(page, /function captureUnscopedProgressData\(\)[\s\S]*?dynamicKeys[\s\S]*?fingerprint: JSON\.stringify\(entries\)/,
    "the first upgrade must fingerprint both singleton and every dynamic v19 record");
  assert.match(page, /function progressSnapshotFromUnscopedCapture[\s\S]*?const backup = parseLegacyProgressBackup\(backupRaw, today\)/);
  assert.match(page, /const missingStatsAreEmpty = backupRaw === null \|\| \(backup !== null && !legacyStatsContainProgress\(backup\.stats\)\)/);
  assert.match(page, /const missingMasteryIsEmpty = backupRaw === null \|\| \(backup !== null && backup\.mastered\.length === 0\)/);
  assert.match(page, /const missingPhraseMasteryIsEmpty = backupRaw === null \|\| \(backup !== null && backup\.masteredPhrases\.length === 0\)/);
  assert.match(page, /mergeLegacyProgressStatsHighWater\(parsedStats, backup\.stats, today\)/);
  assert.match(page, /const primaryCheckpoint = parseProgressCheckpoint[\s\S]*?return mergeProgress\(baseline, ledgers, today, progressValidation, primaryCheckpoint \?\? backupCheckpoint\)/,
    "migration must fold old ledgers and checkpoint exactly once into the scoped baseline");
  assert.equal(PROGRESS_LEDGER_KEY_PREFIX, "hangul-progress-ledger-v19:");
  assert.match(page, /function readStoredProgressLedgers/);
  assert.match(page, /key\?\.startsWith\(PROGRESS_LEDGER_KEY_PREFIX\)/);
  assert.match(page, /const appendProgressOperation = useCallback\(\(operation: ProgressLedgerOperation\) =>/);
  assert.match(page, /window\.localStorage\.setItem\(key, serialized\)[\s\S]*?window\.localStorage\.getItem\(key\) !== serialized/);
  assert.match(page, /const delta = createProgressStatsDelta\(current, optimistic, progressValidation\)/);
  assert.match(page, /appendProgressOperation\(\{ kind: "stats", delta \}\)/);
  assert.match(page, /mergeProgress\(\s*baseline,\s*own \? \[\.\.\.stored, own\] : stored,\s*today,\s*progressValidation,\s*progressCheckpointRef\.current,\s*\)/);
  assert.match(page, /const baseline = baselineRead\.baseline\?\.snapshot \?\? lastProgressBaselineRef\.current/);
  assert.match(page, /knownProgressLedgersRef\.current/);
  assert.match(page, /window\.addEventListener\("storage", syncStoredProgress\)/);
  assert.doesNotMatch(page, /progressEpochLegacyBridgeRef/,
    "ready v31 tabs must never keep dynamically rereading old unscoped progress");
  assert.match(page, /window\.addEventListener\("pageshow", handlePageShow\)/);

  assert.match(page, /speedDeadlineRef\.current = performance\.now\(\) \+ 30_000/);
  assert.match(page, /speedAcceptingAnswersRef\.current/);
  assert.match(page, /if \(performance\.now\(\) >= speedDeadlineRef\.current\)/);
  assert.match(page, /speedDeadlineRef\.current -= 2_000/);
  assert.match(page, /if \(remaining === 0 && speedAcceptingAnswersRef\.current\)/);

  assert.match(page, /new IntersectionObserver/);
  assert.match(page, /ref=\{gameSectionRef\} className="game-console"/);
  assert.match(page, /ref=\{phraseSectionRef\} id="phrase-quiz-panel"/);
  assert.match(page, /setGameSectionVisible\(entry\.isIntersecting\)/);
  assert.match(page, /else \{[\s\S]*?setGameAutoAdvanceCancelled\(true\)[\s\S]*?cancelActiveSpeedRound\("训练区已离开画面/);
  assert.match(page, /visibilitychange/);
  assert.match(page, /const visible = document\.visibilityState === "visible"/);
  assert.match(page, /setPageVisible\(visible\)/);
  assert.match(page, /if \(keyboardZone === "games" && !gameSectionVisible\) return/);
  assert.match(page, /if \(keyboardZone === "phrases" && !phraseSectionVisible\) return/);
  assert.match(page, /function openKeyboardHelp\(\)[\s\S]*?setGameAutoAdvanceCancelled\(true\)[\s\S]*?setPhraseAutoAdvanceCancelled\(true\)[\s\S]*?cancelActiveSpeedRound\(/);
  assert.match(page, /function changeActiveSet[\s\S]*?cancelComparisonSequence\(\)/);
  assert.match(page, /phraseAutoAdvanceCancelled/);
  assert.match(page, /!pageVisible \|\| !phraseSectionVisible \|\| phraseAutoAdvanceCancelled \|\| phraseAudioFailed \|\| !phraseAudioReady/);
  assert.match(page, /音频未能播放，已暂停自动下一题/);
  assert.match(page, /replayPhraseQuizAudio/);
  assert.match(page, /function playPhraseItemWithNotice[\s\S]*?setPhraseAutoAdvanceCancelled\(true\)[\s\S]*?已暂停本题自动推进/);
  assert.match(page, /function nextPhraseQuestion[\s\S]*?phraseQuizRound >= phraseQuizTotal[\s\S]*?activeAudio\?\.pause\(\)[\s\S]*?stopSpeechSynthesis\(\)/);
  assert.match(page, /function playConsonantName[\s\S]*?consonantNameAudioPaths\.get\(name\)[\s\S]*?playAudioSourceToEnd/);
  assert.match(page, /async function playLetterName[\s\S]*?正式名称音频未能播放/);
  assert.doesNotMatch(page, /koreanVoice/);
  assert.match(page, /选择下一轮跟读范围/);
  assert.match(page, /tabIndex=\{gameMode === "listen" \? 0 : -1\}/);
  assert.match(page, /aria-pressed=\{selected\}/);
  assert.match(page, /className="speed-feedback" role="status" aria-live="polite"/);
  assert.match(page, /const matchResetTimerRef = useRef<number \| null>\(null\)/);
  assert.match(page, /function clearMatchResetTimer\(\)/);
  assert.match(page, /window\.clearTimeout\(matchResetTimerRef\.current\)/);
  assert.match(page, /matchResetTimerRef\.current = window\.setTimeout/);
  assert.match(page, /matchResetTimerRef\.current = null/);
  assert.match(page, /useEffect\(\(\) => \(\) => \{[\s\S]*?clearMatchResetTimer\(\)/);
  assert.match(page, /setInterval\(\(\) => \{[\s\S]*?refreshProgress\(\)[\s\S]*?60_000/);

  assert.match(page, /className="jamo" lang="ko"/);
  assert.match(page, /className="phrase-audio"[\s\S]*?<strong lang="ko">\{item\.korean\}<\/strong>/);
  assert.match(page, /className="speed-target"[\s\S]*?<strong lang="ko">\{speedTarget\.char\}<\/strong>/);
  assert.match(page, /className="brand-mark" lang="ko"/);

  assert.match(css, /\.master-button \{[^}]*width: 44px;[^}]*height: 44px;/);
  assert.match(css, /\.letter-audio-actions button > span \{[^}]*font-size: 10px;/);
  assert.match(css, /\.phrase-meaning button \{[^}]*min-height: 44px;[^}]*font-size: 10px;/);
  assert.match(css, /\.phrase-quiz-feedback button \{[^}]*min-height: 44px;/);
  assert.match(css, /--coral: #a6422f;/);
  assert.match(css, /\.keyboard-guide button \{[^}]*min-width: 44px;[^}]*min-height: 44px;/);
  assert.match(css, /\.speed-feedback \{/);
});

test("v25 guards beginner flow, fair games, playback, focus, and responsive choices", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  const listenChoicesSource = page.match(/function makeChoices\b[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(listenChoicesSource, /areBlindLettersConfusable\(target\.char, item\.char\)/);
  assert.match(page, /function makeBlendInitialChoices\(targetInitial: string, targetVowel: string, candidates = initialOrder\)/);
  assert.match(page, /function makeBlendVowelChoices\(targetInitial: string, targetVowel: string, candidates = vowelOrder\)/);
  assert.match(page, /selectFairBlindLetters\(candidates, 6\)/);
  assert.match(page, /const \[listenStarted, setListenStarted\] = useState\(false\)/);
  assert.match(page, /id="listen-start"/);
  assert.match(page, /先播放，再作答/);
  assert.match(page, /if \(!listenStarted\)[\s\S]{0,180}startInitialListenGame\(\)/,
    "the first keyboard start must claim the game area before revealing a random question");
  const resetListenSource = page.match(/function resetListenGame\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(resetListenSource, /setListenChoices\(makeChoices\(target, pool\)\)/);
  assert.match(resetListenSource, /setListenStarted\(true\)/);
  assert.match(page, /if \(listenAnswer !== null \|\| !gameAudioReady\) return/);
  assert.match(page, /disabled=\{answered \|\| !gameAudioReady\}/);
  assert.match(page, /完整听完后才开放作答/);

  const phraseAnswerSource = page.match(/function answerPhraseQuiz\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(phraseAnswerSource, /phraseQuizAnswer !== null \|\| !phraseQuizStarted \|\| phraseQuizFinished \|\| !phraseAudioReady/,
    "phrase scoring must reject input until the complete prompt has ended");
  assert.match(page, /fourChoiceIndex >= 0 && phraseQuizAnswer === null && phraseAudioReady/,
    "phrase keyboard choices must obey the same ready gate as pointer choices");
  assert.match(page, /className="phrase-quiz-choices" aria-busy=\{!phraseAudioReady && phraseQuizAnswer === null\}/);
  assert.match(page, /disabled=\{answered \|\| !phraseAudioReady\}/);
  assert.match(page, /音频未能播放，请用 Space、R 或上方按钮重试；本题暂不可作答/);

  for (const functionName of ["evaluateBlend", "selectBlendInitial", "selectBlendVowel"]) {
    const source = page.match(new RegExp(`function ${functionName}\\b[\\s\\S]*?\\n  }`))?.[0] ?? "";
    assert.match(source, /!gameAudioReady/, `${functionName} must reject input until the complete syllable has ended`);
  }
  assert.match(page, /initialChoiceIndex >= 0 && blendFeedback === null && gameAudioReady/);
  assert.match(page, /vowelChoiceIndex >= 0 && blendFeedback === null && gameAudioReady/);
  assert.match(page, /className="blend-choice-groups" aria-busy=\{!gameAudioReady && blendFeedback === null\}/);
  assert.ok((page.match(/disabled=\{blendFeedback !== null \|\| !gameAudioReady\}/g) ?? []).length >= 2,
    "both blend choice rows must stay disabled until prompt playback succeeds");
  assert.match(page, /题目音节未能播放，请点上方播放按钮重试；本题暂不可作答/);

  for (const [tokenRef, advancedRef, nextFunction] of [
    ["listenQuestionTokenRef", "listenAdvancedTokenRef", "nextListenQuestion"],
    ["phraseQuestionTokenRef", "phraseAdvancedTokenRef", "nextPhraseQuestion"],
    ["blendQuestionTokenRef", "blendAdvancedTokenRef", "nextBlendQuestion"],
  ]) {
    assert.match(page, new RegExp(
      `const token = ${tokenRef}\\.current;\\s*const timer = window\\.setTimeout\\(\\(\\) => ${nextFunction}\\(token\\), AUTO_ADVANCE_DELAY_MS\\)`,
    ), `${nextFunction} auto-advance must capture the current question token in an arrow callback`);
    const nextSource = page.match(new RegExp(`function ${nextFunction}\\b[\\s\\S]*?\\n  }`))?.[0] ?? "";
    assert.match(nextSource, new RegExp(`expectedToken = ${tokenRef}\\.current`));
    assert.match(nextSource, new RegExp(
      `expectedToken !== ${tokenRef}\\.current \\|\\| ${advancedRef}\\.current === expectedToken`,
    ), `${nextFunction} must reject stale timers and a second manual/automatic claim`);
    assert.match(nextSource, new RegExp(`${advancedRef}\\.current = expectedToken`));
  }

  assert.match(page, /function switchGameMode[\s\S]*?if \(mode === gameMode\)[\s\S]*?return;/);
  assert.match(page, /function handleKeyboard\(event: KeyboardEvent\) \{\s*if \(event\.defaultPrevented\) return;/);
  assert.match(page, /const focusedGameTab = element\?\.getAttribute\("role"\) === "tab"/);
  assert.match(page, /const nativeInteractive = Boolean\(element\?\.closest\("button, a\[href\], summary"\)\)/);
  assert.match(page, /nativeInteractive && \(event\.key === "Enter" \|\| event\.key === " "\)\) return/);
  assert.doesNotMatch(page, /focusedShadowControl/,
    "focused shadow buttons must keep native Enter and Space activation instead of being hijacked globally");
  assert.match(page, /gameMode === "shadow"[\s\S]*?shadowStage !== "finished" && replayKey[\s\S]*?replayShadowExample\(\)/,
    "the physical R shortcut must remain available away from text inputs");
  assert.match(page, /async function confirmShadowRepeat[\s\S]*?await playShadowExample\(shadowCurrent\)[\s\S]*?if \(!played\)[\s\S]*?focusAfterQuestionAdvance\("game-panel-shadow", "shadow-replay"\)[\s\S]*?setShadowStage\("rate"\)/);
  assert.match(page, /disabled=\{shadowAudioBusy\}/);
  assert.match(page, /function changeActiveSet[\s\S]*?cancelComparisonSequence\(\)[\s\S]*?stopSpeechSynthesis\(\)/);
  assert.match(page, /async function playGameAudio[\s\S]*?cancelComparisonSequence\(false\)/);
  assert.match(page, /async function playPhraseAudio[\s\S]*?cancelComparisonSequence\(false\)/);

  const phrasePoolSource = page.match(/function getPhraseQuizPools\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(page, /function phraseMatchesGroup/);
  assert.match(page, /group === STARTER_PHRASE_GROUP/);
  assert.match(page, /group === SURVIVAL_PHRASE_GROUP/);
  assert.match(page, /const starterPhraseItems = phraseItems\.filter\(\(item\) => usesOnlyOpenSyllablesFromSets\(item\.korean, basicConsonantChars, coreVowelChars\)\)/);
  assert.match(page, /const STARTER_PHRASE_GROUP = "已学字母首读"/);
  assert.match(phrasePoolSource, /const targetIdSet = new Set\(targetIds\)/);
  assert.match(phrasePoolSource, /const scoped = phraseTypeItems\.filter\(\(item\) => targetIdSet\.has\(item\.id\)\)/);
  assert.match(phrasePoolSource, /const choicePool = new Set\(scoped\.map\(\(item\) => item\.chinese\)\)\.size >= 4 \? scoped : phraseTypeItems/);
  assert.match(phrasePoolSource, /return \{ targetPool: scoped, choicePool \}/);
  assert.match(page, /const \{ targetPool, choicePool \} = getPhraseQuizPools\(nextPoolIds\)/);
  assert.match(page, /const \{ targetPool, choicePool \} = getPhraseQuizPools\(phraseQuizPoolIds\)/);
  assert.equal((page.match(/pickWeightedPhrase\(targetPool, gameStats\.phraseMistakes,/g) ?? []).length, 2);
  assert.equal((page.match(/makePhraseChoices\(target, choicePool\)/g) ?? []).length, 2);

  const shadowPlaybackSource = page.match(/async function playShadowExample\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(page, /const pool = shadowSet === "consonants" \? consonants : shadowSet === "vowels" \? vowels : allLetters/);
  assert.match(shadowPlaybackSource, /playSound\(letter\.sample\)/);
  assert.doesNotMatch(shadowPlaybackSource, /playLetterExample\(/,
    "imitation practice must use a natural complete syllable, never a cropped bare onset");
  assert.match(page, /辅音进入完整音节/);
  assert.match(page, /初声 ㅇ 静音，只听元音/);

  assert.match(page, /const ROMAN_HINT_KEY = "hangul-show-roman-v22"/);
  assert.match(page, /const BEGINNER_BLEND_KEY = "hangul-beginner-blend-qualified-v23"/);
  assert.doesNotMatch(page, /hangul-beginner-blend-completed-v22/,
    "a legacy v22 completion bit must not bypass the new 6\/8 qualification rule");
  assert.match(page, /window\.localStorage\.setItem\(ROMAN_HINT_KEY, String\(show\)\)/);
  assert.match(page, /罗马字只是检索提示，不按汉语拼音读/);
  assert.match(page, /<small>\{showRomanization \? item\.roman : "罗马字已隐藏 · 先直接读韩文"\}<\/small>/);
  assert.doesNotMatch(page, /showRomanization \|\| revealed/,
    "revealing the Chinese meaning must not leak romanization while direct-reading mode is enabled");

  assert.match(page, /const starterBlendQuestionPool: BlendQuestion\[\] = basicConsonantChars[\s\S]{0,180}coreVowelChars/);
  assert.match(page, /const \[beginnerBlendCompleted, setBeginnerBlendCompleted\] = useState\(false\)/);
  assert.match(page, /: !beginnerBlendCompleted \? "blend"/);
  assert.match(page, /function startStarterBlend[\s\S]*?startBlendGame\("starter"\)/);
  assert.match(page, /function createBlendQuestion\(play = true, scope = blendScope\)[\s\S]*?initialCandidates[\s\S]*?vowelCandidates/);
  assert.match(page, /setBlendInitialChoices\(makeBlendInitialChoices\(nextInitial, nextVowel, initialCandidates\)\)/);
  assert.match(page, /setBlendVowelChoices\(makeBlendVowelChoices\(nextInitial, nextVowel, vowelCandidates\)\)/);
  const nextBlendSource = page.match(/function nextBlendQuestion\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(nextBlendSource, /if \(blendScope === "starter" && blendScore >= 6\) markBeginnerBlendCompleted\(\)/,
    "only a 6/8-or-better starter-scoped blend round may unlock the next beginner step");
  assert.equal((page.match(/markBeginnerBlendCompleted\(\);/g) ?? []).length, 1,
    "the beginner blend flag must not be granted by another game or the full blend scope");
  assert.doesNotMatch(page, /gameStats\.games > 0 \? "done"/);
  assert.match(page, /startFullReview\(\)/);

  const builderInitialSource = page.match(/function changeBuilderInitial\b[\s\S]*?\n  }/)?.[0] ?? "";
  const builderVowelSource = page.match(/function changeBuilderVowel\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(builderInitialSource, /cancelComparisonSequence\(\)[\s\S]*?stopSpeechSynthesis\(\)[\s\S]*?setInitial\(value\)/);
  assert.match(builderVowelSource, /cancelComparisonSequence\(\)[\s\S]*?stopSpeechSynthesis\(\)[\s\S]*?setVowel\(value\)/);

  const claimGameSource = page.match(/const claimGameActivity = useCallback\([\s\S]*?\n  }, \[\]\);/)?.[0] ?? "";
  const claimPhraseSource = page.match(/const claimPhraseActivity = useCallback\([\s\S]*?\n  }, \[cancelActiveSpeedRound, cancelComparisonSequence, cancelMatchInteraction, pauseTypingRun, resetKoreanInput\]\);/)?.[0] ?? "";
  assert.match(page, /type AudioActivity = "game" \| "phrase-quiz" \| "phrase-library" \| "reference"/);
  assert.match(page, /const audioActivityRef = useRef<AudioActivity>\("reference"\)/);
  assert.match(claimGameSource, /const shouldStopOtherAudio = audioActivityRef\.current !== "game"/);
  assert.match(claimGameSource, /phraseQuestionTokenRef\.current \+= 1/,
    "claiming the game must invalidate an already queued phrase advance");
  assert.match(claimGameSource, /if \(shouldStopOtherAudio\) \{[\s\S]*?activeAudio\?\.pause\(\)[\s\S]*?stopSpeechSynthesis\(\)[\s\S]*?\}/,
    "claiming the game must not interrupt audio already owned by the same game region");
  assert.match(claimPhraseSource, /const shouldStopOtherAudio = !audioActivityRef\.current\.startsWith\("phrase-"\)/);
  assert.match(claimPhraseSource, /cancelMatchInteraction\(\)/,
    "claiming phrase activity must cancel a pending match reveal and clear stale selections");
  for (const tokenRef of ["listenQuestionTokenRef", "phraseQuestionTokenRef", "blendQuestionTokenRef"]) {
    assert.match(claimPhraseSource, new RegExp(`${tokenRef}\\.current \\+= 1`),
      `claiming phrase activity must invalidate queued ${tokenRef.replace("QuestionTokenRef", "")} advancement`);
  }
  assert.match(claimPhraseSource, /if \(shouldStopOtherAudio\) \{[\s\S]*?activeAudio\?\.pause\(\)[\s\S]*?stopSpeechSynthesis\(\)[\s\S]*?\}/,
    "claiming phrase controls must preserve both quiz and library audio owned by the phrase region");
  assert.match(page, /ref=\{gameSectionRef\} className="game-console" onMouseDown=\{claimGameActivity\} onFocusCapture=\{claimGameActivity\}/);
  assert.match(page, /className="phrase-section" id="phrases"[\s\S]{0,180}onMouseDown=\{claimPhraseActivity\} onFocusCapture=\{claimPhraseActivity\}/);
  assert.match(page, /ref=\{phraseSectionRef\} id="phrase-quiz-panel"/);

  const gameObserverSource = page.match(/const section = gameSectionRef\.current;[\s\S]*?\n  }, \[[^\]]*pauseTypingRun[^\]]*\]\);/)?.[0] ?? "";
  assert.match(gameObserverSource, /setGameAutoAdvanceCancelled\(true\)/);
  assert.match(gameObserverSource, /listenQuestionTokenRef\.current \+= 1/);
  assert.match(gameObserverSource, /blendQuestionTokenRef\.current \+= 1/);
  assert.match(gameObserverSource, /gamePlaybackRequestRef\.current \+= 1/);
  assert.match(gameObserverSource, /cancelMatchInteraction\(\)/);
  assert.match(gameObserverSource, /shadowPlaybackRequestRef\.current \+= 1/);
  const cancelMatchSource = page.match(/const cancelMatchInteraction = useCallback\([\s\S]*?\n  }, \[\]\);/)?.[0] ?? "";
  assert.match(cancelMatchSource, /matchPlaybackRequestRef\.current \+= 1/);
  assert.match(cancelMatchSource, /matchLockedRef\.current = false[\s\S]*?setMatchLocked\(false\)/);
  assert.match(cancelMatchSource, /setMatchSelected\(\[\]\)[\s\S]*?setMatchFeedback\(feedback\)/,
    "every interrupted match must clear its cards and stale instruction together");
  assert.match(gameObserverSource, /setGameAudioReady\(false\)/);
  assert.match(gameObserverSource, /if \(audioActivityRef\.current === "game"\) \{[\s\S]*?activeAudio\?\.pause\(\)[\s\S]*?\}/,
    "an offscreen game must invalidate game work but pause only game-owned audio");

  const phraseObserverSource = page.match(/const section = phraseSectionRef\.current;[\s\S]*?\n  }, \[\]\);/)?.[0] ?? "";
  assert.match(phraseObserverSource, /setPhraseAutoAdvanceCancelled\(true\)/);
  assert.match(phraseObserverSource, /phraseQuestionTokenRef\.current \+= 1/);
  assert.match(phraseObserverSource, /phrasePlaybackRequestRef\.current \+= 1/);
  assert.match(phraseObserverSource, /setPhraseAudioReady\(false\)/);
  assert.match(phraseObserverSource, /if \(audioActivityRef\.current === "phrase-quiz"\) \{[\s\S]*?activeAudio\?\.pause\(\)[\s\S]*?\}/,
    "an offscreen quiz must invalidate quiz playback without stopping a phrase-library recording");

  const visibilityStart = page.indexOf("const handleVisibilityChange = () => {");
  const visibilityEnd = page.indexOf("const frame = window.requestAnimationFrame(handleVisibilityChange)", visibilityStart);
  assert.ok(visibilityStart >= 0 && visibilityEnd > visibilityStart, "the visibility cancellation handler must remain inspectable");
  const visibilitySource = page.slice(visibilityStart, visibilityEnd);
  for (const tokenRef of ["listenQuestionTokenRef", "phraseQuestionTokenRef", "blendQuestionTokenRef"]) {
    assert.match(visibilitySource, new RegExp(`${tokenRef}\\.current \\+= 1`),
      `backgrounding the page must invalidate queued ${tokenRef.replace("QuestionTokenRef", "")} advancement`);
  }

  const stopPlaybackSource = page.match(/function stopGamePlayback\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(stopPlaybackSource, /gamePlaybackRequestRef\.current \+= 1/);
  assert.match(stopPlaybackSource, /listenQuestionTokenRef\.current \+= 1/);
  assert.match(stopPlaybackSource, /blendQuestionTokenRef\.current \+= 1/);
  assert.match(stopPlaybackSource, /activeAudio\?\.pause\(\)/);
  assert.match(stopPlaybackSource, /stopSpeechSynthesis\(\)/);
  const replayLetterSource = page.match(/function replayGameLetter\b[\s\S]*?\n  }/)?.[0] ?? "";
  const replaySyllableSource = page.match(/function replayGameSyllable\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(replayLetterSource, /listenQuestionTokenRef\.current \+= 1/,
    "replaying a listen prompt must invalidate the timer scheduled by its previous playback");
  assert.match(replaySyllableSource, /blendQuestionTokenRef\.current \+= 1/,
    "replaying a blend prompt must invalidate the timer scheduled by its previous playback");
  const gameAudioSource = page.match(/async function playGameAudio\b[\s\S]*?\n  }/)?.[0] ?? "";
  const phraseAudioSource = page.match(/async function playPhraseAudio\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(gameAudioSource, /result !== "ended"[\s\S]*?listenQuestionTokenRef\.current \+= 1[\s\S]*?blendQuestionTokenRef\.current \+= 1/);
  assert.match(phraseAudioSource, /result !== "ended"[\s\S]*?phraseQuestionTokenRef\.current \+= 1/);
  assert.match(page, /async function playSoundWithNotice[\s\S]{0,180}prepareReferenceActivity\(\)/,
    "reference playback must cancel active quiz timers before starting");
  assert.match(page, /async function playLetterExample\([^)]*activity: AudioActivity = "reference"\)[\s\S]{0,180}if \(activity === "reference"\) prepareReferenceActivity\(\)/);
  const matchStartSource = page.match(/function startMatchGame\b[\s\S]*?\n  }/)?.[0] ?? "";
  const speedStartSource = page.match(/function startSpeedGame\b[\s\S]*?\n  }/)?.[0] ?? "";
  const speedFinishSource = page.match(/function finishSpeedGame\b[\s\S]*?\n  }/)?.[0] ?? "";
  const speedAnswerSource = page.match(/function answerSpeed\b[\s\S]*?\n  }/)?.[0] ?? "";
  const speedCancelSource = page.match(/const cancelActiveSpeedRound = useCallback\([\s\S]*?\n  }, \[\]\);/)?.[0] ?? "";
  assert.match(matchStartSource, /stopGamePlayback\(\)/);
  assert.match(speedStartSource, /stopGamePlayback\(\)/);
  assert.match(page, /async function selectMatchCard[\s\S]*?const played = await playGameLetter\(card\.letter\)[\s\S]*?if \(!played\)/,
    "a sound card must remain retryable when playback does not finish");
  assert.match(page, /disabled=\{matched \|\| matchLocked\}/);
  assert.match(page, /focusAfterQuestionAdvance\("game-panel-match", `match-card-\$\{cardIndex\}`\)/);
  assert.match(page, /matchResetTimerRef\.current = window\.setTimeout\([\s\S]*?focusAfterQuestionAdvance\("game-panel-match", `match-card-\$\{firstCardIndex\}`\)/);
  assert.match(speedAnswerSource, /!speedRunning \|\| !speedAcceptingAnswersRef\.current \|\| speedAnswerLockedRef\.current/);
  assert.match(speedAnswerSource, /speedAnswerLockedRef\.current = true/);
  assert.match(speedStartSource, /speedRunTokenRef\.current \+= 1/);
  assert.match(speedFinishSource, /speedRunTokenRef\.current \+= 1/);
  assert.match(speedCancelSource, /speedRunTokenRef\.current \+= 1/);
  assert.match(speedAnswerSource, /const runToken = speedRunTokenRef\.current/);
  const speedPlaybackIndex = speedAnswerSource.indexOf("const playback = playGameLetter(answeredTarget)");
  const speedWaitIndex = speedAnswerSource.indexOf("await waitForSpeedFeedback(playback)");
  const speedNextIndex = speedAnswerSource.indexOf("nextSpeedTarget()");
  assert.ok(speedPlaybackIndex >= 0 && speedPlaybackIndex < speedWaitIndex && speedWaitIndex < speedNextIndex,
    "speed mode must keep the answered target visible until its audio feedback settles");
  assert.match(speedAnswerSource, /if \(runToken !== speedRunTokenRef\.current \|\| !speedAcceptingAnswersRef\.current\) return;/);
  const speedRunGateIndex = speedAnswerSource.indexOf("runToken !== speedRunTokenRef.current");
  const speedDeadlineExtensionIndex = speedAnswerSource.indexOf("speedDeadlineRef.current +=");
  assert.ok(speedWaitIndex < speedRunGateIndex && speedRunGateIndex < speedDeadlineExtensionIndex && speedRunGateIndex < speedNextIndex,
    "an async answer from an old speed run must stop before extending or changing the new run");
  assert.match(speedAnswerSource, /const feedbackStartedAt = performance\.now\(\)/);
  assert.match(speedAnswerSource, /speedDeadlineRef\.current \+= performance\.now\(\) - feedbackStartedAt/,
    "audio feedback time must not consume the player's 30-second answer clock");
  assert.doesNotMatch(speedAnswerSource, /if \(remaining === 0\)/,
    "a wrong answer that consumes the remaining time must still finish its audio feedback before ending");
  assert.match(page, /setInterval\(\(\) => \{\s*if \(speedAnswerLockedRef\.current\) return;/,
    "the visible countdown must pause while complete feedback audio is playing");
  assert.match(speedAnswerSource, /if \(performance\.now\(\) >= speedDeadlineRef\.current\)[\s\S]*?finishSpeedGame\(\)/);
  assert.doesNotMatch(speedAnswerSource, /requestAnimationFrame/, "speed answers must not unlock on the next frame while audio is still playing");
  assert.match(page, /disabled=\{speedAnswerPending\}/);
  assert.match(page, /const cancelActiveSpeedRound[\s\S]*?setSpeedTime\(0\)[\s\S]*?setSpeedCancelled\(true\)/);
  assert.match(page, /speedCancelled \? "本轮已取消"/,
    "an interrupted speed round must be visibly distinguished from a completed score");

  const romanChoiceSource = page.match(/function makeRomanChoices\b[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(page, /function romanHintTokens/);
  assert.match(page, /function romanHintsOverlap/);
  assert.match(romanChoiceSource, /selected\.some\(\(item\) => item\.char === candidate\.char \|\| romanHintsOverlap\(item\.roman, candidate\.roman\)\)/);
  assert.match(page, /function pickWeightedPhrase\(pool: PhraseItem\[], mistakes: Record<string, number>, previousId = ""\)/);
  assert.match(page, /pool\.length > 1 \? pool\.filter\(\(item\) => item\.id !== previousId\) : pool/);
  assert.match(page, /function phraseQuizRoundLimit/);
  assert.match(page, /targetCount <= 1\) return targetCount/);
  assert.match(page, /phraseQuizRound >= phraseQuizTotal/);

  assert.match(page, /function focusAfterQuestionAdvance/);
  assert.match(page, /playShadowExample\(queue\[0\]\)\.then\([\s\S]*?focusAfterQuestionAdvance\("game-panel-shadow", "shadow-replay"\)/,
    "shadow controls must receive focus only after their disabled audio-busy state ends");
  assert.match(page, /async function replayShadowExample[\s\S]*?await playShadowExample\(shadowCurrent\)[\s\S]*?focusAfterQuestionAdvance\("game-panel-shadow"/,
    "manual shadow replays must also restore focus after audio finishes");
  assert.match(page, /focusAfterQuestionAdvance\("game-panel-listen",[\s\S]{0,140}"listen-replay"\)/);
  assert.match(page, /focusAfterQuestionAdvance\("game-panel-blend",[\s\S]{0,140}"blend-replay"\)/);
  assert.match(page, /focusAfterQuestionAdvance\("phrase-quiz-panel",[\s\S]{0,180}"phrase-quiz-replay"\)/);
  for (const id of ["listen-replay", "listen-restart", "blend-replay", "blend-restart", "phrase-quiz-replay", "phrase-quiz-restart"]) {
    assert.match(page, new RegExp(`id="${id}"`), `${id} must exist as a stable post-advance focus target`);
  }
  for (const id of ["shadow-replay", "shadow-rate-unsure", "shadow-restart", "match-restart", "speed-restart"]) {
    assert.match(page, new RegExp(`id="${id}"`), `${id} must exist as a stable game focus target`);
  }
  assert.match(page, /id=\{`match-card-\$\{index\}`\}/);
  assert.match(page, /id=\{`speed-choice-\$\{index\}`\}/);

  assert.equal(PROGRESS_LEDGER_KEY_PREFIX, "hangul-progress-ledger-v19:");
  assert.match(page, /PROGRESS_LEDGER_KEY_PREFIX/);
  assert.doesNotMatch(page, /lockManager\.request\("hangul-progress-write"/);
  assert.doesNotMatch(page, /setGameStats\(\(current\) => \{[\s\S]{0,500}localStorage\.setItem/, "storage writes must not run inside React state updaters");
  assert.match(page, /function copyShareText/);
  assert.match(page, /navigator\.clipboard\?\.writeText[\s\S]*?document\.execCommand\("copy"\)/);
  assert.match(page, /navigator\.share[\s\S]*?AbortError[\s\S]*?await copyShareText\(shareText\)/);
  assert.match(page, /function changePhraseGroup\(group: string\) \{[\s\S]*?if \(group === phraseGroup\)[\s\S]*?return;/,
    "reselecting the current phrase scene must not reset an active quiz");
  assert.match(page, /function playSidebarLetterExample[\s\S]*?setGameAutoAdvanceCancelled\(true\)/,
    "sidebar playback must cancel a pending game advance");
  const typingSidebarPlaybackSource = page.match(/function playSidebarLetterExample\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(typingSidebarPlaybackSource, /pauseTypingRun\("已试听累计易错音/,
    "sidebar playback must freeze an active typing trip before replacing its audio");

  assert.match(page, /id="phrase-tab-word"[\s\S]{0,260}tabIndex=\{phraseTab === "word" \? 0 : -1\}/);
  const keyboardSource = page.match(/function handleKeyboard\b[\s\S]*?\n    }/)?.[0] ?? "";
  assert.match(keyboardSource, /keyboardZone === "games" && focusedGameTab && \(event\.key === "ArrowLeft" \|\| event\.key === "ArrowRight"\)/,
    "game-tab arrows must not reset a trip while a regular game action has focus");
  assert.match(keyboardSource, /const focusedPhraseTab = element\?\.id === "phrase-tab-word" \|\| element\?\.id === "phrase-tab-sentence"/);
  assert.match(keyboardSource, /if \(focusedPhraseTab && \["ArrowLeft", "ArrowRight", "Home", "End"\]\.includes\(event\.key\)\) \{[\s\S]*?changePhraseTab\(nextTab, true\)[\s\S]*?return;/,
    "focused phrase tabs must retain arrow-key navigation while the stacked mobile quiz is offscreen");
  const phraseTabNavigationIndex = keyboardSource.indexOf("if (focusedPhraseTab &&");
  const gameVisibilityGuardIndex = keyboardSource.indexOf('if (keyboardZone === "games" && !gameSectionVisible) return');
  const phraseVisibilityGuardIndex = keyboardSource.indexOf('if (keyboardZone === "phrases" && !phraseSectionVisible) return');
  assert.ok(phraseTabNavigationIndex >= 0 && phraseTabNavigationIndex < gameVisibilityGuardIndex && phraseTabNavigationIndex < phraseVisibilityGuardIndex,
    "phrase-tab arrow handling must run before either stale keyboard-zone visibility guard");
  assert.match(page, /id="letter-tab-consonants"[\s\S]{0,300}tabIndex=\{activeSet === "consonants" \? 0 : -1\}[\s\S]{0,100}onKeyDown=\{handleLetterTabKeyDown\}/);
  assert.match(page, /prefers-reduced-motion: reduce/);
  assert.match(page, /game-tab-listen"\)\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(page, /const fallbackId = fallback\.keyboardZone === "games" \? `game-tab-\$\{fallback\.gameMode\}` : `phrase-tab-\$\{fallback\.phraseTab\}`/);
  assert.match(page, /if \(previous\?\.isConnected\) previous\.focus\(\);\s*else document\.getElementById\(fallbackId\)\?\.focus\(\)/);
  assert.match(page, /可听 39 音（不含初声静音 ㅇ）/);
  assert.doesNotMatch(page, /全部 40 音/);
  assert.match(page, /\{phraseItems\.length\} 条高频内容/);
  assert.match(page, /\{phraseItems\.length\} 条词句现在全部使用网站内置完整韩语合成音频/);
  const moveToSectionSource = page.match(/function moveToSection\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(moveToSectionSource, /document\.getElementById\(focusId\)\?\.focus\(\)/);
  assert.doesNotMatch(moveToSectionSource, /preventScroll/,
    "cross-section route focus must remain visually aligned on stacked mobile layouts");

  const mobileCss = css.slice(css.indexOf("@media (max-width: 520px)"));
  assert.ok(mobileCss.length > 0, "the 520px mobile media query must exist");
  const mobileRules = [...mobileCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const fourColumnDeclaration = /grid-template-columns:\s*repeat\(\s*4\s*,\s*(?:minmax\(\s*0\s*,\s*)?1fr\s*\)?\s*\)/;
  for (const selector of [".game-choices", ".match-grid", ".blend-choice-row", ".speed-options"]) {
    const hasFourColumns = mobileRules.some(([, selectors, declarations]) =>
      selectors.split(",").map((item) => item.trim()).includes(selector)
      && fourColumnDeclaration.test(declarations));
    assert.ok(hasFourColumns, `${selector} must stay four columns on 520px mobile layouts`);
  }
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?\.game-choices button kbd,[\s\S]*?\.speed-options button kbd \{ display: none; \}/);
  assert.ok(page.indexOf('className="phrase-library"') < page.indexOf('ref={phraseSectionRef} id="phrase-quiz-panel"'),
    "single-column phrase study must preserve the advertised learn-before-quiz source order");
  assert.doesNotMatch(css, /\.phrase-quiz \{[^}]*order: -1;/,
    "responsive CSS must not move the quiz ahead of the phrase cards");
  assert.match(css, /\.tone-1 \{ background: var\(--coral\); color: white; \}/);
  assert.match(css, /\.week-day small \{ color: rgba\(255,255,255,\.58\);/);
  assert.match(css, /\.starter-path \{/);
  assert.match(css, /\.block-lab \{/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.block-equation \{ flex-wrap: nowrap;[^}]*overflow-x: auto;/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?\.block-equation > div \{ width: 48px;/);
  assert.match(page, /className="pronunciation-note-copy"[\s\S]*?查看真人音源[\s\S]*?查看 ㅇ 官方说明/);
  assert.match(css, /\.pronunciation-note \{[^}]*display: grid;[^}]*grid-template-columns: 20px minmax\(0,1fr\);/,
    "the pronunciation source note must keep its prose and links in one non-collapsing text column");
  assert.match(css, /\.pronunciation-note a \{[^}]*min-height: 44px;[^}]*display: inline-flex;/,
    "pronunciation source links must remain usable touch targets on mobile");
  assert.doesNotMatch(css, /\.typing-line li\.upcoming\s*\{[^}]*opacity:/,
    "upcoming station labels must keep full text contrast");

  assert.match(css, /button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible \{[^}]*outline: 3px solid var\(--lime\);[^}]*outline-offset: 3px;/,
    "keyboard users must retain a high-contrast visible focus indicator");
  const compactNavigationCss = css.slice(css.indexOf("@media (max-width: 780px)"), css.indexOf("@media (max-width: 520px)"));
  assert.match(compactNavigationCss, /\.topbar nav, \.topbar \.main-nav \{[\s\S]*?order: 3;[\s\S]*?width: 100%;[\s\S]*?overflow-x: auto;[\s\S]*?scroll-snap-type: x proximity;/,
    "compact navigation must remain reachable as a horizontal, scrollable row");
  assert.match(compactNavigationCss, /\.topbar nav a, \.topbar \.main-nav a \{[\s\S]*?min-height: 44px;[\s\S]*?flex: 0 0 auto;/,
    "compact navigation links must keep a usable touch target without being squeezed");
  assert.match(mobileCss, /\.phrase-filters button, \.phrase-scenes button, \.phrase-read-filters button, \.phrase-empty button \{ min-height: 44px; \}/);
  assert.match(mobileCss, /\.keyboard-guide button \{ min-height: 44px;/);
  assert.match(mobileCss, /\.starter-path article > small \{ font-size: 11px; \}/);
  assert.match(mobileCss, /\.phrase-library-head span, \.phrase-library-head small,[\s\S]*?\.phrase-quiz-sound small \{ font-size: 10px; \}/,
    "essential mobile instructions must not fall back to the desktop microtype sizes");
});

test("v25 completes the 40-letter route, phrase block lens, mastery handoff, and direct-reading privacy", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  const coreVowels = ["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ"];
  const basicConsonants = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅎ"];
  const expectedAdvancedConsonants = ["ㄲ", "ㅋ", "ㄸ", "ㅌ", "ㅃ", "ㅍ", "ㅆ", "ㅉ", "ㅊ"];
  const expectedAdvancedVowels = VOWEL_ORDER.filter((char) => !coreVowels.includes(char));
  const advancedConsonantLiteral = page.match(/const advancedConsonantChars = (\[[^\n]+\]);/)?.[1];
  assert.ok(advancedConsonantLiteral, "the advanced-consonant scope must remain a visible fixed curriculum");
  assert.deepEqual(JSON.parse(advancedConsonantLiteral), expectedAdvancedConsonants);
  assert.equal(expectedAdvancedConsonants.length, 9);
  assert.equal(expectedAdvancedVowels.length, 15);
  assert.deepEqual(new Set([...basicConsonants, ...expectedAdvancedConsonants]), new Set(INITIAL_ORDER),
    "the 10-letter foundation plus 9-letter advanced scope must cover all 19 consonants exactly once");
  assert.deepEqual(new Set([...coreVowels, ...expectedAdvancedVowels]), new Set(VOWEL_ORDER),
    "the 6-letter foundation plus 15-letter advanced scope must cover all 21 vowels exactly once");
  assert.match(page, /const advancedVowelChars = vowels\.map\(\(letter\) => letter\.char\)\.filter\(\(char\) => !coreVowelChars\.includes\(char\)\)/);
  assert.match(page, /type LetterLesson = "all" \| "core-vowels" \| "basic-consonants" \| "advanced-consonants" \| "advanced-vowels"/);

  const beginnerRouteSource = page.match(/const beginnerNextStep\b[\s\S]*?const blendSessionLabel/)?.[0] ?? "";
  assert.match(beginnerRouteSource, /survivalMastered < 3 \? "survival-phrases"[\s\S]*?advancedConsonantMastered < advancedConsonantChars\.length \? "advanced-consonants"[\s\S]*?advancedVowelMastered < advancedVowelChars\.length \? "advanced-vowels"[\s\S]*?!fullReviewCompleted \? "review" : "complete"/,
    "the full alphabet must follow the proven five-step foundation rather than bypassing it");
  assert.match(beginnerRouteSource, /补齐进阶辅音 9 音/);
  assert.match(beginnerRouteSource, /补齐进阶元音 15 音/);
  assert.match(beginnerRouteSource, /最后验收：39 个可听音/);
  const continueRouteSource = page.match(/function continueBeginnerPath\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(continueRouteSource, /beginnerNextStep === "advanced-consonants"\) openLetterLesson\("advanced-consonants"\)/);
  assert.match(continueRouteSource, /beginnerNextStep === "advanced-vowels"\) openLetterLesson\("advanced-vowels"\)/);
  assert.match(continueRouteSource, /startFullReview\(\)/,
    "the general final review must not offer one-click mastery for all unseen letters");
  const scopedListenSource = page.match(/function startScopedListenDrill\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(scopedListenSource, /const pool = audibleLetters\.filter\(\(letter\) => chars\.includes\(letter\.char\)\)/,
    "the nominal 40-letter scope must become 39 playable prompts by excluding silent initial ㅇ");
  assert.match(page, /className="starter-advance" aria-labelledby="starter-advance-title"/);
  assert.match(page, /进阶辅音[\s\S]{0,500}看 9 张音卡[\s\S]{0,250}进阶元音[\s\S]{0,500}看 15 张音卡/);
  assert.match(page, /39 个可听音混合复习/);
  assert.match(page, /const FULL_REVIEW_KEY = "hangul-full-review-qualified-v25"/);
  assert.match(page, /const fullReviewPrerequisitesComplete =[\s\S]*?advancedVowelMastered === advancedVowelChars\.length/);
  assert.match(page, /function startFullReview\(\) \{[\s\S]*?if \(!fullReviewPrerequisitesComplete\)[\s\S]*?return;[\s\S]*?"完整 39 个可听音验收 · 8\/10 通过", \[\], true\)/,
    "the permanent final pass must remain locked until every preceding route milestone is complete");
  assert.match(page, /disabled=\{!fullReviewPrerequisitesComplete\}/);
  assert.match(page, /listenQualifiesFullReview && listenScore >= 8\) markFullReviewCompleted\(\)/);
  assert.match(page, /setFullReviewSaved\(saved\)/);
  assert.match(page, /fullReviewSaved \? "完整路线验收已通过，刷新后也会保留。" : "完整路线已在本页通过，但浏览器未能保存；刷新后需要重新验收。"/,
    "a session-only pass must not promise that it will survive refresh");

  const readingLevelSource = page.match(/function phraseReadingLevel\b[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(readingLevelSource, /decomposeHangulText\(item\.korean\)/);
  assert.match(readingLevelSource, /!knownLetters\.has\(initial\) \|\| !knownLetters\.has\(vowel\)/);
  assert.match(readingLevelSource, /blocks\.some\(\(\{ final \}\) => final !== null\) \? "batchim" : "ready"/,
    "direct reading must require known initial/vowel letters and keep batchim in its own next step");
  assert.match(page, /const \[phraseReadFilter, setPhraseReadFilter\] = useState<PhraseReadFilter>\("all"\)/);
  assert.match(page, /const phraseReadingLevels = useMemo\(\(\) => new Map\(phraseTypeItems\.map\(\(item\) => \[item\.id, phraseReadingLevel\(item, masteredLetterSet\)\]\)\)/);
  assert.match(page, /const visiblePhraseItems = phraseGroupItems\.filter\([\s\S]*?phraseReadFilter === "all" \|\| phraseReadingLevels\.get\(item\.id\) === "ready"/);
  assert.match(page, /className="phrase-read-filters" role="group" aria-label="按已掌握字母筛选"/);
  assert.match(page, /按我会的字 · \{phraseReadyCount\}/);
  assert.match(page, /“可直读”只代表字形已学且暂不含收音/);
  assert.match(page, /function togglePhraseBreakdown\(id: string\) \{[\s\S]*?setExpandedPhraseId\(\(current\) => current === id \? null : id\)/);
  assert.match(page, /className=\{`phrase-block-toggle \$\{readingLevel\}`\}[\s\S]*?aria-expanded=\{expanded\}[\s\S]*?拆字透视/);
  assert.match(page, /className="phrase-block-breakdown"[\s\S]*?className="phrase-block-syllable"[\s\S]*?<small>初<\/small>[\s\S]*?<small>中<\/small>[\s\S]*?<small>收<\/small>/);
  assert.match(page, /aria-label=\{`初声 \$\{blockInitial\}，\$\{initialKnown \? "已学" : "未学"\}/);
  assert.match(page, /aria-label=\{`中声 \$\{blockVowel\}，\$\{vowelKnown \? "已学" : "未学"\}`\}/);
  assert.match(page, /空隙保留原句分词；这里只拆字形。请听上方整条音频，收音不会被单独拼接；前有收音再接初声 ㅇ 时，也以整词连读为准。/);
  assert.match(page, /role="region" aria-label=\{`\$\{item\.korean\} 音节拆解，可横向滚动`\} tabIndex=\{0\}/,
    "long decompositions must expose their scroll region to keyboard and screen-reader users");
  // A lesson link may sit between the controlled breakdown and meaning card.
  const phraseBreakdownSource = page.match(/<div id=\{`phrase-blocks-[\s\S]*?hidden=\{!expanded\}[\s\S]*?<\/div>\n[\s\S]*?<div className="phrase-meaning">/)?.[0] ?? "";
  assert.ok(phraseBreakdownSource, "the always-mounted controlled breakdown region must be present");
  assert.doesNotMatch(phraseBreakdownSource, /playSound|playLetter|playKorean|audioPath/,
    "the visual decomposition must never synthesize isolated jamo or batchim audio");

  const markListenScopeSource = page.match(/function markListenScopeMastered\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(page, /listenScore >= 8 && confirmableListenChars\.length > 0[\s\S]{0,180}className="confirm-mastery"[\s\S]{0,100}markListenScopeMastered/,
    "a scoped 8\/10 pass must offer an explicit, non-automatic mastery handoff");
  assert.match(markListenScopeSource, /listenCorrectChars\.filter\(\(char\) => !listenWrongChars\.includes\(char\) && listenMasteryScope\.includes\(char\) && validLetterChars\.has\(char\)/,
    "one-click confirmation may mark only distinct letters answered correctly without a miss in that round");
  assert.match(markListenScopeSource, /appendProgressOperation\(\{ kind: "mastered", key: char, value: true \}\)/);
  assert.match(markListenScopeSource, /warnIfProgressIsTemporary\(persisted\)[\s\S]*?syncProgressFromStorage\(\)/);
  const markPhraseGroupSource = page.match(/function markCurrentPhraseGroupMastered\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(page, /phraseQuizScore \/ phraseQuizTotal >= 0\.8[\s\S]{0,300}confirmablePhraseItems\.length > 0[\s\S]{0,180}className="confirm-mastery"[\s\S]{0,100}markCurrentPhraseGroupMastered/,
    "a passed starter or survival phrase round must offer explicit group confirmation");
  assert.match(markPhraseGroupSource, /phraseGroup !== STARTER_PHRASE_GROUP && phraseGroup !== SURVIVAL_PHRASE_GROUP/);
  assert.match(markPhraseGroupSource, /phraseQuizCorrectIds\.includes\(item\.id\)/,
    "phrase confirmation may mark only items actually answered correctly in that round");
  assert.match(markPhraseGroupSource, /appendProgressOperation\(\{ kind: "masteredPhrase", key: item\.id, value: true \}\)/);
  assert.match(page, /const \[phraseQuizPoolIds, setPhraseQuizPoolIds\] = useState<string\[\]>\(\[\]\)/);
  assert.match(page, /const phraseQuizTotal = phraseQuizStarted \? phraseQuizRoundTotal : phraseQuizAvailableTotal/);
  assert.match(page, /setPhraseQuizPoolIds\(nextPoolIds\)/);
  assert.match(page, /getPhraseQuizPools\(phraseQuizPoolIds\)/,
    "an active direct-reading quiz must keep its start-of-round target snapshot when mastery changes elsewhere");

  assert.match(page, /answered \? showRomanization \? choice\.roman : "罗马字已隐藏"/,
    "listen feedback must honor direct-reading mode");
  const selectMatchSource = page.match(/async function selectMatchCard\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(selectMatchSource, /setMatchFeedback\(`配对成功：\$\{card\.letter\.char\} 已和声音对应。`\)/);
  assert.doesNotMatch(selectMatchSource, /\.roman/,
    "match feedback must not expose romanization before or after the card pair settles");
  assert.match(page, /matched \? showRomanization \? card\.letter\.roman : "已配对"/,
    "matched cards must not leak romanization in direct-reading mode");
  assert.match(page, /matched\s*\? `\$\{card\.letter\.char\} 已配对`/,
    "a completed match must keep the paired letter in its accessible name");
  assert.match(page, /\$\{showRomanization \? `\$\{comparisonLetter\.roman\} · ` : ""\}真人 ▶/,
    "the onset comparator must hide its roman hint in direct-reading mode");
  assert.match(page, /className="speed-options"[\s\S]{0,320}\{choice\.roman\}<\/button>/,
    "speed mode deliberately remains the romanization-recall exception");
  assert.match(page, /setSpeedFeedback\(`正确：\$\{speedTarget\.char\} 是 \$\{speedTarget\.roman\}。`\)/);

  for (const selector of [
    "starter-advance", "starter-advance-grid", "phrase-read-filters", "phrase-block-toggle",
    "phrase-block-breakdown", "phrase-block-syllable", "listen-finish-actions", "confirm-mastery",
  ]) {
    assert.match(css, new RegExp(`\\.${selector} \\{`), `.${selector} must have an explicit base style`);
  }
  assert.match(css, /\.phrase-block-toggle \{[^}]*min-height: 44px;/);
  assert.match(css, /\.phrase-block-breakdown > div \{[^}]*overflow-x: auto;[^}]*scroll-snap-type: x proximity;/,
    "long Korean phrases must remain inspectable without widening the mobile page");
  assert.match(css, /\.confirm-mastery \{[^}]*min-height: 44px;/,
    "mastery confirmation must be a full touch target");
  const compactCss = css.slice(css.indexOf("@media (max-width: 780px)"), css.indexOf("@media (max-width: 520px)"));
  assert.match(compactCss, /\.starter-advance \{ grid-template-columns: 1fr; \}/);
  assert.match(compactCss, /\.starter-advance-grid \{ grid-template-columns: repeat\(2,minmax\(0,1fr\)\); \}/);
  const mobileCss = css.slice(css.indexOf("@media (max-width: 520px)"));
  assert.match(mobileCss, /\.starter-advance-grid \{[^}]*grid-template-columns: 1fr;/);
  assert.match(mobileCss, /\.phrase-filters button, \.phrase-scenes button, \.phrase-read-filters button, \.phrase-empty button \{ min-height: 44px; \}/);
  assert.match(mobileCss, /\.phrase-block-toggle \{ min-height: 44px;/);
  assert.match(mobileCss, /\.phrase-block-toggle > span, \.phrase-block-toggle > strong, \.phrase-block-breakdown > p \{ font-size: 10px;/);
  assert.match(mobileCss, /\.listen-finish-actions[\s\S]{0,220}(?:grid-template-columns: 1fr|flex-direction: column|width: 100%)/,
    "the two finish actions must stack or fill the narrow viewport");
});

test("retries, resets, migrates, and safely checkpoints browser progress", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.equal(PROGRESS_SESSION_LEDGER_ID_KEY, "hangul-progress-session-ledger-v19");
  assert.equal(PROGRESS_CHECKPOINT_KEY, "hangul-progress-checkpoint-v19");
  assert.equal(PROGRESS_CHECKPOINT_BACKUP_KEY, "hangul-progress-checkpoint-backup-v21");
  assert.equal(LEGACY_MASTERY_SNAPSHOT_KEY, "hangul-legacy-mastery-snapshot-v19");
  assert.doesNotMatch(page, /sessionStorage|PROGRESS_SESSION_LEDGER_ID_KEY/,
    "each live document must get an independent ledger id, including after reload");
  assert.match(page, /function createPageProgressLedgerId\(\) \{\s*return createFreshPageProgressLedgerId\(\);/);
  assert.match(page, /const ownWasDeleted = own[\s\S]*?!ledgerRead\.physicalLedgerIds\.has\(own\.ledgerId\)/);
  assert.match(page, /ownWasDeleted \|\| ownWasCompacted[\s\S]*?rotateProgressLedgerId\(\)/);
  assert.match(page, /ownLedgerPersistedClockRef\.current !== "0"[\s\S]*?const storedRaw = window\.localStorage\.getItem\(key\)[\s\S]*?storedRaw === null[\s\S]*?rotateProgressLedgerId\(\)/);
  assert.match(page, /storedRaw === serialized[\s\S]*?localStorage\.setItem\(key, serialized\)[\s\S]*?localStorage\.getItem\(key\) !== serialized/,
    "a corrupted or rolled-back own ledger must be rewritten and verified");
  assert.match(page, /if \(ledgerRead\.ok\) \{[\s\S]*?persistOwnProgressLedger\(\)/,
    "a successful storage read must retry a dirty in-memory ledger");

  const resetProgressMemorySource = page.match(/const resetProgressMemory = \(\) => \{[\s\S]*?\n    \};/)?.[0] ?? "";
  assert.match(resetProgressMemorySource, /lastProgressBaselineRef\.current = null;\s*pendingProgressOperationsRef\.current = \[\]/,
    "an epoch reset must forget both the previous baseline and old-generation queued actions");
  const clearProgressStart = page.indexOf("if (event.key === null) {");
  const clearProgressEnd = page.indexOf("if (event.key === PROGRESS_EPOCH_META_KEY)", clearProgressStart);
  const clearProgressSource = page.slice(clearProgressStart, clearProgressEnd);
  assert.match(clearProgressSource, /progressPersistenceGenerationRef\.current \+= 1;\s*progressEpochReadyRef\.current = false;\s*progressEpochRef\.current = null;\s*progressEpochNeedsFreshRef\.current = true/,
    "a cross-tab clear must synchronously invalidate every old-epoch read and write");
  assert.match(clearProgressSource, /resetProgressMemory\(\);\s*void ensureProgressEpoch\(true\)\.then[\s\S]*?flushPendingProgressOperations\(\)[\s\S]*?refreshProgress\(\)[\s\S]*?compactSealedProgressLedgers\(\)/,
    "the clear event must stay empty until a fresh empty-source epoch is ready, then replay only new-generation actions");
  assert.doesNotMatch(clearProgressSource, /startsWith\(PROGRESS_LEDGER|for \(let index = 0; index < window\.localStorage\.length/,
    "epoch rotation must not scan or delete another tab's valid new records");
  assert.match(page, /const syncProgressFromStorage = useCallback\(\(\) => \{\s*const epoch = progressEpochRef\.current;\s*if \(!progressEpochReadyRef\.current \|\| epoch === null\) return/,
    "storage sync must not read any progress before its epoch is ready");
  const appendSource = page.match(/const appendProgressOperation = useCallback\([\s\S]*?\n  }, \[applyProgressOperations\]\);/)?.[0] ?? "";
  assert.match(appendSource, /!progressEpochReadyRef\.current \|\| progressEpochRef\.current === null[\s\S]*?pendingProgressOperationsRef\.current\.push\(\{[\s\S]*?generation: progressPersistenceGenerationRef\.current,[\s\S]*?operation/,
    "actions performed while the epoch is initializing must be queued under the current reset generation");
  const flushSource = page.match(/const flushPendingProgressOperations = useCallback\([\s\S]*?\n  }, \[applyProgressOperations\]\);/)?.[0] ?? "";
  assert.match(flushSource, /item\.generation === generation[\s\S]*?applyProgressOperations\(pending\.map\(\(item\) => item\.operation\), \(\) => \{[\s\S]*?item\.generation !== generation/,
    "queued actions must be removed only after they have been applied once to the dirty in-memory ledger");
  const applyOperationsSource = page.match(/const applyProgressOperations = useCallback\([\s\S]*?\n  }, \[persistOwnProgressLedger,[\s\S]*?\]\);/)?.[0] ?? "";
  assert.match(applyOperationsSource, /ownProgressLedgerRef\.current = next;\s*onApplied\?\.\(\);\s*const persisted = persistOwnProgressLedger\(\)/,
    "a failed disk write must retain the already-applied dirty ledger without requeueing and double-applying it");

  const ensureEpochSource = page.match(/const ensureProgressEpoch = useCallback\([\s\S]*?\n  }, \[blockUnexpectedProgressEpoch\]\);/)?.[0] ?? "";
  assert.match(ensureEpochSource, /navigator\.locks\.request\(PROGRESS_EPOCH_LOCK_NAME, commit\)/,
    "simultaneous clear handlers must converge under one epoch lock");
  assert.match(ensureEpochSource, /forceFresh[\s\S]*?migrating\.source === "legacy"[\s\S]*?source: hasLegacy \? "legacy" : "empty"/,
    "a fresh clear must replace a stale initializer and permanently choose an empty source");
  assert.match(ensureEpochSource, /state: "migrating"[\s\S]*?setItem\(PROGRESS_EPOCH_META_KEY, serialized\)[\s\S]*?prepareProgressEpochBaseline\(migrating\)[\s\S]*?state: "ready"[\s\S]*?setItem\(PROGRESS_EPOCH_META_KEY, readySerialized\)/,
    "ready metadata must be the final commit point after a verified, resumable baseline migration");
  assert.match(ensureEpochSource, /persistenceGeneration !== progressPersistenceGenerationRef\.current\) return false/,
    "an initializer queued before a newer reset must not adopt its result");
  assert.match(ensureEpochSource, /isProgressEpochMetaTransitionAllowed\(accepted, migrating, forceFresh\)/,
    "the locked initializer must reject an unapproved old or mutated epoch before reading it");
  assert.match(ensureEpochSource, /lastAcceptedProgressEpochMetaRef\.current = meta[\s\S]*?progressEpochReadyRef\.current = true/,
    "an epoch becomes writable only after its exact metadata is recorded as accepted");
  const prepareBaselineSource = page.match(/function prepareProgressEpochBaseline\b[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(prepareBaselineSource, /const before = captureUnscopedProgressData\(\);\s*const stable = captureUnscopedProgressData\(\)[\s\S]*?before\.fingerprint !== stable\.fingerprint\) continue/,
    "migration must retry unless every relevant unscoped raw key is stable across two captures");
  assert.match(prepareBaselineSource, /writeProgressEpochBaselineCopies\(meta\.epoch, snapshot, canWrite\)[\s\S]*?const after = captureUnscopedProgressData\(\)[\s\S]*?after\.fingerprint !== sourceFingerprint\) continue/,
    "migration must recheck the complete old-data fingerprint after both baseline copies are written");
  assert.match(prepareBaselineSource, /verified\.primaryRaw !== serialized \|\| verified\.backupRaw !== serialized[\s\S]*?const finalSource = captureUnscopedProgressData\(\)[\s\S]*?finalSource\.fingerprint !== sourceFingerprint\) continue/,
    "the final cutover check must remain adjacent to the ready commit after both scoped copies verify");
  assert.match(page, /function writeProgressEpochBaselineCopies[\s\S]*?setItem\(backupKey, serialized\)[\s\S]*?getItem\(backupKey\) !== serialized[\s\S]*?setItem\(primaryKey, serialized\)[\s\S]*?getItem\(primaryKey\) !== serialized/,
    "the baseline backup must verify before primary and ready metadata");
  assert.doesNotMatch(page, /progressEpochLegacyBridgeRef|legacyBridge/,
    "after the one-time cutover no v31 reader may dynamically redefine its baseline from old keys");

  assert.match(page, /const handlePageHide = \(\) => \{[\s\S]*?sealOwnProgressLedger\(\);\s*\}/);
  assert.match(page, /const handlePageShow = \(event: PageTransitionEvent\)[\s\S]*?event\.persisted && ownProgressLedgerSealedRef\.current\) rotateProgressLedgerId\(\)[\s\S]*?refreshProgress\(\)/);
  assert.match(page, /navigator\.locks\.request\(`\$\{progressEpochCheckpointKey\(epoch\)\}:lock`, \{ ifAvailable: true \}/);
  assert.match(page, /if \(!\("locks" in navigator\) \|\| !navigator\.locks\) return;/,
    "browsers without a real cross-tab lock must retain ledgers instead of deleting under an unsafe lease");
  assert.doesNotMatch(page, /PROGRESS_COMPACTION_LEASE_KEY|acquireProgressCompactionLease/);
  assert.match(page, /seal\?\.clock === ledger\.clock/);
  assert.match(page, /newCandidates\.length < 8 && pendingCount === 0/);
  assert.match(page, /function writeProgressCheckpointCopies[\s\S]*?const primaryKey = progressEpochCheckpointKey\(epoch\)[\s\S]*?setItem\(backupKey, serialized\)[\s\S]*?setItem\(primaryKey, serialized\)/);
  assert.match(page, /writeProgressCheckpointCopies\(provisional, epoch, canPersist\)[\s\S]*?localStorage\.removeItem\(progressEpochLedgerKey\(epoch/,
    "both crash-safe checkpoint copies must be durable before any sealed ledger is deleted");
  assert.match(page, /finalizeProgressCheckpoint\(provisional, afterDelete\.physicalLedgerIds\)/);
  assert.match(page, /checkpointBefore\.primaryRaw !== checkpointAfter\.primaryRaw \|\| checkpointBefore\.backupRaw !== checkpointAfter\.backupRaw/,
    "checkpoint and ledger enumeration must retry across concurrent compaction");
  assert.match(page, /const epochPrefix = `\$\{PROGRESS_EPOCH_NAMESPACE_PREFIX\}\$\{epoch\}:`[\s\S]*?event\.key\.startsWith\(epochPrefix\)/,
    "only current-epoch storage events may trigger the normal progress reader");
  assert.match(page, /const checkpoint = primary \?\? backup/,
    "a valid primary remains authoritative; a leading backup cannot erase still-present source ledgers");
  assert.match(page, /mastered: parsedMastered \?\? backup\?\.mastered \?\? \[\]/,
    "a valid current empty mastery list must win, while damaged data may fall back to the validated backup");
  assert.match(page, /const baselineRead = readProgressEpochBaselineCopies\(epoch\)[\s\S]*?baselineRead\.baseline\?\.snapshot \?\? lastProgressBaselineRef\.current/,
    "a live tab must retain its last validated migrated baseline if both stored copies later become unreadable");
  assert.match(page, /const checkpointCorrupted = \(primaryRaw !== null \|\| backupRaw !== null\) && checkpoint === null/);
  assert.match(page, /checkpoint: checkpointAfter\.checkpoint,[\s\S]*?checkpointCorrupted: checkpointAfter\.checkpointCorrupted/,
    "valid physical ledgers must remain readable even when both checkpoint copies are corrupt");
  assert.match(page, /let effectiveCheckpoint = ledgerRead\.checkpoint \?\? previousCheckpoint;[\s\S]*?progressCheckpointRef\.current = effectiveCheckpoint/,
    "a live tab must retain its last validated checkpoint when both stored copies later become corrupt or disappear one-by-one");
  assert.match(page, /compareProgressClocks\(previous\.clock, incoming\.clock\) <= 0\) return incoming;[\s\S]*?return previous/,
    "a structurally valid but older physical ledger must not roll back a live tab");
  assert.match(page, /compareProgressClocks\(previousCheckpoint\.clock, ledgerRead\.checkpoint\.clock\) > 0[\s\S]*?effectiveCheckpoint = previousCheckpoint/,
    "a structurally valid but older checkpoint must not lower compacted progress");
  assert.match(page, /function persistProgressRollbackGuard\(key: string\)[\s\S]*?setItem\(key, "1"\)[\s\S]*?getItem\(key\) === "1"/,
    "rollback evidence must create a verified, non-progress guard shared by every tab");
  assert.match(page, /if \(rollbackDetected\) \{\s*persistSharedProgressRollbackGuard\(\);\s*progressRollbackDetectedRef\.current = true/);
  assert.doesNotMatch(page, /progressRollbackDetectedRef\.current = rollbackDetected/,
    "a transient guard write failure must not clear the current tab's rollback block on the next normal read");
  const reconcileSource = page.match(/const reconcileProgressStorageRead = useCallback\([\s\S]*?\n  }, \[persistSharedProgressRollbackGuard, rotateProgressLedgerId\]\);/)?.[0] ?? "";
  assert.doesNotMatch(reconcileSource, /progressLedgerKey|writeProgressCheckpointCopies/,
    "rollback reconciliation must not overwrite a newer record owned by another tab");
  const compactionSource = page.match(/const compactSealedProgressLedgers = useCallback\([\s\S]*?\n  }, \[persistSharedProgressRollbackGuard, syncProgressFromStorage\]\);/)?.[0] ?? "";
  assert.match(compactionSource, /const epoch = progressEpochRef\.current;\s*if \(!progressEpochReadyRef\.current \|\| epoch === null\) return/,
    "checkpoint compaction must stay paused until one active epoch is ready");
  assert.match(compactionSource, /const persistenceGeneration = progressPersistenceGenerationRef\.current;\s*const canPersist = \(\) => persistenceGeneration === progressPersistenceGenerationRef\.current[\s\S]*?progressEpochRef\.current === epoch/,
    "checkpoint compaction must be bound to both the reset generation and epoch that requested the Web Lock");
  assert.match(compactionSource, /writeProgressCheckpointCopies\(provisional, epoch, canPersist\)/);
  assert.match(compactionSource, /if \(lock && canPersist\(\)\) compact\(\)/,
    "a queued compactor must not start after another tab clears site progress");
  assert.match(compactionSource, /if \(progressRollbackDetectedRef\.current\) \{\s*persistSharedProgressRollbackGuard\(\);\s*return true/,
    "a failed guard write must be retried without letting the current tab compact");
  assert.ok((compactionSource.match(/rollbackBlocksCompaction\(\)/g) ?? []).length >= 7,
    "compaction must recheck a newly-created cross-tab guard before writes, every deletion, and finalization");
  assert.match(page, /const handlePageHide = \(\) => \{\s*if \(progressRollbackDetectedRef\.current\) persistSharedProgressRollbackGuard\(\)/,
    "a closing tab must retry a previously failed rollback guard write");
  assert.match(page, /if \(progressRollbackDetectedRef\.current\) persistSharedProgressRollbackGuard\(\);\s*const visible = document\.visibilityState/,
    "visibility changes must retry a previously failed rollback guard write");
  assert.match(page, /if \(rollbackBlocksCompaction\(\)\) return;/,
    "unrepaired rollback evidence must block destructive checkpoint compaction");
  assert.match(page, /event\.key === progressEpochRollbackGuardKey\(epoch\)[\s\S]*?event\.newValue !== null\) progressRollbackDetectedRef\.current = true/,
    "other live tabs must immediately honor the shared rollback guard");
  assert.doesNotMatch(page, /removeItem\(progressEpochRollbackGuardKey/,
    "only a complete site-data clear or epoch rotation may retire the scoped rollback guard");
  assert.match(page, /const retainedInvalidLedgers = previouslyKnown\.filter\(\(ledger\) => ledgerRead\.invalidPhysicalLedgerIds\.has\(ledger\.ledgerId\)\)[\s\S]*?knownProgressLedgersRef\.current = \[[\s\S]*?retainedInvalidLedgers/,
    "a still-present malformed ledger key must retain the last validated in-memory ledger");
  assert.match(page, /const validLedgerIds = new Set\(ledgers\.map\(\(ledger\) => ledger\.ledgerId\)\)[\s\S]*?!validLedgerIds\.has\(ledgerId\)[\s\S]*?invalidPhysicalLedgerIds\.add\(ledgerId\)/,
    "storage reads must distinguish malformed physical ledgers from intentionally removed keys");
  assert.match(page, /ledgerRead\.checkpointCorrupted \|\| ledgerRead\.invalidPhysicalLedgerIds\.size > 0[\s\S]*?progressRecoveryWarningShownRef\.current/,
    "a malformed physical ledger must show the same one-time recovery warning as a corrupt checkpoint");
  assert.doesNotMatch(page, /if \(!checkpointAfter\.(?:usable|checkpoint)\) break/);
  assert.match(page, /if \(stored\.checkpointCorrupted[\s\S]*?stored\.invalidPhysicalLedgerIds\.size > 0[\s\S]*?progressCheckpointRef\.current !== null && stored\.checkpoint === null[\s\S]*?\) return;[\s\S]*?checkpointNeedsRepair/,
    "corrupt checkpoint copies or physical ledgers must block compaction and deletion, not in-memory recovery");
  assert.match(page, /nextProgressLedgerClock\(\[\.\.\.stored, next\], Date\.now\(\), progressCheckpointClock/,
    "new writes must advance beyond both wall time and an arbitrary-precision checkpoint clock");
  assert.match(page, /const applyProgressOperations = useCallback[\s\S]*?try \{[\s\S]*?nextProgressLedgerClock[\s\S]*?\} catch \{\s*return false;/,
    "unexpected malformed progress must degrade saving without crashing an answer click");
  assert.match(page, /function addSafeCount[\s\S]*?Math\.min\(Number\.MAX_SAFE_INTEGER, value \+ increment\)/);
  assert.match(page, /if \(ownProgressLedgerSealedRef\.current\) rotateProgressLedgerId\(\)/,
    "a sealed immutable ledger must never receive later operations");
  assert.match(page, /const key = progressEpochLedgerKey\(epoch, own\.ledgerId\)[\s\S]*?progressEpochRef\.current === epoch[\s\S]*?localStorage\.setItem\(key, serialized\)/,
    "each ledger write must target and revalidate its captured epoch");
  assert.match(page, /persistProgressLedgerSeal\([\s\S]*?ledger,[\s\S]*?epoch,[\s\S]*?progressEpochRef\.current === epoch/,
    "each seal write must target and revalidate the same captured epoch");
  assert.match(page, /document\.visibilityState !== "visible"[\s\S]*?persistOwnProgressLedgerSeal\(storedOwn\)/,
    "an operation created while already hidden must be sealed immediately");
  assert.match(page, /const visible = document\.visibilityState === "visible"[\s\S]*?sealOwnProgressLedger\(\)/,
    "hidden pages must seal before mobile browsers may discard them");

  const visibleBranch = page.match(/if \(visible\) \{[\s\S]{0,600}?return;/)?.[0] ?? "";
  assert.match(visibleBranch, /refreshProgress\(\)/);
  assert.match(page, /setInterval\(\(\) => \{[\s\S]*?refreshProgress\(\)[\s\S]*?60_000/);
  assert.match(page, /millisecondsUntilNextLocalMidnight\(\)/);
  assert.match(page, /scheduleNextMidnight\(\)[\s\S]*?window\.clearTimeout\(timer\)/,
    "the exact-midnight refresh must reschedule and clean up its timer");

  const typingReloadSource = page.match(/reloadTypingBestRecordsRef\.current = \(\) => \{[\s\S]*?\n  };/)?.[0] ?? "";
  assert.match(typingReloadSource, /const read = readStoredValueResult\(TYPING_BEST_KEY\)[\s\S]*?if \(!read\.ok\) return/,
    "a transient storage read failure must leave the current best records untouched");
  assert.match(typingReloadSource, /read\.value === null && !hasPending[\s\S]*?\? \{\}/,
    "a real empty value without unsaved work must remain a reset instead of resurrecting memory");
  assert.match(typingReloadSource, /mergeTypingBestRecords\(stored, typingBestRecordsRef\.current, pending\)/,
    "a recovered read must merge stored, in-memory, and unsaved best records");
  assert.match(page, /retryTypingBestPersistenceRef\.current = \(\) => \{\s*reloadTypingBestRecordsRef\.current\(\)/,
    "visibility, pageshow, and periodic retries must re-read storage before writing");
});

test("v25 cancels cross-area game races and keeps mobile feedback readable", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  const cancelMatchSource = page.match(/const cancelMatchInteraction = useCallback\([\s\S]*?\n  }, \[\]\);/)?.[0] ?? "";
  for (const pattern of [
    /matchPlaybackRequestRef\.current \+= 1/,
    /setMatchLocked\(false\)/,
    /setMatchSelected\(\[\]\)/,
    /setMatchFeedback\(feedback\)/,
    /window\.clearTimeout\(matchResetTimerRef\.current\)/,
  ]) assert.match(cancelMatchSource, pattern);

  const stopGameSource = page.match(/function stopGamePlayback\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(stopGameSource, /cancelMatchInteraction\(\)/,
    "cancelling a mismatch timer must also clear the two selected cards");
  const sidebarSource = page.match(/function playSidebarLetterExample\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(sidebarSource, /claimGameActivity\(\)[\s\S]*?cancelMatchInteraction\(\)/,
    "sidebar playback must invalidate pending phrase advancement and match work");
  const visibilityStart = page.indexOf("const handleVisibilityChange = () => {");
  const visibilityEnd = page.indexOf("const frame = window.requestAnimationFrame(handleVisibilityChange)", visibilityStart);
  assert.match(page.slice(visibilityStart, visibilityEnd), /cancelMatchInteraction\(\)/,
    "backgrounding must invalidate match audio and mismatch timers");

  const romanChoiceSource = page.match(/function makeRomanChoices\b[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(romanChoiceSource, /shuffle\(audibleLetters\)/);
  assert.doesNotMatch(romanChoiceSource, /shuffle\(allLetters\)/,
    "silent initial ㅇ must not reappear as a speed-mode distractor");

  const mobileCss = css.slice(css.indexOf("@media (max-width: 520px)"));
  assert.match(css, /\.phrase-tabs button \{ min-height: 44px;/);
  assert.match(css, /\.phrase-meaning button \{ min-height: 44px;/);
  assert.match(mobileCss, /\.weak-drill-button \{ min-height: 44px; font-size: 11px; \}/);
  assert.match(mobileCss, /\.game-feedback, \.auto-next-status small \{ font-size: 11px; \}/);
  assert.match(mobileCss, /\.phrase-meaning p, \.phrase-empty p \{ font-size: 11px; \}/);
  assert.match(css, /\.game-feedback button, \.game-finish button, \.speed-start button \{ min-height: 44px;[\s\S]*?font-size: 10px;/);
  assert.match(css, /\.shadow-start-button \{ min-height: 44px;[\s\S]*?font-size: 10px;/);
});

test("keeps keyboard-help focus trapped while the underlying learning mode changes", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /const keyboardFallbackRef = useRef\(\{ keyboardZone, gameMode, phraseTab \}\)/);
  assert.match(page, /keyboardFallbackRef\.current = \{ keyboardZone, gameMode, phraseTab \};\s*\}, \[gameMode, keyboardZone, phraseTab\]\);/,
    "the eventual fallback must track the latest committed mode without restarting the open-modal effect");

  const focusEffect = page.match(/useEffect\(\(\) => \{\s*if \(!showKeyboardHelp\) return;[\s\S]*?\n  \}, \[focusPausedTypingResume, showKeyboardHelp\]\);/)?.[0] ?? "";
  assert.ok(focusEffect, "keyboard-help focus management must run only when the dialog opens or closes");
  assert.doesNotMatch(focusEffect, /\}, \[(?:gameMode|keyboardZone|phraseTab)/,
    "underlying mode changes must not run cleanup and restore focus outside an open dialog");
  assert.match(focusEffect, /const fallback = keyboardFallbackRef\.current/);
  assert.match(focusEffect, /fallback\.keyboardZone === "games" \? `game-tab-\$\{fallback\.gameMode\}` : `phrase-tab-\$\{fallback\.phraseTab\}`/,
    "closing must use the latest reasonable tab when the original control no longer exists");
  assert.match(focusEffect, /typingPhaseRef\.current === "paused" && typingResumeFocusPendingRef\.current\) focusPausedTypingResume\(\)/,
    "a paused typing run must restore focus to its resume action before the vanished opener");
  assert.match(focusEffect, /else if \(previous\?\.isConnected\) previous\.focus\(\)/,
    "closing must still prefer the exact control that opened the dialog");
});

test("v31 keeps Korean-IME shortcuts, monotonic timers, recovery focus, and responsive controls", async () => {
  assert.equal(keyboardShortcutKey("a", "KeyQ"), "a", "AZERTY must follow the user's printed A key");
  assert.equal(keyboardShortcutKey("q", "KeyA"), "q", "non-QWERTY Latin layouts must keep event.key semantics");
  assert.equal(keyboardShortcutKey("!", "Digit1"), "!", "Shift+1 must not accidentally answer option 1");
  assert.equal(keyboardShortcutKey("Dead", "KeyA"), "dead", "a dead key on an international layout is not a shortcut");
  assert.equal(keyboardShortcutKey("ㅁ", "KeyA"), "a");
  assert.equal(keyboardShortcutKey("Process", "KeyS"), "s");
  assert.equal(keyboardShortcutKey("ㅂ", "KeyQ"), "q");
  assert.equal(keyboardShortcutKey("ㄱ", "KeyR"), "r");
  assert.equal(keyboardShortcutKey(";", "Semicolon"), ";");
  assert.equal(keyboardShortcutKey("1", "Digit1"), "1");
  assert.equal(keyboardShortcutKey("ArrowRight", "ArrowRight"), "arrowright");

  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const key = keyboardShortcutKey\(event\.key, event\.code\)/);
  assert.match(page, /const matchIndex = matchKeys\.indexOf\(key\.toUpperCase\(\)\)/);
  assert.match(page, /nativeInteractive && \(event\.key === "Enter" \|\| event\.key === " "\)\) return/,
    "native buttons must retain their standard Enter and Space activation");
  assert.doesNotMatch(page, /focusedShadowControl/,
    "shadow shortcuts must not hijack Enter or Space from a focused button");

  const speedSource = page.slice(page.indexOf("function startSpeedGame"), page.indexOf("function createBlendQuestion"));
  assert.match(speedSource, /performance\.now\(\) \+ 30_000/);
  assert.match(speedSource, /performance\.now\(\) - feedbackStartedAt/);
  assert.doesNotMatch(speedSource, /Date\.now\(\)/,
    "changing the device wall clock must not lengthen or end a speed round");

  const pauseSource = page.match(/const pauseTypingRun = useCallback\([\s\S]*?\n  }, \[\]\);/)?.[0] ?? "";
  assert.match(pauseSource, /typingCompositionRef\.current = false/);
  assert.match(pauseSource, /setTypingInput\(typingInputRef\.current\.value\)/);
  assert.match(pauseSource, /typingResumeFocusPendingRef\.current = true/);
  assert.match(page, /focusPausedTypingResume\(\)/);
  assert.match(page, /id="typing-resume"/);
  assert.match(page, /<p role="status" aria-live="polite">\{typingFeedback\}/);
  assert.match(page, /if \(typingPhase !== "paused" \|\| showKeyboardHelp \|\| gameMode !== "typing" \|\| !gameSectionVisible \|\| !pageVisible\) return;\s*focusPausedTypingResume\(\)/,
    "a visible paused typing run must focus its resume action even when it paused in place");
  const pausedTypingFocusSource = page.match(/const focusPausedTypingResume = useCallback\([\s\S]*?\n  }, \[\]\);/)?.[0] ?? "";
  assert.match(pausedTypingFocusSource, /const active = document\.activeElement/);
  assert.match(pausedTypingFocusSource, /active\.isConnected[\s\S]*?!typingPanel\?\.contains\(active\)\) return/,
    "pause recovery must not steal focus from a live control outside the typing panel");
  assert.match(page, /gameMode === "typing"[\s\S]{0,180}typingPhaseRef\.current === "paused" && event\.key === "Enter"[\s\S]{0,100}resumeTypingRun\(\)/,
    "Enter must resume a paused typing run when focus is not already on a native control");

  const initialListenSource = page.match(/function startInitialListenGame\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(initialListenSource, /prepareGameActivity\(\)[\s\S]*?startListenGame\(\)[\s\S]*?focusAfterQuestionAdvance\("game-panel-listen", "listen-replay"\)/);
  assert.match(page, /onClick=\{startInitialListenGame\}>播放第一题/);
  assert.match(page, /if \(!listenStarted\)[\s\S]{0,180}startInitialListenGame\(\)/);
  const switchModeSource = page.match(/function switchGameMode\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.doesNotMatch(switchModeSource, /startInitialListenGame/,
    "switching tabs must not steal focus from the selected game tab");

  const resetTypingSource = page.match(/const resetTypingRun = useCallback\([\s\S]*?\n  }, \[\]\);/)?.[0] ?? "";
  const resetTypingForRouteSource = page.match(/function resetTypingRunForRouteSelection\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.doesNotMatch(resetTypingSource, /focusAfterQuestionAdvance|\.focus\(/,
    "generic typing resets must remain free of focus side effects");
  assert.match(resetTypingForRouteSource, /focusAfterQuestionAdvance\("game-panel-typing", `typing-route-\$\{typingRoute\.id\}`\)[\s\S]*?resetTypingRun\(\)/);
  assert.match(page, /id=\{`typing-route-\$\{route\.id\}`\}/);
  assert.equal((page.match(/onClick=\{resetTypingRunForRouteSelection\}/g) ?? []).length, 2);

  assert.match(page, /className="week-bars" role="list" aria-label="近七天经验记录"/);
  assert.match(page, /className="week-day" role="listitem"/);
  assert.match(page, /className="sr-only">\{day\.key\}，\{day\.xp\} XP/);
  assert.match(page, /className="heart-row" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(page, /className="sr-only">剩余 \{listenHearts\} 颗心/);
  assert.match(page, /className=\{heart < listenHearts \? "alive" : "lost"\} aria-hidden="true">♥/);
  assert.match(css, /\.sr-only \{[^}]*position: absolute;[^}]*clip: rect\(0,0,0,0\);/);

  assert.match(page, /hidden=\{!expanded\} aria-labelledby=\{`phrase-block-toggle-/,
    "every collapsed aria-controls target must remain in the DOM");
  assert.match(page, /hidden=\{!expanded\}[\s\S]{0,180}\{expanded && <>/,
    "collapsed controls should keep a real target without rendering every hidden decomposition subtree");
  assert.match(page, /typingBestDirtyRef\.current = mergeTypingBestRecords/);
  assert.match(page, /Object\.entries\(typingBestDirtyRef\.current\)\.filter[\s\S]{0,220}!typingBestRecordsCover\(requestedRecords/,
    "a completed retry must not clear a newer dirty record that it did not persist");
  assert.match(page, /retryTypingBestPersistenceRef\.current\(\)/);
  assert.match(page, /存储恢复后会自动重试/);
  assert.match(page, /进度迁移基线的两份副本均不可读/);
  const storageClearSource = page.match(/if \(event\.key === null\) \{[\s\S]*?\n\s*return;\n\s*\}/)?.[0] ?? "";
  assert.match(storageClearSource, /typingBestPersistenceGenerationRef\.current \+= 1/);
  assert.match(storageClearSource, /window\.localStorage\.removeItem\(TYPING_BEST_KEY\)/,
    "a stale best-record save must be removed after localStorage.clear() lands");
  assert.match(storageClearSource, /progressEpochNeedsFreshRef\.current = true[\s\S]*?ensureProgressEpoch\(true\)/,
    "a full clear must cut over to an empty epoch instead of reopening old unscoped data");

  const compactGameCss = css.slice(css.indexOf("@media (max-width: 900px)"), css.indexOf("@media (max-width: 780px)"));
  assert.match(compactGameCss, /\.game-dashboard \{ grid-template-columns: 1fr; \}/);
  assert.match(compactGameCss, /\.game-tabs \{ grid-template-columns: repeat\(3,minmax\(0,1fr\)\); \}/);
  assert.match(compactGameCss, /\.typing-cockpit \{ grid-template-columns: 1fr; \}/);
  const routeCss = css.slice(css.indexOf("@media (max-width: 600px)"), css.indexOf("@media (max-width: 520px)"));
  assert.match(routeCss, /\.typing-route-picker \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.typing-route-picker > button\[aria-pressed="true"\] > span:first-child \{ padding-right: 66px; \}/);
  assert.match(css, /\.brand \{ min-height: 44px; display: flex;/);
  assert.match(css, /\.header-progress \{ min-height: 44px;[\s\S]{0,120}display: inline-flex; align-items: center;/);
  assert.match(css, /\.topbar nav a \{ position: relative; min-height: 44px;[\s\S]{0,100}display: inline-flex; align-items: center;/);
  const compactHeaderCss = css.slice(css.indexOf("@media (max-width: 780px)"), css.indexOf("@media (max-width: 620px)"));
  assert.match(compactHeaderCss, /\.topbar nav a, \.topbar \.main-nav a \{[\s\S]*?min-height: 44px;/);
});

test("v33 keeps keyboard keys readable and hidden progress text out of layout", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.week-day > span:not\(\.sr-only\) \{/);
  assert.doesNotMatch(css, /\.week-day > span \{/);
  assert.match(css, /\.hangul-keyboard-scroll \{ overflow-x: auto;/);
  assert.match(css, /\.hangul-key-row button \{[^}]*flex: 0 0 62px;[^}]*min-width: 62px;/);
});

test("v34 preserves native summary activation before game Enter and Space shortcuts", async () => {
  const [page, keyboard] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/korean-keyboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(keyboard, /<details className="hangul-keyboard">\s*<summary>/);
  const handler = page.slice(page.indexOf("function handleKeyboard(event: KeyboardEvent)"), page.indexOf('window.addEventListener("keydown", handleKeyboard)'));
  assert.match(handler, /const nativeInteractive = Boolean\(element\?\.closest\("button, a\[href\], summary"\)\)/);
  const nativeGuard = handler.indexOf('if (nativeInteractive && (event.key === "Enter" || event.key === " ")) return;');
  assert.ok(nativeGuard >= 0 && nativeGuard < handler.indexOf('if (keyboardZone === "games" && directKoreanKeyboard)'),
    "summary Enter/Space must retain native expansion before pending-vowel confirmation or replay");
});

test("v34 clears pending Korean input synchronously when replacing a same-number question", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const resetSource = page.match(/const resetKoreanInput = useCallback\([\s\S]*?\n  }, \[\]\);/)?.[0] ?? "";
  assert.match(resetSource, /koreanPendingRef\.current = "";\s*setKoreanPending\(""\);\s*setKoreanKeyboardStatus\(""\)/);
  for (const functionName of ["resetListenGame", "createBlendQuestion"]) {
    const source = page.match(new RegExp(`function ${functionName}\\b[\\s\\S]*?\\n  }`))?.[0] ?? "";
    assert.match(source, /\{\s*resetKoreanInput\(\);/,
      `${functionName} must discard the old compound prefix even when round remains 1`);
    assert.ok(source.indexOf("resetKoreanInput();") < source.indexOf("QuestionTokenRef.current += 1;"),
      `${functionName} must reset input before exposing the replacement question`);
  }
  for (const functionName of ["answerListen", "selectBlendInitial", "selectBlendVowel", "changeKeyboardInputMode"]) {
    const source = page.match(new RegExp(`function ${functionName}\\b[\\s\\S]*?\\n  }`))?.[0] ?? "";
    assert.match(source, /resetKoreanInput\(\);/,
      `${functionName} must discard pending input when a different answer or input mode is chosen`);
  }
});

test("v34 keeps phrase keyboard answers on a stable focus target across rounds", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<aside ref=\{phraseSectionRef\} id="phrase-quiz-panel" tabIndex=\{-1\}/);
  assert.match(page, /function focusPhraseKeyboard\(\) \{\s*phraseSectionRef\.current\?\.focus\(\{ preventScroll: true \}\);/);
  const phraseStart = page.indexOf('if (keyboardZone === "phrases") {');
  const phraseHandler = page.slice(phraseStart, page.indexOf('if (gameMode === "listen") {', phraseStart));
  for (const action of ["startPhraseQuiz", "replayPhraseQuizAudio", "answerPhraseQuiz", "nextPhraseQuestion"]) {
    assert.match(phraseHandler, new RegExp(`focusPhraseKeyboard\\(\\);[\\s\\S]{0,120}${action}\\(`),
      `${action} must move shortcut focus before acting so Enter cannot click the old replay button`);
  }
  const advanceSource = page.match(/function focusAfterQuestionAdvance\b[\s\S]*?\n  }/)?.[0] ?? "";
  assert.match(advanceSource, /if \(active === panel\) return;/,
    "automatic progression must retain focus when the keyboard panel already owns it");
  assert.ok(advanceSource.indexOf("if (active === panel) return;") < advanceSource.indexOf("window.requestAnimationFrame"));
});

test("v32 preserves active progress on epoch rollback and clears interrupted comparator status", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /const lastAcceptedProgressEpochMetaRef = useRef<ProgressEpochMeta \| null>\(null\)/);
  const epochEventSource = page.slice(
    page.indexOf("if (event.key === PROGRESS_EPOCH_META_KEY)"),
    page.indexOf("const epoch = progressEpochRef.current", page.indexOf("if (event.key === PROGRESS_EPOCH_META_KEY)")),
  );
  assert.match(epochEventSource, /isProgressEpochMetaTransitionAllowed\([\s\S]*?blockUnexpectedProgressEpoch\(\);\s*return;/,
    "an unauthorized epoch transition must pause storage without resetting in-memory progress");
  assert.doesNotMatch(epochEventSource, /resetProgressMemory\(\)/,
    "an old meta snapshot must not erase the active tab's high-water progress");
  const blockSource = page.match(/const blockUnexpectedProgressEpoch = useCallback\([\s\S]*?\n  }, \[\]\);/)?.[0] ?? "";
  assert.match(blockSource, /persistProgressRollbackGuard\(progressEpochRollbackGuardKey\(acceptedEpoch\)\)/);
  assert.match(blockSource, /progressEpochReadyRef\.current = false/);

  const cancelSource = page.match(/const cancelComparisonSequence = useCallback\([\s\S]*?\n  }, \[\]\);/)?.[0] ?? "";
  assert.match(cancelSource, /const wasActive = comparisonPlaybackActiveRef\.current/);
  assert.match(cancelSource, /comparisonPlaybackActiveRef\.current = false/);
  assert.match(cancelSource, /if \(wasActive\) setComparisonStatus\(interruptedStatus\)/);
  const visibilitySource = page.slice(
    page.indexOf("const handleVisibilityChange = () => {"),
    page.indexOf("const frame = window.requestAnimationFrame(handleVisibilityChange)"),
  );
  assert.match(visibilitySource, /cancelComparisonSequence\(false, "页面进入后台，对照播放已停止；请重新试听。"\)/);
  for (const functionName of ["playComparisonOnset", "playComparisonSyllable", "playComparisonSequence"]) {
    const start = page.indexOf(`async function ${functionName}`);
    const end = page.indexOf("\n  }", start);
    assert.match(page.slice(start, end + 4), /comparisonPlaybackActiveRef\.current = true/,
      `${functionName} must expose an independently cancellable active state`);
  }
});
