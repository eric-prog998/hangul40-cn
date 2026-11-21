"use client";
import { useState } from "react";
import "./letter-audio-actions.css";

type Props = {
  char: string;
  sample: string;
  consonant?: { name: string; id: string; initialSilent?: boolean };
  onName: () => void;
  onSample: () => void;
  onOnset: () => void;
  onReport: (id: string) => void;
};

/** Only the control explicitly selected plays. A report always names the last clip on this card. */
export default function LetterAudioActions({ char, sample, consonant, onName, onSample, onOnset, onReport }: Props) {
  const [lastClip, setLastClip] = useState<{ id: string; label: string } | null>(null);
  const sampleId = `syllable-${sample.codePointAt(0)!.toString(16)}`;
  function play(id: string, label: string, action: () => void) {
    setLastClip({ id, label }); action();
  }
  return <div className={`letter-audio-actions${consonant ? "" : " vowel-audio"}`} onKeyDown={event => {
    if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
  }}>
    {consonant && <button type="button" className="name-audio" onClick={() => play(`name-${consonant.id}`, `名称 ${consonant.name}`, onName)}>
      <span>听名称 · AI</span><strong lang="ko">{consonant.name}<i aria-hidden="true">▶</i></strong>
    </button>}
    <button type="button" className="syllable-audio" onClick={() => play(sampleId, `${consonant ? "音节" : "元音"} ${sample}`, onSample)}>
      <span>{consonant ? "听音节 · AI" : "听元音 · AI"}</span><strong lang="ko">{sample}<i aria-hidden="true">▶</i></strong>
    </button>
    {consonant && (consonant.initialSilent
      ? <p className="silent-initial">ㅇ 在开头不发声；听 아，听到的只有元音 ㅏ。</p>
      : <details className="letter-onset-detail"><summary>单听起音</summary>
        <button type="button" className="onset-audio" onClick={() => play(`onset-${consonant.id}`, `${char} 起音`, onOnset)}>
          <span>听起音 · 真人片段</span><strong lang="ko">{char}<i aria-hidden="true">▶</i></strong>
        </button><small>从原词截取，只播一次；跟读请用上面的完整音节。</small>
      </details>)}
    {lastClip && <a className="letter-audio-feedback" href="#audio-guide" onClick={() => onReport(lastClip.id)}>反馈刚听的{lastClip.label}</a>}
  </div>;
}
