"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { chooseLocalKoreanVoice, DAY_DIALOGUES, type DialogueLine } from "./day-dialogue-data";
import "./day-dialogue.css";

type Props = {
  sceneIndex: number; recall: boolean; active: boolean;
  onDone: (result: "again" | "good") => void;
  onPlay: (path: string) => Promise<boolean>;
  onStop: () => void;
};
const sourceOf = (line: DialogueLine) => line.clip ? "站内 AI 示范" : "本机韩语语音";
const missingVoice = "浏览器没有提供本机韩语语音。可先显示原文、照常练习；也可以在 Mac 安装韩语声音后重试。不会切换到其他语言。";

export default function DayDialogue(props: Props) {
  return <DialogueTurn key={props.sceneIndex + ":" + props.recall} {...props} />;
}

function DialogueTurn({ sceneIndex, recall, active, onDone, onPlay, onStop }: Props) {
  const scene = DAY_DIALOGUES[sceneIndex] ?? DAY_DIALOGUES[0];
  const [revealed, setRevealed] = useState(false);
  const [transcript, setTranscript] = useState(false);
  const [status, setStatus] = useState("");
  const panel = useRef<HTMLElement>(null);
  const played = useRef<"clip" | "voice" | null>(null);
  const seq = useRef(0);
  const timer = useRef<number | null>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const finished = useRef(false);
  const stopShared = useRef(onStop);
  useLayoutEffect(() => { stopShared.current = onStop; }, [onStop]);
  const cancel = useCallback(() => {
    seq.current += 1;
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    if (utterance.current) {
      utterance.current.onend = null;
      utterance.current.onerror = null;
      utterance.current = null;
    }
    const owner = played.current;
    played.current = null;
    if (owner === "voice") window.speechSynthesis?.cancel();
    if (owner === "clip") stopShared.current();
  }, []);
  const stop = useCallback(() => {
    const interrupted = played.current !== null;
    cancel();
    if (interrupted) setStatus("已停止播放，按空格可以重新听。");
  }, [cancel]);

  useLayoutEffect(() => cancel, [cancel]);
  useLayoutEffect(() => {
    if (!active) { stop(); return; }
    panel.current?.focus({ preventScroll: true });
  }, [active, stop]);
  useEffect(() => {
    if (!active) return;
    // Some engines populate the voices list asynchronously on the first call.
    // Listing is silent; never queue an utterance until the learner presses play.
    try { window.speechSynthesis?.getVoices(); } catch { /* Text practice still works. */ }
    const onVisibility = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", stop);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", stop);
    };
  }, [active, stop]);

  async function play(line: DialogueLine) {
    if (!active || finished.current || document.hidden) return;
    cancel();
    const ticket = seq.current;
    if (line.clip) {
      played.current = "clip";
      setStatus("正在播放站内整句示范。");
      let ok = false;
      try { ok = await onPlay(line.clip); } catch { /* Allow retry or visual study. */ }
      if (seq.current !== ticket) return;
      played.current = null;
      setStatus(ok ? "已播完。试着不看文字，自己说一句。" : "音频没有播完。可以重听，也可以看文字继续；不会记错。");
      return;
    }
    try {
      const synth = window.speechSynthesis;
      const voice = synth && chooseLocalKoreanVoice(synth.getVoices());
      if (!voice || !window.SpeechSynthesisUtterance) { setStatus(missingVoice); return; }
      // A previous packaged clip elsewhere must not overlap the system voice.
      stopShared.current();
      const utter = new SpeechSynthesisUtterance(line.ko);
      utter.voice = voice;
      utter.lang = voice.lang;
      utter.rate = 1;
      played.current = "voice";
      utterance.current = utter;
      const finish = (message: string) => {
        if (ticket !== seq.current) return;
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = null;
        utter.onend = null; utter.onerror = null;
        utterance.current = null; played.current = null;
        setStatus(message);
      };
      utter.onend = () => finish("已播完。试着不看文字，自己说一句。");
      utter.onerror = () => finish("本机韩语语音没有播完。可以重听，或用文字继续；不会记错。");
      setStatus("正在使用本机韩语语音：" + voice.name + "。");
      // Voices can be listed but not usable. Don't hang or silently use the default.
      timer.current = window.setTimeout(() => {
        if (seq.current !== ticket) return;
        cancel(); setStatus("本机韩语语音没有完成播放。可重试，或看原文继续。");
      }, 16000);
      synth.speak(utter);
    } catch { if (ticket === seq.current) { cancel(); setStatus(missingVoice); } }
  }
  function reveal() {
    if (!active || revealed || finished.current) return;
    stop(); setRevealed(true); setTranscript(true);
    panel.current?.focus({ preventScroll: true });
  }
  function grade(result: "again" | "good") {
    if (!active || !revealed || finished.current) return;
    finished.current = true; cancel(); onDone(result);
  }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (!active || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey
      || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    const el = event.target as HTMLElement;
    if (el.closest("input,textarea,select,[contenteditable=true]")) return;
    if (event.repeat) {
      if ([" ", "Enter", "F8", "1", "2"].includes(event.key)) event.preventDefault();
      return;
    }
    if ((event.key === " " || event.key === "Enter") && el.closest("button,a[href],summary")) return;
    if (event.key === " " || event.key === "F8") { event.preventDefault(); void play(scene.prompt); }
    else if (event.key === "Enter" && !revealed) { event.preventDefault(); reveal(); }
    else if (event.key === "Escape" && played.current) { event.preventDefault(); stop(); }
    else if (revealed && (event.key === "1" || event.key === "2")) { event.preventDefault(); grade(event.key === "1" ? "again" : "good"); }
  }

  return <section ref={panel} tabIndex={-1} aria-label={scene.title + "接话练习"} data-testid="day-dialogue" data-recall={recall}
    className="day-dialogue" onKeyDown={keyboard} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) stop(); }}>
    <p className="day-dialogue-tag">{recall ? "隔天开口 · 中文情境" : "日常接话 · 先听后说"}</p>
    <h3>{scene.title}</h3>
    <p>{scene.setting}</p>
    <div className="day-dialogue-prompt">
      <strong>{scene.role}的原话</strong>
      {transcript || revealed ? <div data-testid="day-dialogue-prompt-text"><p lang="ko">{scene.prompt.ko}</p><span>{scene.prompt.zh}</span></div>
        : <p>{recall ? "先试着自己接话；需要线索时再听。" : "先只听声音，原文和中文都暂时藏起来。"}</p>}
      <div className="day-dialogue-controls">
        <button type="button" data-testid="day-dialogue-play" onClick={() => void play(scene.prompt)}>听对方说 <kbd>空格 / F8</kbd></button>
        {!revealed && <button type="button" data-testid="day-dialogue-transcript" aria-expanded={transcript} onClick={() => setTranscript(!transcript)}>{transcript ? "隐藏原文和中文" : "显示对方原文和中文"}</button>}
        <small>{sourceOf(scene.prompt)}</small>
      </div>
    </div>
    <div className="day-dialogue-task"><strong>轮到你了</strong><p>{recall ? scene.returnCue : scene.firstCue}</p></div>
    {!revealed ? <button type="button" className="day-dialogue-primary" data-testid="day-dialogue-reveal" onClick={reveal}>我说过了，看参考 <kbd>Enter</kbd></button>
      : <div className="day-dialogue-answers" data-testid="day-dialogue-answers">
        <p>下面是两种不同的意思，不是标准答案。能表达你的意思就可以。</p>
        {[recall ? 1 : 0, recall ? 0 : 1].map((index, pos) => {
          const line = scene.replies[index];
          return <div className="day-dialogue-answer" key={line.ko}>
            <small>{pos === 0 ? "这次想表达" : "换一种需求"} · {line.intent}</small>
            <p lang="ko">{line.ko}</p><span>{line.zh}</span>
            <button type="button" aria-label={"听参考：" + line.ko} onClick={() => void play(line)}>听参考 <small>{sourceOf(line)}</small></button>
          </div>;
        })}
        <p className="day-dialogue-bridge">{scene.bridge}</p>
        <div className="day-dialogue-controls" role="group" aria-label="自评刚才的接话">
          <button type="button" data-testid="day-dialogue-again" onClick={() => grade("again")}>还想再练 <kbd>1</kbd></button>
          <button type="button" className="day-dialogue-primary" data-testid="day-dialogue-good" onClick={() => grade("good")}>能独立接话 <kbd>2</kbd></button>
        </div>
      </div>}
    <p role="status" className="day-dialogue-status">{status}</p>
    <small>只需开口，无需麦克风，不录音、不评口音。示范为合成语音，未经逐句人工听审。</small>
  </section>;
}
