"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { COMPOUND_VOWELS, koreanKeyInput, koreanKeyLabel } from "./keyboard-logic";
import KoreanKeyboard from "./korean-keyboard";
import "./letter-keyboard-lab.css";

type Props = { onPlay: (char: string, name: boolean) => void; onPrepare: () => void };

export default function LetterKeyboardLab({ onPlay, onPrepare }: Props) {
  const [selected, setSelected] = useState("ㄱ");
  const [activeKey, setActiveKey] = useState("");
  const [shifted, setShifted] = useState(false);
  const [names, setNames] = useState(true);
  const prefix = useRef({ char: "", at: 0 });
  const panel = useRef<HTMLDivElement>(null);

  function choose(char: string, physical: string) {
    const now = Date.now();
    const combined = now - prefix.current.at < 1500 ? COMPOUND_VOWELS[prefix.current.char + char] : undefined;
    const next = combined || char;
    prefix.current = { char: combined ? "" : char, at: now };
    setSelected(next);
    setActiveKey(physical);
    panel.current?.focus({ preventScroll: true });
    onPlay(next, names);
  }
  function clear() { prefix.current = { char: "", at: 0 }; setActiveKey(""); }
  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true]")) return;
    if ((event.key === " " || event.key === "Enter") && target.closest("button, summary, a[href]")) return;
    if (event.key === "Shift") { setShifted(true); return; }
    const input = koreanKeyInput(event.key, event.code, event.shiftKey);
    if (input) { event.preventDefault(); setShifted(event.shiftKey); choose(input.char, input.physical); }
    else if (event.key === " " || event.key === "Enter" || event.key === "F8") { event.preventDefault(); clear(); onPlay(selected, names); }
    else if (event.key === "Backspace" || event.key === "Escape") { event.preventDefault(); clear(); onPrepare(); }
    else if (event.code === "Digit1" && !event.shiftKey) { event.preventDefault(); setNames(true); clear(); }
    else if (event.code === "Digit2" && !event.shiftKey) { event.preventDefault(); setNames(false); clear(); }
  }

  return <div id="letter-keyboard-console" className="letter-keyboard-lab" data-keyboard-scope="letters" ref={panel} tabIndex={0} aria-label="40 音韩文键盘点读" onFocusCapture={onPrepare} onKeyDown={handleKey} onKeyUp={(event) => { if (event.key === "Shift") setShifted(false); }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { clear(); setShifted(false); } }}>
    <div className="letter-keyboard-intro"><div><h3>按下韩文键，立即点读</h3><p>Mac 韩语双拼（두벌식）键位；英文输入法也可用。先按 <kbd>Shift + 2</kbd> 到这里，再直接打字。</p></div><button type="button" onClick={() => panel.current?.focus()}>开始键盘点读</button></div>
    <div className="letter-keyboard-result"><button type="button" onClick={() => onPlay(selected, names)} aria-label={`重播 ${selected}`}><strong lang="ko">{selected}</strong><kbd>{koreanKeyLabel(selected)}</kbd><span>再听一次 · 空格</span></button><div><div className="letter-keyboard-modes" role="group" aria-label="辅音点读方式"><button type="button" aria-pressed={names} onClick={() => { setNames(true); clear(); panel.current?.focus(); }}><kbd>1</kbd> 辅音名称</button><button type="button" aria-pressed={!names} onClick={() => { setNames(false); clear(); panel.current?.focus(); }}><kbd>2</kbd> 真人起音</button></div><p role="status">当前：<span lang="ko">{selected}</span> · {names ? "辅音读正式名称，元音读元音" : "辅音播放起音片段，ㅇ 初声无声"}。每次按键只播放所选的一种音频。</p><p>紧音用 Shift，例如 <kbd>Shift + R</kbd> = ㄲ。复合元音快速连按两键，例如 <kbd>H → K</kbd> = ㅘ；⌫ 清除组合，Esc 停止。</p></div></div>
    <KoreanKeyboard activeKey={activeKey} shifted={shifted} onKey={choose} onShift={() => setShifted((value) => !value)} onClear={clear} />
  </div>;
}
