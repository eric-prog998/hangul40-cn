import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = rel => readFile(new URL("../"+rel,import.meta.url));
const json = async rel => JSON.parse(await files(rel));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const pathOf = char => "/audio/hangul-natural/s-"+char.codePointAt(0).toString(16)+".mp3";
const audited = new Set([
  ...Array.from({length:21},(_,i)=>String.fromCodePoint(0xac00+(11*21+i)*28)),
  ...Array.from({length:19},(_,i)=>String.fromCodePoint(0xac00+i*21*28)),
].map(pathOf));

test("cache exceptions match only core recordings with an exact-silence edit",async()=>{
  const trims=await json("data/core-tail-trims.json"), proofs=await json("scripts/core-tail-v513-audit.json");
  const fingerprints=await json("data/audio-fingerprints.json");
  assert.deepEqual(new Set(Object.keys(proofs)),audited);
  assert.deepEqual(new Set(Object.keys(trims)), new Set(Object.entries(proofs).filter(([,p])=>p.status==="trimmed").map(([k])=>k)));
  assert.deepEqual(Object.keys(proofs).filter(k=>!trims[k]).sort(),[..."오바타"].map(pathOf).sort());
  assert.equal(hash(Object.keys(proofs).sort().map(k=>k+" "+proofs[k].original_sha256+"\n").join("")),
    "73df209d3672c556d6d8ba9a0ff5fc3451fb0be3194e9d4bb1ca073192266172", "pinned v51.2 original bytes");
  for(const [k,p] of Object.entries(proofs)){
    const bytes=await files("public"+k);
    assert.equal(hash(bytes),p.sha256,k);
    assert.equal(fingerprints[k].sha256,p.sha256,k);
    assert.equal(bytes.length/144*24,p.new_ms,k);
    if(!trims[k]){
      assert.equal(p.sha256,p.original_sha256); assert.equal(p.original_ms,p.new_ms);
      assert.ok(p.original_samples-p.coreaudio_last_nonzero_end<4320);
      continue;
    }
    assert.equal(trims[k],p.sha256); assert.notEqual(p.sha256,p.original_sha256);
    assert.ok(p.original_ms-p.new_ms>=400 && p.original_ms-p.new_ms<=510);
    assert.equal(p.coreaudio_new_samples,p.new_ms*24);
    assert.ok(p.coreaudio_new_samples-p.coreaudio_last_nonzero_end>=4320);
    assert.match(p.coreaudio_prefix_f32le_sha256,/^[a-f0-9]{64}$/);
    assert.equal(p.chromium.prefix_exact,true); assert.equal(p.chromium.removed_exact_zero,true);
    assert.ok(p.chromium.retained_zero_samples>=4320);
    assert.equal(p.chromium.new_samples,p.chromium.last_nonzero_end+p.chromium.retained_zero_samples);
    assert.ok(p.chromium.original_samples>p.chromium.new_samples);
    for(let i=0;i<bytes.length;i+=144) assert.equal(bytes.readUInt32BE(i),0xfff364c4,k+" incomplete MP3 frame");
  }
});
