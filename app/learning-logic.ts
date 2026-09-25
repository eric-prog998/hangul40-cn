export const INITIAL_ORDER = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
export const VOWEL_ORDER = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
export const FINAL_ORDER = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

const vowelSoundEquivalenceGroups = [
  new Set(["ㅐ", "ㅔ"]),
  new Set(["ㅒ", "ㅖ"]),
  new Set(["ㅙ", "ㅚ", "ㅞ"]),
];

const bareConsonantConfusionGroups = [
  new Set(["ㄱ", "ㄲ", "ㅋ"]),
  new Set(["ㄷ", "ㄸ", "ㅌ"]),
  new Set(["ㅂ", "ㅃ", "ㅍ"]),
  new Set(["ㅈ", "ㅉ", "ㅊ"]),
  new Set(["ㅅ", "ㅆ"]),
];

const recordedBlendEquivalenceGroups = [
  ["긔", "기"], ["끠", "끼"], ["늬", "니"], ["띄", "띠"], ["믜", "미"], ["븨", "비"],
  ["쇼", "쑈"], ["씌", "씨"], ["저", "져"], ["즤", "지"], ["쯰", "찌"], ["킈", "키"],
  ["틔", "티"], ["페", "폐"], ["희", "히"],
].map((group) => new Set(group));

const standardBlendEquivalenceGroups = [["쩌", "쪄"], ["처", "쳐"]].map((group) => new Set(group));

const disfavoredBlendTargets = new Set(["쑈", "져", "쪄", "쳐", "폐"]);

export function makeSyllable(initial: string, vowel: string) {
  const initialIndex = INITIAL_ORDER.indexOf(initial);
  const vowelIndex = VOWEL_ORDER.indexOf(vowel);
  if (initialIndex < 0 || vowelIndex < 0) return "";
  return String.fromCharCode(0xac00 + (initialIndex * 21 + vowelIndex) * 28);
}

export function decomposeHangulSyllable(syllable: string) {
  if ([...syllable].length !== 1) return null;
  const codePoint = syllable.codePointAt(0);
  if (codePoint === undefined || codePoint < 0xac00 || codePoint > 0xd7a3) return null;
  const offset = codePoint - 0xac00;
  const initial = INITIAL_ORDER[Math.floor(offset / (21 * 28))];
  const vowel = VOWEL_ORDER[Math.floor((offset % (21 * 28)) / 28)];
  const final = FINAL_ORDER[offset % 28] || null;
  return initial && vowel ? { initial, vowel, final } : null;
}

export function decomposeHangulText(text: string) {
  return [...text].flatMap((syllable) => {
    const parts = decomposeHangulSyllable(syllable);
    return parts ? [{ syllable, ...parts }] : [];
  });
}

export function hasOnlyOpenHangulSyllables(text: string) {
  const syllables = [...text]
    .map(decomposeHangulSyllable)
    .filter((parts): parts is NonNullable<ReturnType<typeof decomposeHangulSyllable>> => parts !== null);
  return syllables.length > 0 && syllables.every((parts) => parts.final === null);
}

export function usesOnlyOpenSyllablesFromSets(text: string, initials: string[], vowels: string[]) {
  const syllables = [...text]
    .map(decomposeHangulSyllable)
    .filter((parts): parts is NonNullable<ReturnType<typeof decomposeHangulSyllable>> => parts !== null);
  return syllables.length > 0 && syllables.every((parts) => parts.final === null
    && initials.includes(parts.initial)
    && vowels.includes(parts.vowel));
}

export function areBlindEquivalentVowels(left: string, right: string) {
  return left === right || vowelSoundEquivalenceGroups.some((group) => group.has(left) && group.has(right));
}

export function areBareConsonantsConfusable(left: string, right: string) {
  return left === right || bareConsonantConfusionGroups.some((group) => group.has(left) && group.has(right));
}

export function areBlindLettersConfusable(left: string, right: string) {
  if (left === right) return true;
  const bothConsonants = INITIAL_ORDER.includes(left) && INITIAL_ORDER.includes(right);
  return bothConsonants ? areBareConsonantsConfusable(left, right) : areBlindEquivalentVowels(left, right);
}

export function selectFairBlindLetters(candidates: string[], limit: number) {
  const selected: string[] = [];
  for (const candidate of candidates) {
    if (selected.includes(candidate) || selected.some((item) => areBlindLettersConfusable(item, candidate))) continue;
    selected.push(candidate);
    if (selected.length === limit) break;
  }
  return selected;
}

export function areBlendPartsEquivalent(leftInitial: string, leftVowel: string, rightInitial: string, rightVowel: string) {
  if (leftInitial === rightInitial && leftVowel === rightVowel) return true;
  if (leftInitial === rightInitial && areBlindEquivalentVowels(leftVowel, rightVowel)) return true;
  if (leftInitial === rightInitial && leftInitial !== "ㅇ" && new Set([leftVowel, rightVowel]).size === 2
    && [leftVowel, rightVowel].every((vowel) => vowel === "ㅢ" || vowel === "ㅣ")) return true;
  const left = makeSyllable(leftInitial, leftVowel);
  const right = makeSyllable(rightInitial, rightVowel);
  return [...recordedBlendEquivalenceGroups, ...standardBlendEquivalenceGroups]
    .some((group) => group.has(left) && group.has(right));
}

export function isFairBlendTarget(initial: string, vowel: string) {
  if (initial !== "ㅇ" && vowel === "ㅢ") return false;
  return !disfavoredBlendTargets.has(makeSyllable(initial, vowel));
}

export function fairBlendInitialCandidates(targetInitial: string, targetVowel: string, candidates: string[]) {
  return candidates.filter((candidate) => !areBlendPartsEquivalent(targetInitial, targetVowel, candidate, targetVowel));
}

export function fairBlendVowelCandidates(targetInitial: string, targetVowel: string, candidates: string[]) {
  return candidates.filter((candidate) => !areBlendPartsEquivalent(targetInitial, targetVowel, targetInitial, candidate));
}
