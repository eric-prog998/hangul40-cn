import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { VOWEL_CONTRASTS, VOWEL_GUIDE_SOURCE } from "../app/pronunciation-data.ts";
import { decomposeHangulSyllable } from "../app/learning-logic.ts";

test("v35 vowel comparisons hold the consonant fixed and vary lip rounding", () => {
  assert.equal(VOWEL_CONTRASTS.length, 2);
  assert.match(VOWEL_GUIDE_SOURCE, /^https:\/\/www\.korean\.go\.kr\//);
  for (const pair of VOWEL_CONTRASTS) {
    assert.deepEqual(pair.sides.map(side => side.lip), ["unrounded", "rounded"]);
    assert.notEqual(pair.sides[0].letter, pair.sides[1].letter);
    for (const side of pair.sides) {
      const solo = decomposeHangulSyllable(side.isolated);
      const syllable = decomposeHangulSyllable(side.syllable);
      assert.equal(solo.initial, "ㅇ");
      assert.equal(syllable.initial, "ㄱ");
      assert.equal(solo.vowel, side.letter);
      assert.equal(syllable.vowel, side.letter);
    }
  }
});

test("v35 comparison sounds are existing, nonempty and different on each side", async () => {
  for (const pair of VOWEL_CONTRASTS) {
    for (const mode of ["isolated", "syllable"]) {
      const hashes = await Promise.all(pair.sides.map(async side => {
        const bytes = await readFile(new URL(`../public/audio/hangul-natural/s-${side[mode].codePointAt(0).toString(16)}.mp3`, import.meta.url));
        assert.ok(bytes.length > 100);
        return createHash("sha256").update(bytes).digest("hex");
      }));
      assert.notEqual(hashes[0], hashes[1]);
    }
  }
});

test("v35 scopes practice shortcuts and integrates stop with other learning activity", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const practice = await readFile(new URL("../app/vowel-practice.tsx", import.meta.url), "utf8");
  assert.match(page, /data-keyboard-scope="pronunciation"/);
  assert.match(page, /const claimGameActivity = useCallback\(\(\) => \{\s*vowelPracticeRef\.current\?\.stop\(\)/);
  assert.match(page, /const claimPhraseActivity = useCallback\(\(\) => \{\s*vowelPracticeRef\.current\?\.stop\(\)/);
  assert.match(page, /function openKeyboardHelp\(\) \{\s*vowelPracticeRef\.current\?\.stop\(\)/);
  assert.match(practice, /onPrepare\(\);\s*const request = \+\+token\.current/);
  assert.match(practice, /request !== token\.current/);
  assert.match(practice, /gap\.current\.resolve\(false\)/);
  assert.match(practice, /contextKey=\{`\$\{pair\.id\}-\$\{mode\}`\}/);
  assert.match(practice, /不提供自动发音分数/);
});
