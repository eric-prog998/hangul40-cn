"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { COMPOUND_VOWELS, imeOwnsPanelKey, koreanKeyInput, koreanKeyLabel } from "./keyboard-logic";
import KoreanKeyboard from "./korean-keyboard";
import "./letter-keyboard-lab.css";

export type KeyboardAudioMode = "name" | "onset" | "syllable";
const modes = [
  { mode: "name", label: "辅音名称" },
  { mode: "onset", label: "真人起音" },
  { mode: "syllable", label: "完整音节" },
] as const;
type Props = { onPlay: (char: string, mode: KeyboardAudioMode) => Promise<boolean>; onPrepare: () => void };
const COMBINE_MS = 1500;
const prefixes = new Set(Object.keys(COMPOUND_VOWELS).map((pair) => pair[0]));
type Pending = { char: string; until: number; timer: number; prefixAudio: Promise<boolean> | null };

export default function LetterKeyboardLab({ onPlay, onPrepare }: Props) {
  const [selected, setSelected] = useState("ㄱ");
  const [activeKey, setActiveKey] = useState("");
  const [shifted, setShifted] = useState(false);
  const [mode, setMode] = useState<KeyboardAudioMode>("name");
  const [split, setSplit] = useState(false);
  const [waitingFor, setWaitingFor] = useState("");
  const pending = useRef<Pending | null>(null);
  const sequence = useRef(0);
  const panel = useRef<HTMLDivElement>(null);
  const play = useRef(onPlay);
  useEffect(() => { play.current = onPlay; }, [onPlay]);

  const cancelPending = useCallback(() => {
    // Invalidate queued split playback even when the second key has consumed the timer.
    sequence.current++;
    if (!pending.current) return;
    window.clearTimeout(pending.current.timer);
    pending.current = null;
    setWaitingFor("");
  }, []);

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) cancelPending(); };
    // Scene changes can hide this mounted panel without dispatching a blur.
    const scene = panel.current?.closest("[data-scene]");
    const observer = new MutationObserver(cancelPending);
    if (scene) observer.observe(scene, { attributes: true, attributeFilter: ["hidden"] });
    window.addEventListener("blur", cancelPending);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      window.removeEventListener("blur", cancelPending);
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.clearTimeout(pending.current.timer);
      pending.current = null;
      sequence.current += 1;
    };
  }, [cancelPending]);

  function clear() { cancelPending(); setActiveKey(""); }
  function chooseMode(next: KeyboardAudioMode) { clear(); setMode(next); }
  function toggleSplit() { clear(); setSplit((old) => !old); }
  function replay() { clear(); onPlay(selected, mode); }
  function panelStillActive() {
    return !document.hidden && panel.current?.contains(document.activeElement) && !panel.current.closest("[hidden]");
  }
  function choose(char: string, physical: string) {
    const previous = pending.current;
    const combined = previous && performance.now() < previous.until ? COMPOUND_VOWELS[previous.char + char] : undefined;
    const next = combined || char;
    cancelPending();
    setSelected(next);
    setActiveKey(physical);
    panel.current?.focus({ preventScroll: true });
    if (combined && previous?.prefixAudio) {
      // Fast typing must not cut off the first example. Continue only on natural
      // media completion, never after a different action, interruption or error.
      const token = sequence.current;
      void previous.prefixAudio.then((ended) => {
        if (ended && sequence.current === token && panelStillActive()) void play.current(next, mode);
      });
      return;
    }
    if (combined || !prefixes.has(char)) { void onPlay(next, mode); return; }
    // This branch may not start new audio for 1.5 s. Stop the previous example
    // now so its sound cannot be mistaken for the newly displayed vowel.
    if (!split) onPrepare();
    const entry: Pending = { char, until: performance.now() + COMBINE_MS, timer: 0, prefixAudio: split ? onPlay(char, mode) : null };
    pending.current = entry;
    setWaitingFor(char);
    entry.timer = window.setTimeout(() => {
      if (pending.current !== entry) return;
      cancelPending();
      if (!split && panelStillActive()) void play.current(char, mode);
    }, COMBINE_MS);
  }
  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || imeOwnsPanelKey(event.nativeEvent) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.repeat) {
      if (event.key === "Enter" || event.key === " ") event.preventDefault();
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true]")) return;
    if ((event.key === " " || event.key === "Enter") && target.closest("button, summary, a[href]")) return;
    if (event.key === "Shift") { setShifted(true); return; }
    const input = koreanKeyInput(event.key, event.code, event.shiftKey);
    if (input) { event.preventDefault(); setShifted(event.shiftKey); choose(input.char, input.physical); }
    else if (event.key === " " || event.key === "Enter" || event.key === "F8") { event.preventDefault(); replay(); }
    else if (event.key === "Backspace" || event.key === "Escape") { event.preventDefault(); clear(); onPrepare(); }
    else if (!event.shiftKey && /^Digit[1-3]$/.test(event.code)) { event.preventDefault(); chooseMode(modes[Number(event.code.slice(-1)) - 1].mode); }
    else if (!event.shiftKey && event.code === "Digit4") { event.preventDefault(); toggleSplit(); }
  }

  return <div id="letter-keyboard-console" className="letter-keyboard-lab" data-keyboard-scope="letters" ref={panel} tabIndex={0} aria-label="40 音韩文键盘点读" onFocusCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onPrepare(); }} onKeyDown={handleKey} onKeyUp={(event) => { if (event.key === "Shift") setShifted(false); }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { clear(); setShifted(false); } }}>
    <div className="letter-keyboard-intro"><div><h3>按韩文键，听字母发音</h3><p>Mac 韩语双拼（두벌식）键位；英文输入法也可用。先按 <kbd>Shift + 2</kbd> 到这里，再直接打字。</p></div><button type="button" onClick={() => panel.current?.focus()}>开始键盘点读</button></div>
    <div className="letter-keyboard-result">
      <button type="button" onClick={replay} aria-label={`重播 ${selected}`}><strong lang="ko">{selected}</strong><kbd>{koreanKeyLabel(selected)}</kbd><span>{waitingFor && !split ? "立即听单音 · Enter" : "再听一次 · 空格"}</span></button>
      <div>
        <div className="letter-keyboard-modes" role="group" aria-label="辅音点读方式">{modes.map((item, index) => <button key={item.mode} type="button" aria-pressed={mode === item.mode} onClick={() => { chooseMode(item.mode); panel.current?.focus(); }}><kbd>{index + 1}</kbd> {item.label}</button>)}</div>
        <p role="status">当前：<span lang="ko">{selected}</span> · {mode === "name" ? "AI 示范：辅音读名称，元音读元音" : mode === "syllable" ? "AI 示范：辅音与 ㅏ 拼读，元音读元音" : "真人单次起音：ㅇ 作初声无声；元音仍用 AI 示范"}。{waitingFor && (split ? "已播首音，可在 1.5 秒内继续组合。" : "正在等第二键；按 Enter 可立即听这个单音。")}</p>
        <button type="button" aria-pressed={split} onClick={() => { toggleSplit(); panel.current?.focus(); }}><kbd>4</kbd> 拆开听</button>
        <p>{split ? "拆开听已开启：先播首音，再播合成音（H → K：오 → 와）。" : "合成后听（默认）：H → K 只播 와。ㅗ、ㅜ、ㅡ 会等第二键 1.5 秒；按 Enter 或等到时间，就读单音。如果两键不能组合，改读新键。其余字母立即读。"} 紧音用 <kbd>Shift</kbd>；⌫ 清除组合，Esc 停止。</p>
      </div>
    </div>
    <KoreanKeyboard activeKey={activeKey} shifted={shifted} onKey={choose} onShift={() => setShifted((value) => !value)} onClear={clear} />
  </div>;
}
