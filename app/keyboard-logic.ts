/**
 * Returns the physical shortcut key when a browser exposes KeyboardEvent.code.
 * This keeps the learning-game shortcuts usable while a Korean IME is active,
 * where pressing the physical A key reports `event.key === "ㅁ"`.
 */
export function keyboardShortcutKey(key: string, code: string) {
  const normalizedKey = key.toLowerCase();
  if (/^[a-z0-9]$/.test(normalizedKey) || normalizedKey === ";" || normalizedKey === " ") {
    return normalizedKey;
  }

  const imeKey = key === "Process"
    || key === "Unidentified"
    || /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u.test(key);
  if (!imeKey) return normalizedKey;

  const letter = /^Key([A-Z])$/.exec(code)?.[1];
  if (letter) return letter.toLowerCase();

  const digit = /^Digit([0-9])$/.exec(code)?.[1];
  if (digit) return digit;

  if (code === "Semicolon") return ";";
  if (code === "Space") return " ";
  return normalizedKey;
}

/** Standard Korean 두벌식: the physical keys also work with an English IME. */
export const KOREAN_KEY_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
] as const;

export const KOREAN_KEY_MAP: Record<string, string> = {
  Q: "ㅂ", W: "ㅈ", E: "ㄷ", R: "ㄱ", T: "ㅅ", Y: "ㅛ", U: "ㅕ", I: "ㅑ", O: "ㅐ", P: "ㅔ",
  A: "ㅁ", S: "ㄴ", D: "ㅇ", F: "ㄹ", G: "ㅎ", H: "ㅗ", J: "ㅓ", K: "ㅏ", L: "ㅣ",
  Z: "ㅋ", X: "ㅌ", C: "ㅊ", V: "ㅍ", B: "ㅠ", N: "ㅜ", M: "ㅡ",
};

export const KOREAN_SHIFT_MAP: Record<string, string> = {
  Q: "ㅃ", W: "ㅉ", E: "ㄸ", R: "ㄲ", T: "ㅆ", O: "ㅒ", P: "ㅖ",
};

export const COMPOUND_VOWELS: Record<string, string> = {
  "ㅗㅏ": "ㅘ", "ㅗㅐ": "ㅙ", "ㅗㅣ": "ㅚ", "ㅜㅓ": "ㅝ", "ㅜㅔ": "ㅞ", "ㅜㅣ": "ㅟ", "ㅡㅣ": "ㅢ",
};

export function koreanKeyInput(key: string, code: string, shiftKey = false) {
  if (key === "Dead") return null;
  const physical = /^Key([A-Z])$/.exec(code)?.[1];
  if (physical && KOREAN_KEY_MAP[physical]) {
    return { physical, char: (shiftKey && KOREAN_SHIFT_MAP[physical]) || KOREAN_KEY_MAP[physical] };
  }
  // Some browsers omit code but deliver either a Latin key or a Korean jamo.
  const latin = /^[a-z]$/i.test(key) ? key.toUpperCase() : null;
  if (latin && KOREAN_KEY_MAP[latin]) {
    return { physical: latin, char: (shiftKey && KOREAN_SHIFT_MAP[latin]) || KOREAN_KEY_MAP[latin] };
  }
  for (const map of [KOREAN_KEY_MAP, KOREAN_SHIFT_MAP]) {
    const entry = Object.entries(map).find(([, char]) => char === key);
    if (entry) return { physical: entry[0], char: key };
  }
  if (Object.values(COMPOUND_VOWELS).includes(key)) return { physical: "", char: key };
  return null;
}

export function koreanKeyLabel(char: string): string {
  const normal = Object.entries(KOREAN_KEY_MAP).find(([, value]) => value === char);
  if (normal) return normal[0];
  const shifted = Object.entries(KOREAN_SHIFT_MAP).find(([, value]) => value === char);
  if (shifted) return `Shift+${shifted[0]}`;
  const compound = Object.entries(COMPOUND_VOWELS).find(([, value]) => value === char);
  return compound ? [...compound[0]].map(koreanKeyLabel).join(" → ") : char;
}

/** Do not submit ㅗ/ㅜ/ㅡ early when a compound vowel is also an answer choice. */
export function resolveKoreanChoice(previous: string, next: string, choices: readonly string[]) {
  const char = COMPOUND_VOWELS[previous + next] ?? next;
  const exact = choices.includes(char);
  const canExtend = Object.entries(COMPOUND_VOWELS).some(([parts, value]) => parts.startsWith(char) && choices.includes(value));
  return { char, exact, canExtend, submit: exact && !canExtend };
}
