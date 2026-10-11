"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import { keyboardSectionIndex, keyboardShortcutKey, koreanKeyInput, koreanKeyLabel } from "./keyboard-logic";
import { VOWEL_CONTRASTS } from "./pronunciation-data";
import { advanceVowelQuestion, answerVowelQuestion, makeVowelQuestions, missedVowelQuestions, newVowelChallenge, shuffleVowelQuestions, vowelChallengeSummary, type VowelChallengeState } from "./vowel-challenge-logic";
import { pendingVowelQuestions, recentVowelResults } from "./vowel-history";
import type { VowelHistoryModel } from "./use-vowel-history";
import type { AutoAdvanceDelay } from "./learning-settings";

export type VowelChallengeHandle = { stop: () => void };
type Props = {
  onPrepare: () => void;
  playSample: (text: string, speed: 1 | 0.82) => Promise<"ended" | "interrupted" | "failed">;
  speed: 1 | 0.82;
  onSpeedChange: (speed: 1 | 0.82) => void;
  history: VowelHistoryModel;
  autoAdvanceMs: AutoAdvanceDelay;
};

const VowelListeningChallenge = forwardRef<VowelChallengeHandle, Props>(function VowelListeningChallenge({ onPrepare, playSample, speed, onSpeedChange, history, autoAdvanceMs }, ref) {
  const [state, setState] = useState<VowelChallengeState>(() => newVowelChallenge());
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState("每题只听一个声音，选出对应字母；先听完整，再作答。");
  const current = useRef(state);
  const panel = useRef<HTMLDivElement | null>(null);
  const token = useRef(0);
  const alive = useRef(true);
  const isPlaying = useRef(false);
  const pendingAdvance = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function update(next: VowelChallengeState) { current.current = next; setState(next); }
  function focusPanel() { panel.current?.focus({ preventScroll: true }); }
  const stop = useCallback(() => {
    token.current += 1;
    const hadPending = pendingAdvance.current;
    pendingAdvance.current = false;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (alive.current) {
      setPlaying(false);
      if (hadPending) setNotice("自动下一题已暂停；按 Enter 继续，空格只重听本题。");
      else if (isPlaying.current) setNotice("播放已停止；按空格重听，本题没有记错。");
    }
    isPlaying.current = false;
  }, []);
  useImperativeHandle(ref, () => ({ stop }), [stop]);
  useEffect(() => { alive.current = true; focusPanel(); return () => { alive.current = false; stop(); }; }, [stop]);
  useEffect(() => { stop(); }, [autoAdvanceMs, stop]);

  function scheduleAdvance() {
    if (autoAdvanceMs === 0) return;
    if (timer.current !== null) clearTimeout(timer.current);
    const request = ++token.current;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (alive.current && request === token.current && pendingAdvance.current) advance();
    }, autoAdvanceMs);
  }

  async function listen() {
    const quiz = current.current;
    if (quiz.phase !== "quiz") return;
    const answered = quiz.attempts.length > quiz.index;
    // onPrepare stops all panels, including this one. Restore only existing
    // auto-next intent; replay after an explicit stop must remain paused.
    const resumeAdvance = answered && pendingAdvance.current;
    onPrepare();
    pendingAdvance.current = resumeAdvance;
    const request = ++token.current;
    isPlaying.current = true; setPlaying(true);
    if (!answered) update({ ...quiz, heard: false });
    setNotice("正在播放题目声音…");
    const question = quiz.questions[quiz.index];
    const text = VOWEL_CONTRASTS[question.pairIndex].sides[question.answer][question.mode];
    let result: "ended" | "interrupted" | "failed";
    try { result = await playSample(text, speed); } catch { result = "failed"; }
    if (!alive.current || request !== token.current) return;
    isPlaying.current = false; setPlaying(false);
    if (result !== "ended") {
      pendingAdvance.current = false;
      setNotice(result === "failed" ? "音频未能播放；按空格重试，本题没有记错。" : "播放已停止；按空格重听，本题没有记错。");
      return;
    }
    if (!answered) {
      update({ ...current.current, heard: true });
      setNotice("听到的是哪一个？按 1／2 或对应韩文键作答；空格可重复听。");
    } else if (resumeAdvance) {
      setNotice("重听完毕，稍后自动下一题；Esc 暂停，Enter 立即继续。");
      scheduleAdvance();
    } else setNotice("重听完毕。自动下一题仍暂停；按 Enter 继续。");
  }

  function start(mistakesOnly = false, fromHistory = false) {
    const questions = fromHistory ? shuffleVowelQuestions(pendingVowelQuestions(history.records)) : mistakesOnly ? missedVowelQuestions(current.current.attempts) : makeVowelQuestions();
    if (!questions.length) return;
    onPrepare();
    update(newVowelChallenge(questions, mistakesOnly || fromHistory ? "mistakes" : "full"));
    focusPanel();
    void listen();
  }

  function advance() {
    const next = advanceVowelQuestion(current.current);
    if (next === current.current) return;
    onPrepare(); update(next); focusPanel();
    if (next.phase === "quiz") void listen();
    else setNotice("本轮完成。这里只统计听辨作答，不代表你的发音准确度；成绩不会覆盖原有学习进度。");
  }

  function choose(choice: number) {
    if (isPlaying.current) return;
    const next = answerVowelQuestion(current.current, choice);
    if (next === current.current) return;
    onPrepare(); update(next); focusPanel();
    const attempt = next.attempts[next.index];
    history.record(attempt.question, attempt.choice);
    pendingAdvance.current = autoAdvanceMs > 0;
    setNotice(autoAdvanceMs === 0 ? "已关闭自动下一题；按 Enter 继续，空格可重听。" : `看完反馈 ${autoAdvanceMs / 1000} 秒后自动下一题；空格重听，Esc 暂停，Enter 立即继续。`);
    scheduleAdvance();
  }

  function changeSpeed(value: 1 | 0.82) {
    onPrepare(); onSpeedChange(value); focusPanel();
    setNotice(`已切换${value === 1 ? "标准速度" : "慢放"}。${current.current.phase === "quiz" ? "空格重听；已答题可按 Enter 继续。" : "按 Enter 开始一轮。"}`);
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true]")) return;
    if (keyboardSectionIndex(event.code, event.shiftKey) !== null) return;
    if ((event.key === "Enter" || event.key === " ") && target.closest("button, a[href], summary")) return;
    const key = keyboardShortcutKey(event.key, event.code);
    let handled = true;
    if (key === " " || event.key === "F8") void listen();
    else if (event.key === "Escape") onPrepare();
    else if (event.key === "Enter") { if (current.current.phase === "quiz") advance(); else start(); }
    else if (key === "1" || key === "2") choose(Number(key) - 1);
    else {
      const input = koreanKeyInput(event.key, event.code, event.shiftKey);
      const question = current.current.questions[current.current.index];
      const choice = question && input ? VOWEL_CONTRASTS[question.pairIndex].sides.findIndex(side => side.letter === input.char) : -1;
      if (choice >= 0) choose(choice); else handled = false;
    }
    if (handled) { event.preventDefault(); event.stopPropagation(); }
  }

  const question = state.questions[state.index];
  const pair = question ? VOWEL_CONTRASTS[question.pairIndex] : null;
  const attempt = state.attempts[state.index];
  const correct = state.attempts.filter(item => item.choice === item.question.answer).length;
  const missed = state.attempts.length - correct;
  const modeLabel = question?.mode === "isolated" ? "元音本音 · ㅇ 开头不发音" : "固定 ㄱ 音节 · 只比较元音";
  const pendingQuestions = pendingVowelQuestions(history.records);
  const recent = recentVowelResults(history.records);

  return <div id="vowel-listening" className="vowel-listening" role="region" aria-labelledby="vowel-listening-title" ref={panel} tabIndex={-1} onKeyDown={handleKey}>
    <div className="vowel-challenge-header"><div><span className="vowel-challenge-tag">新 · 听辨小挑战</span><h3 id="vowel-listening-title">遮住答案，听一听。</h3></div><span>{state.phase === "quiz" ? `${state.kind === "mistakes" ? "错题重练" : "盲听"} ${state.index + 1} / ${state.questions.length}` : "ㅓ / ㅗ · ㅡ / ㅜ"}</span></div>
    <div className="vowel-challenge-speed" role="group" aria-label="盲听播放速度"><button type="button" aria-pressed={speed === 1} onClick={() => changeSpeed(1)}>标准</button><button type="button" aria-pressed={speed === 0.82} onClick={() => changeSpeed(0.82)}>慢放</button></div>
    {state.phase === "ready" && <div className="vowel-challenge-intro"><p>8 题，不抢时间。每组同时练“元音本音”和“放进 ㄱ 音节”，顺序随机；作答后才显示答案和口型提示。</p><ol><li>听完整声音</li><li>按 1／2 或对应韩文键</li><li>看反馈，再集中练错题</li></ol><button className="vowel-challenge-primary" type="button" onClick={() => start()}>开始 8 题 <kbd>Enter</kbd></button></div>}
    {state.phase === "quiz" && question && pair && <>
      <progress value={state.index} max={state.questions.length} aria-label="盲听完成进度" />
      <div className="vowel-challenge-prompt"><p>{modeLabel}</p><h4>听到的是哪一个？</h4><button type="button" className="vowel-question-audio" onClick={() => { focusPanel(); void listen(); }}>{playing ? "正在播放 · 重新听" : "▶ 重听题目"} <kbd>空格 / F8</kbd></button></div>
      <div className="vowel-challenge-choices" role="group" aria-label="选择听到的元音">{pair.sides.map((side, index) => <button type="button" key={side.letter} disabled={!state.heard || playing || Boolean(attempt)} className={attempt ? index === question.answer ? "is-correct" : index === attempt.choice ? "is-wrong" : "" : ""} onClick={() => choose(index)}><kbd>{index + 1} / {koreanKeyLabel(side.letter)}</kbd><strong lang="ko">{side.letter}</strong><span lang="ko">{side[question.mode]}</span>{attempt && index === question.answer && <small>正确答案</small>}{attempt && index === attempt.choice && index !== question.answer && <small>你刚才的选择</small>}</button>)}</div>
      {attempt && <div className="vowel-challenge-feedback" role="status"><strong>{attempt.choice === question.answer ? "这次听对了" : `这次听到的是 ${pair.sides[question.answer][question.mode]}`}</strong><p><span lang="ko">{pair.sides[question.answer].letter}</span>：{pair.sides[question.answer].cue}</p><p>{pair.caution}</p><button type="button" onClick={advance}>{state.index + 1 === state.questions.length ? "查看结果" : "下一题"} <kbd>Enter</kbd></button></div>}
    </>}
    {state.phase === "finished" && <div className="vowel-challenge-results"><span>{state.kind === "mistakes" ? "本轮错题重练" : "本轮听辨"}</span><h4>{correct} <small>/ {state.questions.length}</small></h4><p>{missed ? "把容易混的几题单独再听一轮，比反复刷已经会的更有针对性。" : "这一轮都分清了。换个时间再听一次，看看是否还记得。"}</p><ul>{vowelChallengeSummary(state.attempts).map(item => <li key={item.id}><strong lang="ko">{item.title}</strong><span>{item.correct} / {item.total} 正确</span></li>)}</ul><div className="vowel-challenge-result-actions">{missed > 0 && <button className="vowel-challenge-primary" type="button" onClick={() => start(true)}>只练错题 · {missed} 题</button>}<button type="button" onClick={() => start()}>重新挑战 8 题 <kbd>Enter</kbd></button></div></div>}
    {state.phase !== "quiz" && <div className="vowel-history-summary"><h4>下次也记得你的错题</h4><p>{recent.total ? `最近 ${recent.total} 次作答：${recent.correct} 次正确；待巩固 ${pendingQuestions.length} 个音例。` : "还没有盲听记录，完成一题就会开始记录。"}</p>{pendingQuestions.length > 0 && <button type="button" disabled={!history.ready} onClick={() => start(false, true)}>练长期错题 · {pendingQuestions.length} 题</button>}<small>同一音例连续两次答对后移出待巩固；范围为保留的最近 200 次作答，不是发音评分。</small></div>}
    <p className="vowel-challenge-notice" role="status" aria-live="polite">{notice}</p>
    <p className="vowel-challenge-help">{history.storageMessage}</p>
    {state.phase === "quiz" && <button type="button" onClick={() => { onPrepare(); focusPanel(); }}>暂停播放／自动下一题 <kbd>Esc</kbd></button>}
    <p className="vowel-challenge-help">1／2 选择；也可直接按韩文键：ㅓ J、ㅗ H、ㅡ M、ㅜ N。空格重听，Enter 开始／继续，Esc 暂停。返回口型对比会结束本轮，已答记录仍保留。<a href="#learning-tools" onClick={onPrepare}>设置下一题节奏 ↗</a></p>
  </div>;
});

export default VowelListeningChallenge;
