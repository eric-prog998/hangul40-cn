"use client";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import names from "../data/consonant-names.json";
import phrases from "../data/phrases.json";
import fingerprints from "../data/audio-fingerprints.json";
import { AUDIO_CATEGORIES, AUDIO_ISSUES, audioFeedback, audioReviewChecklist, createAudioCatalog, filterAudioCatalog, type AudioCategory } from "./audio-catalog";
import type { AudioPlaybackResult } from "./audio-playback";
import "./audio-guide.css";

const catalog = createAudioCatalog(names, phrases, fingerprints);
type Props = { version: string; onPrepare: () => void; onPlay: (source: string) => Promise<AudioPlaybackResult>; onStop: () => void };

function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AudioGuide({ version, onPrepare, onPlay, onStop }: Props) {
  const [category, setCategory] = useState<AudioCategory | "all">("vowel");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState("");
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState("选择要核对的条目，再按播放。查询不会自动播放，也不会显示当前闯关的答案。");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [issue, setIssue] = useState<string>(AUDIO_ISSUES[0]);
  const [note, setNote] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const request = useRef(0);
  const busy = useRef(false);
  const reportBox = useRef<HTMLTextAreaElement>(null);
  const entries = useMemo(() => filterAudioCatalog(catalog, category, query), [category, query]);
  const selected = entries.find(entry => entry.id === selection) ?? entries[0];
  const report = selected ? audioFeedback(selected, issue, note, version) : "";

  function stop(message = "已停止。可按空格或 F8 重听。") {
    ++request.current; busy.current = false; setPlaying(false); onStop(); setMessage(message);
  }
  function changing() {
    onPrepare(); stop("已切换条目；按播放后才会出声。");
    setFeedbackOpen(false); setNote(""); setFeedbackMessage("");
  }
  async function play() {
    if (!selected) return;
    onPrepare(); const token = ++request.current;
    busy.current = true; setPlaying(true); setMessage("正在播放当前条目…");
    let result: AudioPlaybackResult;
    try { result = await onPlay(`${selected.path}?v=21`); } catch { result = "failed"; }
    if (request.current !== token) return;
    busy.current = false; setPlaying(false);
    setMessage(result === "ended" ? "播放结束。听到疑问？可生成带音频编号的反馈。" : result === "interrupted" ? "播放已中断；可按空格或 F8 重播。" : "音频未能播放。请检查网络或浏览器声音权限，然后重试；不会自动切换条目。");
  }
  useEffect(() => {
    const hidden = () => {
      if (document.hidden && busy.current) {
        ++request.current; busy.current = false; onStop(); setPlaying(false); setMessage("页面进入后台，已停止；回来后请手动重播。");
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => { document.removeEventListener("visibilitychange", hidden); ++request.current; if (busy.current) onStop(); };
  }, [onStop]);
  function keydown(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.repeat || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
    if (event.key === "Escape") { event.preventDefault(); stop(); }
    else if (event.key === "F8" || (event.key === " " && !(event.target as HTMLElement).closest("button, a, summary"))) { event.preventDefault(); void play(); }
  }
  async function copyReport() {
    try { await navigator.clipboard.writeText(report); setFeedbackMessage("已复制，尚未发送。请自行粘贴给网站维护者。"); }
    catch { reportBox.current?.focus(); reportBox.current?.select(); setFeedbackMessage("浏览器未允许复制；文字已选中，可按 ⌘C / Ctrl+C，或下载反馈文件。"); }
  }

  return <section id="audio-guide" className="audio-guide" data-keyboard-scope="audio-guide" tabIndex={-1} aria-labelledby="audio-guide-title" onKeyDown={keydown} onFocusCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) onPrepare(); }}>
    <div className="audio-guide-heading"><div><span className="section-kicker">先知道听的是什么</span><h2 id="audio-guide-title">音源与发音反馈</h2><p>字母名称、短促起音、完整音节不是同一种示范。这里能查来源，也能准确指出哪条音频有疑问。</p></div><div className="audio-review-count"><strong>492</strong><span>条现有音频 · 待逐条人工听审</span></div></div>
    <div className="audio-review-notice"><strong>来源可追溯 ≠ 发音已审核</strong><p>本次只核对文件与编号，没有新增母语教师逐条听审记录。真人裁切片段和 AI 示范都标为“待人工听审”；不能用程序测试通过来证明读音准确。ㅇ 作初声无声，不提供虚构的起音文件。</p></div>
    <div className="audio-guide-workspace">
      <div className="audio-guide-picker"><label htmlFor="audio-category">音频类型</label><select id="audio-category" value={category} onChange={event => { changing(); setCategory(event.target.value as AudioCategory | "all"); setSelection(""); }}><option value="all">全部类型</option>{Object.entries(AUDIO_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><label htmlFor="audio-search">查找条目</label><input id="audio-search" type="search" placeholder="韩文、中文或音频编号" value={query} onChange={event => { changing(); setQuery(event.target.value); setSelection(""); }} /><label htmlFor="audio-selection">选择音频 · {entries.length} 条</label><select id="audio-selection" value={selected?.id ?? ""} disabled={!entries.length} onChange={event => { changing(); setSelection(event.target.value); }}>{entries.length ? entries.map(entry => <option key={entry.id} value={entry.id}>{entry.label} · {AUDIO_CATEGORIES[entry.category]}</option>) : <option value="">没有匹配条目</option>}</select><p>空格／F8 重听，Esc 停止。输入框和下拉框保留原生键盘操作。</p><button type="button" onClick={() => { try { download(JSON.stringify(audioReviewChecklist(catalog, version), null, 2), `hangul40-v${version}-audio-review.json`, "application/json"); setMessage("已发起待听审清单下载；这是审核准备材料，不是已通过的审核报告。"); } catch { setMessage("下载未成功，请重试。"); } }}>下载待听审清单</button></div>
      <article className="audio-guide-detail" aria-label="所选音频详情">{selected ? <><div className="audio-guide-badges"><span>{selected.category === "onset" || selected.category === "clarity" ? "真人录音裁切" : "AI 合成示范"}</span><span>待人工听审</span></div><h3>{selected.label}</h3><p className="audio-guide-explanation">{selected.explanation}</p><p className="audio-source-text">{selected.source} {selected.sourceUrl && <a href={selected.sourceUrl} target="_blank" rel="noreferrer">原始音源 ↗</a>}</p><div className="audio-guide-actions"><button id="audio-guide-play" type="button" onClick={() => void play()}>{playing ? "重新播放" : "播放这条音频"}</button><button type="button" onClick={() => stop()} disabled={!playing}>停止</button><button type="button" aria-expanded={feedbackOpen} aria-controls="audio-feedback-form" onClick={() => { stop("已停止播放，可以描述听到的问题。"); setFeedbackOpen(value => !value); setFeedbackMessage(""); }}>这条发音有疑问</button></div><details><summary>查看音频编号与文件指纹</summary><dl><dt>音频编号</dt><dd>{selected.id}</dd><dt>文件</dt><dd>{selected.path}</dd><dt>SHA-256</dt><dd>{selected.fingerprint?.sha256 ?? "未记录"}</dd></dl><p>指纹只用于确认是否为同一文件，不代表发音审核通过。</p></details></> : <div className="audio-guide-empty"><h3>没有找到条目</h3><p>可以清空搜索词，或把类型切换为“全部类型”。</p></div>}</article>
    </div>
    <p id="audio-guide-status" role="status" className="audio-guide-status">{message}</p>
    {feedbackOpen && selected && <div id="audio-feedback-form" className="audio-feedback-form"><h3>生成反馈，自己决定是否发送</h3><p>仅生成下面这些文字；不会自动上传，不读取学习进度，不申请麦克风。请不要填写手机号等个人信息。</p><label htmlFor="audio-issue">遇到什么问题？</label><select id="audio-issue" value={issue} onChange={event => { setIssue(event.target.value); setFeedbackMessage(""); }}>{AUDIO_ISSUES.map(item => <option key={item}>{item}</option>)}</select><label htmlFor="audio-note">补充说明（选填，最多 500 字）</label><textarea id="audio-note" maxLength={500} rows={3} value={note} onChange={event => { setNote(event.target.value); setFeedbackMessage(""); }} /><label htmlFor="audio-report">将要复制或下载的内容 · 未发送</label><textarea id="audio-report" ref={reportBox} value={report} readOnly rows={9} /><div className="audio-guide-actions"><button type="button" onClick={() => void copyReport()}>复制反馈内容</button><button type="button" onClick={() => { try { download(report, `hangul40-audio-${selected.id}.txt`, "text/plain;charset=utf-8"); setFeedbackMessage("已发起下载，尚未发送。请自行将文件发给维护者。"); } catch { setFeedbackMessage("下载未成功；可选择上方文字手动复制。"); } }}>下载反馈文件</button></div><p role="status">{feedbackMessage}</p></div>}
  </section>;
}
