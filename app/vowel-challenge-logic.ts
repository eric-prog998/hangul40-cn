import { VOWEL_CONTRASTS, type VowelPracticeMode } from "./pronunciation-data.ts";

export type VowelQuestion = { id: string; pairIndex: number; mode: VowelPracticeMode; answer: 0 | 1 };
export type VowelAttempt = { question: VowelQuestion; choice: 0 | 1 };
export type VowelChallengeState = {
  phase: "ready" | "quiz" | "finished";
  kind: "full" | "mistakes";
  questions: VowelQuestion[];
  index: number;
  attempts: VowelAttempt[];
  heard: boolean;
};

export function shuffleVowelQuestions(items: readonly VowelQuestion[], random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function makeVowelQuestions(random = Math.random): VowelQuestion[] {
  const questions: VowelQuestion[] = [];
  VOWEL_CONTRASTS.forEach((_, pairIndex) => {
    for (const mode of ["isolated", "syllable"] as const) {
      for (const answer of [0, 1] as const) questions.push({ id: `${pairIndex}-${mode}-${answer}`, pairIndex, mode, answer });
    }
  });
  return shuffleVowelQuestions(questions, random);
}

export function newVowelChallenge(questions: VowelQuestion[] = [], kind: VowelChallengeState["kind"] = "full"): VowelChallengeState {
  return { phase: questions.length ? "quiz" : "ready", kind, questions, index: 0, attempts: [], heard: false };
}

export function answerVowelQuestion(state: VowelChallengeState, choice: number): VowelChallengeState {
  if (state.phase !== "quiz" || !state.heard || state.attempts.length !== state.index || (choice !== 0 && choice !== 1)) return state;
  return { ...state, attempts: [...state.attempts, { question: state.questions[state.index], choice }] };
}

export function advanceVowelQuestion(state: VowelChallengeState): VowelChallengeState {
  if (state.phase !== "quiz" || state.attempts.length !== state.index + 1) return state;
  if (state.index + 1 === state.questions.length) return { ...state, phase: "finished", heard: false };
  return { ...state, index: state.index + 1, heard: false };
}

export function vowelChallengeSummary(attempts: readonly VowelAttempt[]) {
  return VOWEL_CONTRASTS.map((pair, pairIndex) => {
    const matching = attempts.filter(item => item.question.pairIndex === pairIndex);
    return { id: pair.id, title: pair.title, total: matching.length, correct: matching.filter(item => item.choice === item.question.answer).length };
  }).filter(item => item.total > 0);
}

export function missedVowelQuestions(attempts: readonly VowelAttempt[], random = Math.random) {
  return shuffleVowelQuestions(attempts.filter(item => item.choice !== item.question.answer).map(item => item.question), random);
}
