"use client";

import type { KeyboardEvent } from "react";
import { isImeConfirmation, keyboardShortcutKey } from "./keyboard-logic";
import type { DailyPlanSummary } from "./daily-plan-logic";
import "./daily-plan.css";

type Props = {
  summary: DailyPlanSummary | null;
  ready: boolean;
  nextLesson: string;
  beginner: boolean;
  storageMessages: string[];
  onReview: () => void;
  onListening: () => void;
  onLesson: () => void;
  onPrepare: () => void;
};

export default function DailyPlan({ summary, ready, nextLesson, beginner, storageMessages, onReview, onListening, onLesson, onPrepare }: Props) {
  const available = ready && summary !== null;
  const next = beginner ? onLesson : summary?.review.complete ? onListening : onReview;
  const nextLabel = beginner ? "先认核心元音" : summary?.review.complete ? "接着听辨元音" : "先回忆几个词句";

  function handleKey(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat
      || isImeConfirmation(event.nativeEvent.isComposing, event.keyCode, false)) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, audio, [contenteditable=true]")) return;
    if ((event.key === "Enter" || event.key === " ") && target.closest("button, a[href], summary")) return;
    if (!available) return;
    const key = keyboardShortcutKey(event.key, event.code);
    if (key === "1" && summary.review.target > 0) onReview();
    else if (key === "2") onListening();
    else if (key === "3") onLesson();
    else if (event.key === "Enter" && !summary.complete) next();
    else if (event.key === "Escape") onPrepare();
    else return;
    event.preventDefault(); event.stopPropagation();
  }

  return <section id="today-plan" className="daily-plan" tabIndex={-1} data-keyboard-scope="daily-plan" aria-labelledby="daily-plan-title" onKeyDown={handleKey}>
    <div className="daily-plan-heading">
      <div><span className="section-kicker">打开就知道，今天学什么</span><h2 id="daily-plan-title">今日 10 分钟</h2><p>先想起来，再听清楚。留一点时间，学会下一小步。</p></div>
      <div className="daily-plan-count" role="status" aria-live="polite"><span>{available ? summary.today : "正在读取本机记录…"}</span><strong>{available ? summary.completedGoals : "—"}<small> / 2</small></strong><span>今日练习目标 · 不是掌握评分</span></div>
    </div>
    <div className="daily-plan-cards">
      <article className={available && summary.review.complete ? "is-complete" : ""}>
        <div className="daily-plan-step"><span>01 · 约 3 分钟</span><kbd>1</kbd></div>
        <h3>看中文，回忆韩语</h3>
        <p>先想一遍再翻面，自评“忘了 / 想起来了”。到期的优先，不会为凑数量提前复习。</p>
        <div className="daily-plan-metric" data-testid="plan-review-progress">{available ? summary.review.target === 0 ? "今天暂不用复习" : `${Math.min(summary.review.reviewed, summary.review.target)} / ${summary.review.target} 项已回忆` : "读取中…"}</div>
        <small>{available && summary.review.target === 0 ? summary.review.nextDue ? `下次到期：${summary.review.nextDue}` : "没有可复习的词句" : available && summary.review.complete ? "短练完成。忘记也算一次认真回忆，不等于已掌握。" : available && summary.review.due ? `当前有 ${summary.review.due} 项到期，短练最多做 5 项。` : "先从现有词句开始；今天已经做过的会计入。"}</small>
        <button type="button" disabled={!available || summary.review.target === 0} onClick={onReview}>{available && summary.review.complete ? "查看短练结果" : "开始／继续短练"}<span aria-hidden="true">↗</span></button>
      </article>
      <article className={available && summary.listening.complete ? "is-complete" : ""}>
        <div className="daily-plan-step"><span>02 · 约 4 分钟</span><kbd>2</kbd></div>
        <h3>听元音，辨认差别</h3>
        <p><span lang="ko">ㅓ / ㅗ、ㅡ / ㅜ</span>，先听完再选。错题重练也计入，做完 8 次即可休息，不要求全对。</p>
        <div className="daily-plan-metric" data-testid="plan-listening-progress">{available ? `${Math.min(summary.listening.attempts, summary.listening.target)} / ${summary.listening.target} 次已作答` : "读取中…"}</div>
        <small>{available && summary.listening.pending ? `目前有 ${summary.listening.pending} 个待巩固音例，进入后可选“练长期错题”。` : "进入后按 Enter 开始；1 / 2 或韩文键作答，空格重听。"}</small>
        <button type="button" disabled={!available} onClick={onListening}>{available && summary.listening.complete ? "查看盲听／错题" : "进入盲听／错题"}<span aria-hidden="true">↗</span></button>
      </article>
      <article className="daily-plan-lesson">
        <div className="daily-plan-step"><span>03 · 余下约 3 分钟</span><kbd>3</kbd></div>
        <h3>按自己的进度，学一点</h3>
        <p>{beginner ? "刚开始学？可以先从这里认识 6 个核心元音，再回头做上面的练习。" : "接着上次的新手路线学一小段，不必一次学完整课。今天没空也可以跳过。"}</p>
        <div className="daily-plan-next-lesson">{nextLesson}</div>
        <small>这是建议入口，不计入上面的 2 个练习目标；打开课程不会自动标记学会。</small>
        <button type="button" disabled={!available} onClick={onLesson}>接着学下一步<span aria-hidden="true">↗</span></button>
      </article>
    </div>
    <div className="daily-plan-footer">
      <div><strong>{available && summary.complete ? "今天的两项练习已完成，可以休息了。" : "不用刷很久，完成一小段就好。"}</strong><p>10 分钟只是安排建议，不是计时、学习效果或发音准确度保证。记录按设备本地日期统计，仍只保存在本浏览器。</p></div>
      {available && !summary.complete && <button type="button" className="daily-plan-primary" onClick={next}>{nextLabel} <kbd>Enter</kbd></button>}
    </div>
    {available && <div className="daily-plan-storage" role="status">{storageMessages.filter(Boolean).map(message => <p key={message}>{message}</p>)}</div>}
    <details className="daily-plan-notes"><summary>键盘、记录与复习说明</summary><p>聚焦本区后：1 进入回忆、2 进入盲听、3 接着学；Enter 打开推荐下一步。Tab 和 Enter 仍能操作每个按钮，组合输入、长按与系统快捷键不会触发路线。</p><p>回忆沿用原有 1 / 3 / 7 天自评排期；短练最多 5 项，普通“今日复习”仍可做 10 项。盲听按已保留的最近 200 次作答统计，错误也算练习，不算通过考试；累计错题另行展示。</p><p>刷新、跨标签页和进度备份沿用已有记录，不另存一个容易不同步的“打卡完成”标记。跨日会换成新一天；清除网站数据后记录不会保留。</p><a href="#audio-guide" onClick={onPrepare}>音频仍待人工听审，查看来源与反馈 ↗</a></details>
  </section>;
}
