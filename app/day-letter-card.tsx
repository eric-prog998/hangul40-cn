"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { COMPOUND_VOWELS, imeOwnsPanelKey, koreanKeyInput, koreanKeyLabel } from "./keyboard-logic";
import { dayAudioPath, dayHearingOptions, type DayCard } from "./day-letters";
import { decomposeHangulSyllable } from "./learning-logic";

type Props = { card: DayCard; onGrade: (result: "again"|"good", replayed: boolean) => void;
  onPlay: (path:string)=>Promise<boolean>; onStop:()=>void; active:boolean };

export default function DayLetterCard(props: Props) {
  if (!props.active) return null;
  const {char,skill,example,alternative} = props.card;
  return <Card key={[char,skill,example,alternative].join(":")} {...props} />;
}

function Card({card,onGrade,onPlay,onStop}: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  const submitted = useRef(false);
  const composing = useRef(false);
  const playCount = useRef(0);
  const [revealed,setRevealed] = useState(false);
  const [heard,setHeard] = useState(false);
  const [playing,setPlaying] = useState(false);
  const [failed,setFailed] = useState(false);
  const [draft,setDraft] = useState("");
  const [answer,setAnswer] = useState("");
  const [message,setMessage] = useState("");
  const {char,skill,example} = card;
  const options = skill === "listen" ? dayHearingOptions(card) : [];
  const canGradeGood = skill === "read" || (skill === "listen" ? answer === example : answer.normalize("NFKD") === char.normalize("NFKD"));
  const refocus = () => panel.current?.focus({preventScroll:true});
  useLayoutEffect(() => {
    refocus();
    return () => { token.current += 1; };
  }, []);

  async function play() {
    if (submitted.current) return;
    const serial = ++token.current;
    setPlaying(true); setFailed(false); setMessage("");
    let ok = false;
    try { ok = await onPlay(dayAudioPath(card)); } catch { /* Offer retry; never accept a failed prompt. */ }
    if (serial !== token.current) return;
    if (ok) { setHeard(true); playCount.current++; }
    setPlaying(false); setFailed(!ok);
  }
  function reveal(choice?:string) {
    if (submitted.current || revealed) return;
    if (skill === "listen" && !heard && !failed) { setMessage("先按空格听完，再选择；播放失败时也可以跳过本题。"); return; }
    const selected = choice ?? (skill === "keys" ? draft.trim() : "");
    setAnswer(selected); setRevealed(true); setMessage(""); refocus();
  }
  function grade(result: "again"|"good") {
    if (submitted.current || !revealed || (result === "good" && !canGradeGood)) return;
    submitted.current = true; token.current++; onStop(); onGrade(result,playCount.current > 1);
  }
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.metaKey || event.altKey || event.ctrlKey || imeOwnsPanelKey(event.nativeEvent) || composing.current) return;
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
      if (skill === "keys" && !draft) { setMessage("先按韩文键位输入目标字母，或用「看键位」跳过。"); return; }
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
  return <div ref={panel} tabIndex={-1} className="day-letter-card" data-testid="day-letter-card" data-skill={skill} onKeyDown={onKey} aria-label="日课字母练习">
    <p className="day-letter-note">{skill === "read" ? "看字能读 · 先自己读，不用输入" : skill === "listen" ? "听音能认 · 不显示罗马字提示" : "键盘能打 · Mac 韩文双拼键位"}</p>
    <h3>{skill === "read" ? "这个音节，你会怎么读？" : skill === "listen" ? "听一个音节，选出它的写法。" : "在键盘上输入这个字母。"}</h3>
    <div className="day-letter-prompt" data-testid="day-letter-prompt">{skill === "listen" ? (revealed ? <strong lang="ko">{example}</strong> : "先听，再选") : <strong lang="ko">{skill === "read" ? example : char}</strong>}</div>
    {skill === "read" && !revealed && <p>先读出声。准备好后按空格听示范，或按 Enter 看拆解。</p>}
    {skill === "keys" && !revealed && <div>
      <label>你的输入 <input data-testid="day-letter-input" autoComplete="off" spellCheck={false} lang="ko" value={draft}
        onChange={event => setDraft(event.target.value.slice(0,24))} onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }} onBlur={() => { composing.current = false; }}
        onKeyDown={event => {
          if (event.key !== "Enter" || event.repeat || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || composing.current || event.altKey || event.metaKey || event.ctrlKey) return;
          event.preventDefault(); event.stopPropagation();
          if (draft.trim()) reveal(); else setMessage("先输入，或用「看键位」跳过。");
        }} /></label>
      <p>在卡片上直接按双拼键位；使用系统韩文输入法时，按 Tab 进入输入框。Enter 核对。</p>
    </div>}
    {skill === "listen" && !revealed && <div className="day-letter-actions" role="group" aria-label="选择听到的音节">
      {options.map((value,i) => <button type="button" key={value} disabled={!heard} onClick={()=>reveal(value)}><kbd>{i+1}</kbd> <span lang="ko">{value}</span></button>)}
    </div>}
    <div className="day-letter-actions">
      <button type="button" data-testid="day-letter-play" disabled={playing} onClick={()=>void play()}>{playing ? "播放中…" : heard ? "再听一次" : "听示范"} <kbd>空格</kbd></button>
      {!revealed && <button type="button" data-testid="day-letter-reveal" disabled={skill === "listen" && !heard && !failed}
        onClick={()=>reveal()}>{skill === "keys" ? draft ? "核对输入" : "看键位" : skill === "listen" ? "看答案，留待复习" : "看拆解"} <kbd>Enter</kbd></button>}
    </div>
    {revealed && <div className="day-letter-feedback" data-testid="day-letter-feedback">
      {skill === "keys" ? <p>{canGradeGood ? "键位输入正确。" : answer ? "这次输入与目标不同。" : "这次先看键位。"} <span lang="ko">{char}</span> 的双拼键位：<kbd>{koreanKeyLabel(char)}</kbd>。</p> :
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
