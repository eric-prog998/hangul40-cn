"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import { BATCHIM_GROUPS, BATCHIM_RULE_SOURCE, BATCHIM_WORDS, batchimExampleIndex, isBatchimAnswerCorrect } from "./batchim-data";
import { decomposeHangulSyllable } from "./learning-logic";
import { keyboardShortcutKey } from "./keyboard-logic";
import "./batchim-lesson.css";

export type BatchimLessonHandle = { stop: () => void; open: (id?: string) => void };
type Props = { items: readonly { id: string; korean: string; chinese: string }[]; onPrepare: () => void; playSample: (text: string) => Promise<"ended" | "interrupted" | "failed"> };

const BatchimLesson = forwardRef<BatchimLessonHandle, Props>(function BatchimLesson({ items, onPrepare, playSample }, ref) {
  const [mode, setMode] = useState<"lesson" | "quiz" | "finished">("lesson");
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState("先听完整词，再看最后一个字块的底部。");
  const section = useRef<HTMLElement | null>(null);
  const token = useRef(0);
  const alive = useRef(true);
  const isPlaying = useRef(false);
  const answered = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const example = BATCHIM_WORDS[index];
  const word = items.find((item) => item.id === example.id);
  const group = BATCHIM_GROUPS.find((item) => item.final === example.final)!;
  const block = decomposeHangulSyllable(example.last)!;

  const stop = useCallback(() => {
    token.current += 1;
    const pending = timer.current !== null;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (alive.current) {
      setPlaying(false);
      if (pending) setNotice("自动下一题已暂停；返回后可按 Enter 继续。");
      else if (isPlaying.current) setNotice("播放已停止，可按空格重新听。");
    }
    isPlaying.current = false;
  }, []);
  useImperativeHandle(ref, () => ({ stop, open: (id) => { stop(); answered.current = false; setMode("lesson"); setIndex(batchimExampleIndex(id)); setAnswer(null); setNotice("先听完整词，再看最后一个字块的底部。"); } }), [stop]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; stop(); }; }, [stop]);

  function focusPanel() { section.current?.focus({ preventScroll: true }); }
  function selectExample(next: number) { onPrepare(); answered.current = false; setIndex(next); setAnswer(null); setMode("lesson"); setNotice("已换一个例词。先听整词，不给收音补上元音。"); }
  async function listen() {
    if (!word || mode === "finished") return;
    onPrepare(); const request = ++token.current; isPlaying.current = true; setPlaying(true); setNotice("正在播放完整词语…");
    let result: "ended" | "interrupted" | "failed";
    try { result = await playSample(word.korean); } catch { result = "failed"; }
    if (!alive.current || request !== token.current) return;
    isPlaying.current = false; setPlaying(false);
    setNotice(result === "ended" ? "完整词播放完毕。注意末尾收住，不另外加一个音节。" : result === "failed" ? "音频未能播放，请检查网络后重试；本题没有记错。" : "播放已停止，可重新听。");
  }
  function startQuiz() { onPrepare(); answered.current = false; setIndex(0); setAnswer(null); setScore(0); setMode("quiz"); setNotice("5 个词，找最后一个字块的收音。可以看字，也可以按空格听整词。"); focusPanel(); }
  function advance() {
    onPrepare(); answered.current = false; setAnswer(null);
    if (index + 1 === BATCHIM_WORDS.length) { setMode("finished"); setNotice("这只是找收音练习，不是发音准确度评分。"); }
    else { setIndex(index + 1); setNotice("下一题已就绪；按空格听完整词。"); }
  }
  function choose(value: string) {
    if (mode !== "quiz" || answered.current) return;
    onPrepare(); answered.current = true; setAnswer(value);
    if (isBatchimAnswerCorrect(index, value)) setScore((count) => count + 1);
    setNotice("看清反馈后将自动下一题；Esc 暂停，Enter 立即继续。");
    const request = ++token.current;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (alive.current && request === token.current) advance();
    }, 2400);
    focusPanel();
  }
  function handleKey(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true]")) return;
    if ((event.key === "Enter" || event.key === " ") && target.closest("button, a[href], summary")) return;
    const key = keyboardShortcutKey(event.key, event.code);
    if (key === " " || event.key === "F8") { event.preventDefault(); void listen(); }
    else if (event.key === "Escape") { event.preventDefault(); onPrepare(); }
    else if (event.key === "Enter") { event.preventDefault(); if (mode === "quiz" && answer) advance(); else if (mode !== "quiz") startQuiz(); }
    else if (/^[1-5]$/.test(key)) {
      event.preventDefault(); const choice = Number(key) - 1;
      if (mode === "lesson") selectExample(choice);
      else if (mode === "quiz" && choice < BATCHIM_GROUPS.length) choose(BATCHIM_GROUPS[choice].final);
    }
  }

  return <section id="batchim-lesson" className="batchim-lesson" aria-labelledby="batchim-title" ref={section} tabIndex={-1} data-keyboard-scope="batchim" onKeyDown={handleKey}>
    <div className="batchim-heading"><span className="section-kicker">收音入门 · 第 1 小课</span><h2 id="batchim-title">读到词尾，<br />把声音收住。</h2><p>先练 ㄹ、ㅁ、ㅇ。收音就是字块底部的辅音；本课只找整个词最后一个字块的收音。</p><p>先听整词、看收音，再做 5 题认读。七类收音中的其他类别、连读和复杂变音留到后续小课。</p><a href="#phrases" onClick={onPrepare}>返回词句背诵 ↗</a></div>
    <div className="batchim-workspace">
      <div className="batchim-mode-controls"><button type="button" aria-pressed={mode === "lesson"} onClick={() => selectExample(index)}>看例词</button><button type="button" aria-pressed={mode === "quiz"} onClick={startQuiz}>{mode === "quiz" ? "重做 5 题" : "开始 5 题练习"}</button><span>{mode === "quiz" ? `第 ${index + 1} / 5 题` : "完整词音频 · 不拆音拼接"}</span></div>
      {mode === "lesson" && <div className="batchim-examples" role="group" aria-label="选择收音例词">{BATCHIM_WORDS.map((item, i) => <button type="button" key={item.id} aria-pressed={index === i} onClick={() => selectExample(i)}><kbd>{i + 1}</kbd><span lang="ko">{items.find((entry) => entry.id === item.id)?.korean}</span></button>)}</div>}
      {mode !== "finished" && word ? <>
        <div className="batchim-word"><p>{word.chinese}</p><h3 lang="ko">{Array.from(word.korean).map((char, i, chars) => <span key={i} className={i === chars.length - 1 ? "batchim-last" : ""}>{char}</span>)}</h3><button type="button" onClick={() => void listen()}>{playing ? "正在播放 · 再听一次" : "▶ 听完整词"} <kbd>空格 / F8</kbd></button></div>
        {mode === "quiz" && !answer ? <div className="batchim-question"><p>最后的「<span lang="ko">{example.last}</span>」底部是什么收音？</p><div role="group" aria-label="选择末尾收音">{BATCHIM_GROUPS.map((item, i) => <button type="button" key={item.final} onClick={() => choose(item.final)}><kbd>{i + 1}</kbd><strong lang="ko">{item.final}</strong></button>)}</div></div> : <div className="batchim-explanation">
          {mode === "quiz" && <strong className="batchim-result">{isBatchimAnswerCorrect(index, answer!) ? "答对了" : `这次选了 ${answer}；正确是 ${example.final}`}</strong>}
          <div className="batchim-block" aria-label={`末尾字块 ${example.last} 的初声、中声和收音`}><span>初声 <b lang="ko">{block.initial}</b></span><span>中声 <b lang="ko">{block.vowel}</b></span><span className="batchim-final">收音 <b lang="ko">{example.final}</b></span></div>
          <h4><span lang="ko">{group.final}</span> · {group.title}</h4><p>{group.cue}</p><p className="batchim-note">{group.note}</p>
          {example.id === "word-receipt" && <p>영수증 中，영 和 증 都有 ㅇ 收音；这一题只问最后的 증。</p>}
          {mode === "quiz" && <button type="button" className="batchim-next" onClick={() => { advance(); focusPanel(); }}>{index === 4 ? "查看结果" : "下一题"} <kbd>Enter</kbd></button>}
        </div>}
        <p className="batchim-dictionary">词典读音：<span lang="ko">[{example.pronunciation}]</span> {example.id === "word-person" && "ː 标记首音节长音，本课不考长短音。"}<a href={example.source} target="_blank" rel="noreferrer">查看官方词典 ↗</a></p>
      </> : mode === "finished" && <div className="batchim-finished"><h3>完成这 5 个词了</h3><strong>{score} / 5</strong><p>能找对字块底部，是开始读带收音词语的一步。继续听整词，不要给词尾补元音。</p><button type="button" onClick={startQuiz}>再练一次 <kbd>Enter</kbd></button></div>}
      <p className="batchim-status" role="status" aria-live="polite">{notice}</p>
      <p className="batchim-shortcuts">例词：1–5 切换；练习：1 / 2 / 3 作答。空格听词，Enter 开始／下一题，Esc 停止播放和自动下一题。</p>
      <details className="batchim-sources"><summary>读音依据和本课边界</summary><p>词条读音及收音分类依据国立国语院资料核对。播放沿用现有固定 AI 整词音频，不是新真人录音，尚未新增母语教师逐条复核。这里练字形和读词位置，不给发音打分，也不自动标记“背熟”。</p><a href={BATCHIM_RULE_SOURCE} target="_blank" rel="noreferrer">国立国语院：鼻音与流音的发音说明 ↗</a></details>
    </div>
  </section>;
});
export default BatchimLesson;
