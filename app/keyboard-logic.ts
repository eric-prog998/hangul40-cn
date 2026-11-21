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

// Build the reverse index once. Key input and the labels on quiz choices use
// the same mapping, including tense letters and all seven two-key vowels.
const byJamo = new Map<string, { physical: string; label: string }>();
for (const [physical, char] of Object.entries(KOREAN_KEY_MAP)) byJamo.set(char, { physical, label: physical });
for (const [physical, char] of Object.entries(KOREAN_SHIFT_MAP)) byJamo.set(char, { physical, label: "Shift+" + physical });
for (const [parts, char] of Object.entries(COMPOUND_VOWELS)) {
  byJamo.set(char, { physical: "", label: [...parts].map(part => byJamo.get(part)!.label).join(" → ") });
}

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
  const entry = byJamo.get(key);
  return entry ? { physical: entry.physical, char: key } : null;
}

export function koreanKeyLabel(char: string): string {
  return byJamo.get(char)?.label ?? char;
}

/** Do not submit ㅗ/ㅜ/ㅡ early when a compound vowel is also an answer choice. */
export function resolveKoreanChoice(previous: string, next: string, choices: readonly string[]) {
  const char = COMPOUND_VOWELS[previous + next] ?? next;
  const exact = choices.includes(char);
  const canExtend = Object.entries(COMPOUND_VOWELS).some(([parts, value]) => parts.startsWith(char) && choices.includes(value));
  return { char, exact, canExtend, submit: exact && !canExtend };
}

/** Mac-friendly navigation without intercepting system Cmd/Option shortcuts. */
export function keyboardSectionIndex(code: string, shiftKey: boolean) {
  return shiftKey && /^Digit[1-4]$/.test(code) ? Number(code.slice(-1)) : null;
}

/** keyCode 229 also covers browsers reporting compositionend before keydown. */
export function isImeConfirmation(isComposing: boolean, keyCode: number, trackedComposition: boolean) {
  return isComposing || keyCode === 229 || trackedComposition;
}

/** For a non-text learning panel only. Some Korean keyboards emit Process for
 * an ordinary physical letter even though no text composition is in progress. */
export function imeOwnsPanelKey(event: { isComposing: boolean; keyCode: number; key: string; code: string }) {
  return event.isComposing || (event.keyCode === 229 && !(event.key === "Process" && /^Key[A-Z]$/.test(event.code)));
}
