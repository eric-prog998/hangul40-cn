"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { INITIAL_RECORDING_STATE, LocalRecordingSession, MAX_RECORDING_SECONDS, preferredRecordingMimeType, type RecordingState } from "./recording-logic";

export type LocalVoiceRecorderHandle = { stop: () => void };
type Props = { onPrepare?: () => void; contextKey?: string };

const LocalVoiceRecorder = forwardRef<LocalVoiceRecorderHandle, Props>(function LocalVoiceRecorder({ onPrepare, contextKey }, ref) {
  const session = useRef<LocalRecordingSession | null>(null);
  const [state, setState] = useState<RecordingState>({ ...INITIAL_RECORDING_STATE });
  const [unsupportedReason, setUnsupportedReason] = useState("");
  const [checking, setChecking] = useState(true);

  useImperativeHandle(ref, () => ({ stop: () => session.current?.stop() }), []);

  useEffect(() => {
    if (!window.isSecureContext) {
      setUnsupportedReason("录音需要安全连接。请用网站的 HTTPS 地址打开；本地预览可使用 localhost。");
      setChecking(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setUnsupportedReason("当前浏览器不支持网页录音。你仍可听示范；录音可尝试最新版 Safari、Chrome 或 Edge。");
      setChecking(false);
      return;
    }
    const controller = new LocalRecordingSession({
      getStream: () => navigator.mediaDevices.getUserMedia({ audio: true }),
      createRecorder: (stream) => {
        const mimeType = preferredRecordingMimeType((type) => MediaRecorder.isTypeSupported(type));
        return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      },
      createUrl: (blob) => URL.createObjectURL(blob),
      revokeUrl: (url) => URL.revokeObjectURL(url),
      createAudio: (url) => new Audio(url),
      now: () => Date.now(),
      setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
      clearTimeout: (timer) => globalThis.clearTimeout(timer),
      setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
      clearInterval: (timer) => globalThis.clearInterval(timer),
    }, setState);
    session.current = controller;
    setUnsupportedReason("");
    setChecking(false);
    const onVisibility = () => { if (document.visibilityState === "hidden") controller.stop(); };
    const onPageHide = () => controller.clear();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      controller.dispose();
      if (session.current === controller) session.current = null;
    };
  }, []);

  const previousContext = useRef(contextKey);
  useEffect(() => {
    if (previousContext.current !== contextKey) {
      session.current?.clear();
      previousContext.current = contextKey;
    }
  }, [contextKey]);

  const busy = ["requesting", "recording", "processing"].includes(state.phase);
  const unavailable = checking || Boolean(unsupportedReason);
  return <div className="local-voice-recorder" data-recording-phase={state.phase}>
    <div className="local-recorder-heading"><strong>录下自己的声音</strong><span>最长 {MAX_RECORDING_SECONDS} 秒 · 仅本页保留</span></div>
    <p className="local-recorder-privacy">仅点击“开始录音”后申请麦克风权限。不上传、不存档、不做发音评分；切换对比或离开本页会清除录音。</p>
    <div className="local-recorder-actions">
      {state.phase === "requesting" ? <button type="button" onClick={() => session.current?.stop()}>取消录音请求</button>
        : state.phase === "recording" ? <button type="button" className="recording-stop" onClick={() => session.current?.stop()}>■ 停止录音 · {state.seconds} / {MAX_RECORDING_SECONDS} 秒</button>
          : <button type="button" disabled={unavailable || busy} onClick={() => { onPrepare?.(); void session.current?.start(); }}>{state.phase === "processing" ? "整理录音中…" : state.hasRecording ? "重新录音" : "开始录音"}</button>}
      <button type="button" disabled={unavailable || busy || !state.hasRecording} onClick={() => {
        if (state.phase === "playing") session.current?.stop();
        else { onPrepare?.(); void session.current?.play(); }
      }}>{state.phase === "playing" ? "停止回放" : "回放我的声音"}</button>
      <button type="button" disabled={unavailable || (!busy && !state.hasRecording)} onClick={() => session.current?.clear()}>删除录音</button>
    </div>
    <p className={`local-recorder-status${state.phase === "error" || unsupportedReason ? " recorder-error" : ""}`} role="status" aria-live="polite" aria-atomic="true">{checking ? "正在检查浏览器录音能力，不会申请权限…" : unsupportedReason || state.message}</p>
    <p className="local-recorder-listen-tip">回听小提示：先比较元音和送气的差别，不用刻意模仿音色。录音听不见时，请检查系统麦克风输入音量。</p>
  </div>;
});

export default LocalVoiceRecorder;
