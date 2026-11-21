import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createAudioCatalog } from "../app/audio-catalog.ts";
import { coreReviewChecklist } from "../app/core-audio-review.ts";

test("all core lessons and single human onsets decode with an audible signal", async ({page}) => {
  const catalog = createAudioCatalog(JSON.parse(readFileSync(new URL("../data/consonant-names.json", import.meta.url), "utf8")), []);
  const paths = [...coreReviewChecklist(catalog, "48").items.map(x => x.path),
    ...catalog.filter(x => x.category === "onset").map(x => x.path)];
  expect(new Set(paths).size).toBe(76);
  await page.goto("/");
  const issues = await page.evaluate(async urls => {
    const decoder = new OfflineAudioContext(1, 1, 48000);
    const failures: string[] = [];
    for (const path of urls) {
      try {
        const response = await fetch(path);
        if (!response.ok) throw new Error("HTTP " + response.status);
        const sound = await decoder.decodeAudioData(await response.arrayBuffer());
        let audible = false;
        for (let ch = 0; ch < sound.numberOfChannels; ch++) {
          if (sound.getChannelData(ch).some(v => Math.abs(v) > .01)) { audible = true; break; }
        }
        if (!audible || !Number.isFinite(sound.duration) || !sound.length) throw new Error("empty/silent");
      } catch (error) { failures.push(path + ": " + String(error)); }
    }
    return failures;
  }, paths);
  expect(issues, "file decoding and non-silence do not certify pronunciation").toEqual([]);
});
