export type AudioPlaybackResult = "ended" | "interrupted" | "failed";

type AudioLike = Pick<HTMLAudioElement, "preload" | "volume" | "preservesPitch" | "playbackRate" | "ended" | "load" | "play" | "pause" | "cloneNode" | "addEventListener" | "removeEventListener" | "removeAttribute">;

/** One owner for packaged audio. Cancellation also settles a not-yet-started play(). */
export class AudioPlaybackController {
  private cache = new Map<string, AudioLike>();
  private cancel: (() => void) | null = null;
  private create: (source: string) => AudioLike;
  private timeoutMs: number;

  constructor(create: (source: string) => AudioLike = source => new Audio(source), timeoutMs = 15_000) {
    this.create = create;
    this.timeoutMs = timeoutMs;
  }

  preload(source: string) {
    if (!source || this.cache.has(source)) return;
    try {
      const audio = this.create(source);
      audio.preload = "auto";
      audio.addEventListener("error", () => {
        if (this.cache.get(source) === audio) this.cache.delete(source);
      }, { once: true });
      this.cache.set(source, audio);
      audio.load();
    } catch { this.cache.delete(source); }
  }

  stop() { this.cancel?.(); }

  play(source: string, speed = 1): Promise<AudioPlaybackResult> {
    this.stop();
    if (!source) return Promise.resolve("failed");
    this.preload(source);
    let audio: AudioLike;
    try {
      const cached = this.cache.get(source);
      audio = cached ? cached.cloneNode(true) as unknown as AudioLike : this.create(source);
      audio.volume = 1;
      audio.preservesPitch = true;
      audio.playbackRate = Number.isFinite(speed) && speed > 0 ? speed : 1;
    } catch { this.cache.delete(source); return Promise.resolve("failed"); }

    return new Promise(resolve => {
      let settled = false;
      const release = () => {
        audio.pause();
        // Abort a pending load/play without requesting the current document as an empty URL.
        audio.removeAttribute("src");
        audio.load();
      };
      const finish = (result: AudioPlaybackResult, invalidateCache = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        audio.removeEventListener("ended", ended);
        audio.removeEventListener("error", failed);
        audio.removeEventListener("pause", paused);
        if (invalidateCache) this.cache.delete(source);
        if (this.cancel === cancel) this.cancel = null;
        if (result !== "ended") release();
        resolve(result);
      };
      const ended = () => finish("ended");
      const failed = () => finish("failed", true);
      const paused = () => finish(audio.ended ? "ended" : "interrupted");
      const cancel = () => finish("interrupted");
      this.cancel = cancel;
      audio.addEventListener("ended", ended);
      audio.addEventListener("error", failed);
      audio.addEventListener("pause", paused);
      const timeout = setTimeout(failed, this.timeoutMs);
      try { void audio.play().catch(failed); } catch { failed(); }
    });
  }
}
