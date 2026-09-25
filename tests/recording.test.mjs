import assert from "node:assert/strict";
import test from "node:test";
import { LocalRecordingSession, MAX_RECORDING_SECONDS, preferredRecordingMimeType, recordingErrorMessage } from "../app/recording-logic.ts";

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function harness({ pendingStream, empty = false, playReject = false, recorderError } = {}) {
  const states = [];
  const timers = new Map();
  const revoked = [];
  const created = [];
  const recorders = [];
  const audioElements = [];
  const track = {
    readyState: "live", stopped: 0, listeners: new Set(),
    stop() { this.stopped++; this.readyState = "ended"; },
    addEventListener(name, fn) { if (name === "ended") this.listeners.add(fn); },
    removeEventListener(name, fn) { if (name === "ended") this.listeners.delete(fn); },
    end() { this.readyState = "ended"; for (const fn of [...this.listeners]) fn(); },
  };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  let clock = 0, timerId = 0, getStreamCalls = 0;
  const env = {
    getStream: () => { getStreamCalls++; return pendingStream?.promise || Promise.resolve(stream); },
    createRecorder: () => {
      if (recorderError) throw recorderError;
      const recorder = {
        state: "inactive", mimeType: "audio/webm", ondataavailable: null, onstop: null, onerror: null,
        start() { this.state = "recording"; },
        stop() { this.state = "inactive"; },
        flush() {
          this.ondataavailable?.({ data: new Blob(empty ? [] : ["sound"], { type: "audio/webm" }) });
          this.onstop?.();
        },
      };
      recorders.push(recorder);
      return recorder;
    },
    createUrl: (blob) => { created.push(blob); return `blob:recording-${created.length}`; },
    revokeUrl: (url) => revoked.push(url),
    createAudio: () => {
      const audio = {
        paused: true, onended: null, onpause: null, onerror: null,
        play() { this.paused = false; return playReject ? Promise.reject(new Error("blocked")) : Promise.resolve(); },
        pause() { this.paused = true; this.onpause?.(); },
      };
      audioElements.push(audio);
      return audio;
    },
    now: () => clock,
    setTimeout: (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms, repeat: false }); return id; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms, repeat: true }); return id; },
    clearInterval: (id) => timers.delete(id),
  };
  const session = new LocalRecordingSession(env, (state) => states.push(state));
  return {
    session, states, timers, revoked, created, stream, track, recorders, audioElements,
    last: () => states.at(-1), calls: () => getStreamCalls,
    advance: (ms) => { clock += ms; },
  };
}

test("recording format and error messages cover browser/device differences", () => {
  assert.equal(preferredRecordingMimeType((type) => type.includes("mp4")), "audio/mp4");
  assert.equal(preferredRecordingMimeType(() => false), undefined, "let the browser select its default when no preference matches");
  assert.match(recordingErrorMessage({ name: "NotAllowedError" }), /没有获得麦克风权限/);
  assert.match(recordingErrorMessage({ name: "NotFoundError" }), /没有找到麦克风/);
  assert.match(recordingErrorMessage({ name: "NotReadableError" }), /其他应用占用/);
  assert.match(recordingErrorMessage({ name: "NotSupportedError" }), /不支持/);
  assert.match(recordingErrorMessage(null), /未能完成/);
});

test("microphone is requested only by start, never creation, playback or disposal", async () => {
  const h = harness();
  assert.equal(h.calls(), 0);
  await h.session.play();
  h.session.stop();
  h.session.clear();
  h.session.dispose();
  await h.session.start();
  assert.equal(h.calls(), 0);
});

test("cancelling a pending permission request releases a late stream without recording", async () => {
  const pending = deferred();
  const h = harness({ pendingStream: pending });
  const starting = h.session.start();
  assert.equal(h.last().phase, "requesting");
  h.session.stop();
  pending.resolve(h.stream);
  await starting;
  assert.equal(h.track.stopped, 1);
  assert.equal(h.recorders.length, 0);
  assert.equal(h.last().phase, "idle");
  assert.equal(h.timers.size, 0);
});

test("permission errors do not leak timers and explain how to retry", async () => {
  const pending = deferred();
  const h = harness({ pendingStream: pending });
  const starting = h.session.start();
  pending.reject({ name: "NotAllowedError" });
  await starting;
  assert.equal(h.last().phase, "error");
  assert.match(h.last().message, /权限/);
  assert.equal(h.timers.size, 0);
});

test("recording automatically stops at 15 seconds, immediately releases tracks and retains one local clip", async () => {
  const h = harness();
  await h.session.start();
  assert.equal(h.last().phase, "recording");
  assert.equal(h.timers.size, 2);
  const timeout = [...h.timers.values()].find((timer) => !timer.repeat);
  assert.equal(timeout.ms, MAX_RECORDING_SECONDS * 1000);
  h.advance(timeout.ms);
  timeout.callback();
  assert.equal(h.last().phase, "processing");
  assert.equal(h.track.stopped, 1, "microphone closes before async blob processing");
  assert.equal(h.track.listeners.size, 0);
  assert.equal(h.timers.size, 0);
  h.recorders[0].flush();
  assert.equal(h.last().phase, "ready");
  assert.equal(h.last().seconds, 15);
  assert.equal(h.last().hasRecording, true);
  assert.equal(h.created.length, 1);
  h.session.dispose();
  assert.deepEqual(h.revoked, ["blob:recording-1"]);
});

test("clearing during stop discards late data, preventing an old context clip from reappearing", async () => {
  const h = harness();
  await h.session.start();
  const oldData = h.recorders[0].ondataavailable;
  const oldStop = h.recorders[0].onstop;
  const oldError = h.recorders[0].onerror;
  h.session.stop();
  h.session.clear();
  oldData({ data: new Blob(["old sound"]) });
  oldStop();
  oldError({ error: { name: "NotReadableError" } });
  assert.equal(h.last().phase, "idle");
  assert.equal(h.last().hasRecording, false);
  assert.equal(h.created.length, 0);
  assert.equal(h.timers.size, 0);
});

test("device disconnection stops recording and empty data has clear feedback", async () => {
  const h = harness({ empty: true });
  await h.session.start();
  h.track.end();
  assert.equal(h.last().phase, "processing");
  assert.equal(h.timers.size, 0);
  h.recorders[0].flush();
  assert.equal(h.last().phase, "error");
  assert.match(h.last().message, /没有录到音频数据/);
  assert.equal(h.last().hasRecording, false);
});

test("playback failures remain recoverable, and deleting a clip revokes its URL", async () => {
  const h = harness({ playReject: true });
  await h.session.start();
  h.session.stop();
  h.recorders[0].flush();
  await h.session.play();
  assert.equal(h.last().phase, "error");
  assert.equal(h.last().hasRecording, true);
  assert.match(h.last().message, /再次点击/);
  assert.equal(h.audioElements[0].paused, true);
  h.session.clear();
  assert.deepEqual(h.revoked, ["blob:recording-1"]);
  assert.equal(h.last().hasRecording, false);
});

test("stopping playback retains clip, while disposal pauses it and suppresses future UI updates", async () => {
  const h = harness();
  await h.session.start();
  h.session.stop();
  h.recorders[0].flush();
  await h.session.play();
  assert.equal(h.last().phase, "playing");
  h.session.stop();
  assert.equal(h.last().phase, "ready");
  assert.equal(h.last().hasRecording, true);
  await h.session.play();
  const count = h.states.length;
  h.session.dispose();
  assert.equal(h.audioElements.at(-1).paused, true);
  assert.equal(h.states.length, count);
  assert.deepEqual(h.revoked, ["blob:recording-1"]);
});

test("recorder initialization failures stop the acquired microphone", async () => {
  const h = harness({ recorderError: { name: "NotSupportedError" } });
  await h.session.start();
  assert.equal(h.last().phase, "error");
  assert.equal(h.track.stopped, 1);
  assert.equal(h.timers.size, 0);
});

test("unmounting during a permission request releases its eventual stream without state updates", async () => {
  const pending = deferred();
  const h = harness({ pendingStream: pending });
  const starting = h.session.start();
  h.session.dispose();
  const count = h.states.length;
  pending.resolve(h.stream);
  await starting;
  assert.equal(h.track.stopped, 1);
  assert.equal(h.states.length, count);
  assert.equal(h.created.length, 0);
});
