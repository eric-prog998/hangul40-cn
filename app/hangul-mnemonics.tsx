"use client";

import { memo } from "react";
import { CONSONANT_FAMILIES, JAMO_HINTS, VOWEL_RULES } from "./jamo-study-data";

export { JAMO_HINTS };

type Props = {
  activeSet: "consonants" | "vowels";
  onPlaySample: (sample: string) => void;
};

export default memo(function HangulMnemonics({ activeSet, onPlaySample }: Props) {
  return (
    <details className="hangul-mnemonics" data-testid="hangul-mnemonics">
      <summary>
        <span>零基础速记 · 训民正音造字规律图</span>
        <small>{activeSet === "consonants" ? "辅音不用死记：5 个发音器官象形 → 加笔变送气 → 双写变紧音" : "元音不用死记：平地 ㅡ · 站人 ㅣ · 短线方向 + 多一笔变 y 滑音"}</small>
      </summary>
      <div className="hangul-mnemonics-body">
        {activeSet === "consonants" ? (
          <div className="mnemonic-family-grid" aria-label="辅音五大家族造字规律">
            {CONSONANT_FAMILIES.map((family) => (
              <article key={family.organ} className="mnemonic-family-card">
                <div className="mnemonic-family-head">
                  <strong>{family.organ}</strong>
                  <span>{family.origin}</span>
                </div>
                <div className="mnemonic-member-row">
                  {family.members.map((member) => (
                    <button
                      type="button"
                      key={member.char}
                      onClick={() => onPlaySample(member.sample)}
                      aria-label={`${member.char}，示范音节 ${member.sample}，${member.role}`}
                    >
                      <strong lang="ko">{member.char}</strong>
                      <span lang="ko">{member.sample} ▶</span>
                      <small>{member.role}</small>
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mnemonic-vowel-grid" aria-label="元音天地人造字规律">
            <article className="mnemonic-vowel-pillars">
              <strong>两根基准线 + 合成原则</strong>
              <p>韩语元音以 <b>ㅡ（平展双唇）</b> 和 <b>ㅣ（扁唇微笑）</b> 为骨架。记住短线朝向后，所有带两道短线的字母都只是在前面加一个短促的 <b>y</b> 滑音；合体字母（如 <span lang="ko">ㅗ + ㅏ = ㅘ</span>、<span lang="ko">ㅜ + ㅓ = ㅝ</span>）直接从左往右快速滑读。</p>
              <div className="mnemonic-pillar-buttons">
                <button type="button" onClick={() => onPlaySample("으")}><strong lang="ko">ㅡ</strong><span>으 · 平唇不圆 ▶</span></button>
                <button type="button" onClick={() => onPlaySample("이")}><strong lang="ko">ㅣ</strong><span>이 · 扁唇微笑 ▶</span></button>
                <button type="button" onClick={() => onPlaySample("와")}><strong lang="ko">ㅘ</strong><span>ㅗ+ㅏ → 와 ▶</span></button>
                <button type="button" onClick={() => onPlaySample("워")}><strong lang="ko">ㅝ</strong><span>ㅜ+ㅓ → 워 ▶</span></button>
              </div>
            </article>
            {VOWEL_RULES.map((group) => (
              <article key={group.title} className="mnemonic-vowel-card">
                <div className="mnemonic-family-head">
                  <strong>{group.title}</strong>
                  <span>{group.rule}</span>
                </div>
                <div className="mnemonic-pair-list">
                  {group.pairs.map((pair) => (
                    <div key={pair.base} className="mnemonic-pair-row">
                      <button type="button" onClick={() => onPlaySample(pair.baseSample)}>
                        <strong lang="ko">{pair.base}</strong>
                        <span lang="ko">{pair.baseSample} ▶</span>
                      </button>
                      <i aria-hidden="true">+1笔 →</i>
                      <button type="button" onClick={() => onPlaySample(pair.ySample)}>
                        <strong lang="ko">{pair.yChar}</strong>
                        <span lang="ko">{pair.ySample} ▶</span>
                      </button>
                      <small>{pair.tip}</small>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </details>
  );
});
