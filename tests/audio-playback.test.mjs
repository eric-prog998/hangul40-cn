import assert from "node:assert/strict";
import test from "node:test";
import { AudioPlaybackController } from "../app/audio-playback.ts";

class FakeAudio extends EventTarget {
  ended = false;
  paused = true;
  preload = "";
  volume = 1;
  preservesPitch = false;
  playbackRate = 1;
  released = false;
  constructor(source, instances) { super(); this.source = source; this.instances = instances; instances.push(this); }
  cloneNode() { return new FakeAudio(this.source, this.instances); }
  load() {}
  play() { return new Promise((resolve, reject) => { this.resolvePlay = resolve; this.rejectPlay = reject; }); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event("pause")); } }
  removeAttribute(name) { if (name === "src") this.released = true; }
  complete() { this.ended = true; this.paused = false; this.pause(); this.dispatchEvent(new Event("ended")); }
}
function setup(timeout = 1000) {
  const instances = [];
  const player = new AudioPlaybackController(src => new FakeAudio(src, instances), timeout);
  return { player, instances };
}

test("stopping a still-loading audio settles immediately even when pause emits no event", async () => {
  const { player, instances } = setup();
  const playing = player.play("one.mp3");
  assert.equal(instances.at(-1).paused, true);
  player.stop();
  assert.equal(await playing, "interrupted");
  assert.equal(instances.at(-1).released, true);
  instances.at(-1).rejectPlay(new Error("late abort"));
});
test("starting another clip cancels the previous request and late errors cannot stop the new clip", async () => {
  const { player, instances } = setup();
  const first = player.play("one.mp3"); const old = instances.at(-1);
  const second = player.play("two.mp3", 0.8); const current = instances.at(-1);
  assert.equal(await first, "interrupted");
  old.rejectPlay(new Error("late error"));
  await Promise.resolve();
  assert.equal(current.released, false);
  assert.equal(current.playbackRate, 0.8);
  current.complete();
  assert.equal(await second, "ended");
});
test("natural pause-before-ended is completion, not cancellation", async () => {
  const { player, instances } = setup();
  const result = player.play("one.mp3"); instances.at(-1).complete();
  assert.equal(await result, "ended");
  player.stop(); assert.equal(instances.at(-1).released, false);
});
test("failed playback evicts its cached source and allows retry", async () => {
  const { player, instances } = setup();
  const failed = player.play("one.mp3"); instances.at(-1).rejectPlay(new Error("blocked"));
  assert.equal(await failed, "failed");
  const count = instances.length;
  const retry = player.play("one.mp3");
  assert.equal(instances.length, count + 2);
  instances.at(-1).complete(); assert.equal(await retry, "ended");
});
test("preload errors evict only the failed cache entry", async () => {
  const { player, instances } = setup();
  player.preload("one.mp3"); instances[0].dispatchEvent(new Event("error"));
  const result = player.play("one.mp3");
  assert.equal(instances.length, 3);
  instances.at(-1).complete(); assert.equal(await result, "ended");
});
test("timeout releases a stuck load and resolves as failure", async () => {
  const { player, instances } = setup(5);
  assert.equal(await player.play("one.mp3"), "failed");
  assert.equal(instances.at(-1).released, true);
});
test("synchronous media failures and empty sources resolve safely", async () => {
  const player = new AudioPlaybackController(() => { throw new Error("unsupported"); });
  assert.equal(await player.play("one.mp3"), "failed");
  assert.equal(await player.play(""), "failed");
});
