import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { VOWEL_CONTRASTS } from "../app/pronunciation-data.ts";
import { koreanKeyInput } from "../app/keyboard-logic.ts";
import { advanceVowelQuestion, answerVowelQuestion, makeVowelQuestions, missedVowelQuestions, newVowelChallenge, shuffleVowelQuestions, vowelChallengeSummary } from "../app/vowel-challenge-logic.ts";

test("v40 blind listening has 8 balanced, unique questions using existing complete audio", async () => {
  const questions = makeVowelQuestions(() => 0.4);
  assert.equal(questions.length, 8);
  assert.equal(new Set(questions.map(item => item.id)).size, 8);
  for (let pair = 0; pair < 2; pair += 1) {
    for (const mode of ["isolated", "syllable"]) {
      assert.deepEqual(questions.filter(item => item.pairIndex === pair && item.mode === mode).map(item => item.answer).sort(), [0, 1]);
    }
  }
  for (const question of questions) {
    const sound = VOWEL_CONTRASTS[question.pairIndex].sides[question.answer][question.mode];
    const audio = await readFile(new URL(`../public/audio/hangul-natural/s-${sound.codePointAt(0).toString(16)}.mp3`, import.meta.url));
    assert.ok(audio.length > 100);
  }
});

test("v40 shuffle copies input and can produce a different order", () => {
  const questions = makeVowelQuestions(() => 0);
  const original = [...questions];
  assert.notDeepEqual(shuffleVowelQuestions(questions, () => 0), original);
  assert.deepEqual(questions, original);
});

test("v40 cannot answer before successful playback, submit twice or skip unanswered questions", () => {
  const quiz = newVowelChallenge(makeVowelQuestions(() => 0));
  assert.equal(answerVowelQuestion(quiz, 0), quiz);
  assert.equal(advanceVowelQuestion(quiz), quiz);
  const heard = { ...quiz, heard: true };
  assert.equal(answerVowelQuestion(heard, 7), heard);
  const answered = answerVowelQuestion(heard, 0);
  assert.equal(answerVowelQuestion(answered, 1), answered);
  const next = advanceVowelQuestion(answered);
  assert.equal(next.index, 1);
  assert.equal(next.heard, false);
  assert.equal(advanceVowelQuestion(next), next);
});

test("v40 completes exactly once, reports real answers and retries only missed questions", () => {
  const questions = makeVowelQuestions(() => 0.7);
  let state = newVowelChallenge(questions);
  questions.forEach((question, index) => {
    state = answerVowelQuestion({ ...state, heard: true }, index % 2 ? question.answer : 1 - question.answer);
    state = advanceVowelQuestion(state);
  });
  assert.equal(state.phase, "finished");
  assert.equal(state.attempts.length, 8);
  assert.equal(advanceVowelQuestion(state), state);
  assert.equal(answerVowelQuestion(state, 0), state);
  const summary = vowelChallengeSummary(state.attempts);
  assert.equal(summary.reduce((sum, item) => sum + item.total, 0), 8);
  assert.equal(summary.reduce((sum, item) => sum + item.correct, 0), 4);
  const missed = missedVowelQuestions(state.attempts, () => 0);
  assert.equal(missed.length, 4);
  assert.deepEqual(new Set(missed.map(item => item.id)), new Set(questions.filter((_, i) => i % 2 === 0).map(item => item.id)));
  assert.equal(newVowelChallenge(missed, "mistakes").kind, "mistakes");
  assert.deepEqual(missedVowelQuestions(questions.map(question => ({ question, choice: question.answer }))), []);
});

test("v40 Korean keys match both contrasts with English and Korean IME key events", () => {
  for (const [key, char] of [["j", "ㅓ"], ["h", "ㅗ"], ["m", "ㅡ"], ["n", "ㅜ"]]) {
    assert.equal(koreanKeyInput(key, `Key${key.toUpperCase()}`).char, char);
    assert.equal(koreanKeyInput(char, `Key${key.toUpperCase()}`).char, char);
    assert.equal(koreanKeyInput("Process", `Key${key.toUpperCase()}`).char, char);
  }
});

test("v40 challenge owns cancellation and scopes shortcuts without changing mastery", async () => {
  const source = await readFile(new URL("../app/vowel-listening-challenge.tsx", import.meta.url), "utf8");
  const parent = await readFile(new URL("../app/vowel-practice.tsx", import.meta.url), "utf8");
  assert.match(parent, /challenge\.current\?\.stop\(\)/);
  assert.match(parent, /if \(view !== "compare"\) return/);
  assert.match(source, /if \(!alive\.current \|\| request !== token\.current\) return/);
  assert.match(source, /const resumeAdvance = answered && pendingAdvance\.current;\s*onPrepare\(\);\s*pendingAdvance\.current = resumeAdvance/);
  assert.match(source, /if \(alive\.current && request === token\.current && pendingAdvance\.current\) advance\(\)/);
  assert.match(source, /keyboardSectionIndex\(event.code, event.shiftKey\) !== null/);
  assert.match(source, /event\.repeat \|\| event\.metaKey \|\| event\.ctrlKey \|\| event\.altKey/);
  assert.match(source, /if \(isPlaying\.current\) return/);
  assert.match(source, /disabled=\{!state\.heard \|\| playing \|\| Boolean\(attempt\)\}/);
  assert.doesNotMatch(source, /localStorage|recordMistake|recordReview|dailyXp|SpeechSynthesisUtterance/);
});

test("v40 answer highlights and explanations are conditional on a submitted attempt", async () => {
  const source = await readFile(new URL("../app/vowel-listening-challenge.tsx", import.meta.url), "utf8");
  assert.match(source, /className=\{attempt \? index === question\.answer/);
  assert.match(source, /\{attempt && <div className="vowel-challenge-feedback"/);
  assert.doesNotMatch(source, /aria-label=\{[^\n]*question\.answer|data-answer|data-correct/);
  assert.match(source, /setNotice\("正在播放题目声音…"\)/);
});
