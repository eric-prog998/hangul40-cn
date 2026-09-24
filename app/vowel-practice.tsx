"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import LocalVoiceRecorder, { type LocalVoiceRecorderHandle } from "./local-voice-recorder";
import { keyboardShortcutKey } from "./keyboard-logic";
import { VOWEL_CONTRASTS, VOWEL_GUIDE_SOURCE, type VowelPracticeMode } from "./pronunciation-data";

export type VowelPracticeHandle = { stop: () => void };
type Props = {
  onPrepare: () => void;
  playSample: (text: string, speed: 1 | 0.82) => Promise<"ended" | "interrupted" | "failed">;
  speed: 1 | 0.82;
  onSpeedChange: (speed: 1 | 0.82) => void;
};

const VowelPractice = forwardRef<VowelPracticeHandle, Props>(function VowelPractice({ onPrepare, playSample, speed, onSpeedChange }, ref) {
  const [pairIndex, setPairIndex] = useState(0);
  const [mode, setMode] = useState<VowelPracticeMode>("isolated");
  const [playing, setPlaying] = useState<number | null>(null);
  const [status, setStatus] = useState("先听 A，再听 B，观察自己的嘴唇有没有改变。");
  const token = useRef(0);
  const playingRef = useRef(false);
  const mounted = useRef(true);
  const gap = useRef<{ timer: ReturnType<typeof setTimeout>; resolve: (value: boolean) => void } | null>(null);
  const recorder = useRef<LocalVoiceRecorderHandle | null>(null);
  const pair = VOWEL_CONTRASTS[pairIndex];

  const stop = useCallback(() => {
    token.current += 1;
    if (gap.current) { clearTimeout(gap.current.timer); gap.current.resolve(false); gap.current = null; }
    recorder.current?.stop();
    if (mounted.current) {
      setPlaying(null);
      if (playingRef.current) setStatus("对比播放已停止，可重新试听。");
    }
    playingRef.current = false;
  }, []);
  useImperativeHandle(ref, () => ({ stop }), [stop]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stop(); };
  }, [stop]);

  async function listen(indices: number[]) {
    onPrepare();
    const request = ++token.current;
    playingRef.current = true;
    for (let index = 0; index < indices.length; index += 1) {
      const sideIndex = indices[index];
      const sound = pair.sides[sideIndex][mode];
      setPlaying(sideIndex);
      setStatus(`正在播放 ${sideIndex === 0 ? "A" : "B"}：${sound}，请听完整音节。`);
      let result: "ended" | "interrupted" | "failed";
      try { result = await playSample(sound, speed); } catch { result = "failed"; }
      if (request !== token.current || !mounted.current) return;
      if (result !== "ended") {
        playingRef.current = false;
        setPlaying(null);
        setStatus(result === "failed" ? "音频未能播放，请检查网络并重试。" : "播放已停止，可重新试听。");
        return;
      }
      if (index < indices.length - 1) {
        setPlaying(null);
        setStatus("停半拍，再比较下一个声音…");
        const continued = await new Promise<boolean>((resolve) => {
          gap.current = { timer: setTimeout(() => { gap.current = null; resolve(true); }, 500), resolve };
        });
        if (!continued || request !== token.current || !mounted.current) return;
      }
    }
    playingRef.current = false;
    setPlaying(null);
    setStatus("示范播放完成。模仿两次，再录下自己，交替回听比较。");
  }

  function handleKeyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, audio, [contenteditable=true]")) return;
    if ((event.key === "Enter" || event.key === " ") && target.closest("button, a[href], summary")) return;
    const key = keyboardShortcutKey(event.key, event.code);
    if (key === "a" || key === "b") { event.preventDefault(); void listen([key === "a" ? 0 : 1]); }
    else if (key === " ") { event.preventDefault(); void listen([0, 1]); }
    else if (event.key === "Escape") { event.preventDefault(); onPrepare(); }
  }

  return <section id="pronunciation-practice" className="vowel-practice" aria-labelledby="vowel-practice-title" data-keyboard-scope="pronunciation" tabIndex={-1} onKeyDown={handleKeyboard}>
    <div className="vowel-practice-heading"><span className="section-kicker">听清差别，再听自己</span><h2 id="vowel-practice-title">嘴唇一变，<br />声音就不一样。</h2><p>先比较示范，再录音回听。不用汉语谐音硬套，也不把“听懂了”当成“已经发音准确”。</p></div>
    <div className="vowel-practice-workspace">
      <div className="vowel-pair-picker" role="group" aria-label="选择元音对比组">{VOWEL_CONTRASTS.map((item, index) => <button type="button" key={item.id} aria-pressed={pairIndex === index} onClick={() => { onPrepare(); setPairIndex(index); setStatus("已切换对比组，先听两边，再跟读。"); }}><strong lang="ko">{item.title}</strong><span>{item.subtitle}</span></button>)}</div>
      <div className="vowel-practice-settings"><div role="group" aria-label="选择对比形式"><button type="button" aria-pressed={mode === "isolated"} onClick={() => { onPrepare(); setMode("isolated"); setStatus("只比较元音本音；ㅇ 在开头不发音。"); }}>先听元音</button><button type="button" aria-pressed={mode === "syllable"} onClick={() => { onPrepare(); setMode("syllable"); setStatus("两边固定同一个辅音 ㄱ，比较后面的元音。"); }}>放进 ㄱ 音节</button></div><div role="group" aria-label="对比播放速度"><button type="button" aria-pressed={speed === 1} onClick={() => { onPrepare(); onSpeedChange(1); }}>标准</button><button type="button" aria-pressed={speed === 0.82} onClick={() => { onPrepare(); onSpeedChange(0.82); }}>慢放</button></div></div>
      <div className="vowel-contrast-cards">{pair.sides.map((side, index) => <button type="button" key={side.letter} className={`vowel-contrast-card ${playing === index ? "is-playing" : ""}`} aria-label={`播放 ${index === 0 ? "A" : "B"}：${side[mode]}`} onClick={() => void listen([index])}><span className="vowel-card-top"><kbd>{index === 0 ? "A" : "B"}</kbd><span>{side.lip === "rounded" ? "圆唇" : "不圆唇"}</span></span><strong lang="ko">{side[mode]}</strong><span className={`lip-cue ${side.lip}`} aria-hidden="true" /><span className="vowel-card-cue">{side.cue}</span><small>{playing === index ? "正在播放…" : "▶ 听完整示范"}</small></button>)}</div>
      <p className="vowel-caution">{pair.caution}</p>
      <div className="vowel-practice-actions"><button type="button" onClick={() => void listen([0, 1])}>顺序听 A → B</button><button type="button" onClick={onPrepare}>停止播放／录音</button><span>聚焦本区：A / B 试听 · 空格顺序听 · Esc 停止</span></div>
      <p className="vowel-playback-status" role="status" aria-live="polite">{status}</p>
      <LocalVoiceRecorder ref={recorder} onPrepare={onPrepare} contextKey={`${pair.id}-${mode}`} />
      <details className="vowel-source-note"><summary>示范音来源与使用边界</summary><p>这里使用网站已有的固定 AI 完整音节音频，不是新增真人录音，也不是把裁切辅音和元音拼接。两侧使用同一播放速度与播放器音量设置；不同音频的实际响度可能略有差异。</p><p>口型提示已按官方资料核对；音频尚未新增母语教师逐条复核。录音回听用于自我比较，不提供自动发音分数或“标准发音”认证。</p><a href={VOWEL_GUIDE_SOURCE} target="_blank" rel="noreferrer">教学依据：国立国语院标准发音法 ↗</a></details>
    </div>
  </section>;
});

export default VowelPractice;
