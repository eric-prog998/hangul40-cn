"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { isImeConfirmation, keyboardShortcutKey } from "./keyboard-logic";
import { createDailyReviewQueue, type ReviewRating, type ReviewRecords } from "./review-logic";
import { compareRecall } from "./recall-logic";
import "./daily-review.css";

export type DailyReviewHandle = { stop: () => void };
export type DailyReviewProps = {
  items: readonly { id: string; korean: string; chinese: string; group: string; type: "word" | "sentence" }[];
  today: string;
  records: ReviewRecords;
  ready: boolean;
  storageMessage: string;
  target?: number;
  onReturnToPlan?: () => void;
  onRate: (id: string, rating: ReviewRating) => { ok: boolean; message: string };
  onPrepare: () => void;
  playSample: (korean: string) => Promise<"ended" | "interrupted" | "failed">;
};

const DailyReview = forwardRef<DailyReviewHandle, DailyReviewProps>(function DailyReview({ items, today, records, ready, storageMessage, target = 10, onReturnToPlan, onRate, onPrepare, playSample }, ref) {
  const DAILY_TARGET = Number.isFinite(target) ? Math.max(1, Math.min(10, Math.floor(target))) : 10;
  const section = useRef<HTMLElement | null>(null);
  const mounted = useRef(true);
  const token = useRef(0);
  const playingRef = useRef<string | null>(null);
  const ratedRef = useRef<string | null>(null);
  const onPrepareLatest = useRef(onPrepare);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("先看中文，在心里想一遍韩语，再翻开答案。");
  const [audioNotice, setAudioNotice] = useState<{ key: string; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const composing = useRef(false);
  const focusRequestedKey = useRef<string | null>(null);
  const advanceRequestedDay = useRef<string | null>(null);
  const heldRatingCode = useRef<string | null>(null);
  const [continuousInput, setContinuousInput] = useState(false);
  const [retryKey, setRetryKey] = useState<string | null>(null);
  const [typingKey, setTypingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState({ key: "", text: "" });
  const [checked, setChecked] = useState<{ key: string; text: string; kind: ReturnType<typeof compareRecall> } | null>(null);
  const ids = useMemo(() => [...new Set(items.map((item) => item.id))], [items]);
  const todayReviewedCount = ids.filter((id) => records[id]?.lastReviewed === today).length;
  const queue = ready ? createDailyReviewQueue(ids, records, today, Math.max(0, DAILY_TARGET - todayReviewedCount)) : [];
  const current = items.find((item) => item.id === queue[0]);
  const currentKey = `${today}:${current?.id ?? "empty"}:${current ? records[current.id]?.updatedAt ?? "new" : ""}`;
  const revealed = Boolean(current && revealedKey === currentKey);
  const typing = Boolean(current && (typingKey === currentKey || continuousInput));
  const retrying = retryKey === currentKey;
  const playing = playingKey === currentKey;
  const futureRecords = ids.map((id) => records[id]).filter((record) => record && record.due > today);
  const nextDue = futureRecords.map((record) => record.due).sort()[0];
  const nextDueCount = nextDue ? futureRecords.filter((record) => record.due === nextDue).length : 0;

  const stop = useCallback(() => {
    token.current += 1;
    const interruptedKey = playingRef.current;
    playingRef.current = null;
    if (mounted.current) {
      setPlayingKey(null);
      if (interruptedKey) setAudioNotice({ key: interruptedKey, message: "示范已停止，可以重新播放。" });
    }
  }, []);
  useImperativeHandle(ref, () => ({ stop }), [stop]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stop(); };
  }, [stop]);
  useEffect(() => { onPrepareLatest.current = onPrepare; }, [onPrepare]);
  useEffect(() => {
    // Invalidate a pending result after a date change or cross-tab record update.
    token.current += 1;
    if (playingRef.current !== null) onPrepareLatest.current();
    playingRef.current = null;
    // Forget the previous card, not merely hide it under a different date/key.
    // Only an explicit successful self-rating may move focus to the next input.
    const focusNext = advanceRequestedDay.current === today && continuousInput && Boolean(current);
    advanceRequestedDay.current = null;
    focusRequestedKey.current = focusNext ? currentKey : null;
    composing.current = false;
    setTypingKey(null);
    setDraft({ key: "", text: "" });
    setChecked(null);
    setRetryKey(null);
    setRevealedKey(null);
    setPlayingKey(null);
    setAudioNotice(null);
    // Deliberately keyed to card identity, not mode toggles or object refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);
  useEffect(() => {
    if (typing && !revealed && focusRequestedKey.current === currentKey) {
      focusRequestedKey.current = null;
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [typing, currentKey, revealed]);

  function keepFocusInReview() {
    // Only called synchronously by this section's own click/keyboard actions.
    // Safari may not focus clicked buttons, so activeElement is not a reliable guard.
    section.current?.focus({ preventScroll: true });
  }

  function reveal() {
    if (!ready || !current || revealed) return;
    onPrepare();
    setRevealedKey(currentKey);
    setAudioNotice(null);
    setFeedback("对照答案，再诚实选择：忘了，还是想起来了？不要求一遍就记住。");
    keepFocusInReview();
  }

  function startTyping() {
    if (!ready || !current || revealed) return;
    onPrepare();
    focusRequestedKey.current = currentKey;
    setTypingKey(currentKey);
    if (inputRef.current) {
      focusRequestedKey.current = null;
      inputRef.current.focus({ preventScroll: true });
    }
  }

  function toggleContinuousInput(enabled: boolean) {
    setContinuousInput(enabled);
    if (enabled) startTyping();
    else if (current && typing && !revealed) setTypingKey(currentKey);
  }

  function retryWriting() {
    if (!ready || !current || !revealed) return;
    onPrepare();
    composing.current = false;
    setRevealedKey(null);
    setChecked(null);
    setAudioNotice(null);
    setDraft({ key: currentKey, text: "" });
    setRetryKey(currentKey);
    setTypingKey(currentKey);
    focusRequestedKey.current = currentKey;
    setFeedback("刚看过答案，现在遮住再写一遍巩固；自评仍按第一次是否想起来选择。");
  }

  function checkDraft() {
    if (!current || revealed || composing.current) return;
    const text = draft.key === currentKey ? draft.text : "";
    const kind = compareRecall(text, current.korean);
    if (kind === "empty") { setFeedback("先输入你想起的韩文；不记得也可以直接显示答案。"); return; }
    setChecked({ key: currentKey, text, kind });
    reveal();
  }

  function handleInputKey(event: KeyboardEvent<HTMLInputElement>) {
    // A rating key may still be held when the next input receives focus.
    if (event.repeat && event.code === heldRatingCode.current) { event.preventDefault(); return; }
    if (!event.repeat) heldRatingCode.current = null;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || isImeConfirmation(event.nativeEvent.isComposing, event.keyCode, composing.current)) return;
    if (event.key !== "Enter" && event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (event.key === "Enter") checkDraft();
    else { onPrepare(); keepFocusInReview(); }
  }

  async function listen() {
    if (!ready || !current) return;
    if (!revealed) { setFeedback("请先回忆并显示韩语答案，再听示范。"); return; }
    onPrepare();
    const request = ++token.current;
    playingRef.current = currentKey;
    setPlayingKey(currentKey);
    setAudioNotice({ key: currentKey, message: "正在播放完整词句示范…" });
    let result: "ended" | "interrupted" | "failed";
    try { result = await playSample(current.korean); } catch { result = "failed"; }
    if (!mounted.current || request !== token.current) return;
    playingRef.current = null;
    setPlayingKey(null);
    setAudioNotice({ key: currentKey, message: result === "ended" ? "示范播放完成。可以再听，也可以给自己做记忆评价。" : result === "interrupted" ? "示范已停止，可以重新播放。" : "音频未能播放，请检查网络后重试；这不会改变复习记录。" });
  }

  function rate(rating: ReviewRating, triggerCode?: string) {
    if (!ready || !current || ratedRef.current === currentKey) return;
    if (!revealed) { setFeedback("先想一想并显示韩语答案，才能记录这次复习。" ); return; }
    onPrepare();
    let result: { ok: boolean; message: string };
    try { result = onRate(current.id, rating); }
    catch { result = { ok: false, message: "未能保存这次复习，请重试。当前卡片没有跳过。" }; }
    setFeedback(result.message);
    if (!result.ok) return;
    heldRatingCode.current = triggerCode ?? null;
    advanceRequestedDay.current = continuousInput ? today : null;
    ratedRef.current = currentKey;
    setRevealedKey(null);
    setAudioNotice(null);
    keepFocusInReview();
  }

  function handleKeyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat || isImeConfirmation(event.nativeEvent.isComposing, event.keyCode, composing.current)) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, audio, [contenteditable=true]")) return;
    if ((event.key === "Enter" || event.key === " ") && target.closest("button, a[href], summary")) return;
    const key = keyboardShortcutKey(event.key, event.code);
    if (key === "1" || key === "2") { event.preventDefault(); rate(key === "1" ? "again" : "remembered", event.code); }
    else if (key === "t") { event.preventDefault(); startTyping(); }
    else if (key === "r") { event.preventDefault(); retryWriting(); }
    else if (event.key === "Enter") { event.preventDefault(); reveal(); }
    else if (key === " " || event.key === "F8") { event.preventDefault(); void listen(); }
    else if (event.key === "Escape") { event.preventDefault(); onPrepare(); }
  }

  return <section id="daily-review" className="daily-review" aria-labelledby="daily-review-title" ref={section} tabIndex={-1} data-keyboard-scope="daily-review" onKeyDown={handleKeyboard}>
    <div className="daily-review-heading"><span className="section-kicker">每天一点，记得更久</span><h2 id="daily-review-title">不是一直重看，<br />是试着想起来。</h2><p>从中文主动回忆韩语。先复习到期的词句，再补一点新内容，{onReturnToPlan ? `今日路线短练最多 ${DAILY_TARGET} 项。` : "每天最多 10 项。"}</p><p className="daily-review-local-note">只保存在本浏览器，与词卡的“标记掌握”分开记录。</p></div>
    <div className="daily-review-workspace">
      {onReturnToPlan && <div className="daily-plan-return"><p>{todayReviewedCount >= DAILY_TARGET ? "短练已完成，回到路线继续下一小步。" : "今日路线 · 回忆短练；今天已做过的也计入。"}</p><button type="button" onClick={onReturnToPlan}>返回今日路线</button></div>}
      <div className="daily-review-progress-heading"><strong>今日完成 <span>{Math.min(todayReviewedCount, DAILY_TARGET)} / {DAILY_TARGET}</span></strong><span>{today}</span></div>
      <progress className="daily-review-progress" max={DAILY_TARGET} value={Math.min(todayReviewedCount, DAILY_TARGET)} aria-label="今日复习目标完成进度" />
      <label className="daily-review-mode"><input type="checkbox" id="daily-review-continuous" checked={continuousInput} disabled={!ready} onChange={event => toggleContinuousInput(event.target.checked)} /><span><strong>连续键盘输入</strong><small>本页有效：自评后直接输入下一张；外部进度更新不会抢焦点。</small></span></label>
      {!ready ? <div className="daily-review-empty"><h3>正在读取本机复习记录…</h3><p>读取完成后再开始，避免覆盖已有进度。</p></div> : current ? <div className="daily-review-card">
        <div className="daily-review-card-meta"><span>{current.type === "word" ? "单词" : "句子"} · {current.group}</span><span>{records[current.id] ? "到期复习" : "第一次回忆"} · 本轮还剩 {queue.length} 项</span></div>
        <p className="daily-review-prompt">看到这个中文，你能想起韩语吗？</p>
        <h3 className="daily-review-chinese">{current.chinese}</h3>
        {retrying && <p className="daily-review-retry-note">已看过答案 · 这次重写用于巩固，不算新的复习；自评请按第一次回忆表现选择。</p>}
        {!revealed ? <div className="daily-review-hidden"><p>在心里说一遍、轻声读出来，或用键盘试着写下来。</p>
          {typing ? <div className="daily-review-input-box">
            <label htmlFor="daily-review-input">输入你想起的韩文</label>
            <input id="daily-review-input" ref={inputRef} lang="ko" value={draft.key === currentKey ? draft.text : ""} maxLength={200} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-describedby="daily-review-input-help" onChange={event => setDraft({ key: currentKey, text: event.target.value })} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onBlur={() => { composing.current = false; heldRatingCode.current = null; }} onKeyDown={handleInputKey} onKeyUp={event => { if (event.code === heldRatingCode.current) heldRatingCode.current = null; }} />
            <p id="daily-review-input-help">请切换系统韩文输入法。Enter 对照参考答案；输入法正在组字时，Enter 只确认组字。Esc 返回本区快捷键。输入只留在本页，不保存或上传。</p>
            <button type="button" className="daily-review-check" onClick={checkDraft}>对照参考答案 <kbd>Enter</kbd></button>
          </div> : <button type="button" className="daily-review-type" onClick={startTyping}>用键盘试着输入 <kbd>T</kbd></button>}
          <button type="button" className="daily-review-reveal" onClick={reveal}>显示韩语答案 <kbd>Enter</kbd></button></div> : <div className="daily-review-answer">
          {checked?.key === currentKey && <div className="daily-review-comparison" role="status"><p>你输入的：<strong lang="ko">{checked.text}</strong></p><p>{checked.kind === "match" ? "与本卡参考写法一致。仍请自己评价是否真正想起来了。" : checked.kind === "format" ? "文字相同，空格或句末标点不同，请对照参考写法。" : "与本卡参考写法不同，不代表你的韩语表达一定错误；这里不判断其他译法，请对照后自行评价。"}</p></div>}
          <p className="daily-review-korean" lang="ko">{current.korean}</p>
          <button type="button" className="daily-review-listen" onClick={() => void listen()} aria-label={`播放复习示范：${current.korean}`}>{playing ? "正在播放 · 再听一次" : "▶ 听完整词句"}<span><kbd>空格</kbd> / <kbd>F8</kbd></span></button>
          <button type="button" className="daily-review-retry" onClick={retryWriting}>遮住答案，再写一次 <kbd>R</kbd></button>
          <div className="daily-review-rating" role="group" aria-label="这次是否想起韩语"><button type="button" onClick={() => rate("again")}><kbd>1</kbd><span><strong>忘了</strong><small>明天再见，不用着急</small></span></button><button type="button" onClick={() => rate("remembered")}><kbd>2</kbd><span><strong>想起来了</strong><small>按记忆排期再次复习</small></span></button></div>
        </div>}
      </div> : <div className="daily-review-empty"><span aria-hidden="true">✓</span><h3>{todayReviewedCount >= DAILY_TARGET ? `今天的 ${DAILY_TARGET} 项复习完成了` : items.length ? "当前没有需要复习的词句" : "暂时没有可复习的词句"}</h3><p>{todayReviewedCount >= DAILY_TARGET ? "不用继续刷数量。休息一下，明天再试着回忆。" : "到期的内容会再次出现；已经排期的词句不会为了凑数提前重复。"}</p></div>}
      <div className="daily-review-feedback" role="status" aria-live="polite"><p>{feedback}</p>{audioNotice?.key === currentKey && <p>{audioNotice.message}</p>}</div>
      {storageMessage && <p className="daily-review-storage" role="status">{storageMessage}</p>}
      <p className="daily-review-next">{nextDue ? <>下次到期：<strong>{nextDue}</strong>，{nextDueCount} 项。已排期共 {futureRecords.length} 项。</> : "完成一次自评后，这里会显示下次复习日期。"}</p>
      <p className="daily-review-shortcuts">聚焦本区：T 输入韩文 · Enter 翻面 · R 遮住再写 · 1 / 2 自评 · 空格 / F8 听示范 · Esc 停止。输入框内按键用于打字，不触发自评或播放；按钮仍可正常用 Tab 和 Enter 操作。</p>
      <details className="daily-review-notes"><summary>复习规则与音频说明</summary><p>“忘了 / 想起来了”是你对记忆的自评，不是发音判分。1 / 3 / 7 天是可调整的产品排期规则，不保证每个人都在同样时间记牢；忘了会安排明天再见。</p><p>本区沿用现有完整 AI 词句音频，没有新增教师逐条校验。不自动播放下一题，不启用麦克风，也不把自评当作发音准确的证明。</p><p>进度仅保存在当前浏览器；换设备、换浏览器或清除网站数据后不会自动同步。今日已完成数量会保留，普通复习每天最多 10 项；路线短练与普通复习共享记录，不会另开一轮计数。</p></details>
    </div>
  </section>;
});

export default DailyReview;
