import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { chooseLocalKoreanVoice, DAY_DIALOGUES, SCENE_LINES, SCENE_TITLES } from "../app/day-dialogue-data.ts";

test("each scenario has a fresh Chinese recall task and two polite replies with distinct intentions", () => {
  assert.deepEqual(SCENE_TITLES, ["便利店结账", "餐厅点餐", "没听懂，请再说一遍"]);
  assert.deepEqual(SCENE_LINES, ["네, 하나 주세요.", "이거 주세요.", "다시 말해 주세요."]);
  assert.equal(DAY_DIALOGUES[0].prompt.ko, "봉투 필요하세요?");
  assert.equal(DAY_DIALOGUES[0].replies[1].ko, "아니요, 괜찮아요.");
  for (const scene of DAY_DIALOGUES) {
    assert.notEqual(scene.firstCue, scene.returnCue);
    assert.doesNotMatch(scene.firstCue + scene.returnCue, /[가-힣]/u, "do not put the answer into the speaking cue");
    assert.equal(new Set(scene.replies.map(x => x.intent)).size, 2);
    assert.equal(new Set(scene.replies.map(x => x.ko)).size, 2);
    assert.ok(scene.bridge.includes("从字母到开口"));
  }
});

test("every claimed packaged dialogue recording is the same complete Korean line, including its ending", () => {
  const library = JSON.parse(readFileSync(new URL("../data/phrases.json", import.meta.url), "utf8"));
  for (const scene of DAY_DIALOGUES) for (const line of [scene.prompt, ...scene.replies]) {
    const existing = library.find(item => item.korean === line.ko);
    if (!line.clip) { assert.equal(existing, undefined, "reuse an exact packaged recording when one exists"); continue; }
    assert.equal(line.clip, "/audio/phrases/" + existing?.id + ".mp3");
    assert.ok(existsSync(new URL("../public" + line.clip, import.meta.url)));
  }
});

test("utterances only use installed Korean voices, never a different language or network voice", () => {
  const v = (lang, localService = true) => ({ lang, localService });
  assert.equal(chooseLocalKoreanVoice([]), undefined);
  assert.equal(chooseLocalKoreanVoice([v("zh-CN"), v("en-US"), v("ko-KR", false)]), undefined);
  assert.equal(chooseLocalKoreanVoice([v("kok-IN")]), undefined);
  assert.equal(chooseLocalKoreanVoice([v("ko"), v("KO_KR"), v("en-US")]).lang, "KO_KR");
  assert.equal(chooseLocalKoreanVoice([v("ko-KR", false), v("ko")]).lang, "ko");
});
