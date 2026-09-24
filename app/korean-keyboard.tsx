"use client";

import { KOREAN_KEY_MAP, KOREAN_KEY_ROWS, KOREAN_SHIFT_MAP } from "./keyboard-logic";

type Props = {
  activeKey: string;
  shifted: boolean;
  onKey: (char: string, physical: string) => void;
  onShift: () => void;
  onClear: () => void;
};

export default function KoreanKeyboard({ activeKey, shifted, onKey, onShift, onClear }: Props) {
  return <details className="hangul-keyboard">
    <summary>韩文双拼键位表 <span>두벌식 · 按键同步亮起</span></summary>
    <div className="hangul-keyboard-scroll" role="group" aria-label="韩文双拼键盘">
      {KOREAN_KEY_ROWS.map((row, index) => <div className="hangul-key-row" key={index}>
        {row.map((physical) => {
          const char = shifted && KOREAN_SHIFT_MAP[physical] || KOREAN_KEY_MAP[physical];
          return <button type="button" key={physical} className={activeKey === physical ? "pressed" : ""} aria-label={`${physical}，${char}`} onClick={() => onKey(char, physical)}>
            <kbd>{physical}</kbd><strong lang="ko">{char}</strong>{KOREAN_SHIFT_MAP[physical] && <small lang="ko">{shifted ? KOREAN_KEY_MAP[physical] : KOREAN_SHIFT_MAP[physical]}</small>}
          </button>;
        })}
      </div>)}
      <div className="hangul-key-tools"><button type="button" aria-pressed={shifted} onClick={onShift}>Shift · 紧音 / ㅒ / ㅖ</button><button type="button" onClick={onClear}>⌫ 清除待选</button></div>
    </div>
    <p>紧音：按住 Shift 再按对应键。复合元音连续按两键，例如 H → K = ㅘ。Caps Lock 不改变韩文字母。</p>
  </details>;
}
