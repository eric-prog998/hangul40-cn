// Compare two local MP3s using the browser's real decoder, without serving or sending media.
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
const inputs = JSON.parse(await readFile(process.argv[2], "utf8"));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ offline: true });
  const reports = {};
  for (const {path, original, candidate} of inputs) {
    const pair = await Promise.all([original, candidate].map(p => readFile(p, "base64")));
    reports[path] = await page.evaluate(async ([oldB64, newB64]) => {
      const ctx = new OfflineAudioContext(1, 1, 24000);
      const decode = async data => ctx.decodeAudioData(Uint8Array.from(atob(data), c => c.charCodeAt(0)).buffer);
      const [before, after] = await Promise.all([decode(oldB64), decode(newB64)]);
      if ([before,after].some(b => b.numberOfChannels !== 1 || b.sampleRate !== 24000)) throw Error("Bad format");
      const a = before.getChannelData(0), b = after.getChannelData(0);
      const af = new Uint32Array(a.buffer, a.byteOffset, a.length), bf = new Uint32Array(b.buffer, b.byteOffset, b.length);
      const last = a.findLastIndex(x => x !== 0) + 1;
      return {original_samples:a.length, new_samples:b.length, last_nonzero_end:last,
        retained_zero_samples:b.length-last, prefix_exact:b.length<a.length && bf.every((x,i)=>x===af[i]),
        removed_exact_zero:a.subarray(b.length).every(x=>x===0)};
    }, pair);
  }
  process.stdout.write(JSON.stringify(reports));
} finally { await browser.close(); }
