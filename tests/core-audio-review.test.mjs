import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createAudioCatalog } from "../app/audio-catalog.ts";
import { coreReviewChecklist } from "../app/core-audio-review.ts";

const data = async name => JSON.parse(await readFile(new URL("../data/" + name + ".json", import.meta.url), "utf8"));
test("the core hearing sheet covers the reference spellings and ㅏ group without silent or duplicated examples", async () => {
  const names = await data("consonant-names");
  const catalog = createAudioCatalog(names, [], await data("audio-fingerprints"));
  const list = coreReviewChecklist(catalog, "48").items;
  assert.deepEqual(names.map(n => n.name), "기역 쌍기역 니은 디귿 쌍디귿 리을 미음 비읍 쌍비읍 시옷 쌍시옷 이응 지읒 쌍지읒 치읓 키읔 티읕 피읖 히읗".split(" "));
  const vowels = "아애야얘어에여예오와왜외요우워웨위유으의이";
  assert.deepEqual(list.slice(0,21).map(e => e.label.split(" · ")[1]), [...vowels]);
  assert.equal(list.filter(e => e.id.startsWith("name-")).length, 19);
  assert.deepEqual(list.slice(40,43).map(e => e.label), ["가","카","까"]);
  assert.equal(list.length, 58);
  assert.equal(new Set(list.map(e => e.path)).size, 58);
  assert.ok(list.every(e => e.reviewStatus === "pending" && e.sha256?.length === 64 && !e.reviewer));
});
