"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { keyboardShortcutKey } from "./keyboard-logic";
import { createDailyReviewQueue, type ReviewRating, type ReviewRecords } from "./review-logic";
import "./daily-review.css";

export type DailyReviewHandle = { stop: () => void };
export type DailyReviewProps = {
  items: readonly { id: string; korean: string; chinese: string; group: string; type: "word" | "sentence" }[];
  today: string;
  records: ReviewRecords;
  ready: boolean;
  storageMessage: string;
  onRate: (id: string, rating: ReviewRating) => { ok: boolean; message: string };
  onPrepare: () => void;
  playSample: (korean: string) => Promise<"ended" | "interrupted" | "failed">;
};

const DAILY_TARGET = 10;

const DailyReview = forwardRef<DailyReviewHandle, DailyReviewProps>(function DailyReview({ items, today, records, ready, storageMessage, onRate, onPrepare, playSample }, ref) {
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
  const ids = useMemo(() => [...new Set(items.map((item) => item.id))], [items]);
  const todayReviewedCount = ids.filter((id) => records[id]?.lastReviewed === today).length;
  const queue = ready ? createDailyReviewQueue(ids, records, today, Math.max(0, DAILY_TARGET - todayReviewedCount)) : [];
  const current = items.find((item) => item.id === queue[0]);
  const currentKey = `${today}:${current?.id ?? "empty"}:${current ? records[current.id]?.updatedAt ?? "new" : ""}`;
  const revealed = Boolean(current && revealedKey === currentKey);
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
  }, [currentKey]);

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

  function rate(rating: ReviewRating) {
    if (!ready || !current || ratedRef.current === currentKey) return;
    if (!revealed) { setFeedback("先想一想并显示韩语答案，才能记录这次复习。" ); return; }
    onPrepare();
    let result: { ok: boolean; message: string };
    try { result = onRate(current.id, rating); }
    catch { result = { ok: false, message: "未能保存这次复习，请重试。当前卡片没有跳过。" }; }
    setFeedback(result.message);
    if (!result.ok) return;
    ratedRef.current = currentKey;
    setRevealedKey(null);
    setAudioNotice(null);
    keepFocusInReview();
  }

  function handleKeyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, audio, [contenteditable=true]")) return;
    if ((event.key === "Enter" || event.key === " ") && target.closest("button, a[href], summary")) return;
    const key = keyboardShortcutKey(event.key, event.code);
    if (key === "1" || key === "2") { event.preventDefault(); rate(key === "1" ? "again" : "remembered"); }
    else if (event.key === "Enter") { event.preventDefault(); reveal(); }
    else if (key === " " || event.key === "F8") { event.preventDefault(); void listen(); }
    else if (event.key === "Escape") { event.preventDefault(); onPrepare(); }
  }

  return <section id="daily-review" className="daily-review" aria-labelledby="daily-review-title" ref={section} tabIndex={-1} data-keyboard-scope="daily-review" onKeyDown={handleKeyboard}>
    <div className="daily-review-heading"><span className="section-kicker">每天一点，记得更久</span><h2 id="daily-review-title">不是一直重看，<br />是试着想起来。</h2><p>从中文主动回忆韩语。先复习到期的词句，再补一点新内容，每天最多 10 项。</p><p className="daily-review-local-note">只保存在本浏览器，与词卡的“标记掌握”分开记录。</p></div>
    <div className="daily-review-workspace">
      <div className="daily-review-progress-heading"><strong>今日完成 <span>{Math.min(todayReviewedCount, DAILY_TARGET)} / {DAILY_TARGET}</span></strong><span>{today}</span></div>
      <progress className="daily-review-progress" max={DAILY_TARGET} value={Math.min(todayReviewedCount, DAILY_TARGET)} aria-label="今日复习目标完成进度" />
      {!ready ? <div className="daily-review-empty"><h3>正在读取本机复习记录…</h3><p>读取完成后再开始，避免覆盖已有进度。</p></div> : current ? <div className="daily-review-card">
        <div className="daily-review-card-meta"><span>{current.type === "word" ? "单词" : "句子"} · {current.group}</span><span>{records[current.id] ? "到期复习" : "第一次回忆"} · 本轮还剩 {queue.length} 项</span></div>
        <p className="daily-review-prompt">看到这个中文，你能想起韩语吗？</p>
        <h3 className="daily-review-chinese">{current.chinese}</h3>
        {!revealed ? <div className="daily-review-hidden"><p>在心里说一遍，或轻声读出来。</p><button type="button" className="daily-review-reveal" onClick={reveal}>显示韩语答案 <kbd>Enter</kbd></button></div> : <div className="daily-review-answer">
          <p className="daily-review-korean" lang="ko">{current.korean}</p>
          <button type="button" className="daily-review-listen" onClick={() => void listen()} aria-label={`播放复习示范：${current.korean}`}>{playing ? "正在播放 · 再听一次" : "▶ 听完整词句"}<span><kbd>空格</kbd> / <kbd>F8</kbd></span></button>
          <div className="daily-review-rating" role="group" aria-label="这次是否想起韩语"><button type="button" onClick={() => rate("again")}><kbd>1</kbd><span><strong>忘了</strong><small>明天再见，不用着急</small></span></button><button type="button" onClick={() => rate("remembered")}><kbd>2</kbd><span><strong>想起来了</strong><small>按记忆排期再次复习</small></span></button></div>
        </div>}
      </div> : <div className="daily-review-empty"><span aria-hidden="true">✓</span><h3>{todayReviewedCount >= DAILY_TARGET ? "今天的 10 项复习完成了" : items.length ? "当前没有需要复习的词句" : "暂时没有可复习的词句"}</h3><p>{todayReviewedCount >= DAILY_TARGET ? "不用继续刷数量。休息一下，明天再试着回忆。" : "到期的内容会再次出现；已经排期的词句不会为了凑数提前重复。"}</p></div>}
      <div className="daily-review-feedback" role="status" aria-live="polite"><p>{feedback}</p>{audioNotice?.key === currentKey && <p>{audioNotice.message}</p>}</div>
      {storageMessage && <p className="daily-review-storage" role="status">{storageMessage}</p>}
      <p className="daily-review-next">{nextDue ? <>下次到期：<strong>{nextDue}</strong>，{nextDueCount} 项。已排期共 {futureRecords.length} 项。</> : "完成一次自评后，这里会显示下次复习日期。"}</p>
      <p className="daily-review-shortcuts">聚焦本区：Enter 翻面 · 1 / 2 自评 · 空格 / F8 听示范 · Esc 停止。按钮仍可正常用 Tab 和 Enter 操作。</p>
      <details className="daily-review-notes"><summary>复习规则与音频说明</summary><p>“忘了 / 想起来了”是你对记忆的自评，不是发音判分。1 / 3 / 7 天是可调整的产品排期规则，不保证每个人都在同样时间记牢；忘了会安排明天再见。</p><p>本区沿用现有完整 AI 词句音频，没有新增教师逐条校验。不自动播放下一题，不启用麦克风，也不把自评当作发音准确的证明。</p><p>进度仅保存在当前浏览器；换设备、换浏览器或清除网站数据后不会自动同步。今日已完成数量会保留，刷新页面不会再补出一轮新的 10 项。</p></details>
    </div>
  </section>;
});

export default DailyReview;
