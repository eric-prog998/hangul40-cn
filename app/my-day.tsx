"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import DayLetterCard from "./day-letter-card";
import { daySkillTotals } from "./day-letters";
import DayDialogue from "./day-dialogue";
import { SCENE_LINES, SCENE_TITLES } from "./day-dialogue-data";
import { beginDay, currentStep, emptyBook, gradeDialogue, gradeLetter, MY_DAY_KEY, readBook, type Notebook } from "./my-day-state";
import "./my-day.css";

export type DayBadge = "new" | "started" | "finished";
type Props = { visible: boolean; active: boolean; day: string; legacy: readonly string[]; onBadge: (b: DayBadge) => void;
  onHome: () => void; onPlay: (path: string) => Promise<boolean>; onStop: () => void };
const phases = ["温故", "读音", "接话", "收尾"] as const;
export default function MyDay({visible, active, day, legacy, onBadge, onHome, onPlay, onStop}: Props) {
  const [book, setBook] = useState<Notebook | null>(null);
  const [message, setMessage] = useState("");
  const state = useRef<Notebook | null>(null);
  const stored = useRef<string | null>(null);
  const writable = useRef(true);
  const finish = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (active) return onStop; }, [active, onStop]);
  const apply = useCallback((next: Notebook) => { state.current = next; setBook(next); }, []);
  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem(MY_DAY_KEY);
      const next = readBook(raw);
      writable.current = true; stored.current = raw; setMessage(""); apply(next);
    } catch {
      writable.current = false;
      setMessage("无法读取日课存档。仍可练习，本次只在当前页面保留，不会覆盖原记录。");
      if (!state.current) apply(emptyBook());
    }
  }, [apply]);
  useEffect(() => {
    refresh();
    const sync = (e: StorageEvent) => { if ((e.key === MY_DAY_KEY || e.key === null) && e.storageArea === localStorage) refresh(); };
    window.addEventListener("storage", sync); return () => window.removeEventListener("storage", sync);
  }, [refresh]);
  const save = useCallback((next: Notebook) => {
    if (writable.current) {
      try {
        if (localStorage.getItem(MY_DAY_KEY) !== stored.current) { refresh(); return; }
        const raw = JSON.stringify(next);
        localStorage.setItem(MY_DAY_KEY, raw); stored.current = raw;
      } catch {
        writable.current = false;
        setMessage("浏览器没能保存日课。你仍能继续，暂时不要刷新或关闭页面。");
      }
    }
    apply(next);
  }, [apply, refresh]);
  useEffect(() => {
    if (visible && active && book && day && book.session?.day !== day && state.current === book) save(beginDay(book, day, legacy));
  }, [visible, active, day, legacy, book, save]);
  const s = book?.session;
  const step = s ? currentStep(s) : null;
  useEffect(() => { onBadge(s && s.day === day ? (s.done ? "finished" : "started") : "new"); }, [s, day, onBadge]);
  useEffect(() => { if (visible && active && step === "finish") finish.current?.focus({preventScroll:true}); }, [visible, active, step]);
  if (!visible) return null;
  if (!book || !s || s.day !== day || !step) return <p role="status">正在打开今天的日课…</p>;
  const index = s.marks.length;
  const phase = step === "letters" ? Number(index > 0) : step === "finish" ? 3 : 2;
  const sceneIndex = step === "extra" ? s.extra! : step === "recall" ? s.recall! : s.scene;
  const reads = s.cards.filter((card, i) => card.skill === "read" && s.marks[i]?.result === "good" && !s.marks[i].replayed).map(c => c.char);
  const saveIfCurrent = (next: () => Notebook) => { if (active && state.current === book) save(next()); };
  return <div className="my-day-layout">
    <div className="my-day-main">
      <header className="my-day-heading"><div className="study-kicker"><span aria-hidden="true"/>我的韩语日课 <small>{s.day.slice(5).replace("-", " / ")}</small></div>
        <h1>今天，练到能开口。</h1><p>建议约 12 分钟，不倒计时。完成一张就记一张，随时可以停。</p></header>
      <ol className="day-steps" aria-label="日课步骤">{phases.map((name, i) => <li key={name} data-past={i < phase} aria-current={i === phase ? "step" : undefined}><small>0{i + 1}</small> {name}</li>)}</ol>
      {message && <p role="status" className="day-notice">{message}</p>}
      <div className="day-surface">
        <div className="day-eyebrow">{step === "letters" ? (index === 0 ? "01 · 热身与温故" : "02 · 40 音分项练习") : step === "recall" ? "03 · 上次的场景 / 先用中文提示回忆" : step === "finish" ? "04 · 今日学习小结" : "03 · 生活接话"}<span>{step === "letters" ? (index+1)+" / "+s.cards.length : step === "finish" ? "已完成" : SCENE_TITLES[sceneIndex]}</span></div>
        {step === "letters" ? <DayLetterCard key={s.day+":"+index} card={s.cards[index]} active={active} onPlay={onPlay} onStop={onStop} onGrade={(result,replayed) => saveIfCurrent(() => gradeLetter(book,result,replayed))}/>
        : step !== "finish" ? <DayDialogue key={s.day+":"+step+":"+sceneIndex} sceneIndex={sceneIndex} recall={step === "recall"} active={active} onPlay={onPlay} onStop={onStop} onDone={result => saveIfCurrent(() => gradeDialogue(book,result))}/>
        : <div className="day-finish" data-testid="day-finish"><h2 tabIndex={-1} ref={finish}>今天练到了这里。</h2>
          <p>看字能读 <strong lang="ko">{[...new Set(reads)].join(" · ") || "还在熟悉"}</strong><small>只列本次自评读出、没有重听的字母；隔日还会换音节再练。</small></p>
          <p>{SCENE_TITLES[s.scene]} <strong lang="ko">{SCENE_LINES[s.scene]}</strong><small>可再说一句 · {s.done === "good" ? "本次自评能接话" : "标记为还要练"}，不是发音评分。</small></p>
          <div className="day-more"><small>继续自由接话</small>{SCENE_TITLES.map((title, i) => <button key={title} id={i === (s.scene+1)%3 ? "day-extra" : undefined} type="button" onClick={() => saveIfCurrent(() => ({...book,session:{...s,extra:i}}))}>{title}</button>)}</div>
          <button type="button" onClick={onHome}>回到首页</button></div>}
      </div>
    </div>
    <aside className="day-margin"><span className="day-side-label">本课便签</span><h2>今天的生活场景</h2><p>{SCENE_TITLES[s.scene]}</p><hr/><p>先试着自己说，再听示范。想不起来就标「再练」，不扣分。</p>
      <button id="day-pause" type="button" onClick={onHome}>{step === "finish" ? "回到今天" : "暂停并回首页"}</button>
      <a href="#learn">查 40 音表</a><hr/><strong>我的分项记录</strong>
      <dl className="day-skill-counts">{daySkillTotals(book.history).map(({skill,practiced,total,confirmed}) =>
        <div key={skill}><dt>{{read:"看字读",listen:"听音认",keys:"按键打"}[skill]}</dt><dd>{practiced} / {total} 已练 · {confirmed} 已复核</dd></div>)}</dl>
      <small>「已复核」需隔日再练。盲听不考静音、易混拼写；自由练习的标记单独保留。</small></aside>
  </div>;
}
