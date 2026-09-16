import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

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

test("renders the real Korean learning product", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /韩语 40 音｜中文闯关版/);
  assert.match(html, /中文闯关版 · v13/);
  assert.match(html, /韩国真人起音/);
  assert.match(html, /答题自动推进/);
  assert.match(html, /韩语 40 音表 · 真人起音版/);
  assert.match(html, /韩国母语者真人起音 · 已截去完整元音/);
  assert.doesNotMatch(html, /Your site is taking shape|Codex is working|codex-preview/);
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
});

test("ships 18 distinct native-speaker consonant onsets and treats initial ㅇ as silence", async () => {
  const metadata = JSON.parse(await readFile(new URL("../data/consonant-names.json", import.meta.url), "utf8"));
  const clips = JSON.parse(await readFile(new URL("../data/consonant-human-clips.json", import.meta.url), "utf8"));
  const audible = metadata.filter((item) => item.audioFile);
  const silent = metadata.filter((item) => item.initialSilent);
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
  assert.ok(clips.every((item) => item.transitionTailMs > 0 && item.transitionTailMs <= 35));
  assert.ok(clips.every((item) => item.endMs > item.startMs));
  assert.ok(clips.every((item) => /^[a-f0-9]{64}$/.test(item.sourceSha256)));
  assert.ok(clips.every((item) => item.sourcePage.startsWith("https://commons.wikimedia.org/wiki/File:")));

  for (const item of audible) {
    const file = new URL(`../public/audio/consonant-human-onset/${item.audioFile}`, import.meta.url);
    const info = await stat(file);
    const bytes = await readFile(file);
    assert.ok(info.size > 5_000, `${item.char} human onset is unexpectedly small`);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WAVE");
    assert.equal(bytes.readUInt16LE(20), 1, `${item.char} is not PCM`);
    assert.equal(bytes.readUInt16LE(22), 1, `${item.char} is not mono`);
    assert.equal(bytes.readUInt32LE(24), 48_000, `${item.char} has an unexpected sample rate`);
    assert.equal(bytes.readUInt16LE(34), 16, `${item.char} is not 16-bit audio`);
    const duration = bytes.readUInt32LE(40) / bytes.readUInt32LE(28);
    assert.ok(duration >= 0.05 && duration <= 0.30, `${item.char} duration ${duration} is outside the human-onset range`);
    let peak = 0;
    for (let offset = 44; offset + 1 < bytes.length; offset += 2) {
      const sample = bytes.readInt16LE(offset);
      peak = Math.max(peak, Math.abs(sample));
    }
    assert.ok(peak >= 29_000, `${item.char} human onset is effectively silent`);
    const silentTail = bytes.subarray(bytes.length - 48_000 * 0.008 * 2);
    assert.ok([...silentTail].every((byte) => byte === 0), `${item.char} is missing its click-free silent tail`);
    hashes.push(createHash("sha256").update(bytes).digest("hex"));
  }

  assert.equal(new Set(hashes).size, 18, "two human consonant onsets contain identical audio bytes");
  await assert.rejects(stat(new URL("../public/audio/consonant-human-onset/ieung.wav", import.meta.url)), { code: "ENOENT" });
  await assert.rejects(stat(new URL("../public/audio/consonant-synthetic/", import.meta.url)), { code: "ENOENT" });
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
  const phraseFiles = (await readdir(new URL("../public/audio/phrases/", import.meta.url))).filter((name) => name.endsWith(".mp3"));
  assert.equal(phraseFiles.length, 36);
});

test("prevents ambiguous mixed-category questions and enables automatic progress", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /consonantNameMap\.has\(target\.char\) \? audibleConsonants : vowels/);
  assert.match(page, /pickWeightedLetter\(gameStats\.mistakes, audibleLetters\)/);
  assert.equal(page.match(/pickWeightedLetter\(gameStats\.mistakes, audibleLetters\)/g)?.length, 4);
  assert.match(page, /function consonantSoundPath/);
  assert.match(page, /\/audio\/consonant-human-onset\/\$\{audioFile\}/);
  assert.match(page, /playLetterExample\(listenTarget\)/);
  assert.match(page, /listenAnswer === null \? "韩国真人起音" : `真人起音/);
  assert.match(page, /playLetterExample\(shadowCurrent\)/);
  assert.match(page, /card\.type === "sound"\) playLetterExample\(card\.letter\)/);
  assert.match(page, /playLetterExample\(speedTarget\)/);
  assert.doesNotMatch(page, /playSound\((listenTarget|shadowCurrent|speedTarget|card\.letter)\.sample\)/);
  assert.doesNotMatch(page, /consonant-synthetic|离线数字合成|无元音合成|合成近似/);
  assert.doesNotMatch(page, /ㅏ 组合示范|辅音 \+ ㅏ 示例/);
  assert.match(page, /AUTO_ADVANCE_DELAY_MS/);
  assert.match(page, /setTimeout\(nextListenQuestion, AUTO_ADVANCE_DELAY_MS\)/);
  assert.match(page, /setTimeout\(nextPhraseQuestion, phraseAutoAdvanceDelay/);
  assert.match(page, /phraseAutoAdvanceDelay\(phraseQuizTarget\.korean, audioSpeed\)/);
  assert.match(page, /Math\.ceil\(normalSpeedDelay \/ speed\)/);
  assert.match(page, /setTimeout\(nextBlendQuestion, AUTO_ADVANCE_DELAY_MS\)/);
  assert.match(page, /pickPreferredKoreanVoice/);
  assert.match(page, /noveltyKoreanVoiceNames/);
  assert.doesNotMatch(page, /getVoices\(\)\.find\(\(voice\) => voice\.lang/);
  assert.match(page, /const replayKey = event\.key === " " \|\| key === "r"/);
  assert.match(page, /event\.key === "Enter" && listenAnswer !== null/);
});
