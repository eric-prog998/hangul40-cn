export type AudioPlaybackResult = "ended" | "interrupted" | "failed";

type AudioLike = Pick<HTMLAudioElement, "preload" | "volume" | "preservesPitch" | "playbackRate" | "ended" | "load" | "play" | "pause" | "cloneNode" | "addEventListener" | "removeEventListener" | "removeAttribute">;

// A warm set for the current exercise, not a media element for every clip ever heard.
const MAX_PRELOADED = 32;

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

  private discard(source: string, audio: AudioLike | undefined) {
    if (!audio || this.cache.get(source) !== audio) return;
    this.cache.delete(source);
    // Only release the template; an already-playing clone owns its own lifetime.
    try { audio.removeAttribute("src"); audio.load(); } catch { /* Already detached. */ }
  }

  preload(source: string) {
    if (!source) return;
    const cached = this.cache.get(source);
    if (cached) {
      this.cache.delete(source); this.cache.set(source, cached);
      return;
    }
    try {
      const audio = this.create(source);
      audio.preload = "auto";
      audio.addEventListener("error", () => this.discard(source, audio), { once: true });
      this.cache.set(source, audio);
      if (this.cache.size > MAX_PRELOADED) {
        const oldest = this.cache.entries().next().value;
        if (oldest) this.discard(...oldest);
      }
      audio.load();
    } catch { this.discard(source, this.cache.get(source)); }
  }

  stop() { this.cancel?.(); }

  play(source: string, speed = 1): Promise<AudioPlaybackResult> {
    this.stop();
    if (!source) return Promise.resolve("failed");
    this.preload(source);
    const cached = this.cache.get(source);
    let audio: AudioLike;
    try {
      audio = cached ? cached.cloneNode(true) as unknown as AudioLike : this.create(source);
      audio.volume = 1;
      audio.preservesPitch = true;
      audio.playbackRate = Number.isFinite(speed) && speed > 0 ? speed : 1;
    } catch { this.discard(source, cached); return Promise.resolve("failed"); }

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
        if (invalidateCache) this.discard(source, cached);
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
