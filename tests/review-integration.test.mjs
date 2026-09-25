import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("daily review gates self-rating on reveal, caps the remaining daily queue and owns its keyboard zone", async () => {
  const ui = await readFile(new URL("../app/daily-review.tsx", import.meta.url), "utf8");
  assert.match(ui, /Math\.max\(0, DAILY_TARGET - todayReviewedCount\)/);
  assert.match(ui, /revealedKey === currentKey/);
  assert.match(ui, /function rate[\s\S]*?if \(!revealed\)[\s\S]*?return;/);
  assert.match(ui, /ratedRef\.current === currentKey/);
  assert.match(ui, /data-keyboard-scope="daily-review"/);
  assert.match(ui, /button, a\[href\], summary/);
  assert.match(ui, /if \(playingRef\.current !== null\) onPrepareLatest\.current\(\)/);
  assert.match(ui, /request !== token\.current/);
  assert.match(ui, /setRevealedKey\(null\)/);
  assert.match(ui, /不是发音判分/);
});

test("review storage refreshes across midnight and external updates without modifying original mastery", async () => {
  const hook = await readFile(new URL("../app/use-daily-review.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const store = await readFile(new URL("../app/review-storage.ts", import.meta.url), "utf8");
  assert.match(hook, /millisecondsUntilNextLocalMidnight\(\)/);
  assert.match(hook, /addEventListener\("storage", onStorage\)/);
  assert.match(hook, /removeEventListener\("visibilitychange", onVisible\)/);
  assert.match(store, /storage\.getItem\(reviewStorageKey\(id\)\) === serialized/);
  assert.doesNotMatch(store, /localStorage\.clear|masteredPhrases|fetch\(|XMLHttpRequest/);
  assert.match(page, /data-keyboard-scope="daily-review"/);
  assert.match(page, /const claimGameActivity = useCallback\(\(\) => \{\s*vowelPracticeRef\.current\?\.stop\(\);\s*dailyReviewRef\.current\?\.stop\(\)/);
});
