"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { COMPOUND_VOWELS, imeOwnsPanelKey, koreanKeyInput, koreanKeyLabel } from "./keyboard-logic";
import { dayAudioPath, dayHearingOptions, type DayCard } from "./day-letters";
import { decomposeHangulSyllable } from "./learning-logic";
import type { DayAction, DayAnswer, DayAttempt } from "./my-day-state";

type Props = { card: DayCard; attempt?: DayAttempt; onEvidence: (action:DayAction) => void;
  onGrade: (result: "again"|"good") => boolean;
  onPlay: (path:string)=>Promise<boolean>; onStop:()=>void; active:boolean };

export default function DayLetterCard({card,attempt,onEvidence,onGrade,onPlay,onStop,active}: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  const inFlight = useRef<number | null>(null);
  const focusedOnce = useRef(false);
  const hiddenPause = useRef(false);
  const submitted = useRef(false);
  const composing = useRef(false);
  const [playing,setPlaying] = useState<number | null>(null);
  const [failed,setFailed] = useState(false);
  const [draft,setDraft] = useState("");
  const [message,setMessage] = useState("");
  const {char,skill,example} = card;
  const options = skill === "listen" ? dayHearingOptions(card) : [];
  const answer = attempt?.answer ?? null;
  const revealed = answer !== null, heard = !!attempt?.plays;
  const canGradeGood = skill === "read" || answer === "correct";
  const refocus = () => panel.current?.focus({preventScroll:true});
  useLayoutEffect(() => {
    if (!active) { hiddenPause.current = document.hidden; return; }
    // Modal close returns focus to its own opener; only reclaim empty focus on
    // tab return. Keep the attempt itself mounted while keyboard input is paused.
    if (!focusedOnce.current || (hiddenPause.current && document.activeElement === document.body)) refocus();
    focusedOnce.current = true; hiddenPause.current = false;
    return () => {
      composing.current = false;
      token.current += 1;
      if (inFlight.current !== null) { inFlight.current = null; onStop(); }
    };
  }, [active,onStop]);

  async function play() {
    if (!active || document.hidden || submitted.current || inFlight.current !== null) return;
    const serial = ++token.current;
    inFlight.current = serial;
    setPlaying(serial); setFailed(false); setMessage("");
    let ok = false;
    try { ok = await onPlay(dayAudioPath(card)); } catch { /* Offer retry; never accept a failed prompt. */ }
    setPlaying(current => current === serial ? null : current);
    if (serial !== token.current) return;
    inFlight.current = null;
    if (ok) onEvidence("heard");
    setFailed(!ok);
  }
  function reveal(choice?:string) {
    if (!active || document.hidden || submitted.current || revealed) return;
    if (skill === "listen" && !heard && !failed) { setMessage("先按空格听完，再选择；播放失败时也可以跳过本题。"); return; }
    const selected = choice ?? (skill === "keys" ? draft.trim() : "");
    const outcome: DayAnswer = !selected ? "hint" :
      (skill === "listen" ? selected === example : selected.normalize("NFKD") === char.normalize("NFKD")) ? "correct" : "incorrect";
    onEvidence(outcome); setMessage(""); refocus();
  }
  function grade(result: "again"|"good") {
    if (!active || document.hidden || submitted.current || !revealed || (result === "good" && !canGradeGood)) return;
    token.current++; onStop(); submitted.current = onGrade(result);
  }
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!active || event.defaultPrevented || event.metaKey || event.altKey || event.ctrlKey || imeOwnsPanelKey(event.nativeEvent) || composing.current) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true]")) return;
    if (event.repeat) {
      if (event.key === "Enter" || event.key === " ") event.preventDefault();
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && target.closest("button, a[href], summary")) return;
    if (event.key === " " || event.key === "F8") { event.preventDefault(); void play(); return; }
    if (!event.shiftKey && (event.key === "1" || event.key === "2")) {
      if (revealed) { event.preventDefault(); grade(event.key === "1" ? "again":"good"); }
      else if (skill === "listen" && heard) { event.preventDefault(); reveal(options[Number(event.key)-1]); }
      return;
    }
    if (!revealed && event.key === "Enter") {
      event.preventDefault();
      reveal(); return;
    }
    if (!revealed && skill === "keys") {
      if (event.key === "Backspace") { event.preventDefault(); setDraft(""); setMessage(""); return; }
      const input = koreanKeyInput(event.key,event.code,event.shiftKey);
      if (input) {
        event.preventDefault(); setDraft(previous => COMPOUND_VOWELS[previous + input.char] ?? input.char); setMessage("");
      }
    }
  }
  const { initial,vowel } = decomposeHangulSyllable(example)!;
  return <div ref={panel} tabIndex={-1} inert={!active} className="day-letter-card" data-testid="day-letter-card" data-skill={skill} onKeyDown={onKey} aria-label="日课字母练习">
    <p className="day-letter-note">{skill === "read" ? "看字能读 · 先自己读，不用输入" : skill === "listen" ? "听音能认 · 不显示罗马字提示" : "键盘能打 · Mac 韩文双拼键位"}</p>
    <h3>{skill === "read" ? "这个音节，你会怎么读？" : skill === "listen" ? "听一个音节，选出它的写法。" : "在键盘上输入这个字母。"}</h3>
    <div className="day-letter-prompt" data-testid="day-letter-prompt">{skill === "listen" ? (revealed ? <strong lang="ko">{example}</strong> : "先听，再选") : <strong lang="ko">{skill === "read" ? example : char}</strong>}</div>
    {skill === "read" && !revealed && <p>先读出声。准备好后按空格听示范，或按 Enter 看拆解。</p>}
    {skill === "keys" && !revealed && <div>
      <label>你的输入 <input data-testid="day-letter-input" autoComplete="off" spellCheck={false} lang="ko" value={draft}
        onChange={event => setDraft(event.target.value.slice(0,24))} onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }} onBlur={() => { composing.current = false; }}
        onKeyDown={event => {
          if (event.repeat || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || composing.current || event.altKey || event.metaKey || event.ctrlKey) return;
          if (event.key === "Enter") {
            event.preventDefault(); event.stopPropagation();
            reveal();
            return;
          }
          if (/^[a-z]$/i.test(event.key)) {
            const input = koreanKeyInput(event.key, event.code, event.shiftKey);
            if (input) {
              event.preventDefault(); event.stopPropagation();
              setDraft(previous => COMPOUND_VOWELS[previous + input.char] ?? input.char);
              setMessage("");
            }
          }
        }} /></label>
      <p>直接按双拼键位，或按 Tab 使用韩文输入法。Enter 核对；留空按 Enter 看键位，这张记「再练」。</p>
    </div>}
    {skill === "listen" && !revealed && <div className="day-letter-actions" role="group" aria-label="选择听到的音节">
      {options.map((value,i) => <button type="button" key={value} disabled={!heard} onClick={()=>reveal(value)}><kbd>{i+1}</kbd> <span lang="ko">{value}</span></button>)}
    </div>}
    <div className="day-letter-actions">
      <button type="button" data-testid="day-letter-play" disabled={playing !== null} onClick={()=>void play()}>{playing !== null ? "播放中…" : heard ? "再听一次" : "听示范"} <kbd>空格</kbd></button>
      {!revealed && <button type="button" data-testid="day-letter-reveal" disabled={skill === "listen" && !heard && !failed}
        onClick={()=>reveal()}>{skill === "keys" ? draft ? "核对输入" : "看键位" : skill === "listen" ? "看答案，留待复习" : "看拆解"} <kbd>Enter</kbd></button>}
    </div>
    {revealed && <div className="day-letter-feedback" data-testid="day-letter-feedback">
      {skill === "keys" ? <p>{canGradeGood ? "键位输入正确。" : answer === "incorrect" ? "这次输入与目标不同。" : "这次先看键位。"} <span lang="ko">{char}</span> 的双拼键位：<kbd>{koreanKeyLabel(char)}</kbd>（示范音节：<span lang="ko">{initial} + {vowel} = {example}</span>）。</p> :
       <p>{skill === "listen" ? (canGradeGood ? "听辨正确。" : "这次先核对，留到以后再听。") : "核对你的读音："}
        <strong lang="ko">{initial} + {vowel} = {example}</strong>。{initial === "ㅇ" ? "这里的 ㅇ 作初声不发音；你听到的是元音。" : "示范是整个音节，不是辅音名称或单独起音。"}
       </p>}
      <div className="day-letter-actions">
        <button type="button" data-testid="day-letter-again" onClick={()=>grade("again")}><kbd>1</kbd> 再练</button>
        <button type="button" data-testid="day-letter-good" disabled={!canGradeGood} onClick={()=>grade("good")}><kbd>2</kbd> {skill === "read" ? "我能读出" : skill === "listen" ? "我听认出来了" : "我能打出"}</button>
      </div>
    </div>}
    <p role="status" className="day-letter-note">{failed ? "这次播放未完成。可重听；没听清请选「再练」。" : message}</p>
    <small className="day-letter-note">音源：站内 AI 音节示范；不使用麦克风，不自动评价口音。</small>
  </div>;
}
