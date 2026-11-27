"use client";

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import LocalVoiceRecorder, { type LocalVoiceRecorderHandle } from "./local-voice-recorder";
import { imeOwnsPanelKey, keyboardShortcutKey } from "./keyboard-logic";
import type { AutoAdvanceDelay } from "./learning-settings";
import { CONSONANT_CONTRAST_FAMILIES, buildConsonantContrastQuestions, type ChallengeQuestion } from "./jamo-study-data";

export type ConsonantContrastLabHandle = {
  stop: () => void;
};

type Props = {
  visible?: boolean;
  onPrepare: () => void;
  playSample: (text: string, speed: 1 | 0.82) => Promise<"ended" | "interrupted" | "failed">;
  speed: 1 | 0.82;
  onSpeedChange: (speed: 1 | 0.82) => void;
  autoAdvanceMs: AutoAdvanceDelay;
};

const ConsonantContrastLab = memo(forwardRef<ConsonantContrastLabHandle, Props>(function ConsonantContrastLab(
  { visible = true, onPrepare, playSample, speed, onSpeedChange, autoAdvanceMs },
  ref,
) {
  const [stage, setStage] = useState<"idle" | "quiz" | "finished">("idle");
  const [questions, setQuestions] = useState<ChallengeQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState("点击上方任一音节先听高低与气流差别，或开启 8 题盲听自测。");
  const [recordFamilyId, setRecordFamilyId] = useState(CONSONANT_CONTRAST_FAMILIES[0].id);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<LocalVoiceRecorderHandle | null>(null);
  const tokenRef = useRef(0);
  const mountedRef = useRef(true);
  const playingRef = useRef(false);
  const answeredRef = useRef(false);
  const autoAdvanceRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    tokenRef.current += 1;
    const hadPending = autoAdvanceRef.current;
    autoAdvanceRef.current = false;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    recorderRef.current?.stop();
    if (mountedRef.current) {
      setPlaying(false);
      if (hadPending) setNotice("自动下一题已暂停；可按 Enter 继续。");
      else if (playingRef.current) setNotice("示范播放已停止，按空格可重听本题。");
    }
    playingRef.current = false;
  }, []);

  useImperativeHandle(ref, () => ({ stop }), [stop]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stop();
    };
  }, [stop]);

  useEffect(() => {
    stop();
  }, [autoAdvanceMs, stop]);

  const sFamily = CONSONANT_CONTRAST_FAMILIES[4];
  const currentQuestion = questions[index];
  const currentFamily = currentQuestion ? CONSONANT_CONTRAST_FAMILIES[currentQuestion.familyIndex] : null;
  const targetItem = currentFamily && currentQuestion ? currentFamily.items[currentQuestion.targetIndex] : null;

  async function playClip(text: string, announceDone?: string) {
    onPrepare();
    const serial = ++tokenRef.current;
    playingRef.current = true;
    setPlaying(true);
    let result: "ended" | "interrupted" | "failed";
    try {
      result = await playSample(text, speed);
    } catch {
      result = "failed";
    }
    if (!mountedRef.current || serial !== tokenRef.current) return result;
    playingRef.current = false;
    setPlaying(false);
    if (announceDone && result === "ended") setNotice(announceDone);
    else if (result === "failed") setNotice("音频未能播放，请重试。");
    return result;
  }

  function scheduleAutoAdvance() {
    if (autoAdvanceMs === 0) return;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    const serial = ++tokenRef.current;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (mountedRef.current && serial === tokenRef.current && autoAdvanceRef.current) advanceQuestion();
    }, autoAdvanceMs);
  }

  async function playQuizPrompt(question: ChallengeQuestion, preserveAutoAdvance = false, alreadyAnswered = false) {
    const family = CONSONANT_CONTRAST_FAMILIES[question.familyIndex];
    const target = family.items[question.targetIndex];
    onPrepare();
    autoAdvanceRef.current = preserveAutoAdvance;
    const serial = ++tokenRef.current;
    playingRef.current = true;
    setPlaying(true);
    setNotice("正在播放题目音节，请留意起首音高与送气量…");
    let result: "ended" | "interrupted" | "failed";
    try {
      result = await playSample(target.text, speed);
    } catch {
      result = "failed";
    }
    if (!mountedRef.current || serial !== tokenRef.current) return;
    playingRef.current = false;
    setPlaying(false);
    if (result === "ended") {
      setReady(true);
      if (alreadyAnswered && preserveAutoAdvance) {
        setNotice("已重听本题示范，稍后自动下一题；按 Esc 暂停，按 Enter 立即下一题。");
        scheduleAutoAdvance();
      } else {
        setNotice(alreadyAnswered ? "已重听本题示范。" : "示范已播完，请判断刚才是松音、紧音还是送气音。");
      }
    } else {
      autoAdvanceRef.current = false;
      setNotice(result === "failed" ? "音频未能完整播放，请按空格重听后再作答。" : "播放已中断，请按空格完整听完再选。");
    }
  }

  function startChallenge() {
    const nextQuestions = buildConsonantContrastQuestions();
    answeredRef.current = false;
    setQuestions(nextQuestions);
    setIndex(0);
    setPicked(null);
    setScore(0);
    setReady(false);
    setStage("quiz");
    panelRef.current?.focus({ preventScroll: true });
    void playQuizPrompt(nextQuestions[0], false, false);
  }

  function advanceQuestion() {
    if (stage !== "quiz" || !answeredRef.current) return;
    onPrepare();
    answeredRef.current = false;
    autoAdvanceRef.current = false;
    if (index + 1 >= questions.length) {
      setStage("finished");
      setNotice("完成一轮松·紧·送气盲听。结合下方自录回听效果更好。");
      return;
    }
    const nextIdx = index + 1;
    setIndex(nextIdx);
    setPicked(null);
    setReady(false);
    void playQuizPrompt(questions[nextIdx], false, false);
  }

  function chooseOption(choiceIndex: number) {
    if (stage !== "quiz" || answeredRef.current || !ready || !currentFamily || !currentQuestion) return;
    if (choiceIndex < 0 || choiceIndex >= currentFamily.items.length) return;
    onPrepare();
    answeredRef.current = true;
    setPicked(choiceIndex);
    const correct = choiceIndex === currentQuestion.targetIndex;
    if (correct) setScore((prev) => prev + 1);
    panelRef.current?.focus({ preventScroll: true });
    if (autoAdvanceMs === 0) {
      setNotice("已关闭自动下一题；看清音高与气流提示后按 Enter 继续。");
      return;
    }
    setNotice(`${autoAdvanceMs / 1000} 秒后自动下一题；按 Esc 暂停，按 Enter 立即下一题。`);
    autoAdvanceRef.current = true;
    scheduleAutoAdvance();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || imeOwnsPanelKey(event.nativeEvent) || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, audio, [contenteditable=true]")) return;
    if ((event.key === "Enter" || event.key === " ") && target.closest("button, a[href], summary")) return;
    const key = keyboardShortcutKey(event.key, event.code);
    if (stage === "quiz") {
      if ((key === " " || event.key === "F8") && currentQuestion) {
        event.preventDefault();
        void playQuizPrompt(currentQuestion, answeredRef.current && autoAdvanceRef.current, answeredRef.current);
      } else if (event.key === "Escape") {
        event.preventDefault();
        stop();
      } else if (event.key === "Enter" && answeredRef.current) {
        event.preventDefault();
        advanceQuestion();
      } else if (!answeredRef.current && ready && /^[1-3]$/.test(key)) {
        event.preventDefault();
        chooseOption(Number(key) - 1);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      startChallenge();
    }
  }

  const recordFamily = CONSONANT_CONTRAST_FAMILIES.find((item) => item.id === recordFamilyId) ?? CONSONANT_CONTRAST_FAMILIES[0];

  return (
    <div className="compare-lab" ref={panelRef} tabIndex={-1} data-testid="consonant-contrast-lab" onKeyDown={handleKeyDown}>
      <article className="compare-pair-row" aria-label="齿间擦音松紧对比">
        <div>
          <h3 lang="ko">{sFamily.title}</h3>
          <p>{sFamily.cue}</p>
        </div>
        <div className="compare-pair-buttons">
          {sFamily.items.map((item, idx) => (
            <button
              key={item.text}
              type="button"
              className={idx === 0 ? "tone-0" : "tone-1"}
              onClick={() => void playClip(item.text, `刚才播放：${item.text}（${item.acousticTip}）`)}
            >
              <strong lang="ko">{item.text}</strong>
              <span>{item.label}</span>
              <i aria-hidden="true">▶</i>
            </button>
          ))}
        </div>
      </article>

      <div className="compare-workbench">
        <section className="compare-blind-card" aria-labelledby="compare-blind-title">
          <div className="compare-blind-head">
            <div>
              <span className="compare-badge">耳朵实战 · 8 题</span>
              <h3 id="compare-blind-title">松·紧·送气盲听挑战</h3>
            </div>
            <div className="compare-speed-group" role="group" aria-label="辅音盲听播放速度">
              <button type="button" aria-pressed={speed === 1} onClick={() => { onPrepare(); onSpeedChange(1); }}>标准</button>
              <button type="button" aria-pressed={speed === 0.82} onClick={() => { onPrepare(); onSpeedChange(0.82); }}>慢放</button>
            </div>
          </div>

          {stage === "idle" && (
            <div className="compare-blind-idle">
              <p>对中国学习者最有效的听辨顺序：<b>① 先听起首音调是低平（松音）还是高平（紧音/送气）；② 再听高音里有没有强送气</b>。完整听完题目后开放作答。</p>
              <button type="button" className="compare-primary-btn" onClick={startChallenge}>
                开始 8 题盲听 <kbd>Enter</kbd>
              </button>
            </div>
          )}

          {stage === "quiz" && currentFamily && targetItem && (
            <div className="compare-blind-quiz">
              <div className="compare-blind-progress">
                <span>第 {index + 1} / {questions.length} 题 · {currentFamily.title}</span>
                <strong>已对 {score} 题</strong>
              </div>
              <button
                type="button"
                className="compare-replay-btn"
                disabled={playing}
                onClick={() => void playQuizPrompt(currentQuestion, picked !== null && autoAdvanceRef.current, picked !== null)}
              >
                <span aria-hidden="true">▶</span>
                <strong>{picked === null ? (playing ? "正在播放…" : "再听一次本题") : `${targetItem.text}（${targetItem.label}）`}</strong>
                <small>空格 / F8 重听 · 1–{currentFamily.items.length} 选择</small>
              </button>
              <div className={`compare-choice-grid cols-${currentFamily.items.length}`} role="group" aria-label="判断松音、紧音或送气音">
                {currentFamily.items.map((item, choiceIdx) => {
                  const answered = picked !== null;
                  const isTarget = choiceIdx === currentQuestion.targetIndex;
                  const isWrongPick = answered && picked === choiceIdx && !isTarget;
                  return (
                    <button
                      type="button"
                      key={item.text}
                      disabled={answered || !ready}
                      className={`${answered && isTarget ? "is-correct" : ""} ${isWrongPick ? "is-wrong" : ""}`}
                      onClick={() => chooseOption(choiceIdx)}
                    >
                      <kbd>{choiceIdx + 1}</kbd>
                      <strong lang="ko">{item.text}</strong>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
              {picked !== null && (
                <div className="compare-blind-feedback" role="status">
                  <strong>{picked === currentQuestion.targetIndex ? "听准了！" : `刚才播的是 ${targetItem.text}（${targetItem.label}）`}</strong>
                  <p>{targetItem.acousticTip}</p>
                  <button type="button" className="compare-next-btn" onClick={advanceQuestion}>
                    {index + 1 >= questions.length ? "查看本轮小结" : "下一题"} <kbd>Enter</kbd>
                  </button>
                </div>
              )}
            </div>
          )}

          {stage === "finished" && (
            <div className="compare-blind-finish">
              <strong>{score} / {questions.length}</strong>
              <p>{score >= 6 ? "你已经能抓住「松音低柔、紧音高紧、送气高且喷气」的核心差别了！" : "松音和送气音在词首都有轻微气流，下一轮试着重点听「音调高低」：低平选松音，高平再分紧音和送气。"}</p>
              <button type="button" className="compare-primary-btn" onClick={startChallenge}>
                再测一轮 8 题 <kbd>Enter</kbd>
              </button>
            </div>
          )}

          <p className="compare-blind-status" role="status" aria-live="polite">{notice}</p>
        </section>

        <section className="compare-recorder-card" aria-labelledby="compare-recorder-title">
          <div className="compare-recorder-head">
            <span className="compare-badge">自录回听 · 不上传</span>
            <h3 id="compare-recorder-title">录一组自己的松·紧·送气</h3>
            <p>选一组连读一遍（如「가 — 까 — 카」），录下后与上方示范交替回听，检查自己的松音有没有压低放松、紧音有没有收紧不漏气。</p>
            <label className="compare-recorder-select">
              <span>当前跟读组</span>
              <select
                lang="ko"
                value={recordFamilyId}
                onChange={(event) => {
                  onPrepare();
                  setRecordFamilyId(event.target.value);
                }}
              >
                {CONSONANT_CONTRAST_FAMILIES.map((family) => (
                  <option key={family.id} value={family.id}>{family.title}</option>
                ))}
              </select>
            </label>
          </div>
          {visible && <LocalVoiceRecorder ref={recorderRef} onPrepare={onPrepare} contextKey={`consonant-${recordFamily.id}`} />}
        </section>
      </div>
    </div>
  );
}));

export default ConsonantContrastLab;
