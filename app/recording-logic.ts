export const MAX_RECORDING_SECONDS = 15;

export const RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/webm",
  "audio/ogg;codecs=opus",
] as const;

export function preferredRecordingMimeType(isSupported: (mime: string) => boolean): string | undefined {
  return RECORDING_MIME_TYPES.find((mime) => isSupported(mime));
}

export function recordingErrorMessage(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "没有获得麦克风权限。请在浏览器的网站设置中允许麦克风后重试；也可以继续听示范，不必开启录音。";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "没有找到麦克风。请连接或启用麦克风后重试。";
    case "NotReadableError":
    case "TrackStartError":
      return "麦克风暂时不可用，可能被其他应用占用。请检查设备后重试。";
    case "NotSupportedError":
      return "当前浏览器不支持这种录音格式，请尝试最新版 Safari、Chrome 或 Edge。";
    default:
      return "录音未能完成。请检查麦克风和浏览器权限后重试。";
  }
}

export type RecordingState = {
  phase: "idle" | "requesting" | "recording" | "processing" | "ready" | "playing" | "error";
  seconds: number;
  message: string;
  hasRecording: boolean;
};

export const INITIAL_RECORDING_STATE: RecordingState = {
  phase: "idle", seconds: 0, message: "先听示范，再录下自己读的声音。", hasRecording: false,
};

type Timer = ReturnType<typeof globalThis.setTimeout>;

/** Browser operations are injected so lifecycle/race tests never open a microphone. */
export type RecordingEnvironment = {
  getStream: () => Promise<MediaStream>;
  createRecorder: (stream: MediaStream) => MediaRecorder;
  createUrl: (blob: Blob) => string;
  revokeUrl: (url: string) => void;
  createAudio: (url: string) => HTMLAudioElement;
  now: () => number;
  setTimeout: (callback: () => void, ms: number) => Timer;
  clearTimeout: (timer: Timer) => void;
  setInterval: (callback: () => void, ms: number) => Timer;
  clearInterval: (timer: Timer) => void;
};

export class LocalRecordingSession {
  private state: RecordingState = { ...INITIAL_RECORDING_STATE };
  private disposed = false;
  private requestToken = 0;
  private playbackToken = 0;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private timeout: Timer | null = null;
  private interval: Timer | null = null;
  private trackListeners: Array<{ track: MediaStreamTrack; listener: () => void }> = [];
  private env: RecordingEnvironment;
  private onChange: (state: RecordingState) => void;

  constructor(env: RecordingEnvironment, onChange: (state: RecordingState) => void) {
    this.env = env;
    this.onChange = onChange;
  }

  private update(change: Partial<RecordingState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...change, hasRecording: this.url !== null };
    this.onChange({ ...this.state });
  }

  private clearTimers() {
    if (this.timeout !== null) this.env.clearTimeout(this.timeout);
    if (this.interval !== null) this.env.clearInterval(this.interval);
    this.timeout = null;
    this.interval = null;
  }

  private releaseStream() {
    for (const { track, listener } of this.trackListeners) track.removeEventListener("ended", listener);
    this.trackListeners = [];
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private detachRecorder() {
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
    }
    return recorder;
  }

  private releaseClip() {
    if (this.url) this.env.revokeUrl(this.url);
    this.url = null;
  }

  private stopPlayback() {
    this.playbackToken++;
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.onpause = null;
      this.audio.pause();
      this.audio = null;
    }
  }

  private fail(error: unknown) {
    this.clearTimers();
    const recorder = this.detachRecorder();
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* Tracks are still released below. */ }
    }
    this.releaseStream();
    this.chunks = [];
    this.update({ phase: "error", message: recordingErrorMessage(error) });
  }

  async start() {
    if (this.disposed || ["requesting", "recording", "processing"].includes(this.state.phase)) return;
    this.stopPlayback();
    const token = ++this.requestToken;
    this.update({ phase: "requesting", message: "等待麦克风权限……只有这次点击才会申请权限。" });
    try {
      const stream = await this.env.getStream();
      if (this.disposed || token !== this.requestToken) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      if (!stream.getAudioTracks().some((track) => track.readyState === "live")) {
        this.fail({ name: "NotFoundError" });
        return;
      }
      const recorder = this.env.createRecorder(stream);
      this.recorder = recorder;
      this.chunks = [];
      recorder.ondataavailable = (event) => {
        if (this.recorder === recorder && event.data.size > 0) this.chunks.push(event.data);
      };
      recorder.onstop = () => {
        // A previous context's delayed stop event must never revive its recording.
        if (this.disposed || this.recorder !== recorder) return;
        this.clearTimers();
        this.releaseStream();
        this.detachRecorder();
        const blob = new Blob(this.chunks, { type: recorder.mimeType || this.chunks[0]?.type || "audio/webm" });
        this.chunks = [];
        if (!blob.size) {
          this.update({ phase: "error", message: "没有录到音频数据。请确认麦克风正常，再按开始录音。" });
          return;
        }
        try {
          this.releaseClip();
          this.url = this.env.createUrl(blob);
          this.update({ phase: "ready", seconds: Math.min(MAX_RECORDING_SECONDS, Math.ceil((this.env.now() - this.startedAt) / 1000)), message: "录音已就绪。交替播放示范和自己的声音，听听差别。" });
        } catch (error) {
          this.fail(error);
        }
      };
      recorder.onerror = (event) => {
        if (this.recorder === recorder) this.fail("error" in event ? event.error : event);
      };
      for (const track of stream.getAudioTracks()) {
        const listener = () => { if (this.stream === stream) this.stop(); };
        track.addEventListener("ended", listener);
        this.trackListeners.push({ track, listener });
      }
      recorder.start();
      this.startedAt = this.env.now();
      this.update({ phase: "recording", seconds: 0, message: "正在录音，请读出当前韩语；15 秒后自动停止。" });
      this.interval = this.env.setInterval(() => {
        this.update({ seconds: Math.min(MAX_RECORDING_SECONDS, Math.floor((this.env.now() - this.startedAt) / 1000)) });
      }, 250);
      this.timeout = this.env.setTimeout(() => this.stop(), MAX_RECORDING_SECONDS * 1000);
    } catch (error) {
      if (!this.disposed && token === this.requestToken) this.fail(error);
    }
  }

  /** Keep a finished clip, but stop devices and playback immediately. */
  stop() {
    if (this.disposed) return;
    this.requestToken++;
    this.stopPlayback();
    this.clearTimers();
    if (this.recorder && this.recorder.state !== "inactive") {
      this.update({ phase: "processing", seconds: Math.min(MAX_RECORDING_SECONDS, Math.ceil((this.env.now() - this.startedAt) / 1000)), message: "正在整理这段录音……" });
      try {
        this.recorder.stop();
      } catch (error) {
        this.fail(error);
      }
      this.releaseStream();
      return;
    }
    // A stop event may still be queued after the recorder became inactive.
    if (this.recorder) return;
    this.releaseStream();
    if (["requesting", "playing"].includes(this.state.phase)) {
      this.update({ phase: this.url ? "ready" : "idle", message: this.url ? "已停止播放，录音仍保留在本页。" : "已取消录音。你可以继续听示范。" });
    }
  }

  async play() {
    if (this.disposed || !this.url || ["requesting", "recording", "processing"].includes(this.state.phase)) return;
    this.stopPlayback();
    const token = this.playbackToken;
    let audio: HTMLAudioElement;
    try {
      audio = this.env.createAudio(this.url);
      this.audio = audio;
      audio.onended = () => {
        if (token !== this.playbackToken || this.disposed) return;
        this.stopPlayback();
        this.update({ phase: "ready", message: "回放结束。再听一次示范，或重录后比较。" });
      };
      audio.onpause = () => {
        if (token !== this.playbackToken || this.disposed) return;
        this.stopPlayback();
        this.update({ phase: "ready", message: "回放已暂停。" });
      };
      audio.onerror = () => {
        if (token !== this.playbackToken || this.disposed) return;
        this.stopPlayback();
        this.update({ phase: "error", message: "这段录音暂时无法播放。请重新录音，或换一个浏览器重试。" });
      };
      this.update({ phase: "playing", message: "正在回放你的录音。" });
      await audio.play();
      if (token !== this.playbackToken || this.disposed) audio.pause();
    } catch {
      if (token !== this.playbackToken || this.disposed) return;
      this.stopPlayback();
      this.update({ phase: "error", message: "浏览器未能播放录音。请再次点击“回放我的声音”；若仍失败，请重新录音。" });
    }
  }

  clear() {
    this.requestToken++;
    this.stopPlayback();
    this.clearTimers();
    const recorder = this.detachRecorder();
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* The stream cleanup below is unconditional. */ }
    }
    this.releaseStream();
    this.releaseClip();
    this.chunks = [];
    this.update({ ...INITIAL_RECORDING_STATE, message: "录音已清除。声音只在本页临时保留，不会上传。" });
  }

  dispose() {
    this.disposed = true;
    this.clear();
  }
}
