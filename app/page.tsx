"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import phraseData from "../data/phrases.json";
import consonantNameData from "../data/consonant-names.json";
import typingRouteData from "../data/typing-routes.json";
import {
  INITIAL_ORDER as initialOrder,
  VOWEL_ORDER as vowelOrder,
  areBlindLettersConfusable,
  decomposeHangulText,
  decomposeHangulSyllable,
  fairBlendInitialCandidates,
  fairBlendVowelCandidates,
  isFairBlendTarget,
  makeSyllable,
  selectFairBlindLetters,
  usesOnlyOpenSyllablesFromSets,
} from "./learning-logic";
import {
  LEGACY_MASTERY_SNAPSHOT_KEY,
  PROGRESS_CHECKPOINT_BACKUP_KEY,
  PROGRESS_CHECKPOINT_KEY,
  PROGRESS_EPOCH_LOCK_NAME,
  PROGRESS_EPOCH_META_KEY,
  PROGRESS_EPOCH_NAMESPACE_PREFIX,
  PROGRESS_LEDGER_KEY_PREFIX,
  PROGRESS_LEDGER_SEAL_KEY_PREFIX,
  applyProgressLedgerOperation,
  compareProgressClocks,
  compactProgressLedgers,
  createProgressLedger,
  createProgressLedgerSeal,
  createProgressStatsDelta,
  finalizeProgressCheckpoint,
  isProgressLedgerId,
  mergeLegacyProgressStatsHighWater,
  mergeProgress,
  nextProgressLedgerClock,
  parseLegacyProgressStats,
  parseProgressEpochBaseline,
  parseProgressCheckpoint,
  parseProgressEpochMeta,
  parseProgressLedger,
  parseProgressLedgerSeal,
  isProgressEpochMetaTransitionAllowed,
  progressCheckpointClock,
  progressEpochBaselineBackupKey,
  progressEpochBaselineKey,
  progressEpochCheckpointBackupKey,
  progressEpochCheckpointKey,
  progressEpochLedgerIdFromKey,
  progressEpochLedgerIdFromSealKey,
  progressEpochLedgerKey,
  progressEpochLedgerSealKey,
  progressEpochRollbackGuardKey,
  progressLedgerIdFromKey,
  progressLedgerIdFromSealKey,
  serializeProgressEpochBaseline,
  serializeProgressCheckpoint,
  serializeProgressEpochMeta,
  serializeProgressLedger,
  serializeProgressLedgerSeal,
  type ProgressCheckpoint,
  type ProgressClock,
  type ProgressLedger,
  type ProgressLedgerOperation,
  type ProgressLedgerSeal,
  type ProgressSnapshot,
  type ProgressEpochMeta,
} from "./progress-ledger";
import {
  calculateTypingAccuracy,
  calculateTypingCpm,
  formatTypingTime,
  isTypingAnswerCorrect,
  mergeTypingBestRecords,
  normalizeTypingInput,
  parseTypingBestRecords,
  typingBestRecordsCover,
  typingErrorDistance,
  type TypingBestRecord,
} from "./typing-logic";
import { keyboardShortcutKey, koreanKeyInput, koreanKeyLabel, resolveKoreanChoice } from "./keyboard-logic";
import KoreanKeyboard from "./korean-keyboard";
import VowelPractice, { type VowelPracticeHandle } from "./vowel-practice";
import DailyReview, { type DailyReviewHandle } from "./daily-review";
import { useDailyReview } from "./use-daily-review";
import BatchimLesson, { type BatchimLessonHandle } from "./batchim-lesson";
import { millisecondsUntilNextLocalMidnight } from "./date-logic";

type Letter = {
  char: string;
  roman: string;
  hint: string;
  sample: string;
  group: string;
};

type PendingProgressOperation = {
  generation: number;
  operation: ProgressLedgerOperation;
};

type GameStats = {
  date: string;
  dailyXp: number;
  totalXp: number;
  bestCombo: number;
  games: number;
  mistakes: Record<string, number>;
  phraseMistakes: Record<string, number>;
  history: Record<string, number>;
};

type PhraseItem = {
  id: string;
  type: "word" | "sentence";
  korean: string;
  chinese: string;
  roman: string;
  group: string;
};

type TypingRoute = {
  id: string;
  name: string;
  korean: string;
  description: string;
  theme: "coral" | "lime" | "blue" | "purple";
  wordIds: string[];
};

type TypingPhase = "idle" | "typing" | "paused" | "finished";

type ConsonantName = {
  char: string;
  name: string;
  id: string;
  ipa: string;
  audioFile: string | null;
  audioKind: "human-consonant-onset" | "silent-initial";
  sourceWord?: string;
  sourcePage?: string;
  initialSilent?: boolean;
};

type MatchCard = {
  uid: string;
  letter: Letter;
  type: "char" | "sound";
};

type BlendQuestion = {
  initial: string;
  vowel: string;
  syllable: string;
};

type LetterLesson = "all" | "core-vowels" | "basic-consonants" | "advanced-consonants" | "advanced-vowels";
type BlendScope = "all" | "starter";
type PhraseReadFilter = "all" | "ready";
type PhraseReadingLevel = "ready" | "batchim" | "new";

type BlockExample = {
  id: string;
  syllable: string;
  chinese: string;
  note: string;
};

type AudioPlaybackResult = "ended" | "interrupted" | "failed";
type AudioActivity = "game" | "phrase-quiz" | "phrase-library" | "reference";

const consonants: Letter[] = [
  { char: "ㄱ", roman: "g / k", hint: "不要按汉语拼音 g / k 硬套；词首放松，与 ㄲ、ㅋ 成组比较", sample: "가", group: "松音" },
  { char: "ㄴ", roman: "n", hint: "像汉语 n，舌尖贴上齿龈", sample: "나", group: "基础音" },
  { char: "ㄷ", roman: "d / t", hint: "不是汉语拼音 d / t 的一一对应；舌尖放松，与 ㄸ、ㅌ 成组比较", sample: "다", group: "松音" },
  { char: "ㄹ", roman: "r / l", hint: "音节开头舌尖只轻弹一下 [ɾ]，天然很短；作收音通常是 [l]。不要把它拉长成“拉”", sample: "라", group: "易错音" },
  { char: "ㅁ", roman: "m", hint: "像汉语 m，双唇闭合后放开", sample: "마", group: "基础音" },
  { char: "ㅂ", roman: "b / p", hint: "不是汉语拼音 b / p 的一一对应；双唇放松，与 ㅃ、ㅍ 成组比较", sample: "바", group: "松音" },
  { char: "ㅅ", roman: "s", hint: "像 s；遇到 ㅣ、ㅑ 等时会更接近“西”的开头", sample: "사", group: "易错音" },
  { char: "ㅇ", roman: "— / ng", hint: "作初声不发音；例如 이 的起始处没有辅音，听到的是 ㅣ；作收音才读 [ŋ]", sample: "아", group: "位置音" },
  { char: "ㅈ", roman: "j", hint: "舌尖不卷、发音位置靠前；不要按拼音 j 硬套，与 ㅉ、ㅊ 成组比较", sample: "자", group: "松音" },
  { char: "ㅊ", roman: "ch", hint: "比 ㅈ 送气更强，纸片会明显被吹动", sample: "차", group: "送气音" },
  { char: "ㅋ", roman: "k", hint: "强送气的 k，重点是气流，不是更大声", sample: "카", group: "送气音" },
  { char: "ㅌ", roman: "t", hint: "强送气的 t，舌尖放开时带一股气", sample: "타", group: "送气音" },
  { char: "ㅍ", roman: "p", hint: "强送气的 p，双唇打开时吹动纸片", sample: "파", group: "送气音" },
  { char: "ㅎ", roman: "h", hint: "像轻柔的 h，气流从喉咙通过", sample: "하", group: "基础音" },
  { char: "ㄲ", roman: "kk", hint: "喉部收紧，爆破前有短暂闭塞，几乎不送气；不是两个 ㄱ", sample: "까", group: "紧音" },
  { char: "ㄸ", roman: "tt", hint: "舌位像 ㄷ，爆破前短暂闭塞，喉部更紧、爆发更干脆", sample: "따", group: "紧音" },
  { char: "ㅃ", roman: "pp", hint: "双唇先绷紧再打开，短促而不送气", sample: "빠", group: "紧音" },
  { char: "ㅆ", roman: "ss", hint: "比 ㅅ 更紧更长，齿缝气流集中", sample: "싸", group: "紧音" },
  { char: "ㅉ", roman: "jj", hint: "比 ㅈ 更紧、更短促，不要加很强的气", sample: "짜", group: "紧音" },
];

const vowels: Letter[] = [
  { char: "ㅏ", roman: "a", hint: "嘴巴自然张开，像 a，但更短更干脆", sample: "아", group: "基础字母" },
  { char: "ㅑ", roman: "ya", hint: "先带一点 i，再快速滑向 ㅏ", sample: "야", group: "基础字母" },
  { char: "ㅓ", roman: "eo", hint: "嘴自然张开、舌位偏后；不要直接读成“饿”", sample: "어", group: "易错音" },
  { char: "ㅕ", roman: "yeo", hint: "在 ㅓ 前加一个很短的 y 滑音", sample: "여", group: "易错音" },
  { char: "ㅗ", roman: "o", hint: "嘴唇收圆，舌头偏后；与 ㅓ 对比时先注意是否圆唇", sample: "오", group: "基础字母" },
  { char: "ㅛ", roman: "yo", hint: "快速的 y 加 ㅗ，嘴唇保持圆形", sample: "요", group: "基础字母" },
  { char: "ㅜ", roman: "u", hint: "嘴唇收圆，舌后部抬高；不要与汉语拼音 u 直接等同", sample: "우", group: "基础字母" },
  { char: "ㅠ", roman: "yu", hint: "先有短 y，再滑到 ㅜ", sample: "유", group: "基础字母" },
  { char: "ㅡ", roman: "eu", hint: "不用汉字谐音代替：嘴唇不收圆，舌后部抬高", sample: "으", group: "易错音" },
  { char: "ㅣ", roman: "i", hint: "接近汉语 i，嘴角自然向两侧", sample: "이", group: "基础字母" },
  { char: "ㅐ", roman: "ae", hint: "现代首尔语中常与 ㅔ 很接近，不必过度拉开", sample: "애", group: "组合字母" },
  { char: "ㅒ", roman: "yae", hint: "短 y 加 ㅐ；现代口语中并不常见", sample: "얘", group: "组合字母" },
  { char: "ㅔ", roman: "e", hint: "接近 e；现代口语常与 ㅐ 合流", sample: "에", group: "组合字母" },
  { char: "ㅖ", roman: "ye", hint: "短 y 加 ㅔ，连读时要一口气完成", sample: "예", group: "组合字母" },
  { char: "ㅘ", roman: "wa", hint: "从 ㅗ 快速滑向 ㅏ，不要拆成两个音节", sample: "와", group: "组合字母" },
  { char: "ㅙ", roman: "wae", hint: "从圆唇开始，快速滑向 ㅐ", sample: "왜", group: "组合字母" },
  { char: "ㅚ", roman: "oe / we", hint: "现代口语通常读得接近 we", sample: "외", group: "组合字母" },
  { char: "ㅝ", roman: "wo", hint: "从 ㅜ 快速滑向 ㅓ，注意不是汉语“窝”", sample: "워", group: "组合字母" },
  { char: "ㅞ", roman: "we", hint: "从 ㅜ 滑向 ㅔ，和 ㅙ、ㅚ 常很接近", sample: "웨", group: "组合字母" },
  { char: "ㅟ", roman: "wi", hint: "从圆唇的 ㅜ 快速滑向 ㅣ", sample: "위", group: "组合字母" },
  { char: "ㅢ", roman: "ui", hint: "先 ㅡ 后 ㅣ；在实际词语中常发生变读", sample: "의", group: "易错音" },
];

const allLetters = [...consonants, ...vowels];
const consonantNames = consonantNameData as ConsonantName[];
const consonantNameMap = new Map(consonantNames.map((item) => [item.char, item]));
const audibleConsonants = consonants.filter((letter) => letter.char !== "ㅇ");
const audibleLetters = [...audibleConsonants, ...vowels];
const phraseItems = phraseData as PhraseItem[];
const reviewPhraseIds = phraseItems.map((item) => item.id);
const wordItems = phraseItems.filter((item) => item.type === "word");
const sentenceItems = phraseItems.filter((item) => item.type === "sentence");
const phraseItemById = new Map(phraseItems.map((item) => [item.id, item]));
const phraseItemByKorean = new Map(phraseItems.map((item) => [item.korean, item]));
const phraseAudioPaths = new Map(phraseItems.map((item) => [item.korean, `/audio/phrases/${item.id}.mp3`]));
const consonantNameAudioPaths = new Map(consonantNames.map((item) => [item.name, `/audio/consonant-names/${item.id}.mp3`]));
const clarityReplayConsonants = new Set(["ㄹ", "ㄲ", "ㄸ", "ㅃ"]);
const coreVowelChars = ["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ"];
const basicConsonantChars = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅎ"];
const advancedConsonantChars = ["ㄲ", "ㅋ", "ㄸ", "ㅌ", "ㅃ", "ㅍ", "ㅆ", "ㅉ", "ㅊ"];
const advancedVowelChars = vowels.map((letter) => letter.char).filter((char) => !coreVowelChars.includes(char));
const starterPhraseItems = phraseItems.filter((item) => usesOnlyOpenSyllablesFromSets(item.korean, basicConsonantChars, coreVowelChars));
const starterPhraseIds = new Set(starterPhraseItems.map((item) => item.id));
const survivalPhraseIds = new Set([
  "sentence-this",
  "sentence-toilet",
  "sentence-slow",
  "sentence-again",
  "sentence-card",
  "sentence-help",
]);
const STARTER_PHRASE_GROUP = "已学字母首读";
const SURVIVAL_PHRASE_GROUP = "生存 6 句";
const ROMAN_HINT_KEY = "hangul-show-roman-v22";
const BEGINNER_BLEND_KEY = "hangul-beginner-blend-qualified-v23";
const FULL_REVIEW_KEY = "hangul-full-review-qualified-v25";
const blockExamples: BlockExample[] = [
  { id: "open", syllable: "가", chinese: "完整音节", note: "ㄱ 在左，ㅏ 在右；没有收音。" },
  { id: "silent", syllable: "아", chinese: "从元音开始", note: "ㅇ 占初声位置但不发音，真正听到的是 ㅏ。" },
  { id: "batchim", syllable: "밥", chinese: "饭／一餐", note: "下面的 ㅂ 是收音。这里先认位置，实际音值听完整词。" },
];
const choiceKeys = ["A", "S", "D", "F"];
const choiceKeyLabels = ["1 / A", "2 / S", "3 / D", "4 / F"];
const blendVowelKeys = ["J", "K", "L", ";"];
const matchKeys = ["Q", "W", "E", "R", "A", "S", "D", "F", "Z", "X", "C", "V"];
const gameModes = ["listen", "shadow", "match", "blend", "speed", "typing"] as const;
type GameMode = typeof gameModes[number];
const AUTO_ADVANCE_DELAY_MS = 900;
const APP_VERSION = "37";
const KEYBOARD_MODE_KEY = "hangul-keyboard-mode-v33";
const AUDIO_ASSET_VERSION = "21";
const TYPING_BEST_KEY = "hangul-typing-best-v1";
const LEGACY_PROGRESS_BACKUP_KEY = "hangul-legacy-progress-backup-v1";
const typingRoutes = typingRouteData as TypingRoute[];
const typingRouteIds = new Set(typingRoutes.map((route) => route.id));
const comparisonVowels = ["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ"];
const typingRouteItems = new Map(typingRoutes.map((route) => [route.id, route.wordIds
  .map((id) => phraseItemById.get(id))
  .filter((item): item is PhraseItem => item?.type === "word")]));

const compareGroups = [
  { title: "가 · 까 · 카", cue: "松音 → 紧音 → 送气音", items: [{ text: "가", label: "ㄱ 松音" }, { text: "까", label: "ㄲ 紧音" }, { text: "카", label: "ㅋ 送气" }] },
  { title: "다 · 따 · 타", cue: "气流不是越大越好，先分清喉咙是否绷紧", items: [{ text: "다", label: "ㄷ 松音" }, { text: "따", label: "ㄸ 紧音" }, { text: "타", label: "ㅌ 送气" }] },
  { title: "바 · 빠 · 파", cue: "送气音通常最明显；松音也可能带少量气流", items: [{ text: "바", label: "ㅂ 松音" }, { text: "빠", label: "ㅃ 紧音" }, { text: "파", label: "ㅍ 送气" }] },
  { title: "자 · 짜 · 차", cue: "都不要卷舌，差别在紧张度和送气量", items: [{ text: "자", label: "ㅈ 松音" }, { text: "짜", label: "ㅉ 紧音" }, { text: "차", label: "ㅊ 送气" }] },
];

const emptyStats: GameStats = { date: "", dailyXp: 0, totalXp: 0, bestCombo: 0, games: 0, mistakes: {}, phraseMistakes: {}, history: {} };
const validLetterChars = new Set(allLetters.map((letter) => letter.char));
const validPhraseIds = new Set(phraseItems.map((item) => item.id));
const progressValidation = { allowedLetters: validLetterChars, allowedPhraseIds: validPhraseIds };
const initialMatchLetters = selectFairBlindLetters(audibleLetters.map((letter) => letter.char), 6)
  .map((char) => audibleLetters.find((letter) => letter.char === char))
  .filter((letter): letter is Letter => Boolean(letter));
const initialMatchDeck: MatchCard[] = initialMatchLetters.flatMap((letter) => [
  { uid: `${letter.char}-char`, letter, type: "char" as const },
  { uid: `${letter.char}-sound`, letter, type: "sound" as const },
]);

let activeAudio: HTMLAudioElement | null = null;
const audioCache = new Map<string, HTMLAudioElement>();

function createFreshPageProgressLedgerId() {
  const uuid = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `page-${uuid.replace(/[^A-Za-z0-9._-]/g, "-")}`;
}

function createPageProgressLedgerId() {
  return createFreshPageProgressLedgerId();
}

function createProgressEpochId() {
  return createFreshPageProgressLedgerId().replace(/^page-/, "epoch-");
}

function hasAnyUnscopedProgressData() {
  try {
    for (const key of [
      "hangul-game-stats",
      "hangul-mastered",
      "hangul-phrase-mastered",
      LEGACY_PROGRESS_BACKUP_KEY,
      LEGACY_MASTERY_SNAPSHOT_KEY,
      PROGRESS_CHECKPOINT_KEY,
      PROGRESS_CHECKPOINT_BACKUP_KEY,
    ]) {
      if (window.localStorage.getItem(key) !== null) return true;
    }
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(PROGRESS_LEDGER_KEY_PREFIX) || key?.startsWith(PROGRESS_LEDGER_SEAL_KEY_PREFIX)) return true;
    }
    return false;
  } catch {
    return null;
  }
}

function readStoredValueResult(key: string) {
  try {
    return { ok: true as const, value: window.localStorage.getItem(key) };
  } catch {
    return { ok: false as const, value: null };
  }
}

function readStoredValue(key: string) {
  return readStoredValueResult(key).value;
}

function persistProgressRollbackGuard(key: string) {
  try {
    if (window.localStorage.getItem(key) !== "1") window.localStorage.setItem(key, "1");
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function progressRollbackGuardBlocksCompaction(key: string) {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return true;
  }
}

function parseStoredStringList(value: string | null, allowed: Set<string>, filterUnknown = false) {
  if (value === null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) return null;
    const strings = parsed as string[];
    if (!filterUnknown && strings.some((item) => !allowed.has(item))) return null;
    return [...new Set(strings.filter((item) => allowed.has(item)))];
  } catch {
    return null;
  }
}

function addSafeCount(value: number, increment: number) {
  return Math.min(Number.MAX_SAFE_INTEGER, value + increment);
}

function parseStoredStats(value: string | null, today: string): GameStats | null {
  if (value === null) return { ...emptyStats, date: today };
  const parsed = parseLegacyProgressStats(value, progressValidation);
  if (!parsed) return null;
  return { ...parsed, date: today, dailyXp: parsed.history[today] ?? 0 };
}

function parseLegacyProgressBackup(value: string | null, today: string): ProgressSnapshot | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const raw = parsed as Record<string, unknown>;
    if (raw.version !== 1 || !raw.snapshot || typeof raw.snapshot !== "object" || Array.isArray(raw.snapshot)) return null;
    const snapshot = raw.snapshot as Record<string, unknown>;
    const statsRaw = JSON.stringify(snapshot.stats);
    const masteredRaw = JSON.stringify(snapshot.mastered);
    const masteredPhrasesRaw = JSON.stringify(snapshot.masteredPhrases);
    if (statsRaw === undefined || masteredRaw === undefined || masteredPhrasesRaw === undefined) return null;
    const stats = parseStoredStats(statsRaw, today);
    const mastered = parseStoredStringList(masteredRaw, validLetterChars);
    const masteredPhrases = parseStoredStringList(masteredPhrasesRaw, validPhraseIds, true);
    return stats && mastered && masteredPhrases ? { stats, mastered, masteredPhrases } : null;
  } catch {
    return null;
  }
}

function legacyStatsContainProgress(stats: GameStats) {
  return stats.dailyXp > 0 || stats.totalXp > 0 || stats.bestCombo > 0 || stats.games > 0
    || Object.values(stats.mistakes).some((count) => count > 0)
    || Object.values(stats.phraseMistakes).some((count) => count > 0)
    || Object.values(stats.history).some((count) => count > 0);
}

type ProgressStorageEpoch = string | null;

function progressStorageCheckpointKey(epoch: ProgressStorageEpoch) {
  return epoch === null ? PROGRESS_CHECKPOINT_KEY : progressEpochCheckpointKey(epoch);
}

function progressStorageCheckpointBackupKey(epoch: ProgressStorageEpoch) {
  return epoch === null ? PROGRESS_CHECKPOINT_BACKUP_KEY : progressEpochCheckpointBackupKey(epoch);
}

function progressStorageLedgerIdFromKey(key: string, epoch: ProgressStorageEpoch) {
  if (epoch === null) {
    if (!key.startsWith(PROGRESS_LEDGER_KEY_PREFIX)) return null;
    const ledgerId = key.slice(PROGRESS_LEDGER_KEY_PREFIX.length);
    return isProgressLedgerId(ledgerId) ? ledgerId : null;
  }
  return progressEpochLedgerIdFromKey(key, epoch);
}

function progressStorageLedgerIdFromSealKey(key: string, epoch: ProgressStorageEpoch) {
  return epoch === null ? progressLedgerIdFromSealKey(key) : progressEpochLedgerIdFromSealKey(key, epoch);
}

function progressStorageLedgerPrefix(epoch: ProgressStorageEpoch) {
  return epoch === null ? PROGRESS_LEDGER_KEY_PREFIX : `${PROGRESS_EPOCH_NAMESPACE_PREFIX}${epoch}:ledger:`;
}

function progressStorageLedgerSealPrefix(epoch: ProgressStorageEpoch) {
  return epoch === null ? PROGRESS_LEDGER_SEAL_KEY_PREFIX : `${PROGRESS_EPOCH_NAMESPACE_PREFIX}${epoch}:seal:`;
}

function readProgressCheckpointCopies(epoch: ProgressStorageEpoch) {
  const primaryKey = progressStorageCheckpointKey(epoch);
  const backupKey = progressStorageCheckpointBackupKey(epoch);
  const primaryRaw = window.localStorage.getItem(primaryKey);
  const backupRaw = window.localStorage.getItem(backupKey);
  const primary = parseProgressCheckpoint(primaryRaw, progressValidation);
  const backup = parseProgressCheckpoint(backupRaw, progressValidation);
  // The primary copy is authoritative when valid. If a crash happened after
  // writing only the leading backup, its source ledgers have not been deleted,
  // so replaying them from the primary remains safe.
  const checkpoint = primary ?? backup;
  const checkpointCorrupted = (primaryRaw !== null || backupRaw !== null) && checkpoint === null;
  const serialized = checkpoint ? serializeProgressCheckpoint(checkpoint) : null;
  return {
    primaryRaw,
    backupRaw,
    checkpoint,
    checkpointCorrupted,
    needsRepair: serialized !== null && (primaryRaw !== serialized || backupRaw !== serialized),
  };
}

function writeProgressCheckpointCopies(
  checkpoint: ProgressCheckpoint,
  epoch: string,
  canWrite: () => boolean = () => true,
) {
  const primaryKey = progressEpochCheckpointKey(epoch);
  const backupKey = progressEpochCheckpointBackupKey(epoch);
  const serialized = serializeProgressCheckpoint(checkpoint);
  if (!canWrite()) return false;
  window.localStorage.setItem(backupKey, serialized);
  if (!canWrite()) return false;
  if (window.localStorage.getItem(backupKey) !== serialized) return false;
  if (!canWrite()) return false;
  window.localStorage.setItem(primaryKey, serialized);
  if (!canWrite()) return false;
  return window.localStorage.getItem(primaryKey) === serialized;
}

function persistProgressLedgerSeal(
  ledger: ProgressLedger,
  epoch: string,
  canWrite: () => boolean = () => true,
) {
  try {
    const ledgerKey = progressEpochLedgerKey(epoch, ledger.ledgerId);
    const sealKey = progressEpochLedgerSealKey(epoch, ledger.ledgerId);
    if (!canWrite()) return false;
    if (window.localStorage.getItem(ledgerKey) !== serializeProgressLedger(ledger)) return false;
    const seal = createProgressLedgerSeal(ledger, Date.now());
    const serialized = serializeProgressLedgerSeal(seal);
    if (!canWrite()) return false;
    window.localStorage.setItem(sealKey, serialized);
    if (!canWrite()) return false;
    return window.localStorage.getItem(sealKey) === serialized;
  } catch {
    return false;
  }
}

function readStoredProgressLedgers(epoch: ProgressStorageEpoch) {
  try {
    const ledgerPrefix = progressStorageLedgerPrefix(epoch);
    const sealPrefix = progressStorageLedgerSealPrefix(epoch);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const checkpointBefore = readProgressCheckpointCopies(epoch);
      const entries: Array<readonly [string, string | null]> = [];
      const physicalLedgerIds = new Set<string>();
      const invalidPhysicalLedgerIds = new Set<string>();
      const seals = new Map<string, ProgressLedgerSeal>();
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith(ledgerPrefix)) {
          const ledgerId = progressStorageLedgerIdFromKey(key, epoch);
          if (ledgerId) {
            physicalLedgerIds.add(ledgerId);
            entries.push([key, window.localStorage.getItem(key)]);
          }
        } else if (key?.startsWith(sealPrefix)) {
          const ledgerId = progressStorageLedgerIdFromSealKey(key, epoch);
          const seal = ledgerId ? parseProgressLedgerSeal(window.localStorage.getItem(key), ledgerId) : null;
          if (ledgerId && seal) seals.set(ledgerId, seal);
        }
      }
      const checkpointAfter = readProgressCheckpointCopies(epoch);
      if (checkpointBefore.primaryRaw !== checkpointAfter.primaryRaw || checkpointBefore.backupRaw !== checkpointAfter.backupRaw) continue;
      const ledgers = entries.flatMap(([key, raw]) => {
        const ledgerId = progressStorageLedgerIdFromKey(key, epoch);
        const ledger = ledgerId ? parseProgressLedger(raw, progressValidation, ledgerId) : null;
        return ledger ? [ledger] : [];
      });
      const validLedgerIds = new Set(ledgers.map((ledger) => ledger.ledgerId));
      for (const ledgerId of physicalLedgerIds) {
        if (!validLedgerIds.has(ledgerId)) invalidPhysicalLedgerIds.add(ledgerId);
      }
      return {
        ok: true as const,
        ledgers,
        physicalLedgerIds,
        invalidPhysicalLedgerIds,
        seals,
        checkpoint: checkpointAfter.checkpoint,
        checkpointCorrupted: checkpointAfter.checkpointCorrupted,
        checkpointNeedsRepair: checkpointAfter.needsRepair,
      };
    }
  } catch {
    // Treat storage failures as degraded so the last known-good in-memory state survives.
  }
  return {
    ok: false as const,
    ledgers: [] as ProgressLedger[],
    physicalLedgerIds: new Set<string>(),
    invalidPhysicalLedgerIds: new Set<string>(),
    seals: new Map<string, ProgressLedgerSeal>(),
    checkpoint: null as ProgressCheckpoint | null,
    checkpointCorrupted: false,
    checkpointNeedsRepair: false,
  };
}

type UnscopedProgressCapture = {
  fingerprint: string;
  entries: Array<readonly [string, string | null]>;
};

const unscopedProgressSingletonKeys = [
  "hangul-game-stats",
  "hangul-mastered",
  "hangul-phrase-mastered",
  LEGACY_PROGRESS_BACKUP_KEY,
  LEGACY_MASTERY_SNAPSHOT_KEY,
  PROGRESS_CHECKPOINT_KEY,
  PROGRESS_CHECKPOINT_BACKUP_KEY,
] as const;

function captureUnscopedProgressData(): UnscopedProgressCapture | null {
  try {
    const entries: Array<readonly [string, string | null]> = unscopedProgressSingletonKeys
      .map((key) => [key, window.localStorage.getItem(key)] as const);
    const dynamicKeys = new Set<string>();
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(PROGRESS_LEDGER_KEY_PREFIX) || key?.startsWith(PROGRESS_LEDGER_SEAL_KEY_PREFIX)) {
        dynamicKeys.add(key);
      }
    }
    for (const key of [...dynamicKeys].sort()) entries.push([key, window.localStorage.getItem(key)]);
    return { fingerprint: JSON.stringify(entries), entries };
  } catch {
    return null;
  }
}

function progressSnapshotFromUnscopedCapture(capture: UnscopedProgressCapture, today: string) {
  const byKey = new Map(capture.entries);
  const statsRaw = byKey.get("hangul-game-stats") ?? null;
  const masteredRaw = byKey.get("hangul-mastered") ?? null;
  const masteredPhrasesRaw = byKey.get("hangul-phrase-mastered") ?? null;
  const backupRaw = byKey.get(LEGACY_PROGRESS_BACKUP_KEY) ?? null;
  const backup = parseLegacyProgressBackup(backupRaw, today);
  const missingStatsAreEmpty = backupRaw === null || (backup !== null && !legacyStatsContainProgress(backup.stats));
  const missingMasteryIsEmpty = backupRaw === null || (backup !== null && backup.mastered.length === 0);
  const missingPhraseMasteryIsEmpty = backupRaw === null || (backup !== null && backup.masteredPhrases.length === 0);
  const parsedStats = statsRaw === null
    ? (missingStatsAreEmpty ? { ...emptyStats, date: today } : null)
    : parseStoredStats(statsRaw, today);
  const parsedMastered = masteredRaw === null
    ? (missingMasteryIsEmpty ? [] : null)
    : parseStoredStringList(masteredRaw, validLetterChars);
  const parsedMasteredPhrases = masteredPhrasesRaw === null
    ? (missingPhraseMasteryIsEmpty ? [] : null)
    : parseStoredStringList(masteredPhrasesRaw, validPhraseIds, true);
  const protectedStats = parsedStats && backup
    ? mergeLegacyProgressStatsHighWater(parsedStats, backup.stats, today)
    : parsedStats ?? backup?.stats ?? null;
  const baseline: ProgressSnapshot = {
    stats: protectedStats ?? { ...emptyStats, date: today },
    mastered: parsedMastered ?? backup?.mastered ?? [],
    masteredPhrases: parsedMasteredPhrases ?? backup?.masteredPhrases ?? [],
  };

  const ledgers: ProgressLedger[] = [];
  for (const [key, raw] of capture.entries) {
    const ledgerId = progressLedgerIdFromKey(key);
    const ledger = ledgerId ? parseProgressLedger(raw, progressValidation, ledgerId) : null;
    if (ledger) ledgers.push(ledger);
  }
  const primaryCheckpoint = parseProgressCheckpoint(byKey.get(PROGRESS_CHECKPOINT_KEY) ?? null, progressValidation);
  const backupCheckpoint = parseProgressCheckpoint(byKey.get(PROGRESS_CHECKPOINT_BACKUP_KEY) ?? null, progressValidation);
  return mergeProgress(baseline, ledgers, today, progressValidation, primaryCheckpoint ?? backupCheckpoint);
}

function readProgressEpochBaselineCopies(epoch: string) {
  try {
    const primaryKey = progressEpochBaselineKey(epoch);
    const backupKey = progressEpochBaselineBackupKey(epoch);
    const primaryRaw = window.localStorage.getItem(primaryKey);
    const backupRaw = window.localStorage.getItem(backupKey);
    const primary = parseProgressEpochBaseline(primaryRaw, progressValidation);
    const backup = parseProgressEpochBaseline(backupRaw, progressValidation);
    const baseline = primary ?? backup;
    const serialized = baseline ? serializeProgressEpochBaseline(baseline) : null;
    return {
      ok: baseline !== null,
      baseline,
      primaryRaw,
      backupRaw,
      needsRepair: serialized !== null && (primaryRaw !== serialized || backupRaw !== serialized),
    };
  } catch {
    return { ok: false, baseline: null, primaryRaw: null, backupRaw: null, needsRepair: false };
  }
}

function writeProgressEpochBaselineCopies(
  epoch: string,
  snapshot: ProgressSnapshot,
  canWrite: () => boolean,
) {
  try {
    const serialized = serializeProgressEpochBaseline({ version: 1, snapshot });
    const backupKey = progressEpochBaselineBackupKey(epoch);
    const primaryKey = progressEpochBaselineKey(epoch);
    if (!canWrite()) return false;
    window.localStorage.setItem(backupKey, serialized);
    if (!canWrite() || window.localStorage.getItem(backupKey) !== serialized) return false;
    window.localStorage.setItem(primaryKey, serialized);
    if (!canWrite() || window.localStorage.getItem(primaryKey) !== serialized) return false;
    return window.localStorage.getItem(backupKey) === serialized;
  } catch {
    return false;
  }
}

function prepareProgressEpochBaseline(meta: ProgressEpochMeta) {
  const migratingSerialized = serializeProgressEpochMeta(meta);
  const canWrite = () => window.localStorage.getItem(PROGRESS_EPOCH_META_KEY) === migratingSerialized;
  const today = localDateKey();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let snapshot: ProgressSnapshot;
    let sourceFingerprint: string | null = null;
    if (meta.source === "legacy") {
      const before = captureUnscopedProgressData();
      const stable = captureUnscopedProgressData();
      if (!before || !stable) return false;
      if (before.fingerprint !== stable.fingerprint) continue;
      snapshot = progressSnapshotFromUnscopedCapture(stable, today);
      sourceFingerprint = stable.fingerprint;
    } else {
      snapshot = { stats: { ...emptyStats, date: today }, mastered: [], masteredPhrases: [] };
    }
    if (!writeProgressEpochBaselineCopies(meta.epoch, snapshot, canWrite)) return false;
    if (meta.source === "legacy") {
      const after = captureUnscopedProgressData();
      if (!after) return false;
      if (after.fingerprint !== sourceFingerprint) continue;
    }
    const verified = readProgressEpochBaselineCopies(meta.epoch);
    const serialized = serializeProgressEpochBaseline({ version: 1, snapshot });
    if (!canWrite() || verified.primaryRaw !== serialized || verified.backupRaw !== serialized) continue;
    if (meta.source === "legacy") {
      const finalSource = captureUnscopedProgressData();
      if (!finalSource || finalSource.fingerprint !== sourceFingerprint) continue;
    }
    return true;
  }
  return false;
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function audioPath(text: string) {
  const phraseSource = phraseAudioPaths.get(text);
  if (phraseSource) return `${phraseSource}?v=${AUDIO_ASSET_VERSION}`;
  if (phraseItemByKorean.has(text)) return "";
  const syllables = text.match(/[가-힣]/g) ?? [];
  if (syllables.length !== 1) return "";
  const syllable = syllables[0];
  return syllable ? `/audio/hangul-natural/s-${syllable.codePointAt(0)?.toString(16)}.mp3?v=${AUDIO_ASSET_VERSION}` : "";
}

function stopSpeechSynthesis() {
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

function consonantOnsetPath(letter: Letter) {
  const audioFile = consonantNameMap.get(letter.char)?.audioFile;
  return audioFile ? `/audio/consonant-human-onset/${audioFile}?v=${AUDIO_ASSET_VERSION}` : "";
}

function consonantReferenceSoundPath(letter: Letter) {
  const audioFile = consonantNameMap.get(letter.char)?.audioFile;
  const directory = clarityReplayConsonants.has(letter.char) ? "consonant-human-clarity" : "consonant-human-onset";
  return audioFile ? `/audio/${directory}/${audioFile}?v=${AUDIO_ASSET_VERSION}` : "";
}

function preloadAudioSource(source: string) {
  if (typeof window === "undefined") return;
  if (!source || audioCache.has(source)) return;
  const audio = new Audio(source);
  audio.preload = "auto";
  audio.addEventListener("error", () => audioCache.delete(source), { once: true });
  audio.load();
  audioCache.set(source, audio);
}

async function playAudioSourceToEnd(source: string, speed = 1): Promise<AudioPlaybackResult> {
  if (typeof window === "undefined" || !source) return "failed";
  stopSpeechSynthesis();
  preloadAudioSource(source);
  activeAudio?.pause();
  const audio = (audioCache.get(source)?.cloneNode(true) as HTMLAudioElement | undefined) ?? new Audio(source);
  activeAudio = audio;
  audio.volume = 1;
  audio.preservesPitch = true;
  audio.playbackRate = speed;

  return new Promise<AudioPlaybackResult>((resolve) => {
    let settled = false;
    let timeout = 0;
    const finish = (result: AudioPlaybackResult, invalidateCache = false) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("pause", handlePause);
      if (invalidateCache) audioCache.delete(source);
      if (activeAudio === audio) activeAudio = null;
      resolve(result);
    };
    const handleEnded = () => finish("ended");
    const handleError = () => finish("failed", true);
    // Browsers may dispatch pause immediately before ended at natural completion.
    const handlePause = () => finish(audio.ended ? "ended" : "interrupted");
    audio.addEventListener("ended", handleEnded, { once: true });
    audio.addEventListener("error", handleError, { once: true });
    audio.addEventListener("pause", handlePause, { once: true });
    timeout = window.setTimeout(() => {
      finish("failed", true);
      audio.pause();
    }, 15_000);
    void audio.play().catch(() => finish("failed", true));
  });
}

function preloadKorean(text: string) {
  preloadAudioSource(audioPath(text));
}

function playKorean(text: string, speed = 1) {
  return playAudioSourceToEnd(audioPath(text), speed);
}

function preloadGameLetterExample(letter: Letter) {
  preloadAudioSource(consonantNameMap.has(letter.char) ? consonantOnsetPath(letter) : audioPath(letter.sample));
}

function preloadReferenceLetterExample(letter: Letter) {
  preloadAudioSource(consonantNameMap.has(letter.char) ? consonantReferenceSoundPath(letter) : audioPath(letter.sample));
}

function playGameLetterExampleAudio(letter: Letter, speed = 1) {
  const source = consonantNameMap.has(letter.char) ? consonantOnsetPath(letter) : audioPath(letter.sample);
  return source ? playAudioSourceToEnd(source, speed) : Promise.resolve<AudioPlaybackResult>("failed");
}

function playReferenceLetterExampleAudio(letter: Letter, speed = 1) {
  const source = consonantNameMap.has(letter.char) ? consonantReferenceSoundPath(letter) : audioPath(letter.sample);
  return source ? playAudioSourceToEnd(source, speed) : Promise.resolve<AudioPlaybackResult>("failed");
}

function playConsonantName(name: string, speed = 1) {
  const source = consonantNameAudioPaths.get(name);
  return source
    ? playAudioSourceToEnd(`${source}?v=${AUDIO_ASSET_VERSION}`, speed)
    : Promise.resolve<AudioPlaybackResult>("failed");
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const blendQuestionPool: BlendQuestion[] = initialOrder
  .flatMap((initial) => vowelOrder.map((vowel) => ({ initial, vowel, syllable: makeSyllable(initial, vowel) })))
  .filter((question) => isFairBlendTarget(question.initial, question.vowel));
const starterBlendQuestionPool: BlendQuestion[] = basicConsonantChars
  .flatMap((initial) => coreVowelChars.map((vowel) => ({ initial, vowel, syllable: makeSyllable(initial, vowel) })))
  .filter((question) => isFairBlendTarget(question.initial, question.vowel));

function makeChoices(target: Letter, pool?: Letter[]) {
  const categoryPool = consonantNameMap.has(target.char) ? audibleConsonants : vowels;
  const scopedPool = pool?.filter((item) => categoryPool.some((candidate) => candidate.char === item.char)) ?? categoryPool;
  const candidates = [...shuffle(scopedPool), ...shuffle(categoryPool)]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.char === item.char) === index)
    .filter((item) => !areBlindLettersConfusable(target.char, item.char));
  const extras = candidates.slice(0, 3);
  return shuffle([target, ...extras]);
}

function romanHintTokens(roman: string) {
  return roman.toLowerCase().split(/\s*\/\s*|\s+/).filter((token) => token && token !== "—");
}

function romanHintsOverlap(left: string, right: string) {
  const leftTokens = new Set(romanHintTokens(left));
  return romanHintTokens(right).some((token) => leftTokens.has(token));
}

function makeRomanChoices(target: Letter) {
  const selected = [target];
  for (const candidate of shuffle(audibleLetters)) {
    if (selected.some((item) => item.char === candidate.char || romanHintsOverlap(item.roman, candidate.roman))) continue;
    selected.push(candidate);
    if (selected.length === 4) break;
  }
  return shuffle(selected);
}

function makeBlendInitialChoices(targetInitial: string, targetVowel: string, candidates = initialOrder) {
  return shuffle([targetInitial, ...shuffle(fairBlendInitialCandidates(targetInitial, targetVowel, candidates)).slice(0, 3)]);
}

function makeBlendVowelChoices(targetInitial: string, targetVowel: string, candidates = vowelOrder) {
  return shuffle([targetVowel, ...shuffle(fairBlendVowelCandidates(targetInitial, targetVowel, candidates)).slice(0, 3)]);
}

function makeMatchDeck(letters: Letter[]) {
  return shuffle(letters.flatMap((letter) => [
    { uid: `${letter.char}-char`, letter, type: "char" as const },
    { uid: `${letter.char}-sound`, letter, type: "sound" as const },
  ]));
}

function pickWeightedLetter(mistakes: Record<string, number>, pool: Letter[] = allLetters) {
  const weighted = pool.flatMap((letter) => Array.from({ length: 1 + Math.min(mistakes[letter.char] ?? 0, 4) }, () => letter));
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function makePhraseChoices(target: PhraseItem, pool: PhraseItem[]) {
  const uniqueChoices = new Map<string, PhraseItem>();
  shuffle(pool).forEach((item) => {
    if (item.id !== target.id && item.chinese !== target.chinese && !uniqueChoices.has(item.chinese)) uniqueChoices.set(item.chinese, item);
  });
  return shuffle([target, ...[...uniqueChoices.values()].slice(0, 3)]);
}

function pickWeightedPhrase(pool: PhraseItem[], mistakes: Record<string, number>, previousId = "") {
  const candidates = pool.length > 1 ? pool.filter((item) => item.id !== previousId) : pool;
  const weighted = candidates.flatMap((item) => Array.from({ length: 1 + Math.min(mistakes[item.id] ?? 0, 4) }, () => item));
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function phraseQuizRoundLimit(targetCount: number, scopedGroup: boolean) {
  if (targetCount <= 1) return targetCount;
  return scopedGroup ? Math.min(10, targetCount * 2) : Math.min(10, targetCount);
}

function phraseMatchesGroup(item: PhraseItem, group: string) {
  if (group === "all") return true;
  if (group === STARTER_PHRASE_GROUP) return starterPhraseIds.has(item.id);
  if (group === SURVIVAL_PHRASE_GROUP) return survivalPhraseIds.has(item.id);
  return item.group === group;
}

function phraseReadingLevel(item: PhraseItem, knownLetters: Set<string>): PhraseReadingLevel {
  const blocks = decomposeHangulText(item.korean);
  if (blocks.length === 0 || blocks.some(({ initial, vowel }) => !knownLetters.has(initial) || !knownLetters.has(vowel))) return "new";
  return blocks.some(({ final }) => final !== null) ? "batchim" : "ready";
}

export default function Home() {
  const [activeSet, setActiveSet] = useState<"consonants" | "vowels">("consonants");
  const [letterFilter, setLetterFilter] = useState<"all" | "learning">("all");
  const [letterLesson, setLetterLesson] = useState<LetterLesson>("all");
  const [mastered, setMastered] = useState<string[]>([]);
  const [initial, setInitial] = useState("ㄱ");
  const [vowel, setVowel] = useState("ㅏ");
  const [gameStats, setGameStats] = useState<GameStats>(emptyStats);
  const [localToday, setLocalToday] = useState("");
  const dailyReview = useDailyReview(reviewPhraseIds);
  const [audioSpeed, setAudioSpeed] = useState<1 | 0.82>(1);
  const [showRomanization, setShowRomanization] = useState(true);
  const [beginnerBlendCompleted, setBeginnerBlendCompleted] = useState(false);
  const [fullReviewCompleted, setFullReviewCompleted] = useState(false);
  const [fullReviewSaved, setFullReviewSaved] = useState(false);
  const [blockExampleId, setBlockExampleId] = useState(blockExamples[0].id);
  const [gameMode, setGameMode] = useState<GameMode>("listen");
  const [keyboardZone, setKeyboardZone] = useState<"games" | "phrases">("games");
  const [keyboardInputMode, setKeyboardInputMode] = useState<"hangul" | "shortcuts">("hangul");
  const [koreanPending, setKoreanPending] = useState("");
  const koreanPendingRef = useRef("");
  const [koreanKeyboardStatus, setKoreanKeyboardStatus] = useState("");
  const [pressedKoreanKey, setPressedKoreanKey] = useState("");
  const [koreanShifted, setKoreanShifted] = useState(false);
  const koreanKeyTimerRef = useRef<number | null>(null);
  const resetKoreanInput = useCallback(() => {
    koreanPendingRef.current = "";
    setKoreanPending("");
    setKoreanKeyboardStatus("");
  }, []);

  const [listenTarget, setListenTarget] = useState<Letter>(consonants[0]);
  const [listenChoices, setListenChoices] = useState<Letter[]>(consonants.slice(0, 4));
  const [listenAnswer, setListenAnswer] = useState<string | null>(null);
  const [listenRound, setListenRound] = useState(1);
  const [listenHearts, setListenHearts] = useState(3);
  const [listenCombo, setListenCombo] = useState(0);
  const [listenScore, setListenScore] = useState(0);
  const [listenStarted, setListenStarted] = useState(false);
  const [listenFinished, setListenFinished] = useState(false);
  const [retryQueue, setRetryQueue] = useState<Letter[]>([]);
  const [listenCorrectChars, setListenCorrectChars] = useState<string[]>([]);
  const [listenWrongChars, setListenWrongChars] = useState<string[]>([]);
  const [listenPool, setListenPool] = useState<Letter[]>(audibleLetters);
  const [listenMasteryScope, setListenMasteryScope] = useState<string[]>([]);
  const [listenQualifiesFullReview, setListenQualifiesFullReview] = useState(false);
  const [listenSessionLabel, setListenSessionLabel] = useState("可听 39 音（不含初声静音 ㅇ）");

  const [matchDeck, setMatchDeck] = useState<MatchCard[]>(initialMatchDeck);
  const [matchSelected, setMatchSelected] = useState<string[]>([]);
  const [matchedLetters, setMatchedLetters] = useState<string[]>([]);
  const [matchMoves, setMatchMoves] = useState(0);
  const [matchLocked, setMatchLocked] = useState(false);
  const [matchFeedback, setMatchFeedback] = useState("先翻一张牌，再找它的另一半。");

  const [speedTarget, setSpeedTarget] = useState<Letter>(vowels[0]);
  const [speedChoices, setSpeedChoices] = useState<Letter[]>(vowels.slice(0, 4));
  const [speedRunning, setSpeedRunning] = useState(false);
  const [speedTime, setSpeedTime] = useState(30);
  const [speedScore, setSpeedScore] = useState(0);
  const [speedCombo, setSpeedCombo] = useState(0);
  const [speedFlash, setSpeedFlash] = useState<"correct" | "wrong" | null>(null);
  const [speedFeedback, setSpeedFeedback] = useState("");
  const [speedAnswerPending, setSpeedAnswerPending] = useState(false);
  const [speedCancelled, setSpeedCancelled] = useState(false);

  const [typingRouteId, setTypingRouteId] = useState(typingRoutes[0].id);
  const [typingPhase, setTypingPhase] = useState<TypingPhase>("idle");
  const [typingStopIndex, setTypingStopIndex] = useState(0);
  const [typingInput, setTypingInput] = useState("");
  const [typingInputInvalid, setTypingInputInvalid] = useState(false);
  const [typingErrorCharacters, setTypingErrorCharacters] = useState(0);
  const [typingWrongAttempts, setTypingWrongAttempts] = useState(0);
  const [typingMissedIds, setTypingMissedIds] = useState<string[]>([]);
  const [typingCompletedCharacters, setTypingCompletedCharacters] = useState(0);
  const [typingElapsedMs, setTypingElapsedMs] = useState(0);
  const [typingFeedback, setTypingFeedback] = useState("选择一条生活词线路，准备发车。");
  const [typingAudioBusy, setTypingAudioBusy] = useState(false);
  const [typingBestRecords, setTypingBestRecords] = useState<Record<string, TypingBestRecord>>({});

  const [blendInitial, setBlendInitial] = useState("ㄱ");
  const [blendVowel, setBlendVowel] = useState("ㅏ");
  const [blendInitialChoices, setBlendInitialChoices] = useState(["ㄱ", "ㄴ", "ㄷ", "ㅁ"]);
  const [blendVowelChoices, setBlendVowelChoices] = useState(["ㅏ", "ㅓ", "ㅗ", "ㅜ"]);
  const [blendSelectedInitial, setBlendSelectedInitial] = useState<string | null>(null);
  const [blendSelectedVowel, setBlendSelectedVowel] = useState<string | null>(null);
  const [blendRound, setBlendRound] = useState(1);
  const [blendScore, setBlendScore] = useState(0);
  const [blendFeedback, setBlendFeedback] = useState<"correct" | "wrong" | null>(null);
  const [blendFinished, setBlendFinished] = useState(false);
  const [blendScope, setBlendScope] = useState<BlendScope>("all");

  const [shadowSet, setShadowSet] = useState<"mixed" | "consonants" | "vowels">("mixed");
  const [shadowQueue, setShadowQueue] = useState<Letter[]>([]);
  const [shadowIndex, setShadowIndex] = useState(0);
  const [shadowStage, setShadowStage] = useState<"repeat" | "rate" | "finished">("repeat");
  const [shadowScore, setShadowScore] = useState(0);
  const [shadowAudioBusy, setShadowAudioBusy] = useState(false);
  const [shadowAudioFailed, setShadowAudioFailed] = useState(false);

  const [phraseTab, setPhraseTab] = useState<"word" | "sentence">("word");
  const [phraseFilter, setPhraseFilter] = useState<"all" | "learning" | "mastered">("all");
  const [phraseReadFilter, setPhraseReadFilter] = useState<PhraseReadFilter>("all");
  const [phraseGroup, setPhraseGroup] = useState("all");
  const [revealedPhrases, setRevealedPhrases] = useState<string[]>([]);
  const [expandedPhraseId, setExpandedPhraseId] = useState<string | null>(null);
  const [masteredPhrases, setMasteredPhrases] = useState<string[]>([]);
  const [phraseQuizTarget, setPhraseQuizTarget] = useState<PhraseItem>(wordItems[0]);
  const [phraseQuizChoices, setPhraseQuizChoices] = useState<PhraseItem[]>(wordItems.slice(0, 4));
  const [phraseQuizAnswer, setPhraseQuizAnswer] = useState<string | null>(null);
  const [phraseQuizRound, setPhraseQuizRound] = useState(1);
  const [phraseQuizScore, setPhraseQuizScore] = useState(0);
  const [phraseQuizCorrectIds, setPhraseQuizCorrectIds] = useState<string[]>([]);
  const [phraseQuizWrongIds, setPhraseQuizWrongIds] = useState<string[]>([]);
  const [phraseQuizPoolIds, setPhraseQuizPoolIds] = useState<string[]>([]);
  const [phraseQuizRoundTotal, setPhraseQuizRoundTotal] = useState(0);
  const [phraseQuizStarted, setPhraseQuizStarted] = useState(false);
  const [phraseQuizFinished, setPhraseQuizFinished] = useState(false);
  const [phraseAudioReady, setPhraseAudioReady] = useState(false);
  const [phraseSectionVisible, setPhraseSectionVisible] = useState(true);
  const [phraseAutoAdvanceCancelled, setPhraseAutoAdvanceCancelled] = useState(false);
  const [phraseAudioFailed, setPhraseAudioFailed] = useState(false);
  const [gameSectionVisible, setGameSectionVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [gameAutoAdvanceCancelled, setGameAutoAdvanceCancelled] = useState(false);
  const [gameAudioReady, setGameAudioReady] = useState(false);
  const [gameAudioFailed, setGameAudioFailed] = useState(false);
  const [comparisonConsonant, setComparisonConsonant] = useState("ㄹ");
  const [comparisonVowel, setComparisonVowel] = useState("ㅏ");
  const [comparisonStatus, setComparisonStatus] = useState("分别试听，先感受短促起音，再听它进入完整音节。");
  const [comparisonBusy, setComparisonBusy] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const gameSectionRef = useRef<HTMLDivElement | null>(null);
  const vowelPracticeRef = useRef<VowelPracticeHandle | null>(null);
  const dailyReviewRef = useRef<DailyReviewHandle | null>(null);
  const batchimLessonRef = useRef<BatchimLessonHandle | null>(null);
  const phraseSectionRef = useRef<HTMLElement | null>(null);
  const speedDeadlineRef = useRef(0);
  const speedRunTokenRef = useRef(0);
  const speedAcceptingAnswersRef = useRef(false);
  const speedAnswerLockedRef = useRef(false);
  const speedCancelledRef = useRef(false);
  const typingPhaseRef = useRef<TypingPhase>("idle");
  const typingStopIndexRef = useRef(0);
  const typingSessionRef = useRef(0);
  const typingRunningSinceRef = useRef(0);
  const typingAccumulatedMsRef = useRef(0);
  const typingSubmissionLockedRef = useRef(false);
  const typingCompositionRef = useRef(false);
  const typingMissedIdsRef = useRef<string[]>([]);
  const typingErrorCharactersRef = useRef(0);
  const typingCompletedCharactersRef = useRef(0);
  const typingComboRef = useRef(0);
  const typingReplayTokenRef = useRef(0);
  const typingBestRecordsRef = useRef<Record<string, TypingBestRecord>>({});
  const typingBestPersistenceGenerationRef = useRef(0);
  const typingBestDirtyRef = useRef<Record<string, TypingBestRecord>>({});
  const retryTypingBestPersistenceRef = useRef<() => void>(() => {});
  const reloadTypingBestRecordsRef = useRef<() => void>(() => {});
  const typingResumeFocusPendingRef = useRef(false);
  const typingInputRef = useRef<HTMLInputElement | null>(null);
  const typingResultHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const matchResetTimerRef = useRef<number | null>(null);
  const matchPlaybackRequestRef = useRef(0);
  const matchLockedRef = useRef(false);
  const gamePlaybackRequestRef = useRef(0);
  const phrasePlaybackRequestRef = useRef(0);
  const comparisonSequenceRef = useRef(0);
  const comparisonPlaybackActiveRef = useRef(false);
  const noticeTimerRef = useRef<number | null>(null);
  const speedFlashTimerRef = useRef<number | null>(null);
  const keyboardModalRef = useRef<HTMLDivElement | null>(null);
  const keyboardPreviousFocusRef = useRef<HTMLElement | null>(null);
  const keyboardFallbackRef = useRef({ keyboardZone, gameMode, phraseTab });
  const gameStatsRef = useRef<GameStats>(emptyStats);
  const gameSectionVisibleRef = useRef(true);
  const masteredRef = useRef<string[]>([]);
  const masteredPhrasesRef = useRef<string[]>([]);
  const progressLedgerIdRef = useRef("");
  const ownProgressLedgerRef = useRef<ProgressLedger | null>(null);
  const ownLedgerPersistedClockRef = useRef<ProgressClock>("0");
  const ownProgressLedgerSealedRef = useRef(false);
  const progressPersistenceGenerationRef = useRef(0);
  const progressEpochRef = useRef<string | null>(null);
  const progressEpochReadyRef = useRef(false);
  const progressEpochNeedsFreshRef = useRef(false);
  const lastAcceptedProgressEpochMetaRef = useRef<ProgressEpochMeta | null>(null);
  const progressEpochMetaWarningShownRef = useRef(false);
  const lastProgressBaselineRef = useRef<ProgressSnapshot | null>(null);
  const pendingProgressOperationsRef = useRef<PendingProgressOperation[]>([]);
  const knownProgressLedgersRef = useRef<ProgressLedger[]>([]);
  const progressCheckpointRef = useRef<ProgressCheckpoint | null>(null);
  const progressRollbackDetectedRef = useRef(false);
  const progressStorageWarningShownRef = useRef(false);
  const progressRecoveryWarningShownRef = useRef(false);
  const shadowPlaybackRequestRef = useRef(0);
  const shadowAudioBusyRef = useRef(false);
  const audioActivityRef = useRef<AudioActivity>("reference");
  const listenQuestionTokenRef = useRef(0);
  const listenAdvancedTokenRef = useRef(-1);
  const phraseQuestionTokenRef = useRef(0);
  const phraseAdvancedTokenRef = useRef(-1);
  const blendQuestionTokenRef = useRef(0);
  const blendAdvancedTokenRef = useRef(-1);

  if (!progressLedgerIdRef.current) progressLedgerIdRef.current = createPageProgressLedgerId();

  const cancelMatchInteraction = useCallback((feedback = "先翻一张牌，再找它的另一半。") => {
    matchPlaybackRequestRef.current += 1;
    matchLockedRef.current = false;
    setMatchLocked(false);
    setMatchSelected([]);
    setMatchFeedback(feedback);
    if (matchResetTimerRef.current !== null) {
      window.clearTimeout(matchResetTimerRef.current);
      matchResetTimerRef.current = null;
    }
  }, []);

  const cancelActiveSpeedRound = useCallback((message: string) => {
    if (!speedAcceptingAnswersRef.current) return false;
    speedRunTokenRef.current += 1;
    speedAcceptingAnswersRef.current = false;
    speedAnswerLockedRef.current = true;
    setSpeedAnswerPending(false);
    setSpeedTime(0);
    setSpeedRunning(false);
    setSpeedFeedback(message);
    speedCancelledRef.current = true;
    setSpeedCancelled(true);
    gamePlaybackRequestRef.current += 1;
    activeAudio?.pause();
    stopSpeechSynthesis();
    return true;
  }, []);

  const pauseTypingRun = useCallback((message: string) => {
    if (typingPhaseRef.current !== "typing") return false;
    const now = performance.now();
    if (typingRunningSinceRef.current > 0) {
      typingAccumulatedMsRef.current += Math.max(0, now - typingRunningSinceRef.current);
    }
    typingRunningSinceRef.current = 0;
    typingPhaseRef.current = "paused";
    typingReplayTokenRef.current += 1;
    typingSubmissionLockedRef.current = true;
    typingCompositionRef.current = false;
    typingResumeFocusPendingRef.current = true;
    if (typingInputRef.current) setTypingInput(typingInputRef.current.value);
    setTypingAudioBusy(false);
    typingInputRef.current?.blur();
    setTypingElapsedMs(Math.max(1, Math.round(typingAccumulatedMsRef.current)));
    setTypingFeedback(message);
    setTypingPhase("paused");
    return true;
  }, []);

  const resetTypingRun = useCallback((message = "选择一条生活词线路，准备发车。") => {
    typingSessionRef.current += 1;
    typingReplayTokenRef.current += 1;
    setTypingAudioBusy(false);
    gamePlaybackRequestRef.current += 1;
    if (audioActivityRef.current === "game") activeAudio?.pause();
    typingPhaseRef.current = "idle";
    typingStopIndexRef.current = 0;
    typingRunningSinceRef.current = 0;
    typingAccumulatedMsRef.current = 0;
    typingSubmissionLockedRef.current = false;
    typingCompositionRef.current = false;
    typingResumeFocusPendingRef.current = false;
    typingMissedIdsRef.current = [];
    typingErrorCharactersRef.current = 0;
    typingCompletedCharactersRef.current = 0;
    typingComboRef.current = 0;
    setTypingPhase("idle");
    setTypingStopIndex(0);
    setTypingInput("");
    setTypingInputInvalid(false);
    setTypingErrorCharacters(0);
    setTypingWrongAttempts(0);
    setTypingMissedIds([]);
    setTypingCompletedCharacters(0);
    setTypingElapsedMs(0);
    setTypingFeedback(message);
  }, []);

  const focusPausedTypingResume = useCallback(() => {
    if (typingPhaseRef.current !== "paused" || !typingResumeFocusPendingRef.current || !gameSectionVisibleRef.current) return;
    window.requestAnimationFrame(() => {
      const active = document.activeElement;
      const typingPanel = document.getElementById("game-panel-typing");
      if (active instanceof HTMLElement
        && active !== document.body
        && active.isConnected
        && !typingPanel?.contains(active)) return;
      const resume = document.getElementById("typing-resume");
      if (!resume) return;
      resume.focus({ preventScroll: true });
      typingResumeFocusPendingRef.current = false;
    });
  }, []);

  const cancelComparisonSequence = useCallback((
    stopAudio = true,
    interruptedStatus = "对照播放已停止；请重新试听。",
  ) => {
    const wasActive = comparisonPlaybackActiveRef.current;
    comparisonPlaybackActiveRef.current = false;
    comparisonSequenceRef.current += 1;
    setComparisonBusy(false);
    if (wasActive) setComparisonStatus(interruptedStatus);
    if (stopAudio) activeAudio?.pause();
  }, []);

  const claimGameActivity = useCallback(() => {
    vowelPracticeRef.current?.stop();
    dailyReviewRef.current?.stop();
    batchimLessonRef.current?.stop();
    const shouldStopOtherAudio = audioActivityRef.current !== "game";
    setKeyboardZone("games");
    setPhraseAutoAdvanceCancelled(true);
    phrasePlaybackRequestRef.current += 1;
    phraseQuestionTokenRef.current += 1;
    setPhraseAudioReady(false);
    setPhraseAudioFailed(false);
    if (shouldStopOtherAudio) {
      activeAudio?.pause();
      stopSpeechSynthesis();
    }
  }, []);

  const claimPhraseActivity = useCallback(() => {
    vowelPracticeRef.current?.stop();
    dailyReviewRef.current?.stop();
    batchimLessonRef.current?.stop();
    resetKoreanInput();
    const shouldStopOtherAudio = !audioActivityRef.current.startsWith("phrase-");
    setKeyboardZone("phrases");
    setPhraseAutoAdvanceCancelled(true);
    setGameAutoAdvanceCancelled(true);
    phraseQuestionTokenRef.current += 1;
    listenQuestionTokenRef.current += 1;
    blendQuestionTokenRef.current += 1;
    cancelActiveSpeedRound("已开始词句学习，本轮极速认读已取消。");
    pauseTypingRun("已离开训练场，本次行程已暂停；返回后可继续。");
    gamePlaybackRequestRef.current += 1;
    cancelMatchInteraction();
    setGameAudioReady(false);
    setGameAudioFailed(false);
    shadowPlaybackRequestRef.current += 1;
    if (shadowAudioBusyRef.current) setShadowAudioFailed(true);
    shadowAudioBusyRef.current = false;
    setShadowAudioBusy(false);
    cancelComparisonSequence(false, "已切换学习内容，对照播放已停止；返回后可重新试听。");
    if (shouldStopOtherAudio) {
      activeAudio?.pause();
      stopSpeechSynthesis();
    }
  }, [cancelActiveSpeedRound, cancelComparisonSequence, cancelMatchInteraction, pauseTypingRun, resetKoreanInput]);

  const syllable = useMemo(() => makeSyllable(initial, vowel), [initial, vowel]);
  const blendTarget = useMemo(() => makeSyllable(blendInitial, blendVowel), [blendInitial, blendVowel]);
  const currentLetters = activeSet === "consonants" ? consonants : vowels;
  const letterLessonChars = letterLesson === "core-vowels" ? coreVowelChars
    : letterLesson === "basic-consonants" ? basicConsonantChars
      : letterLesson === "advanced-consonants" ? advancedConsonantChars
        : letterLesson === "advanced-vowels" ? advancedVowelChars : null;
  const letterLessonLabel = letterLesson === "core-vowels" ? "核心元音 6 音"
    : letterLesson === "basic-consonants" ? "基础辅音 10 音"
      : letterLesson === "advanced-consonants" ? "进阶辅音 9 音"
        : letterLesson === "advanced-vowels" ? "进阶元音 15 音" : activeSet === "consonants" ? "辅音" : "元音";
  const lessonLetters = currentLetters
    .filter((letter) => !letterLessonChars || letterLessonChars.includes(letter.char))
    .sort((left, right) => letterLessonChars ? letterLessonChars.indexOf(left.char) - letterLessonChars.indexOf(right.char) : 0);
  const visibleLetters = lessonLetters.filter((letter) => letterFilter === "all" || !mastered.includes(letter.char));
  const currentDrillPool = lessonLetters.filter((letter) => letter.char !== "ㅇ" && !mastered.includes(letter.char));
  const comparisonLetter = consonants.find((letter) => letter.char === comparisonConsonant) ?? consonants[0];
  const comparisonSyllable = useMemo(() => makeSyllable(comparisonConsonant, comparisonVowel), [comparisonConsonant, comparisonVowel]);
  const shadowCurrent = shadowQueue[shadowIndex] ?? consonants[0];
  const phraseTypeItems = phraseTab === "word" ? wordItems : sentenceItems;
  const phraseGroups = useMemo(() => [...new Set((phraseTab === "word" ? wordItems : sentenceItems).map((item) => item.group))], [phraseTab]);
  const featuredPhraseGroups = phraseTab === "word" ? [STARTER_PHRASE_GROUP] : [SURVIVAL_PHRASE_GROUP];
  const phraseGroupItems = phraseTypeItems.filter((item) => phraseMatchesGroup(item, phraseGroup));
  const masteredLetterSet = useMemo(() => new Set(mastered), [mastered]);
  const phraseReadingLevels = useMemo(() => new Map(phraseTypeItems.map((item) => [item.id, phraseReadingLevel(item, masteredLetterSet)])), [phraseTypeItems, masteredLetterSet]);
  const phraseReadyCount = phraseGroupItems.filter((item) => phraseReadingLevels.get(item.id) === "ready").length;
  const phraseQuizItems = phraseReadFilter === "ready" ? phraseGroupItems.filter((item) => phraseReadingLevels.get(item.id) === "ready") : phraseGroupItems;
  const confirmablePhraseItems = phraseGroupItems.filter((item) => phraseQuizCorrectIds.includes(item.id) && !phraseQuizWrongIds.includes(item.id) && !masteredPhrases.includes(item.id));
  const confirmableListenChars = listenCorrectChars.filter((char) => !listenWrongChars.includes(char) && listenMasteryScope.includes(char) && !mastered.includes(char));
  const phraseQuizTargetCount = phraseQuizItems.length;
  const phraseQuizAvailableTotal = phraseQuizRoundLimit(phraseQuizTargetCount, phraseGroup !== "all" || phraseReadFilter === "ready");
  const phraseQuizTotal = phraseQuizStarted ? phraseQuizRoundTotal : phraseQuizAvailableTotal;
  const visiblePhraseItems = phraseGroupItems.filter((item) => (phraseFilter === "all" || (phraseFilter === "mastered" ? masteredPhrases.includes(item.id) : !masteredPhrases.includes(item.id)))
    && (phraseReadFilter === "all" || phraseReadingLevels.get(item.id) === "ready"));
  const typingRoute = typingRoutes.find((route) => route.id === typingRouteId) ?? typingRoutes[0];
  const typingItems = typingRouteItems.get(typingRoute.id) ?? [];
  const typingCurrent = typingItems[typingStopIndex] ?? typingItems[0] ?? wordItems[0];
  const typingAccuracy = calculateTypingAccuracy(typingCompletedCharacters, typingErrorCharacters);
  const typingCpm = calculateTypingCpm(typingCompletedCharacters, typingElapsedMs);
  const typingBest = typingBestRecords[typingRoute.id];
  const coreVowelMastered = coreVowelChars.filter((char) => mastered.includes(char)).length;
  const basicConsonantMastered = basicConsonantChars.filter((char) => mastered.includes(char)).length;
  const advancedConsonantMastered = advancedConsonantChars.filter((char) => mastered.includes(char)).length;
  const advancedVowelMastered = advancedVowelChars.filter((char) => mastered.includes(char)).length;
  const starterPhraseMastered = starterPhraseItems.filter((item) => masteredPhrases.includes(item.id)).length;
  const survivalMastered = [...survivalPhraseIds].filter((id) => masteredPhrases.includes(id)).length;
  const fullReviewPrerequisitesComplete = coreVowelMastered === coreVowelChars.length
    && basicConsonantMastered === basicConsonantChars.length
    && beginnerBlendCompleted
    && starterPhraseMastered >= starterPhraseItems.length
    && survivalMastered >= 3
    && advancedConsonantMastered === advancedConsonantChars.length
    && advancedVowelMastered === advancedVowelChars.length;
  const beginnerNextStep = coreVowelMastered < coreVowelChars.length ? "core-vowels"
    : basicConsonantMastered < basicConsonantChars.length ? "basic-consonants"
      : !beginnerBlendCompleted ? "blend"
        : starterPhraseMastered < starterPhraseItems.length ? "starter-phrases"
          : survivalMastered < 3 ? "survival-phrases"
            : advancedConsonantMastered < advancedConsonantChars.length ? "advanced-consonants"
              : advancedVowelMastered < advancedVowelChars.length ? "advanced-vowels"
                : !fullReviewCompleted ? "review" : "complete";
  const beginnerNextLabel = beginnerNextStep === "core-vowels" ? "继续：核心元音 6 音"
    : beginnerNextStep === "basic-consonants" ? "继续：基础辅音 10 音"
      : beginnerNextStep === "blend" ? "继续：拼读第一局"
        : beginnerNextStep === "starter-phrases" ? "继续：已学字母首读"
          : beginnerNextStep === "survival-phrases" ? "继续：生存 6 句"
            : beginnerNextStep === "advanced-consonants" ? "继续：补齐进阶辅音 9 音"
              : beginnerNextStep === "advanced-vowels" ? "继续：补齐进阶元音 15 音"
                : beginnerNextStep === "review" ? "最后验收：39 个可听音" : "完整路线已通过 · 再复习";
  const blendSessionLabel = blendScope === "starter" ? "新手 10 辅音 × 6 元音" : "完整 40 音拼读";
  const blockExample = blockExamples.find((item) => item.id === blockExampleId) ?? blockExamples[0];
  const blockParts = decomposeHangulSyllable(blockExample.syllable);
  const weakest = useMemo(() => Object.entries(gameStats.mistakes).sort((a, b) => b[1] - a[1]).slice(0, 3), [gameStats.mistakes]);
  const weekData = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    if (!localToday) return { key: `loading-${index}`, label: "·", xp: 0 };
    const date = new Date(`${localToday}T12:00:00`);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = localDateKey(date);
    return { key, label: ["日", "一", "二", "三", "四", "五", "六"][date.getDay()], xp: gameStats.history[key] ?? 0 };
  }), [gameStats.history, localToday]);
  const weekMax = Math.max(80, ...weekData.map((day) => day.xp));
  const directKoreanKeyboard = keyboardInputMode === "hangul" && (gameMode === "listen" || gameMode === "blend");
  const gameKeyboardHint = directKoreanKeyboard ? "韩文键位直接选字 · 数字键也可选 · Space 重播 · Enter 确认 / 下一题"
    : gameMode === "listen" ? listenStarted ? "1–4 / A S D F 选择 · Space / R 重播 · Enter 下一题" : "Enter 开始 · 开始后用 1–4 / A S D F 选择"
    : gameMode === "shadow" ? "Space / R 重播 · Enter 核对 · A 不稳 · S 熟悉"
      : gameMode === "match" ? "Q W E R / A S D F / Z X C V 翻牌"
        : gameMode === "blend" ? "A S D F 辅音 · J K L ; 元音 · Space / R 重播"
          : gameMode === "typing" ? "1–4 选线路 · Enter 发车 · 输入框内 F8 重播 / Esc 暂停"
            : "1–4 / A S D F 选择 · Enter 开始";

  const rotateProgressLedgerId = useCallback(() => {
    const ledgerId = createFreshPageProgressLedgerId();
    progressLedgerIdRef.current = ledgerId;
    ownProgressLedgerRef.current = null;
    ownLedgerPersistedClockRef.current = "0";
    ownProgressLedgerSealedRef.current = false;
    return ledgerId;
  }, []);

  const blockUnexpectedProgressEpoch = useCallback(() => {
    const acceptedEpoch = progressEpochRef.current;
    if (acceptedEpoch !== null) {
      persistProgressRollbackGuard(progressEpochRollbackGuardKey(acceptedEpoch));
    }
    progressRollbackDetectedRef.current = true;
    progressEpochReadyRef.current = false;
    if (progressEpochMetaWarningShownRef.current) return;
    progressEpochMetaWarningShownRef.current = true;
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    setShareNotice("检测到未授权的旧进度代际；本页已暂停进度读写，并保留当前进度");
    noticeTimerRef.current = window.setTimeout(() => {
      setShareNotice("");
      noticeTimerRef.current = null;
    }, 6200);
  }, []);

  const ensureProgressEpoch = useCallback(async (forceFresh: boolean) => {
    const persistenceGeneration = progressPersistenceGenerationRef.current;
    let unexpectedMeta = false;
    const commit = () => {
      const raw = window.localStorage.getItem(PROGRESS_EPOCH_META_KEY);
      const existing = parseProgressEpochMeta(raw);
      if (raw !== null && !existing) return null;
      const accepted = lastAcceptedProgressEpochMetaRef.current;
      let migrating = existing;
      if (migrating && forceFresh
        && (migrating.source === "legacy" || migrating.epoch === accepted?.epoch)) {
        migrating = null;
      }
      if (!migrating) {
        if (accepted && !forceFresh) {
          unexpectedMeta = true;
          return null;
        }
        const hasLegacy = forceFresh ? false : hasAnyUnscopedProgressData();
        if (hasLegacy === null) return null;
        migrating = {
          version: 1,
          epoch: createProgressEpochId(),
          state: "migrating",
          source: hasLegacy ? "legacy" : "empty",
        };
        const serialized = serializeProgressEpochMeta(migrating);
        window.localStorage.setItem(PROGRESS_EPOCH_META_KEY, serialized);
        if (window.localStorage.getItem(PROGRESS_EPOCH_META_KEY) !== serialized) return null;
      }
      if (!isProgressEpochMetaTransitionAllowed(accepted, migrating, forceFresh)) {
        unexpectedMeta = true;
        return null;
      }
      if (migrating.state === "ready") {
        const baselineRead = readProgressEpochBaselineCopies(migrating.epoch);
        if (!baselineRead.ok || !baselineRead.baseline) return null;
        if (baselineRead.needsRepair && !writeProgressEpochBaselineCopies(
          migrating.epoch,
          baselineRead.baseline.snapshot,
          () => window.localStorage.getItem(PROGRESS_EPOCH_META_KEY) === serializeProgressEpochMeta(migrating as ProgressEpochMeta),
        )) return null;
        return migrating;
      }
      if (!prepareProgressEpochBaseline(migrating)) return null;
      const ready: ProgressEpochMeta = { ...migrating, state: "ready" };
      if (!isProgressEpochMetaTransitionAllowed(accepted, ready, forceFresh)) {
        unexpectedMeta = true;
        return null;
      }
      const migratingSerialized = serializeProgressEpochMeta(migrating);
      if (window.localStorage.getItem(PROGRESS_EPOCH_META_KEY) !== migratingSerialized) return null;
      const readySerialized = serializeProgressEpochMeta(ready);
      window.localStorage.setItem(PROGRESS_EPOCH_META_KEY, readySerialized);
      return window.localStorage.getItem(PROGRESS_EPOCH_META_KEY) === readySerialized ? ready : null;
    };
    try {
      const meta = "locks" in navigator && navigator.locks
        ? await navigator.locks.request(PROGRESS_EPOCH_LOCK_NAME, commit)
        : commit();
      if (unexpectedMeta) {
        blockUnexpectedProgressEpoch();
        return false;
      }
      if (!meta || meta.state !== "ready" || persistenceGeneration !== progressPersistenceGenerationRef.current) return false;
      const accepted = lastAcceptedProgressEpochMetaRef.current;
      const serialized = serializeProgressEpochMeta(meta);
      const currentRaw = window.localStorage.getItem(PROGRESS_EPOCH_META_KEY);
      if (currentRaw !== serialized) {
        const current = parseProgressEpochMeta(currentRaw);
        if (current && !isProgressEpochMetaTransitionAllowed(accepted, current, forceFresh)) {
          blockUnexpectedProgressEpoch();
        }
        return false;
      }
      if (!isProgressEpochMetaTransitionAllowed(accepted, meta, forceFresh)) {
        blockUnexpectedProgressEpoch();
        return false;
      }
      lastAcceptedProgressEpochMetaRef.current = meta;
      progressEpochRef.current = meta.epoch;
      progressEpochReadyRef.current = true;
      progressEpochNeedsFreshRef.current = false;
      return true;
    } catch {
      return false;
    }
  }, [blockUnexpectedProgressEpoch]);

  const persistSharedProgressRollbackGuard = useCallback(() => {
    const epoch = progressEpochRef.current;
    return progressEpochReadyRef.current && epoch !== null
      ? persistProgressRollbackGuard(progressEpochRollbackGuardKey(epoch))
      : false;
  }, []);

  const reconcileProgressStorageRead = useCallback((ledgerRead: ReturnType<typeof readStoredProgressLedgers>) => {
    if (!ledgerRead.ok) return;
    const previouslyKnown = knownProgressLedgersRef.current;
    const previouslyKnownById = new Map(previouslyKnown.map((ledger) => [ledger.ledgerId, ledger]));
    let rollbackDetected = false;
    const reconciledLedgers = ledgerRead.ledgers.map((incoming) => {
      const previous = previouslyKnownById.get(incoming.ledgerId);
      if (!previous || compareProgressClocks(previous.clock, incoming.clock) <= 0) return incoming;
      rollbackDetected = true;
      return previous;
    });
    const retainedInvalidLedgers = previouslyKnown.filter((ledger) => ledgerRead.invalidPhysicalLedgerIds.has(ledger.ledgerId));
    knownProgressLedgersRef.current = [
      ...reconciledLedgers,
      ...retainedInvalidLedgers.filter((ledger) => !reconciledLedgers.some((current) => current.ledgerId === ledger.ledgerId)),
    ];
    const previousCheckpoint = progressCheckpointRef.current;
    let effectiveCheckpoint = ledgerRead.checkpoint ?? previousCheckpoint;
    if (ledgerRead.checkpoint && previousCheckpoint
      && compareProgressClocks(previousCheckpoint.clock, ledgerRead.checkpoint.clock) > 0) {
      rollbackDetected = true;
      effectiveCheckpoint = previousCheckpoint;
    }
    progressCheckpointRef.current = effectiveCheckpoint;
    if (rollbackDetected) {
      persistSharedProgressRollbackGuard();
      progressRollbackDetectedRef.current = true;
    }
    if (rollbackDetected && !progressRecoveryWarningShownRef.current) {
      progressRecoveryWarningShownRef.current = true;
      showNotice("检测到浏览器返回较旧进度；本页已保留较新记录，并暂停可能覆盖它的自动压缩", 6200);
    }

    const own = ownProgressLedgerRef.current;
    const ownWasDeleted = own
      && ownLedgerPersistedClockRef.current !== "0"
      && !ledgerRead.physicalLedgerIds.has(own.ledgerId);
    const ownWasCompacted = own && Object.hasOwn(effectiveCheckpoint?.included ?? {}, own.ledgerId);
    if (ownWasDeleted || ownWasCompacted) {
      rotateProgressLedgerId();
      return;
    }

    if (own) return;
    const ledgerId = progressLedgerIdRef.current;
    const storedOwn = ledgerRead.ledgers.find((ledger) => ledger.ledgerId === ledgerId);
    const storedOwnSeal = ledgerRead.seals.get(ledgerId);
    if (storedOwnSeal?.clock === storedOwn?.clock || Object.hasOwn(effectiveCheckpoint?.included ?? {}, ledgerId)) {
      rotateProgressLedgerId();
    } else if (storedOwn) {
      ownProgressLedgerRef.current = storedOwn;
      ownLedgerPersistedClockRef.current = storedOwn.clock;
    }
  }, [persistSharedProgressRollbackGuard, rotateProgressLedgerId]);

  const persistOwnProgressLedger = useCallback(() => {
    const own = ownProgressLedgerRef.current;
    if (!own) return true;
    const epoch = progressEpochRef.current;
    if (!progressEpochReadyRef.current || epoch === null) return false;
    const persistenceGeneration = progressPersistenceGenerationRef.current;
    const key = progressEpochLedgerKey(epoch, own.ledgerId);
    const serialized = serializeProgressLedger(own);
    if (ownLedgerPersistedClockRef.current !== "0") {
      try {
        const storedRaw = window.localStorage.getItem(key);
        if (storedRaw === null) {
          rotateProgressLedgerId();
          return true;
        }
        if (compareProgressClocks(ownLedgerPersistedClockRef.current, own.clock) >= 0 && storedRaw === serialized) return true;
      } catch {
        return false;
      }
    }
    try {
      const canPersist = () => persistenceGeneration === progressPersistenceGenerationRef.current
        && progressEpochReadyRef.current
        && progressEpochRef.current === epoch;
      if (!canPersist()) return true;
      window.localStorage.setItem(key, serialized);
      if (!canPersist()) return true;
      if (window.localStorage.getItem(key) !== serialized) return false;
      ownLedgerPersistedClockRef.current = own.clock;
      knownProgressLedgersRef.current = [
        ...knownProgressLedgersRef.current.filter((ledger) => ledger.ledgerId !== own.ledgerId),
        own,
      ];
      progressStorageWarningShownRef.current = false;
      return true;
    } catch {
      return false;
    }
  }, [rotateProgressLedgerId]);

  const persistOwnProgressLedgerSeal = useCallback((ledger: ProgressLedger) => {
    const epoch = progressEpochRef.current;
    if (!progressEpochReadyRef.current || epoch === null) return false;
    const persistenceGeneration = progressPersistenceGenerationRef.current;
    return persistProgressLedgerSeal(
      ledger,
      epoch,
      () => persistenceGeneration === progressPersistenceGenerationRef.current
        && progressEpochReadyRef.current
        && progressEpochRef.current === epoch,
    );
  }, []);

  const syncProgressFromStorage = useCallback(() => {
    const epoch = progressEpochRef.current;
    if (!progressEpochReadyRef.current || epoch === null) return;
    const today = localDateKey();
    const baselineRead = readProgressEpochBaselineCopies(epoch);
    if (baselineRead.ok && baselineRead.baseline) {
      lastProgressBaselineRef.current = baselineRead.baseline.snapshot;
      if (baselineRead.needsRepair) {
        const generation = progressPersistenceGenerationRef.current;
        writeProgressEpochBaselineCopies(epoch, baselineRead.baseline.snapshot, () => (
          generation === progressPersistenceGenerationRef.current
          && progressEpochReadyRef.current
          && progressEpochRef.current === epoch
        ));
      }
    }
    const baseline = baselineRead.baseline?.snapshot ?? lastProgressBaselineRef.current;
    if (!baseline) {
      if (!progressRecoveryWarningShownRef.current) {
        progressRecoveryWarningShownRef.current = true;
        showNotice("进度迁移基线的两份副本均不可读；本页已暂停进度刷新，原记录不会被当作空进度覆盖", 6200);
      }
      return;
    }
    const ledgerRead = readStoredProgressLedgers(epoch);
    reconcileProgressStorageRead(ledgerRead);
    const stored = knownProgressLedgersRef.current;
    const own = ownProgressLedgerRef.current;
    const merged = mergeProgress(
      baseline,
      own ? [...stored, own] : stored,
      today,
      progressValidation,
      progressCheckpointRef.current,
    );
    setLocalToday(today);
    masteredRef.current = merged.mastered;
    masteredPhrasesRef.current = merged.masteredPhrases;
    gameStatsRef.current = merged.stats;
    setMastered(merged.mastered);
    setMasteredPhrases(merged.masteredPhrases);
    setGameStats(merged.stats);
    if (ledgerRead.ok) {
      persistOwnProgressLedger();
      if ((ledgerRead.checkpointCorrupted || ledgerRead.invalidPhysicalLedgerIds.size > 0
        || !baselineRead.ok)
        && !progressRecoveryWarningShownRef.current) {
        progressRecoveryWarningShownRef.current = true;
        showNotice("检测到部分进度副本损坏；已保留并合并仍可验证的记录，不会自动删除原数据", 6200);
      }
    }
  }, [persistOwnProgressLedger, reconcileProgressStorageRead]);

  const applyProgressOperations = useCallback((
    operations: readonly ProgressLedgerOperation[],
    onApplied?: () => void,
  ) => {
    try {
      const epoch = progressEpochRef.current;
      if (!progressEpochReadyRef.current || epoch === null) return false;
      if (operations.length === 0) return true;
      if (ownProgressLedgerSealedRef.current) rotateProgressLedgerId();
      const ledgerRead = readStoredProgressLedgers(epoch);
      reconcileProgressStorageRead(ledgerRead);
      const stored = knownProgressLedgersRef.current;
      const ledgerId = progressLedgerIdRef.current;
      const storedOwn = stored.find((ledger) => ledger.ledgerId === ledgerId);
      const currentOwn = ownProgressLedgerRef.current;
      const current = storedOwn && (!currentOwn || compareProgressClocks(storedOwn.clock, currentOwn.clock) > 0)
        ? storedOwn
        : currentOwn ?? createProgressLedger(ledgerId);
      let next = current;
      for (const operation of operations) {
        const clock = nextProgressLedgerClock([...stored, next], Date.now(), progressCheckpointClock(progressCheckpointRef.current));
        next = applyProgressLedgerOperation(next, operation, clock, progressValidation);
      }
      ownProgressLedgerRef.current = next;
      onApplied?.();
      const persisted = persistOwnProgressLedger();
      if (persisted && document.visibilityState !== "visible") {
        const storedOwn = ownProgressLedgerRef.current;
        if (storedOwn && persistOwnProgressLedgerSeal(storedOwn)) ownProgressLedgerSealedRef.current = true;
      }
      return persisted;
    } catch {
      return false;
    }
  }, [persistOwnProgressLedger, persistOwnProgressLedgerSeal, reconcileProgressStorageRead, rotateProgressLedgerId]);

  const appendProgressOperation = useCallback((operation: ProgressLedgerOperation) => {
    if (!progressEpochReadyRef.current || progressEpochRef.current === null) {
      pendingProgressOperationsRef.current.push({
        generation: progressPersistenceGenerationRef.current,
        operation,
      });
      return false;
    }
    return applyProgressOperations([operation]);
  }, [applyProgressOperations]);

  const flushPendingProgressOperations = useCallback(() => {
    const generation = progressPersistenceGenerationRef.current;
    const pending = pendingProgressOperationsRef.current.filter((item) => item.generation === generation);
    pendingProgressOperationsRef.current = pendingProgressOperationsRef.current
      .filter((item) => item.generation >= generation);
    if (pending.length === 0) return true;
    return applyProgressOperations(pending.map((item) => item.operation), () => {
      pendingProgressOperationsRef.current = pendingProgressOperationsRef.current
        .filter((item) => item.generation !== generation);
    });
  }, [applyProgressOperations]);

  const refreshProgress = useCallback(() => {
    syncProgressFromStorage();
  }, [syncProgressFromStorage]);

  const sealOwnProgressLedger = useCallback(() => {
    if (!progressEpochReadyRef.current || progressEpochRef.current === null) return;
    if (!persistOwnProgressLedger()) return;
    const own = ownProgressLedgerRef.current;
    if (!own || compareProgressClocks(ownLedgerPersistedClockRef.current, own.clock) < 0) return;
    if (persistOwnProgressLedgerSeal(own)) ownProgressLedgerSealedRef.current = true;
  }, [persistOwnProgressLedger, persistOwnProgressLedgerSeal]);

  const compactSealedProgressLedgers = useCallback(() => {
    const epoch = progressEpochRef.current;
    if (!progressEpochReadyRef.current || epoch === null) return;
    const persistenceGeneration = progressPersistenceGenerationRef.current;
    const canPersist = () => persistenceGeneration === progressPersistenceGenerationRef.current
      && progressEpochReadyRef.current
      && progressEpochRef.current === epoch;
    const compact = () => {
      const rollbackBlocksCompaction = () => {
        if (!canPersist()) return true;
        if (progressRollbackDetectedRef.current) {
          persistSharedProgressRollbackGuard();
          return true;
        }
        return progressRollbackGuardBlocksCompaction(progressEpochRollbackGuardKey(epoch));
      };
      if (rollbackBlocksCompaction()) return;
      const stored = readStoredProgressLedgers(epoch);
      if (!stored.ok) return;
      if (stored.checkpointCorrupted
        || stored.invalidPhysicalLedgerIds.size > 0
        || (progressCheckpointRef.current !== null && stored.checkpoint === null)) return;
      if (rollbackBlocksCompaction()) return;
      if (stored.checkpointNeedsRepair && stored.checkpoint
        && !writeProgressCheckpointCopies(stored.checkpoint, epoch, canPersist)) return;
      const deletable = stored.ledgers.filter((ledger) => {
        const seal = stored.seals.get(ledger.ledgerId);
        return ledger.ledgerId !== progressLedgerIdRef.current && seal?.clock === ledger.clock;
      });
      const pendingCount = Object.keys(stored.checkpoint?.included ?? {}).length;
      const newCandidates = deletable.filter((ledger) => !Object.hasOwn(stored.checkpoint?.included ?? {}, ledger.ledgerId));
      if (newCandidates.length < 8 && pendingCount === 0) return;

      try {
        if (rollbackBlocksCompaction()) return;
        const provisional = compactProgressLedgers(stored.checkpoint, newCandidates);
        if (rollbackBlocksCompaction()) return;
        if (!writeProgressCheckpointCopies(provisional, epoch, canPersist)) return;

        for (const ledger of deletable) {
          if (rollbackBlocksCompaction()) return;
          if (!Object.hasOwn(provisional.included, ledger.ledgerId)) continue;
          const latestLedger = parseProgressLedger(
            window.localStorage.getItem(progressEpochLedgerKey(epoch, ledger.ledgerId)),
            progressValidation,
            ledger.ledgerId,
          );
          const latestSeal = parseProgressLedgerSeal(
            window.localStorage.getItem(progressEpochLedgerSealKey(epoch, ledger.ledgerId)),
            ledger.ledgerId,
          );
          if (!latestLedger || latestSeal?.clock !== latestLedger.clock || provisional.included[ledger.ledgerId] !== latestLedger.clock) continue;
          window.localStorage.removeItem(progressEpochLedgerKey(epoch, ledger.ledgerId));
          window.localStorage.removeItem(progressEpochLedgerSealKey(epoch, ledger.ledgerId));
        }

        if (rollbackBlocksCompaction()) return;
        const afterDelete = readStoredProgressLedgers(epoch);
        if (!afterDelete.ok) return;
        const finalized = finalizeProgressCheckpoint(provisional, afterDelete.physicalLedgerIds);
        for (const ledgerId of afterDelete.seals.keys()) {
          if (!afterDelete.physicalLedgerIds.has(ledgerId)) window.localStorage.removeItem(progressEpochLedgerSealKey(epoch, ledgerId));
        }
        if (rollbackBlocksCompaction()) return;
        if (!writeProgressCheckpointCopies(finalized, epoch, canPersist)) return;
        syncProgressFromStorage();
      } catch {
        // The provisional checkpoint is crash-safe; a later pass retries cleanup.
      }
    };

    if (!("locks" in navigator) || !navigator.locks) return;
    void navigator.locks.request(`${progressEpochCheckpointKey(epoch)}:lock`, { ifAvailable: true }, (lock) => {
      if (lock && canPersist()) compact();
    }).catch(() => {
      // Web Locks or storage may become unavailable while the tab is closing.
    });
  }, [persistSharedProgressRollbackGuard, syncProgressFromStorage]);

  const retryProgressEpochInitialization = useCallback(() => {
    if (progressEpochReadyRef.current) {
      if (pendingProgressOperationsRef.current.length > 0) {
        flushPendingProgressOperations();
        refreshProgress();
      }
      return;
    }
    void ensureProgressEpoch(progressEpochNeedsFreshRef.current).then((ready) => {
      if (!ready) return;
      flushPendingProgressOperations();
      refreshProgress();
      compactSealedProgressLedgers();
    });
  }, [compactSealedProgressLedgers, ensureProgressEpoch, flushPendingProgressOperations, refreshProgress]);

  function warnIfProgressIsTemporary(persisted: boolean) {
    if (persisted || progressStorageWarningShownRef.current) return;
    progressStorageWarningShownRef.current = true;
    showNotice("浏览器暂时无法保存进度；本页会保留并在关闭前再试一次", 5200);
  }

  useEffect(() => {
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (Number(readStoredValue("hangul-audio-speed")) === 0.82) setAudioSpeed(0.82);
      if (readStoredValue(KEYBOARD_MODE_KEY) === "shortcuts") setKeyboardInputMode("shortcuts");
      if (readStoredValue(ROMAN_HINT_KEY) === "false") setShowRomanization(false);
      if (readStoredValue(BEGINNER_BLEND_KEY) === "true") setBeginnerBlendCompleted(true);
      const fullReviewStored = readStoredValue(FULL_REVIEW_KEY) === "true";
      setFullReviewCompleted(fullReviewStored);
      setFullReviewSaved(fullReviewStored);
      reloadTypingBestRecordsRef.current();
      void ensureProgressEpoch(false).then((ready) => {
        if (cancelled) return;
        const epoch = progressEpochRef.current;
        if (!ready || epoch === null) {
          showNotice("浏览器暂时无法建立安全的进度存储代际；本页不会读取或覆盖旧进度", 6200);
          return;
        }
        if (progressRollbackGuardBlocksCompaction(progressEpochRollbackGuardKey(epoch))) {
          progressRollbackDetectedRef.current = true;
        }
        flushPendingProgressOperations();
        refreshProgress();
        compactSealedProgressLedgers();
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [compactSealedProgressLedgers, ensureProgressEpoch, flushPendingProgressOperations, refreshProgress]);

  useEffect(() => {
    const resetProgressMemory = () => {
      ownProgressLedgerRef.current = null;
      ownLedgerPersistedClockRef.current = "0";
      ownProgressLedgerSealedRef.current = false;
      lastProgressBaselineRef.current = null;
      pendingProgressOperationsRef.current = [];
      knownProgressLedgersRef.current = [];
      progressCheckpointRef.current = null;
      progressRollbackDetectedRef.current = false;
      progressStorageWarningShownRef.current = false;
      progressRecoveryWarningShownRef.current = false;
      rotateProgressLedgerId();
      const clearedToday = localDateKey();
      const clearedStats = { ...emptyStats, date: clearedToday };
      setLocalToday(clearedToday);
      masteredRef.current = [];
      masteredPhrasesRef.current = [];
      gameStatsRef.current = clearedStats;
      setMastered([]);
      setMasteredPhrases([]);
      setGameStats(clearedStats);
    };
    const syncStoredProgress = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
      if (event.key === "hangul-audio-speed") {
        setAudioSpeed(Number(readStoredValue("hangul-audio-speed")) === 0.82 ? 0.82 : 1);
        return;
      }
      if (event.key === ROMAN_HINT_KEY) {
        setShowRomanization(readStoredValue(ROMAN_HINT_KEY) !== "false");
        return;
      }
      if (event.key === BEGINNER_BLEND_KEY) {
        setBeginnerBlendCompleted(readStoredValue(BEGINNER_BLEND_KEY) === "true");
        return;
      }
      if (event.key === FULL_REVIEW_KEY) {
        const fullReviewStored = readStoredValue(FULL_REVIEW_KEY) === "true";
        setFullReviewCompleted(fullReviewStored);
        setFullReviewSaved(fullReviewStored);
        return;
      }
      if (event.key === TYPING_BEST_KEY) {
        if (event.newValue === null) {
          typingBestPersistenceGenerationRef.current += 1;
          typingBestDirtyRef.current = {};
          try {
            // A queued save in this tab may have raced with the remote reset.
            // Apply the reset once more so a stale record cannot reappear on reload.
            if (window.localStorage.getItem(TYPING_BEST_KEY) !== null) window.localStorage.removeItem(TYPING_BEST_KEY);
          } catch {
            // The in-memory reset still takes effect when storage is unavailable.
          }
        }
        const storedTypingBest = parseTypingBestRecords(event.newValue, typingRouteIds);
        const nextTypingBest = event.newValue === null
          ? {}
          : mergeTypingBestRecords(typingBestRecordsRef.current, storedTypingBest);
        typingBestRecordsRef.current = nextTypingBest;
        setTypingBestRecords(nextTypingBest);
        if (event.newValue !== null && !typingBestRecordsCover(storedTypingBest, nextTypingBest)) {
          void persistTypingBestRecords(nextTypingBest);
        }
        return;
      }
      if (event.key === null) {
        progressPersistenceGenerationRef.current += 1;
        progressEpochReadyRef.current = false;
        progressEpochRef.current = null;
        progressEpochNeedsFreshRef.current = true;
        progressEpochMetaWarningShownRef.current = false;
        typingBestPersistenceGenerationRef.current += 1;
        typingBestDirtyRef.current = {};
        try {
          // Typing records remain separate from the epoch-scoped progress system.
          if (window.localStorage.getItem(TYPING_BEST_KEY) !== null) window.localStorage.removeItem(TYPING_BEST_KEY);
        } catch {
          // The generation change still cancels any queued writer in this tab.
        }
        resetProgressMemory();
        void ensureProgressEpoch(true).then((ready) => {
          if (!ready) {
            if (!progressEpochReadyRef.current) showNotice("浏览器暂时无法建立清空后的新进度代际；本页继续保持空进度", 6200);
            return;
          }
          flushPendingProgressOperations();
          refreshProgress();
          compactSealedProgressLedgers();
        });
        setAudioSpeed(1);
        setShowRomanization(true);
        setBeginnerBlendCompleted(false);
        setFullReviewCompleted(false);
        setFullReviewSaved(false);
        typingBestRecordsRef.current = {};
        setTypingBestRecords({});
        return;
      }
      if (event.key === PROGRESS_EPOCH_META_KEY) {
        const meta = parseProgressEpochMeta(event.newValue);
        if (!meta) {
          blockUnexpectedProgressEpoch();
          return;
        }
        try {
          if (window.localStorage.getItem(PROGRESS_EPOCH_META_KEY) !== event.newValue) return;
        } catch {
          progressEpochReadyRef.current = false;
          return;
        }
        if (!isProgressEpochMetaTransitionAllowed(
          lastAcceptedProgressEpochMetaRef.current,
          meta,
          progressEpochNeedsFreshRef.current,
        )) {
          blockUnexpectedProgressEpoch();
          return;
        }
        progressEpochReadyRef.current = false;
        void ensureProgressEpoch(progressEpochNeedsFreshRef.current).then((ready) => {
          if (!ready) return;
          flushPendingProgressOperations();
          refreshProgress();
          compactSealedProgressLedgers();
        });
        return;
      }
      const epoch = progressEpochRef.current;
      if (!progressEpochReadyRef.current || epoch === null) return;
      const epochPrefix = `${PROGRESS_EPOCH_NAMESPACE_PREFIX}${epoch}:`;
      if (event.key === progressEpochRollbackGuardKey(epoch)) {
        if (event.newValue !== null) progressRollbackDetectedRef.current = true;
        return;
      }
      if (event.key.startsWith(epochPrefix)) {
        syncProgressFromStorage();
        return;
      }
    };
    window.addEventListener("storage", syncStoredProgress);
    return () => window.removeEventListener("storage", syncStoredProgress);
    // The storage callback calls a ref-driven persistence routine; its captured setters remain stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockUnexpectedProgressEpoch, compactSealedProgressLedgers, ensureProgressEpoch, flushPendingProgressOperations, refreshProgress, rotateProgressLedgerId, syncProgressFromStorage]);

  useEffect(() => {
    const section = gameSectionRef.current;
    if (!section || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      gameSectionVisibleRef.current = entry.isIntersecting;
      setGameSectionVisible(entry.isIntersecting);
      if (entry.isIntersecting) {
        if (!phraseSectionRef.current?.contains(document.activeElement)) setKeyboardZone("games");
        if (speedCancelledRef.current) {
          window.requestAnimationFrame(() => document.getElementById("speed-restart")?.focus({ preventScroll: true }));
        }
        focusPausedTypingResume();
      } else {
        resetKoreanInput();
        setGameAutoAdvanceCancelled(true);
        listenQuestionTokenRef.current += 1;
        blendQuestionTokenRef.current += 1;
        cancelActiveSpeedRound("训练区已离开画面，本轮已取消；返回后可以重新开始。");
        pauseTypingRun("训练区已离开画面，本次行程已暂停；返回后可以继续。");
        gamePlaybackRequestRef.current += 1;
        cancelMatchInteraction();
        setGameAudioReady(false);
        setGameAudioFailed(false);
        shadowPlaybackRequestRef.current += 1;
        if (shadowAudioBusyRef.current) setShadowAudioFailed(true);
        shadowAudioBusyRef.current = false;
        setShadowAudioBusy(false);
        if (audioActivityRef.current === "game") {
          activeAudio?.pause();
          stopSpeechSynthesis();
        }
      }
    }, { threshold: 0.08 });
    observer.observe(section);
    return () => observer.disconnect();
  }, [cancelActiveSpeedRound, cancelMatchInteraction, focusPausedTypingResume, pauseTypingRun, resetKoreanInput]);

  useEffect(() => {
    const section = phraseSectionRef.current;
    if (!section) return;
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      setPhraseSectionVisible(entry.isIntersecting);
      if (entry.isIntersecting) {
        if (!gameSectionRef.current?.contains(document.activeElement)) setKeyboardZone("phrases");
      }
      else {
        setPhraseAutoAdvanceCancelled(true);
        phraseQuestionTokenRef.current += 1;
        phrasePlaybackRequestRef.current += 1;
        setPhraseAudioReady(false);
        setPhraseAudioFailed(false);
        if (audioActivityRef.current === "phrase-quiz") {
          activeAudio?.pause();
          stopSpeechSynthesis();
        }
      }
    }, { threshold: 0.08 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (progressRollbackDetectedRef.current) persistSharedProgressRollbackGuard();
      const visible = document.visibilityState === "visible";
      setPageVisible(visible);
      if (visible) {
        retryProgressEpochInitialization();
        if (ownProgressLedgerSealedRef.current) rotateProgressLedgerId();
        refreshProgress();
        compactSealedProgressLedgers();
        if (speedCancelledRef.current) {
          window.requestAnimationFrame(() => document.getElementById("speed-restart")?.focus({ preventScroll: true }));
        }
        focusPausedTypingResume();
        retryTypingBestPersistenceRef.current();
        return;
      }
      sealOwnProgressLedger();
      vowelPracticeRef.current?.stop();
      dailyReviewRef.current?.stop();
      batchimLessonRef.current?.stop();
      setGameAutoAdvanceCancelled(true);
      setPhraseAutoAdvanceCancelled(true);
      listenQuestionTokenRef.current += 1;
      phraseQuestionTokenRef.current += 1;
      blendQuestionTokenRef.current += 1;
      cancelActiveSpeedRound("页面切到后台，本轮已取消；返回后可以重新开始。");
      pauseTypingRun("页面切到后台，本次行程已暂停；返回后可以继续。");
      gamePlaybackRequestRef.current += 1;
      phrasePlaybackRequestRef.current += 1;
      cancelMatchInteraction();
      cancelComparisonSequence(false, "页面进入后台，对照播放已停止；请重新试听。");
      shadowPlaybackRequestRef.current += 1;
      if (shadowAudioBusyRef.current) setShadowAudioFailed(true);
      shadowAudioBusyRef.current = false;
      setShadowAudioBusy(false);
      activeAudio?.pause();
      stopSpeechSynthesis();
    };
    const frame = window.requestAnimationFrame(handleVisibilityChange);
    const handlePageShow = (event: PageTransitionEvent) => {
      retryProgressEpochInitialization();
      if (event.persisted && ownProgressLedgerSealedRef.current) rotateProgressLedgerId();
      refreshProgress();
      compactSealedProgressLedgers();
      retryTypingBestPersistenceRef.current();
      focusPausedTypingResume();
    };
    const handlePageHide = () => {
      if (progressRollbackDetectedRef.current) persistSharedProgressRollbackGuard();
      sealOwnProgressLedger();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [cancelActiveSpeedRound, cancelComparisonSequence, cancelMatchInteraction, compactSealedProgressLedgers, focusPausedTypingResume, pauseTypingRun, persistSharedProgressRollbackGuard, refreshProgress, retryProgressEpochInitialization, rotateProgressLedgerId, sealOwnProgressLedger]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      retryProgressEpochInitialization();
      refreshProgress();
      compactSealedProgressLedgers();
      retryTypingBestPersistenceRef.current();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [compactSealedProgressLedgers, refreshProgress, retryProgressEpochInitialization]);

  useEffect(() => {
    let timer: number | null = null;
    const scheduleNextMidnight = () => {
      timer = window.setTimeout(() => {
        refreshProgress();
        scheduleNextMidnight();
      }, millisecondsUntilNextLocalMidnight());
    };
    scheduleNextMidnight();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [refreshProgress]);

  useEffect(() => () => {
    vowelPracticeRef.current?.stop();
    dailyReviewRef.current?.stop();
    batchimLessonRef.current?.stop();
    sealOwnProgressLedger();
    clearMatchResetTimer();
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    if (speedFlashTimerRef.current !== null) window.clearTimeout(speedFlashTimerRef.current);
    gamePlaybackRequestRef.current += 1;
    phrasePlaybackRequestRef.current += 1;
    comparisonSequenceRef.current += 1;
    comparisonPlaybackActiveRef.current = false;
    shadowPlaybackRequestRef.current += 1;
    shadowAudioBusyRef.current = false;
    activeAudio?.pause();
    stopSpeechSynthesis();
  }, [sealOwnProgressLedger]);

  useEffect(() => {
    keyboardFallbackRef.current = { keyboardZone, gameMode, phraseTab };
  }, [gameMode, keyboardZone, phraseTab]);

  useEffect(() => {
    const release = (event: KeyboardEvent) => {
      if (event.key === "Shift" || event.code.startsWith("Shift")) setKoreanShifted(false);
    };
    const blur = () => { setKoreanShifted(false); setPressedKoreanKey(""); };
    window.addEventListener("keyup", release);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", blur);
      if (koreanKeyTimerRef.current !== null) window.clearTimeout(koreanKeyTimerRef.current);
    };
  }, []);

  function changeKeyboardInputMode(mode: "hangul" | "shortcuts") {
    resetKoreanInput();
    setKeyboardInputMode(mode);
    try { window.localStorage.setItem(KEYBOARD_MODE_KEY, mode); } catch { /* Keep the preference for this visit. */ }
  }

  function focusGameKeyboard() {
    gameSectionRef.current?.focus({ preventScroll: true });
  }

  function focusPhraseKeyboard() {
    phraseSectionRef.current?.focus({ preventScroll: true });
  }

  function enterKeyboardTraining() {
    claimGameActivity();
    gameSectionRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
    focusGameKeyboard();
  }

  function clearKoreanPending() {
    koreanPendingRef.current = "";
    setKoreanPending("");
    setKoreanKeyboardStatus("已清除待选字母。继续按韩文键位即可。");
  }

  function acceptKoreanChoice(char: string) {
    koreanPendingRef.current = "";
    setKoreanPending("");
    if (gameMode === "listen") answerListen(char);
    else if (blendInitialChoices.includes(char)) selectBlendInitial(char);
    else if (blendVowelChoices.includes(char)) selectBlendVowel(char);
  }

  function handleKoreanGameKey(char: string, physical: string) {
    setPressedKoreanKey(physical);
    if (koreanKeyTimerRef.current !== null) window.clearTimeout(koreanKeyTimerRef.current);
    koreanKeyTimerRef.current = window.setTimeout(() => setPressedKoreanKey(""), 200);
    focusGameKeyboard();
    if ((gameMode === "listen" && (!listenStarted || listenFinished)) || (gameMode === "blend" && blendFinished)) {
      setKoreanKeyboardStatus(`${physical} → ${char}。按 Enter 开始这一局。`);
      return;
    }
    if (!gameAudioReady || (gameMode === "listen" ? listenAnswer !== null : blendFeedback !== null)) {
      setKoreanKeyboardStatus(`${physical} → ${char}。请先听完；已作答时可按 Enter 继续。`);
      return;
    }
    const choices = gameMode === "listen" ? listenChoices.map((letter) => letter.char) : [...blendInitialChoices, ...blendVowelChoices];
    const result = resolveKoreanChoice(koreanPendingRef.current, char, choices);
    koreanPendingRef.current = result.canExtend ? result.char : "";
    setKoreanPending(koreanPendingRef.current);
    if (result.submit) {
      setKoreanKeyboardStatus(`${koreanKeyLabel(result.char)} → ${result.char}，已选择。`);
      acceptKoreanChoice(result.char);
    } else if (result.canExtend) {
      setKoreanKeyboardStatus(`已按出 ${result.char}：继续按键组成复合元音${result.exact ? "，或按 Enter 选择当前元音" : ""}。`);
    } else {
      setKoreanKeyboardStatus(`${koreanKeyLabel(result.char)} → ${result.char} 不在本题选项中，请看选项旁的键位。`);
    }
  }

  useEffect(() => {
    if (!showKeyboardHelp) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const modal = keyboardModalRef.current;
    if (!modal) return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
    const selector = "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";
    const focusable = Array.from(modal.querySelectorAll<HTMLElement>(selector));
    focusable[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = previousBodyOverflow;
      const previous = keyboardPreviousFocusRef.current;
      const fallback = keyboardFallbackRef.current;
      const fallbackId = fallback.keyboardZone === "games" ? `game-tab-${fallback.gameMode}` : `phrase-tab-${fallback.phraseTab}`;
      keyboardPreviousFocusRef.current = null;
      window.requestAnimationFrame(() => {
        if (typingPhaseRef.current === "paused" && typingResumeFocusPendingRef.current) focusPausedTypingResume();
        else if (previous?.isConnected) previous.focus();
        else document.getElementById(fallbackId)?.focus();
      });
    };
  }, [focusPausedTypingResume, showKeyboardHelp]);

  useEffect(() => {
    [syllable, blendTarget, comparisonSyllable, phraseQuizTarget.korean, shadowCurrent.sample, blockExample.syllable].forEach(preloadKorean);
    [listenTarget, speedTarget, ...matchDeck.map((card) => card.letter)].forEach(preloadGameLetterExample);
    preloadReferenceLetterExample(comparisonLetter);
  }, [syllable, blendTarget, comparisonSyllable, phraseQuizTarget.korean, listenTarget, speedTarget, shadowCurrent, comparisonLetter, matchDeck, blockExample.syllable]);

  useEffect(() => {
    audibleConsonants.forEach(preloadGameLetterExample);
    consonants.filter((letter) => clarityReplayConsonants.has(letter.char)).forEach(preloadReferenceLetterExample);
  }, []);

  useEffect(() => {
    if (!pageVisible || !gameSectionVisible || gameAutoAdvanceCancelled || gameAudioFailed || !gameAudioReady || gameMode !== "listen" || !listenStarted || listenFinished || listenAnswer === null) return;
    const token = listenQuestionTokenRef.current;
    const timer = window.setTimeout(() => nextListenQuestion(token), AUTO_ADVANCE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // The answer/round state deliberately chooses the exact question-advance closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameAudioFailed, gameAudioReady, gameAutoAdvanceCancelled, gameMode, gameSectionVisible, listenAnswer, listenFinished, listenHearts, listenRound, listenStarted, pageVisible]);

  useEffect(() => {
    if (!pageVisible || !phraseSectionVisible || phraseAutoAdvanceCancelled || phraseAudioFailed || !phraseAudioReady || !phraseQuizStarted || phraseQuizFinished || phraseQuizAnswer === null) return;
    const token = phraseQuestionTokenRef.current;
    const timer = window.setTimeout(() => nextPhraseQuestion(token), AUTO_ADVANCE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageVisible, phraseAudioFailed, phraseAudioReady, phraseAutoAdvanceCancelled, phraseQuizAnswer, phraseQuizFinished, phraseQuizRound, phraseQuizStarted, phraseSectionVisible]);

  useEffect(() => {
    if (!pageVisible || !gameSectionVisible || gameAutoAdvanceCancelled || gameAudioFailed || !gameAudioReady || gameMode !== "blend" || blendFinished || blendFeedback === null) return;
    const token = blendQuestionTokenRef.current;
    const timer = window.setTimeout(() => nextBlendQuestion(token), AUTO_ADVANCE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blendFeedback, blendFinished, blendRound, gameAudioFailed, gameAudioReady, gameAutoAdvanceCancelled, gameMode, gameSectionVisible, pageVisible]);

  useEffect(() => {
    if (!speedRunning) return;
    const timer = window.setInterval(() => {
      if (speedAnswerLockedRef.current) return;
      const remaining = Math.min(30, Math.max(0, Math.ceil((speedDeadlineRef.current - performance.now()) / 1000)));
      setSpeedTime(remaining);
      if (remaining === 0 && speedAcceptingAnswersRef.current) {
        finishSpeedGame();
      }
    }, 200);
    return () => window.clearInterval(timer);
    // The timer always reads the current progress through gameStatsRef/storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speedRunning]);

  useEffect(() => {
    if (typingPhase !== "typing") return;
    const tick = () => {
      const running = typingRunningSinceRef.current > 0 ? performance.now() - typingRunningSinceRef.current : 0;
      setTypingElapsedMs(Math.max(1, Math.round(typingAccumulatedMsRef.current + running)));
    };
    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [typingPhase]);

  useEffect(() => {
    if (typingPhase !== "paused" || showKeyboardHelp || gameMode !== "typing" || !gameSectionVisible || !pageVisible) return;
    focusPausedTypingResume();
  }, [focusPausedTypingResume, gameMode, gameSectionVisible, pageVisible, showKeyboardHelp, typingPhase]);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const element = event.target as HTMLElement | null;
      if (element?.id === "typing-input" && !event.repeat && !event.isComposing && !typingCompositionRef.current) {
        if (event.key === "F8") { event.preventDefault(); void replayTypingWord(); return; }
        if (event.key === "Escape") { event.preventDefault(); pauseTypingRun("已按 Esc 暂停；按 Enter 继续行程。"); return; }
      }
      if (element && (["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName) || element.isContentEditable)) return;
      if (event.repeat) return;
      const key = keyboardShortcutKey(event.key, event.code);

      if (event.key === "?") {
        event.preventDefault();
        if (showKeyboardHelp) setShowKeyboardHelp(false);
        else openKeyboardHelp();
        return;
      }
      if (event.key === "Escape") {
        if (showKeyboardHelp) event.preventDefault();
        setShowKeyboardHelp(false);
        return;
      }
      if (showKeyboardHelp) return;
      if (event.key === "F2") {
        event.preventDefault();
        enterKeyboardTraining();
        return;
      }
      // Independent learning panels own their keys, never game answers.
      if (element?.closest('[data-keyboard-scope="pronunciation"], [data-keyboard-scope="daily-review"], [data-keyboard-scope="batchim"]')) return;
      const replayKey = key === " " || event.key === "F8" || (!(keyboardZone === "games" && directKoreanKeyboard) && key === "r");
      const focusedGameTab = element?.getAttribute("role") === "tab" && element.id.startsWith("game-tab-");
      const focusedPhraseTab = element?.id === "phrase-tab-word" || element?.id === "phrase-tab-sentence";
      const nativeInteractive = Boolean(element?.closest("button, a[href], summary"));
      if (!pageVisible) return;
      if (event.key === "Enter" && !nativeInteractive && !gameSectionVisible && !phraseSectionVisible) {
        event.preventDefault();
        enterKeyboardTraining();
        return;
      }
      if (focusedPhraseTab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const nextTab = event.key === "Home" ? "word" : event.key === "End" ? "sentence" : phraseTab === "word" ? "sentence" : "word";
        changePhraseTab(nextTab, true);
        return;
      }
      if (keyboardZone === "games" && !gameSectionVisible) return;
      if (keyboardZone === "phrases" && !phraseSectionVisible) return;
      if (nativeInteractive && (event.key === "Enter" || event.key === " ")) return;
      const numberIndex = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
      const letterChoiceIndex = choiceKeys.findIndex((choice) => choice.toLowerCase() === key);
      const fourChoiceIndex = numberIndex >= 0 && numberIndex < 4 ? numberIndex : keyboardZone === "games" && directKoreanKeyboard ? -1 : letterChoiceIndex;

      // Brackets work from any non-editable game control; arrows also work on
      // the keyboard console. Native inputs and buttons keep their own arrows.
      const freeGameFocus = element === gameSectionRef.current || element === document.body;
      const previousGame = event.code === "BracketLeft" || key === "[" || (freeGameFocus && event.key === "ArrowLeft");
      const nextGame = event.code === "BracketRight" || key === "]" || (freeGameFocus && event.key === "ArrowRight");
      if (keyboardZone === "games" && (previousGame || nextGame)) {
        event.preventDefault();
        focusGameKeyboard();
        const direction = nextGame ? 1 : -1;
        switchGameMode(gameModes[(gameModes.indexOf(gameMode) + direction + gameModes.length) % gameModes.length]);
        return;
      }

      if (keyboardZone === "games" && directKoreanKeyboard) {
        if (event.key === "Shift") { setKoreanShifted(true); return; }
        const input = koreanKeyInput(event.key, event.code, event.shiftKey);
        if (input) {
          event.preventDefault();
          setKoreanShifted(event.shiftKey);
          handleKoreanGameKey(input.char, input.physical);
          return;
        }
        if (event.key === "Backspace") {
          event.preventDefault();
          focusGameKeyboard();
          clearKoreanPending();
          return;
        }
        if (event.key === "Enter" && koreanPendingRef.current && gameAudioReady) {
          const pending = koreanPendingRef.current;
          const choices = gameMode === "listen" ? listenChoices.map((letter) => letter.char) : blendVowelChoices;
          if (choices.includes(pending)) {
            event.preventDefault();
            focusGameKeyboard();
            acceptKoreanChoice(pending);
            return;
          }
        }
      }

      if (keyboardZone === "games" && focusedGameTab && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        const currentIndex = gameModes.indexOf(gameMode);
        const direction = event.key === "ArrowRight" ? 1 : -1;
        switchGameMode(gameModes[(currentIndex + direction + gameModes.length) % gameModes.length], true);
        return;
      }

      if (keyboardZone === "phrases") {
        if (event.key === "Enter" && (!phraseQuizStarted || phraseQuizFinished)) {
          if (phraseQuizTotal === 0) return;
          event.preventDefault();
          focusPhraseKeyboard();
          startPhraseQuiz();
          return;
        }
        if (!phraseQuizStarted || phraseQuizFinished) return;
        if (replayKey) {
          event.preventDefault();
          focusPhraseKeyboard();
          replayPhraseQuizAudio();
        } else if (fourChoiceIndex >= 0 && phraseQuizAnswer === null && phraseAudioReady) {
          event.preventDefault();
          focusPhraseKeyboard();
          const choice = phraseQuizChoices[fourChoiceIndex];
          if (choice) answerPhraseQuiz(choice.id);
        } else if (event.key === "Enter" && phraseQuizAnswer !== null) {
          event.preventDefault();
          focusPhraseKeyboard();
          nextPhraseQuestion();
        }
        return;
      }

      if (gameMode === "listen") {
        if (!listenStarted) {
          if (event.key === "Enter") {
            event.preventDefault();
            focusGameKeyboard();
            startInitialListenGame();
          }
          return;
        }
        if (replayKey) {
          event.preventDefault();
          void replayGameLetter(listenTarget);
        } else if (listenFinished && event.key === "Enter") {
          event.preventDefault();
          restartListenSession();
        } else if (fourChoiceIndex >= 0 && listenAnswer === null && !listenFinished && gameAudioReady) {
          event.preventDefault();
          const choice = listenChoices[fourChoiceIndex];
          if (choice) answerListen(choice.char);
        } else if (event.key === "Enter" && listenAnswer !== null) {
          event.preventDefault();
          nextListenQuestion();
        }
      } else if (gameMode === "match") {
        const matchIndex = matchKeys.indexOf(key.toUpperCase());
        if (matchIndex >= 0 && matchDeck[matchIndex]) {
          event.preventDefault();
          void selectMatchCard(matchDeck[matchIndex]);
        } else if (event.key === "Enter" && matchedLetters.length === 6) {
          event.preventDefault();
          startMatchGame();
        }
      } else if (gameMode === "blend") {
        const vowelKeyIndex = directKoreanKeyboard ? -1 : blendVowelKeys.findIndex((choice) => choice.toLowerCase() === key);
        const initialChoiceIndex = fourChoiceIndex;
        const vowelChoiceIndex = numberIndex >= 4 && numberIndex < 8 ? numberIndex - 4 : vowelKeyIndex;
        if (replayKey) {
          event.preventDefault();
          void replayGameSyllable(blendTarget);
        } else if (blendFinished && event.key === "Enter") {
          event.preventDefault();
          startBlendGame();
        } else if (initialChoiceIndex >= 0 && blendFeedback === null && gameAudioReady) {
          event.preventDefault();
          selectBlendInitial(blendInitialChoices[initialChoiceIndex]);
        } else if (vowelChoiceIndex >= 0 && blendFeedback === null && gameAudioReady) {
          event.preventDefault();
          selectBlendVowel(blendVowelChoices[vowelChoiceIndex]);
        } else if (event.key === "Enter" && blendFeedback !== null) {
          event.preventDefault();
          nextBlendQuestion();
        }
      } else if (gameMode === "speed") {
        if (!speedRunning && event.key === "Enter") {
          event.preventDefault();
          startSpeedGame();
        } else if (speedRunning && fourChoiceIndex >= 0) {
          event.preventDefault();
          void answerSpeed(speedChoices[fourChoiceIndex].char);
        }
      } else if (gameMode === "typing") {
        if (typingPhaseRef.current === "paused" && event.key === "Enter") {
          event.preventDefault();
          resumeTypingRun();
        } else if ((typingPhase === "idle" || typingPhase === "finished") && event.key === "Enter") {
          event.preventDefault();
          startTypingRun();
        } else if (typingPhase === "idle" && numberIndex >= 0 && numberIndex < typingRoutes.length) {
          event.preventDefault();
          selectTypingRoute(typingRoutes[numberIndex].id);
        } else if (typingPhase === "typing" && replayKey) {
          event.preventDefault();
          void replayTypingWord();
        }
      } else if (gameMode === "shadow") {
        if ((shadowQueue.length === 0 || shadowStage === "finished") && event.key === "Enter") {
          event.preventDefault();
          startShadowSession();
        } else if (shadowQueue.length > 0 && shadowStage !== "finished" && replayKey) {
          event.preventDefault();
          void replayShadowExample();
        } else if (shadowStage === "repeat" && event.key === "Enter") {
          event.preventDefault();
          void confirmShadowRepeat();
        } else if (shadowStage === "rate" && (key === "1" || key === "a")) {
          event.preventDefault();
          rateShadow(false);
        } else if (shadowStage === "rate" && (key === "2" || key === "s")) {
          event.preventDefault();
          rateShadow(true);
        }
      }
      if (event.defaultPrevented && gameMode !== "typing") focusGameKeyboard();
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  });

  function updateStats(updater: (current: GameStats) => GameStats) {
    const today = localDateKey();
    const current = {
      ...gameStatsRef.current,
      date: today,
      dailyXp: gameStatsRef.current.history[today] ?? 0,
    };
    const optimistic = updater(current);
    gameStatsRef.current = optimistic;
    setGameStats(optimistic);
    const delta = createProgressStatsDelta(current, optimistic, progressValidation);
    warnIfProgressIsTemporary(appendProgressOperation({ kind: "stats", delta }));
    syncProgressFromStorage();
  }

  function awardXp(points: number, combo = 0) {
    updateStats((current) => ({
      ...current,
      dailyXp: addSafeCount(current.dailyXp, points),
      totalXp: addSafeCount(current.totalXp, points),
      bestCombo: Math.max(current.bestCombo, combo),
      history: { ...current.history, [current.date]: addSafeCount(current.history[current.date] ?? 0, points) },
    }));
  }

  function recordMistake(char: string) {
    updateStats((current) => ({ ...current, mistakes: { ...current.mistakes, [char]: addSafeCount(current.mistakes[char] ?? 0, 1) } }));
  }

  function recordPhraseMistake(id: string) {
    updateStats((current) => ({ ...current, phraseMistakes: { ...current.phraseMistakes, [id]: addSafeCount(current.phraseMistakes[id] ?? 0, 1) } }));
  }

  function typingCharacterCount(value: string) {
    return Array.from(normalizeTypingInput(value)).filter((character) => !/\s/u.test(character)).length;
  }

  async function persistTypingBestRecords(expectedRecords: Record<string, TypingBestRecord>, notifyOnFailure = true) {
    const persistenceGeneration = typingBestPersistenceGenerationRef.current;
    const requestedRecords = mergeTypingBestRecords(typingBestDirtyRef.current, expectedRecords);
    const commit = () => {
      if (persistenceGeneration !== typingBestPersistenceGenerationRef.current) return true;
      try {
        let expected = mergeTypingBestRecords(typingBestRecordsRef.current, requestedRecords);
        for (let attempt = 0; attempt < 4; attempt += 1) {
          if (persistenceGeneration !== typingBestPersistenceGenerationRef.current) return true;
          const stored = parseTypingBestRecords(window.localStorage.getItem(TYPING_BEST_KEY), typingRouteIds);
          expected = mergeTypingBestRecords(stored, typingBestRecordsRef.current, expected);
          window.localStorage.setItem(TYPING_BEST_KEY, JSON.stringify(expected));
          const verified = parseTypingBestRecords(window.localStorage.getItem(TYPING_BEST_KEY), typingRouteIds);
          const merged = mergeTypingBestRecords(typingBestRecordsRef.current, expected, verified);
          typingBestRecordsRef.current = merged;
          setTypingBestRecords(merged);
          if (typingBestRecordsCover(verified, expected)) return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    let persisted = false;
    try {
      persisted = "locks" in navigator && navigator.locks
        ? await navigator.locks.request(TYPING_BEST_KEY, commit)
        : commit();
    } catch {
      persisted = false;
    }
    if (persistenceGeneration !== typingBestPersistenceGenerationRef.current) return true;
    if (persisted) {
      typingBestDirtyRef.current = Object.fromEntries(
        Object.entries(typingBestDirtyRef.current).filter(([routeId, record]) => (
          !typingBestRecordsCover(requestedRecords, { [routeId]: record })
        )),
      );
    } else {
      typingBestDirtyRef.current = mergeTypingBestRecords(typingBestDirtyRef.current, requestedRecords);
      if (notifyOnFailure) showNotice("最佳纪录已保留在页面中；存储恢复后会自动重试", 4600);
    }
    return persisted;
  }

  reloadTypingBestRecordsRef.current = () => {
    const read = readStoredValueResult(TYPING_BEST_KEY);
    if (!read.ok) return;
    const stored = parseTypingBestRecords(read.value, typingRouteIds);
    const pending = typingBestDirtyRef.current;
    const hasPending = Object.keys(pending).length > 0;
    const next = read.value === null && !hasPending
      ? {}
      : mergeTypingBestRecords(stored, typingBestRecordsRef.current, pending);
    typingBestRecordsRef.current = next;
    setTypingBestRecords(next);
    if ((read.value !== null && !typingBestRecordsCover(stored, next)) || (read.value === null && hasPending)) {
      typingBestDirtyRef.current = mergeTypingBestRecords(pending, next);
    }
  };

  retryTypingBestPersistenceRef.current = () => {
    reloadTypingBestRecordsRef.current();
    const pending = typingBestDirtyRef.current;
    if (Object.keys(pending).length > 0) void persistTypingBestRecords(pending, false);
  };

  async function saveTypingBestRecord(routeId: string, candidate: TypingBestRecord) {
    const optimistic = mergeTypingBestRecords(typingBestRecordsRef.current, { [routeId]: candidate });
    typingBestRecordsRef.current = optimistic;
    setTypingBestRecords(optimistic);

    await persistTypingBestRecords({ [routeId]: candidate });
  }

  function selectTypingRoute(routeId: string) {
    if (!typingRouteIds.has(routeId) || typingPhaseRef.current === "typing" || typingPhaseRef.current === "paused") return;
    resetTypingRun();
    setTypingRouteId(routeId);
  }

  function resetTypingRunForRouteSelection() {
    focusAfterQuestionAdvance("game-panel-typing", `typing-route-${typingRoute.id}`);
    resetTypingRun();
  }

  function startTypingRun() {
    const route = typingRoutes.find((item) => item.id === typingRouteId) ?? typingRoutes[0];
    const items = typingRouteItems.get(route.id) ?? [];
    if (items.length === 0) {
      showNotice("这条线路暂时没有可练习的生活词");
      return;
    }
    prepareGameActivity();
    typingSessionRef.current += 1;
    typingReplayTokenRef.current += 1;
    setTypingAudioBusy(false);
    typingPhaseRef.current = "typing";
    typingStopIndexRef.current = 0;
    typingRunningSinceRef.current = performance.now();
    typingAccumulatedMsRef.current = 0;
    typingSubmissionLockedRef.current = false;
    typingCompositionRef.current = false;
    typingResumeFocusPendingRef.current = false;
    typingMissedIdsRef.current = [];
    typingErrorCharactersRef.current = 0;
    typingCompletedCharactersRef.current = 0;
    typingComboRef.current = 0;
    setTypingPhase("typing");
    setTypingStopIndex(0);
    setTypingInput("");
    setTypingInputInvalid(false);
    setTypingErrorCharacters(0);
    setTypingWrongAttempts(0);
    setTypingMissedIds([]);
    setTypingCompletedCharacters(0);
    setTypingElapsedMs(1);
    setTypingFeedback(`列车已发车。当前词：${items[0].korean}（${items[0].chinese}）；输入后按 Enter。`);
    window.requestAnimationFrame(() => typingInputRef.current?.focus());
  }

  function resumeTypingRun() {
    if (typingPhaseRef.current !== "paused") return;
    typingPhaseRef.current = "typing";
    typingRunningSinceRef.current = performance.now();
    typingSubmissionLockedRef.current = false;
    typingCompositionRef.current = false;
    typingResumeFocusPendingRef.current = false;
    setTypingPhase("typing");
    setTypingFeedback(`继续前往第 ${typingStopIndexRef.current + 1} 站；计时已恢复。`);
    window.requestAnimationFrame(() => typingInputRef.current?.focus());
  }

  async function replayTypingWord() {
    if (typingPhaseRef.current !== "typing" || typingSubmissionLockedRef.current) return;
    typingSubmissionLockedRef.current = true;
    setTypingAudioBusy(true);
    claimGameActivity();
    const session = typingSessionRef.current;
    const stopIndex = typingStopIndexRef.current;
    const replayToken = ++typingReplayTokenRef.current;
    const now = performance.now();
    if (typingRunningSinceRef.current > 0) {
      typingAccumulatedMsRef.current += Math.max(0, now - typingRunningSinceRef.current);
      typingRunningSinceRef.current = 0;
      setTypingElapsedMs(Math.max(1, Math.round(typingAccumulatedMsRef.current)));
    }
    const played = await playGameAudio(() => playPhraseItemSource(typingCurrent));
    if (session !== typingSessionRef.current
      || replayToken !== typingReplayTokenRef.current
      || stopIndex !== typingStopIndexRef.current
      || typingPhaseRef.current !== "typing") return;
    typingRunningSinceRef.current = performance.now();
    typingSubmissionLockedRef.current = false;
    setTypingAudioBusy(false);
    if (!played) showNotice("生活词音频未能完整播放，可以继续打字或再试一次");
    window.requestAnimationFrame(() => typingInputRef.current?.focus());
  }

  function submitTypingStop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (typingPhaseRef.current !== "typing" || typingCompositionRef.current || typingSubmissionLockedRef.current) return;
    const targetIndex = typingStopIndexRef.current;
    const target = typingItems[targetIndex];
    if (!target) return;
    const draft = typingInputRef.current?.value ?? typingInput;
    const normalizedDraft = normalizeTypingInput(draft);
    if (!normalizedDraft) {
      setTypingInputInvalid(true);
      setTypingFeedback("先切换到韩语输入法，输入上方词语，再按 Enter。");
      return;
    }

    if (!isTypingAnswerCorrect(normalizedDraft, target.korean)) {
      const distance = Math.max(1, typingErrorDistance(normalizedDraft, target.korean));
      const nextErrors = addSafeCount(typingErrorCharactersRef.current, distance);
      typingErrorCharactersRef.current = nextErrors;
      setTypingErrorCharacters(nextErrors);
      setTypingWrongAttempts((count) => addSafeCount(count, 1));
      typingComboRef.current = 0;
      setTypingInputInvalid(true);
      setTypingFeedback(`列车仍停在本站：检查 ${target.korean} 的每个字块后再试。`);
      if (!typingMissedIdsRef.current.includes(target.id)) {
        const missed = [...typingMissedIdsRef.current, target.id];
        typingMissedIdsRef.current = missed;
        setTypingMissedIds(missed);
        recordPhraseMistake(target.id);
      }
      return;
    }

    typingSubmissionLockedRef.current = true;
    typingReplayTokenRef.current += 1;
    setTypingInputInvalid(false);
    const completedCharacters = addSafeCount(typingCompletedCharactersRef.current, typingCharacterCount(target.korean));
    typingCompletedCharactersRef.current = completedCharacters;
    setTypingCompletedCharacters(completedCharacters);
    const hadMistake = typingMissedIdsRef.current.includes(target.id);
    typingComboRef.current = hadMistake ? 0 : addSafeCount(typingComboRef.current, 1);
    awardXp(hadMistake ? 4 : 7, typingComboRef.current);
    activeAudio?.pause();
    stopSpeechSynthesis();

    const nextIndex = targetIndex + 1;
    if (nextIndex >= typingItems.length) {
      const now = performance.now();
      const elapsed = Math.max(1, Math.round(typingAccumulatedMsRef.current
        + (typingRunningSinceRef.current > 0 ? now - typingRunningSinceRef.current : 0)));
      const accuracy = calculateTypingAccuracy(completedCharacters, typingErrorCharactersRef.current);
      const cpm = calculateTypingCpm(completedCharacters, elapsed);
      const candidate = { elapsedMs: elapsed, accuracy, cpm };
      typingAccumulatedMsRef.current = elapsed;
      typingRunningSinceRef.current = 0;
      typingPhaseRef.current = "finished";
      setTypingElapsedMs(elapsed);
      setTypingInput("");
      setTypingPhase("finished");
      setTypingFeedback(`已到达 ${typingRoute.name} 终点，共通过 ${typingItems.length} 站。`);
      updateStats((current) => ({ ...current, games: addSafeCount(current.games, 1) }));
      void saveTypingBestRecord(typingRoute.id, candidate);
      window.requestAnimationFrame(() => typingResultHeadingRef.current?.focus({ preventScroll: true }));
      return;
    }

    typingStopIndexRef.current = nextIndex;
    setTypingStopIndex(nextIndex);
    setTypingInput("");
    setTypingFeedback(`到达 ${target.chinese} 站。下一词：${typingItems[nextIndex].korean}（${typingItems[nextIndex].chinese}）。`);
    window.requestAnimationFrame(() => {
      typingSubmissionLockedRef.current = false;
      typingInputRef.current?.focus();
    });
  }

  function playSound(text: string, speed = audioSpeed) {
    return playKorean(text, speed);
  }

  function playPhraseItemSource(item: PhraseItem, speed = audioSpeed) {
    return playKorean(item.korean, speed);
  }

  function showNotice(message: string, duration = 3200) {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    setShareNotice(message);
    noticeTimerRef.current = window.setTimeout(() => {
      setShareNotice("");
      noticeTimerRef.current = null;
    }, duration);
  }

  function focusAfterQuestionAdvance(panelId: string, targetId: string) {
    const active = document.activeElement;
    const panel = document.getElementById(panelId);
    // A keyboard console owns focus across rounds; do not turn Enter into replay.
    if (active === panel) return;
    if (active !== document.body && active instanceof HTMLElement && !panel?.contains(active)) return;
    window.requestAnimationFrame(() => document.getElementById(targetId)?.focus({ preventScroll: true }));
  }

  async function playSoundWithNotice(text: string, speed = audioSpeed) {
    prepareReferenceActivity();
    cancelComparisonSequence(false);
    const result = await playSound(text, speed);
    if (result === "failed") showNotice("音频未能播放，请检查网络后再点一次");
    return result === "ended";
  }

  async function playPhraseItemWithNotice(item: PhraseItem) {
    claimPhraseActivity();
    audioActivityRef.current = "phrase-library";
    cancelComparisonSequence(false);
    const pausedActiveQuiz = phraseQuizStarted && !phraseQuizFinished;
    if (pausedActiveQuiz) {
      phrasePlaybackRequestRef.current += 1;
      phraseQuestionTokenRef.current += 1;
      setPhraseAutoAdvanceCancelled(true);
      setPhraseAudioReady(false);
      setPhraseAudioFailed(false);
      showNotice("已暂停本题自动推进；可点右侧“只听声音”重播当前题", 3600);
    }
    const result = await playPhraseItemSource(item);
    if (result === "failed") showNotice("内置词句音频未能播放，请再点一次");
    return result === "ended";
  }

  async function playGameAudio(playback: () => Promise<AudioPlaybackResult>) {
    audioActivityRef.current = "game";
    cancelComparisonSequence(false);
    const request = ++gamePlaybackRequestRef.current;
    setGameAudioReady(false);
    setGameAudioFailed(false);
    const result = await playback();
    const played = result === "ended";
    if (request !== gamePlaybackRequestRef.current) return played;
    setGameAudioReady(played);
    setGameAudioFailed(result === "failed");
    if (result !== "ended") {
      listenQuestionTokenRef.current += 1;
      blendQuestionTokenRef.current += 1;
      setGameAutoAdvanceCancelled(true);
    }
    if (result === "failed") {
      setGameAutoAdvanceCancelled(true);
      showNotice("音频未能播放，请点重播；本题不会自动跳过");
    }
    return played;
  }

  async function playPhraseAudio(item: PhraseItem) {
    audioActivityRef.current = "phrase-quiz";
    cancelComparisonSequence(false);
    const request = ++phrasePlaybackRequestRef.current;
    setPhraseAudioFailed(false);
    setPhraseAudioReady(false);
    const result = await playPhraseItemSource(item);
    const played = result === "ended";
    if (request !== phrasePlaybackRequestRef.current) return played;
    setPhraseAudioFailed(result === "failed");
    setPhraseAudioReady(played);
    if (result !== "ended") {
      phraseQuestionTokenRef.current += 1;
      setPhraseAutoAdvanceCancelled(true);
    }
    return played;
  }

  function replayPhraseQuizAudio() {
    claimPhraseActivity();
    setPhraseAutoAdvanceCancelled(false);
    void playPhraseAudio(phraseQuizTarget);
  }

  async function playLetterExample(letter: Letter, speed = audioSpeed, activity: AudioActivity = "reference") {
    if (activity === "reference") prepareReferenceActivity();
    audioActivityRef.current = activity;
    cancelComparisonSequence(false);
    const source = consonantNameMap.has(letter.char) ? consonantReferenceSoundPath(letter) : audioPath(letter.sample);
    if (!source) {
      activeAudio?.pause();
      stopSpeechSynthesis();
      showNotice("ㅇ 作初声本来就是静音；放在收尾时才读 ng");
      return false;
    }
    const result = await (activity === "reference"
      ? playReferenceLetterExampleAudio(letter, speed)
      : playGameLetterExampleAudio(letter, speed));
    if (result === "failed") {
      showNotice("音频未能播放，请检查网络后再点一次");
    }
    return result === "ended";
  }

  function playSidebarLetterExample(letter: Letter) {
    pauseTypingRun("已试听累计易错音，本次地铁行程已暂停；返回后可继续。");
    claimGameActivity();
    setGameAutoAdvanceCancelled(true);
    listenQuestionTokenRef.current += 1;
    blendQuestionTokenRef.current += 1;
    setGameAudioReady(false);
    setGameAudioFailed(false);
    cancelActiveSpeedRound("已试听薄弱音，本轮极速认读已取消。");
    cancelMatchInteraction();
    gamePlaybackRequestRef.current += 1;
    void playLetterExample(letter, audioSpeed, "game");
  }

  function playGameLetter(letter: Letter) {
    return playGameAudio(() => playGameLetterExampleAudio(letter, audioSpeed));
  }

  function playGameSyllable(text: string) {
    return playGameAudio(() => playSound(text));
  }

  function replayGameLetter(letter: Letter) {
    listenQuestionTokenRef.current += 1;
    setGameAutoAdvanceCancelled(false);
    setGameAudioReady(false);
    setGameAudioFailed(false);
    return playGameLetter(letter);
  }

  function replayGameSyllable(text: string) {
    blendQuestionTokenRef.current += 1;
    setGameAutoAdvanceCancelled(false);
    setGameAudioReady(false);
    setGameAudioFailed(false);
    return playGameSyllable(text);
  }

  async function playComparisonOnset() {
    prepareReferenceActivity();
    const request = ++comparisonSequenceRef.current;
    setComparisonBusy(false);
    if (comparisonConsonant === "ㅇ") {
      activeAudio?.pause();
      comparisonPlaybackActiveRef.current = false;
      setComparisonStatus("ㅇ 作初声时没有辅音声；右边完整音节从元音直接开始。");
      return;
    }
    comparisonPlaybackActiveRef.current = true;
    setComparisonStatus(`正在播放 ${comparisonConsonant} 的韩国真人短促起音…`);
    const result = await playReferenceLetterExampleAudio(comparisonLetter, audioSpeed);
    if (request !== comparisonSequenceRef.current) return;
    comparisonPlaybackActiveRef.current = false;
    setComparisonStatus(result === "ended" ? `刚才只有 ${comparisonConsonant} 的起音，没有读出元音。` : result === "failed" ? "真人起音未能播放，请再试一次。" : "起音播放已停止。");
  }

  async function playComparisonSyllable() {
    prepareReferenceActivity();
    const request = ++comparisonSequenceRef.current;
    setComparisonBusy(false);
    comparisonPlaybackActiveRef.current = true;
    setComparisonStatus(`正在播放完整音节 ${comparisonSyllable}，这里包含元音 ${comparisonVowel}。`);
    const result = await playSound(comparisonSyllable);
    if (request !== comparisonSequenceRef.current) return;
    comparisonPlaybackActiveRef.current = false;
    setComparisonStatus(result === "ended" ? `刚才是完整音节 ${comparisonSyllable}，其中包含元音 ${comparisonVowel}。` : result === "failed" ? "完整音节未能播放，请再试一次。" : "完整音节播放已停止。");
  }

  async function playComparisonSequence() {
    prepareReferenceActivity();
    const request = ++comparisonSequenceRef.current;
    setComparisonBusy(true);
    comparisonPlaybackActiveRef.current = true;
    setComparisonStatus(comparisonConsonant === "ㅇ" ? "先听一小段静音，再听完整音节。" : `先听 ${comparisonConsonant} 的短促起音，再听完整音节 ${comparisonSyllable}。`);

    if (comparisonConsonant !== "ㅇ") {
      const onsetResult = await playAudioSourceToEnd(consonantReferenceSoundPath(comparisonLetter), audioSpeed);
      if (request !== comparisonSequenceRef.current) return;
      if (onsetResult !== "ended") {
        comparisonPlaybackActiveRef.current = false;
        setComparisonBusy(false);
        setComparisonStatus(onsetResult === "failed" ? "真人起音未能播放，已停止顺序对照。" : "顺序对照已停止。");
        return;
      }
    }

    await new Promise((resolve) => window.setTimeout(resolve, comparisonConsonant === "ㅇ" ? 650 : 420));
    if (request !== comparisonSequenceRef.current) return;
    const syllableResult = await playAudioSourceToEnd(audioPath(comparisonSyllable), audioSpeed);
    if (request !== comparisonSequenceRef.current) return;
    comparisonPlaybackActiveRef.current = false;
    setComparisonBusy(false);
    setComparisonStatus(syllableResult === "ended"
      ? `${comparisonConsonant === "ㅇ" ? "初声静音" : `${comparisonConsonant} 起音`} → ${comparisonSyllable} 完整音节；后者才包含 ${comparisonVowel}。`
      : syllableResult === "failed" ? "完整音节未能播放，请再试一次。" : "顺序对照已停止。");
  }

  async function playLetterName(name: string) {
    prepareReferenceActivity();
    cancelComparisonSequence(false);
    const result = await playConsonantName(name, audioSpeed);
    if (result === "failed") showNotice("正式名称音频未能播放，请再点一次");
  }

  function changeAudioSpeed(speed: 1 | 0.82) {
    setAudioSpeed(speed);
    try {
      window.localStorage.setItem("hangul-audio-speed", String(speed));
    } catch {
      // The speed switch still works when storage is unavailable.
    }
  }

  function changeRomanization(show: boolean) {
    setShowRomanization(show);
    try {
      window.localStorage.setItem(ROMAN_HINT_KEY, String(show));
    } catch {
      // The study-mode switch still works when storage is unavailable.
    }
  }

  function markBeginnerBlendCompleted() {
    setBeginnerBlendCompleted(true);
    try {
      window.localStorage.setItem(BEGINNER_BLEND_KEY, "true");
    } catch {
      // The route still advances for the current page when storage is unavailable.
    }
  }

  function markFullReviewCompleted() {
    setFullReviewCompleted(true);
    let saved = false;
    try {
      window.localStorage.setItem(FULL_REVIEW_KEY, "true");
      saved = window.localStorage.getItem(FULL_REVIEW_KEY) === "true";
    } catch {
      // The in-page pass still counts for this session.
    }
    setFullReviewSaved(saved);
    if (!saved) {
      showNotice("完整验收已在本页通过，但浏览器暂时无法长期保存这个状态", 5200);
    }
  }

  function changeBuilderInitial(value: string) {
    prepareReferenceActivity();
    cancelComparisonSequence();
    stopSpeechSynthesis();
    setInitial(value);
  }

  function changeBuilderVowel(value: string) {
    prepareReferenceActivity();
    cancelComparisonSequence();
    stopSpeechSynthesis();
    setVowel(value);
  }

  function moveToSection(sectionId: string, focusId?: string) {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    document.getElementById(sectionId)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    if (focusId) window.requestAnimationFrame(() => document.getElementById(focusId)?.focus());
  }

  function openLetterLesson(lesson: Exclude<LetterLesson, "all">) {
    prepareReferenceActivity();
    const isVowelLesson = lesson === "core-vowels" || lesson === "advanced-vowels";
    const set = isVowelLesson ? "vowels" : "consonants";
    const lessonChars = lesson === "core-vowels" ? coreVowelChars
      : lesson === "basic-consonants" ? basicConsonantChars
        : lesson === "advanced-consonants" ? advancedConsonantChars : advancedVowelChars;
    const firstChar = lessonChars.find((char) => !masteredRef.current.includes(char)) ?? lessonChars[0];
    setActiveSet(set);
    setLetterLesson(lesson);
    setLetterFilter("all");
    moveToSection("learn", `letter-master-${firstChar}`);
  }

  function openContrastLesson() {
    prepareReferenceActivity();
    moveToSection("compare", "compare-first-sound");
  }

  function openPhraseLesson(tab: "word" | "sentence", group: string) {
    claimPhraseActivity();
    phrasePlaybackRequestRef.current += 1;
    phraseQuestionTokenRef.current += 1;
    activeAudio?.pause();
    stopSpeechSynthesis();
    setPhraseTab(tab);
    setPhraseFilter("all");
    setPhraseReadFilter("all");
    setExpandedPhraseId(null);
    setPhraseGroup(group);
    setPhraseQuizStarted(false);
    setPhraseQuizFinished(false);
    setPhraseQuizAnswer(null);
    setPhraseAudioReady(false);
    setPhraseAudioFailed(false);
    moveToSection("phrases", group === SURVIVAL_PHRASE_GROUP ? "phrase-scene-survival" : "phrase-scene-starter");
  }

  function playBlockExample() {
    prepareReferenceActivity();
    void playSoundWithNotice(blockExample.syllable);
  }

  function selectBlockExample(id: string) {
    prepareReferenceActivity();
    setBlockExampleId(id);
  }

  function continueBeginnerPath() {
    if (beginnerNextStep === "core-vowels") openLetterLesson("core-vowels");
    else if (beginnerNextStep === "basic-consonants") openLetterLesson("basic-consonants");
    else if (beginnerNextStep === "blend") startStarterBlend();
    else if (beginnerNextStep === "starter-phrases") openPhraseLesson("word", STARTER_PHRASE_GROUP);
    else if (beginnerNextStep === "survival-phrases") openPhraseLesson("sentence", SURVIVAL_PHRASE_GROUP);
    else if (beginnerNextStep === "advanced-consonants") openLetterLesson("advanced-consonants");
    else if (beginnerNextStep === "advanced-vowels") openLetterLesson("advanced-vowels");
    else startFullReview();
  }

  function openKeyboardHelp() {
    vowelPracticeRef.current?.stop();
    dailyReviewRef.current?.stop();
    batchimLessonRef.current?.stop();
    keyboardPreviousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pauseTypingRun("快捷键帮助已打开，本次行程已暂停；关闭后可继续。");
    setGameAutoAdvanceCancelled(true);
    setPhraseAutoAdvanceCancelled(true);
    listenQuestionTokenRef.current += 1;
    phraseQuestionTokenRef.current += 1;
    blendQuestionTokenRef.current += 1;
    gamePlaybackRequestRef.current += 1;
    phrasePlaybackRequestRef.current += 1;
    cancelComparisonSequence(false);
    activeAudio?.pause();
    stopSpeechSynthesis();
    cancelActiveSpeedRound("快捷键帮助已打开，本轮极速认读已取消。");
    setShowKeyboardHelp(true);
  }

  function changeActiveSet(set: "consonants" | "vowels", focusTab = false) {
    if (set === activeSet) {
      if (letterLesson !== "all") setLetterLesson("all");
      if (focusTab) window.requestAnimationFrame(() => document.getElementById(`letter-tab-${set}`)?.focus());
      return;
    }
    cancelComparisonSequence();
    stopSpeechSynthesis();
    setActiveSet(set);
    setLetterLesson("all");
    if (focusTab) window.requestAnimationFrame(() => document.getElementById(`letter-tab-${set}`)?.focus());
  }

  function handleLetterTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextSet = event.key === "Home" ? "consonants" : event.key === "End" ? "vowels" : activeSet === "consonants" ? "vowels" : "consonants";
    changeActiveSet(nextSet, true);
  }

  function toggleMastered(char: string) {
    const current = masteredRef.current;
    const shouldMaster = !current.includes(char);
    const optimistic = shouldMaster ? [...current, char] : current.filter((item) => item !== char);
    masteredRef.current = optimistic;
    setMastered(optimistic);
    if (letterFilter === "learning" && shouldMaster) {
      const index = visibleLetters.findIndex((letter) => letter.char === char);
      const nextVisible = visibleLetters[index + 1] ?? visibleLetters[index - 1];
      window.requestAnimationFrame(() => document.getElementById(nextVisible ? `letter-master-${nextVisible.char}` : "letter-filter-learning")?.focus());
    }

    warnIfProgressIsTemporary(appendProgressOperation({ kind: "mastered", key: char, value: shouldMaster }));
    syncProgressFromStorage();
  }

  function togglePhraseReveal(id: string) {
    setRevealedPhrases((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function togglePhraseBreakdown(id: string) {
    setExpandedPhraseId((current) => current === id ? null : id);
  }

  function togglePhraseMastered(id: string) {
    const current = masteredPhrasesRef.current;
    const shouldMaster = !current.includes(id);
    const optimistic = shouldMaster ? [...current, id] : current.filter((item) => item !== id);
    masteredPhrasesRef.current = optimistic;
    setMasteredPhrases(optimistic);
    const disappears = (phraseFilter === "learning" && shouldMaster) || (phraseFilter === "mastered" && !shouldMaster);
    if (disappears) {
      const index = visiblePhraseItems.findIndex((item) => item.id === id);
      const nextVisible = visiblePhraseItems[index + 1] ?? visiblePhraseItems[index - 1];
      window.requestAnimationFrame(() => document.getElementById(nextVisible ? `phrase-master-${nextVisible.id}` : `phrase-filter-${phraseFilter}`)?.focus());
    }

    warnIfProgressIsTemporary(appendProgressOperation({ kind: "masteredPhrase", key: id, value: shouldMaster }));
    syncProgressFromStorage();
  }

  function markCurrentPhraseGroupMastered() {
    if (phraseGroup !== STARTER_PHRASE_GROUP && phraseGroup !== SURVIVAL_PHRASE_GROUP) return;
    const missing = phraseGroupItems.filter((item) => phraseQuizCorrectIds.includes(item.id) && !phraseQuizWrongIds.includes(item.id) && !masteredPhrasesRef.current.includes(item.id));
    if (missing.length === 0) {
      showNotice("本局答对的词句已经全部标记背熟");
      return;
    }
    const optimistic = [...new Set([...masteredPhrasesRef.current, ...missing.map((item) => item.id)])];
    masteredPhrasesRef.current = optimistic;
    setMasteredPhrases(optimistic);
    let persisted = true;
    for (const item of missing) {
      if (!appendProgressOperation({ kind: "masteredPhrase", key: item.id, value: true })) persisted = false;
    }
    warnIfProgressIsTemporary(persisted);
    syncProgressFromStorage();
    if (persisted) showNotice(`已确认本局答对的 ${missing.length} 条内容，学习路线已更新`);
    window.requestAnimationFrame(() => document.getElementById("phrase-quiz-restart")?.focus());
  }

  function changePhraseTab(tab: "word" | "sentence", focusTab = false) {
    claimPhraseActivity();
    if (tab === phraseTab) {
      if (focusTab) window.requestAnimationFrame(() => document.getElementById(`phrase-tab-${tab}`)?.focus());
      return;
    }
    phrasePlaybackRequestRef.current += 1;
    phraseQuestionTokenRef.current += 1;
    setPhraseAutoAdvanceCancelled(true);
    setPhraseAudioFailed(false);
    setPhraseAudioReady(false);
    activeAudio?.pause();
    stopSpeechSynthesis();
    setPhraseTab(tab);
    setPhraseFilter("all");
    setPhraseReadFilter("all");
    setExpandedPhraseId(null);
    const nextTypeItems = tab === "word" ? wordItems : sentenceItems;
    const keepFeaturedGroup = (phraseGroup === STARTER_PHRASE_GROUP || phraseGroup === SURVIVAL_PHRASE_GROUP)
      && nextTypeItems.some((item) => phraseMatchesGroup(item, phraseGroup));
    setPhraseGroup(keepFeaturedGroup ? phraseGroup : "all");
    setPhraseQuizStarted(false);
    setPhraseQuizFinished(false);
    setPhraseQuizAnswer(null);
    if (focusTab) window.requestAnimationFrame(() => document.getElementById(`phrase-tab-${tab}`)?.focus());
  }

  function changePhraseGroup(group: string) {
    claimPhraseActivity();
    if (group === phraseGroup) {
      setKeyboardZone("phrases");
      return;
    }
    phrasePlaybackRequestRef.current += 1;
    phraseQuestionTokenRef.current += 1;
    setPhraseAutoAdvanceCancelled(true);
    setPhraseAudioFailed(false);
    setPhraseAudioReady(false);
    activeAudio?.pause();
    stopSpeechSynthesis();
    setPhraseGroup(group);
    setExpandedPhraseId(null);
    setPhraseQuizStarted(false);
    setPhraseQuizFinished(false);
    setPhraseQuizAnswer(null);
  }

  function changePhraseReadFilter(filter: PhraseReadFilter) {
    if (filter === phraseReadFilter) return;
    claimPhraseActivity();
    phrasePlaybackRequestRef.current += 1;
    phraseQuestionTokenRef.current += 1;
    setPhraseAutoAdvanceCancelled(true);
    setPhraseAudioFailed(false);
    setPhraseAudioReady(false);
    activeAudio?.pause();
    stopSpeechSynthesis();
    setPhraseReadFilter(filter);
    setExpandedPhraseId(null);
    setPhraseQuizStarted(false);
    setPhraseQuizFinished(false);
    setPhraseQuizAnswer(null);
  }

  function getPhraseQuizPools(targetIds: string[]) {
    const targetIdSet = new Set(targetIds);
    const scoped = phraseTypeItems.filter((item) => targetIdSet.has(item.id));
    const choicePool = new Set(scoped.map((item) => item.chinese)).size >= 4 ? scoped : phraseTypeItems;
    return { targetPool: scoped, choicePool };
  }

  function startPhraseQuiz() {
    claimPhraseActivity();
    focusAfterQuestionAdvance("phrase-quiz-panel", "phrase-quiz-replay");
    const nextPoolIds = phraseQuizItems.map((item) => item.id);
    const { targetPool, choicePool } = getPhraseQuizPools(nextPoolIds);
    const target = pickWeightedPhrase(targetPool, gameStats.phraseMistakes, phraseQuizStarted ? phraseQuizTarget.id : "");
    if (!target) {
      showNotice("当前分类没有足够的词句，请切换分类后再试");
      return;
    }
    phraseQuestionTokenRef.current += 1;
    setPhraseQuizTarget(target);
    setPhraseQuizChoices(makePhraseChoices(target, choicePool));
    setPhraseQuizAnswer(null);
    setPhraseQuizRound(1);
    setPhraseQuizScore(0);
    setPhraseQuizCorrectIds([]);
    setPhraseQuizWrongIds([]);
    setPhraseQuizPoolIds(nextPoolIds);
    setPhraseQuizRoundTotal(phraseQuizRoundLimit(targetPool.length, phraseGroup !== "all" || phraseReadFilter === "ready"));
    setPhraseQuizStarted(true);
    setPhraseQuizFinished(false);
    setPhraseAutoAdvanceCancelled(false);
    setPhraseAudioFailed(false);
    setPhraseAudioReady(false);
    setKeyboardZone("phrases");
    void playPhraseAudio(target);
  }

  function answerPhraseQuiz(id: string) {
    if (phraseQuizAnswer !== null || !phraseQuizStarted || phraseQuizFinished || !phraseAudioReady) return;
    claimPhraseActivity();
    setPhraseAutoAdvanceCancelled(false);
    setPhraseAudioFailed(false);
    setPhraseAudioReady(false);
    setPhraseQuizAnswer(id);
    void playPhraseAudio(phraseQuizTarget);
    if (id === phraseQuizTarget.id) {
      setPhraseQuizScore((score) => score + 1);
      if (!phraseQuizWrongIds.includes(phraseQuizTarget.id)) setPhraseQuizCorrectIds((current) => current.includes(phraseQuizTarget.id) ? current : [...current, phraseQuizTarget.id]);
      awardXp(10);
    } else {
      setPhraseQuizWrongIds((current) => current.includes(phraseQuizTarget.id) ? current : [...current, phraseQuizTarget.id]);
      setPhraseQuizCorrectIds((current) => current.filter((item) => item !== phraseQuizTarget.id));
      recordPhraseMistake(phraseQuizTarget.id);
    }
  }

  function nextPhraseQuestion(expectedToken = phraseQuestionTokenRef.current) {
    if (phraseQuizAnswer === null || !phraseQuizStarted || phraseQuizFinished) return;
    if (expectedToken !== phraseQuestionTokenRef.current || phraseAdvancedTokenRef.current === expectedToken) return;
    phraseAdvancedTokenRef.current = expectedToken;
    focusAfterQuestionAdvance("phrase-quiz-panel", phraseQuizRound >= phraseQuizTotal ? "phrase-quiz-restart" : "phrase-quiz-replay");
    setPhraseAutoAdvanceCancelled(true);
    setPhraseAudioFailed(false);
    setPhraseAudioReady(false);
    if (phraseQuizRound >= phraseQuizTotal) {
      phrasePlaybackRequestRef.current += 1;
      activeAudio?.pause();
      stopSpeechSynthesis();
      setPhraseQuizFinished(true);
      updateStats((current) => ({ ...current, games: addSafeCount(current.games, 1) }));
      return;
    }
    const { targetPool, choicePool } = getPhraseQuizPools(phraseQuizPoolIds);
    const target = pickWeightedPhrase(targetPool, gameStats.phraseMistakes, phraseQuizTarget.id);
    if (!target) {
      setPhraseQuizFinished(true);
      showNotice("当前没有足够的可播放韩语内容");
      return;
    }
    phraseQuestionTokenRef.current += 1;
    setPhraseQuizTarget(target);
    setPhraseQuizChoices(makePhraseChoices(target, choicePool));
    setPhraseQuizAnswer(null);
    setPhraseQuizRound((round) => round + 1);
    void playPhraseAudio(target);
  }

  async function copyShareText(shareText: string) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareText);
        return;
      } catch {
        // Some embedded browsers expose Clipboard API but reject writes.
      }
    }
    const field = document.createElement("textarea");
    field.value = shareText;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.appendChild(field);
    let copied = false;
    try {
      field.focus();
      field.select();
      field.setSelectionRange(0, field.value.length);
      copied = document.execCommand("copy");
    } finally {
      field.remove();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    }
    if (!copied) throw new Error("copy command was rejected");
  }

  async function sharePage(score?: number, total = 10) {
    const url = `${window.location.origin}${window.location.pathname}`;
    const text = score === undefined
      ? "这个韩语 40 音网页可以练发音、背单词和句子，还能用键盘闯关。"
      : `我在韩语词句记忆闯关拿了 ${score}/${total}，你也来挑战一下！`;
    const shareText = `${text}\n${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "韩语 40 音｜中文闯关版", text, url });
        showNotice("分享完成", 2600);
        return;
      } catch (error) {
        if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return;
      }
    }
    try {
      await copyShareText(shareText);
      showNotice("分享链接已复制", 2600);
    } catch {
      showNotice("暂时无法自动复制，请复制浏览器地址", 2600);
    }
  }

  function clearMatchResetTimer() {
    if (matchResetTimerRef.current === null) return;
    window.clearTimeout(matchResetTimerRef.current);
    matchResetTimerRef.current = null;
  }

  function stopGamePlayback() {
    gamePlaybackRequestRef.current += 1;
    listenQuestionTokenRef.current += 1;
    blendQuestionTokenRef.current += 1;
    cancelMatchInteraction();
    activeAudio?.pause();
    stopSpeechSynthesis();
    setGameAudioReady(false);
    setGameAudioFailed(false);
  }

  function prepareGameActivity() {
    resetKoreanInput();
    claimGameActivity();
    cancelComparisonSequence(false);
    cancelActiveSpeedRound("已切换训练内容，本轮极速认读已取消。");
    stopGamePlayback();
    shadowPlaybackRequestRef.current += 1;
    if (shadowAudioBusyRef.current) setShadowAudioFailed(true);
    shadowAudioBusyRef.current = false;
    setShadowAudioBusy(false);
    setGameAutoAdvanceCancelled(true);
  }

  function leaveTypingForMode(mode: GameMode) {
    if (mode !== "typing" && typingPhaseRef.current !== "idle") {
      resetTypingRun("本次行程已结束；重新进入后可选择线路再发车。");
    }
  }

  function prepareReferenceActivity() {
    claimPhraseActivity();
    phrasePlaybackRequestRef.current += 1;
    setPhraseAutoAdvanceCancelled(true);
    activeAudio?.pause();
    stopSpeechSynthesis();
    audioActivityRef.current = "reference";
  }

  function openBatchimLesson(id?: string) {
    prepareReferenceActivity();
    batchimLessonRef.current?.open(id);
    moveToSection("batchim-lesson", "batchim-lesson");
  }

  function resetListenGame(target: Letter, pool = audibleLetters, label = "可听 39 音（不含初声静音 ㅇ）") {
    resetKoreanInput();
    listenQuestionTokenRef.current += 1;
    setListenPool(pool);
    setListenSessionLabel(label);
    setListenTarget(target);
    setListenChoices(makeChoices(target, pool));
    setListenAnswer(null);
    setListenRound(1);
    setListenHearts(3);
    setListenCombo(0);
    setListenScore(0);
    setListenStarted(true);
    setRetryQueue([]);
    setListenCorrectChars([]);
    setListenWrongChars([]);
    setListenFinished(false);
    setGameAutoAdvanceCancelled(false);
    setGameAudioReady(false);
    setGameAudioFailed(false);
    void playGameLetter(target);
  }

  function startListenGame() {
    setListenMasteryScope([]);
    setListenQualifiesFullReview(false);
    resetListenGame(pickWeightedLetter(gameStats.mistakes, audibleLetters), audibleLetters, "可听 39 音（不含初声静音 ㅇ）");
  }

  function startInitialListenGame() {
    prepareGameActivity();
    startListenGame();
    focusAfterQuestionAdvance("game-panel-listen", "listen-replay");
  }

  function startScopedListenDrill(chars: string[], label: string, masteryScope = chars, qualifiesFullReview = false) {
    const pool = audibleLetters.filter((letter) => chars.includes(letter.char));
    if (pool.length === 0) {
      showNotice("当前范围没有可用于盲听的声音");
      return;
    }
    leaveTypingForMode("listen");
    prepareGameActivity();
    setGameMode("listen");
    setListenMasteryScope(masteryScope.filter((char) => validLetterChars.has(char)));
    setListenQualifiesFullReview(qualifiesFullReview);
    resetListenGame(pickWeightedLetter(gameStats.mistakes, pool), pool, label);
    moveFocusToListenGame();
  }

  function startFullReview() {
    if (!fullReviewPrerequisitesComplete) {
      showNotice("请先完成五步入门并标记完 40 个字母，再开始最终验收", 4600);
      return;
    }
    startScopedListenDrill(allLetters.map((letter) => letter.char), "完整 39 个可听音验收 · 8/10 通过", [], true);
  }

  function startStarterBlend() {
    leaveTypingForMode("blend");
    prepareGameActivity();
    setGameMode("blend");
    startBlendGame("starter");
    moveToSection("games", "game-tab-blend");
  }

  function restartListenSession() {
    focusAfterQuestionAdvance("game-panel-listen", "listen-replay");
    const pool = listenPool.length > 0 ? listenPool : audibleLetters;
    resetListenGame(pickWeightedLetter(gameStats.mistakes, pool), pool, listenSessionLabel);
  }

  function moveFocusToListenGame() {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    document.getElementById("games")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    window.requestAnimationFrame(() => document.getElementById("game-tab-listen")?.focus({ preventScroll: true }));
  }

  function startWeakDrill() {
    const weakChars = weakest.filter(([char]) => char !== "ㅇ").map(([char]) => char);
    const pool = audibleLetters.filter((letter) => weakChars.includes(letter.char));
    if (pool.length === 0) return;
    leaveTypingForMode("listen");
    prepareGameActivity();
    setGameMode("listen");
    setListenMasteryScope([]);
    setListenQualifiesFullReview(false);
    resetListenGame(pickWeightedLetter(gameStats.mistakes, pool), pool, "薄弱音专项");
    moveFocusToListenGame();
  }

  function startUnmasteredDrill() {
    const pool = currentDrillPool;
    if (pool.length === 0) {
      showNotice(`${letterLessonLabel}里可听的未掌握字母已经练完，可以做综合复习`);
      return;
    }
    leaveTypingForMode("listen");
    prepareGameActivity();
    setGameMode("listen");
    setListenMasteryScope(pool.map((letter) => letter.char));
    setListenQualifiesFullReview(false);
    resetListenGame(pickWeightedLetter(gameStats.mistakes, pool), pool, `${letterLessonLabel} · 未掌握专项`);
    moveFocusToListenGame();
  }

  function markListenScopeMastered() {
    const missing = listenCorrectChars.filter((char) => !listenWrongChars.includes(char) && listenMasteryScope.includes(char) && validLetterChars.has(char) && !masteredRef.current.includes(char));
    if (missing.length === 0) {
      showNotice("本局答对的字母已经全部标记");
      return;
    }
    const optimistic = [...new Set([...masteredRef.current, ...missing])];
    masteredRef.current = optimistic;
    setMastered(optimistic);
    let persisted = true;
    for (const char of missing) {
      if (!appendProgressOperation({ kind: "mastered", key: char, value: true })) persisted = false;
    }
    warnIfProgressIsTemporary(persisted);
    syncProgressFromStorage();
    if (persisted) {
      const needsSilentInitial = listenMasteryScope.includes("ㅇ") && !optimistic.includes("ㅇ");
      showNotice(needsSilentInitial
        ? `已标记本局答对的 ${missing.length} 个；ㅇ 不能盲听，请回音卡确认初声静音`
        : `已确认本局答对的 ${missing.length} 个字母，学习路线已更新`);
    }
    window.requestAnimationFrame(() => document.getElementById("listen-restart")?.focus());
  }

  function answerListen(char: string) {
    if (listenAnswer !== null || !gameAudioReady) return;
    resetKoreanInput();
    setGameAutoAdvanceCancelled(false);
    setGameAudioReady(false);
    setGameAudioFailed(false);
    setListenAnswer(char);
    void playGameLetter(listenTarget);
    if (char === listenTarget.char) {
      const nextCombo = listenCombo + 1;
      setListenCombo(nextCombo);
      setListenScore((score) => score + 1);
      if (!listenWrongChars.includes(listenTarget.char)) setListenCorrectChars((current) => current.includes(listenTarget.char) ? current : [...current, listenTarget.char]);
      awardXp(10 + Math.min(nextCombo * 2, 10), nextCombo);
    } else {
      setListenHearts((hearts) => Math.max(0, hearts - 1));
      setListenCombo(0);
      setRetryQueue((queue) => [...queue, listenTarget]);
      setListenWrongChars((current) => current.includes(listenTarget.char) ? current : [...current, listenTarget.char]);
      setListenCorrectChars((current) => current.filter((item) => item !== listenTarget.char));
      recordMistake(listenTarget.char);
    }
  }

  function nextListenQuestion(expectedToken = listenQuestionTokenRef.current) {
    if (listenAnswer === null || !listenStarted || listenFinished) return;
    if (expectedToken !== listenQuestionTokenRef.current || listenAdvancedTokenRef.current === expectedToken) return;
    resetKoreanInput();
    listenAdvancedTokenRef.current = expectedToken;
    focusAfterQuestionAdvance("game-panel-listen", listenRound >= 10 || listenHearts <= 0 ? "listen-restart" : "listen-replay");
    setGameAutoAdvanceCancelled(true);
    setGameAudioReady(false);
    setGameAudioFailed(false);
    if (listenRound >= 10 || listenHearts <= 0) {
      gamePlaybackRequestRef.current += 1;
      activeAudio?.pause();
      setListenFinished(true);
      if (listenQualifiesFullReview && listenScore >= 8) markFullReviewCompleted();
      updateStats((current) => ({ ...current, games: addSafeCount(current.games, 1) }));
      return;
    }
    let target: Letter;
    if ((listenRound + 1) % 3 === 0 && retryQueue.length > 0) {
      target = retryQueue[0];
      setRetryQueue((queue) => queue.slice(1));
    } else {
      target = pickWeightedLetter(gameStats.mistakes, listenPool);
    }
    listenQuestionTokenRef.current += 1;
    setListenRound((round) => round + 1);
    setListenTarget(target);
    setListenChoices(makeChoices(target, listenPool));
    setListenAnswer(null);
    void playGameLetter(target);
  }

  function startMatchGame() {
    clearMatchResetTimer();
    stopGamePlayback();
    const weakChars = weakest.map(([char]) => char);
    const candidates = [
      ...weakChars.filter((char) => audibleLetters.some((letter) => letter.char === char)),
      ...shuffle(audibleLetters.map((letter) => letter.char).filter((char) => !weakChars.includes(char))),
    ];
    const fairChars = selectFairBlindLetters(candidates, 6);
    const fairLetters = fairChars
      .map((char) => audibleLetters.find((letter) => letter.char === char))
      .filter((letter): letter is Letter => Boolean(letter));
    setMatchDeck(makeMatchDeck(fairLetters));
    setMatchSelected([]);
    setMatchedLetters([]);
    setMatchMoves(0);
    matchLockedRef.current = false;
    setMatchLocked(false);
    setMatchFeedback("先翻一张牌，再找它的另一半。");
    focusAfterQuestionAdvance("game-panel-match", "match-card-0");
  }

  async function selectMatchCard(card: MatchCard) {
    if (matchLockedRef.current || matchedLetters.includes(card.letter.char)) return;
    const alreadySelected = matchSelected.includes(card.uid);
    if (alreadySelected && card.type !== "sound") return;
    if (card.type === "sound") {
      const request = ++matchPlaybackRequestRef.current;
      matchLockedRef.current = true;
      setMatchLocked(true);
      setMatchFeedback(alreadySelected ? "正在重播这张声音牌…" : "正在播放声音牌，请听完再继续。");
      const played = await playGameLetter(card.letter);
      if (request !== matchPlaybackRequestRef.current) return;
      matchLockedRef.current = false;
      setMatchLocked(false);
      const cardIndex = matchDeck.findIndex((item) => item.uid === card.uid);
      focusAfterQuestionAdvance("game-panel-match", `match-card-${cardIndex}`);
      if (!played) {
        setMatchFeedback(alreadySelected
          ? "示范音频未能完整重播；声音牌仍保持选中，请再点一次重试。"
          : "示范音频未能完整播放；这张牌尚未翻开，请再点一次重试。");
        return;
      }
      if (alreadySelected) {
        setMatchFeedback("已重播这张声音牌，请继续找对应字母。");
        return;
      }
    }
    if (matchSelected.length === 0) {
      setMatchSelected([card.uid]);
      setMatchFeedback(card.type === "char" ? `已选字母 ${card.letter.char}，请找对应示范音。` : "已播放示范音，请找对应字母。");
      return;
    }
    const first = matchDeck.find((item) => item.uid === matchSelected[0]);
    setMatchMoves((moves) => moves + 1);
    if (first && first.letter.char === card.letter.char && first.type !== card.type) {
      const nextMatched = [...matchedLetters, card.letter.char];
      setMatchedLetters(nextMatched);
      setMatchSelected([]);
      setMatchFeedback(`配对成功：${card.letter.char} 已和声音对应。`);
      const nextCardIndex = matchDeck.findIndex((item) => !nextMatched.includes(item.letter.char));
      focusAfterQuestionAdvance("game-panel-match", nextMatched.length === 6 ? "match-restart" : `match-card-${nextCardIndex}`);
      awardXp(8);
      if (nextMatched.length === 6) {
        awardXp(25);
        updateStats((current) => ({ ...current, games: addSafeCount(current.games, 1) }));
      }
    } else {
      setMatchSelected([matchSelected[0], card.uid]);
      matchLockedRef.current = true;
      setMatchLocked(true);
      setMatchFeedback("这两张牌不匹配，稍后会自动翻回。");
      clearMatchResetTimer();
      const firstCardIndex = matchDeck.findIndex((item) => item.uid === matchSelected[0]);
      matchResetTimerRef.current = window.setTimeout(() => {
        setMatchSelected([]);
        matchLockedRef.current = false;
        setMatchLocked(false);
        matchResetTimerRef.current = null;
        focusAfterQuestionAdvance("game-panel-match", `match-card-${firstCardIndex}`);
      }, 680);
    }
  }

  async function waitForSpeedFeedback(playback: Promise<boolean>) {
    let guardTimer = 0;
    const guardedPlayback = Promise.race([
      playback.then(() => "settled" as const, () => "settled" as const),
      new Promise<"timeout">((resolve) => {
        guardTimer = window.setTimeout(() => resolve("timeout"), 2_200);
      }),
    ]);
    const [playbackState] = await Promise.all([
      guardedPlayback,
      new Promise((resolve) => window.setTimeout(resolve, 240)),
    ]);
    window.clearTimeout(guardTimer);
    return playbackState;
  }

  function nextSpeedTarget() {
    const target = pickWeightedLetter(gameStats.mistakes, audibleLetters);
    setSpeedTarget(target);
    setSpeedChoices(makeRomanChoices(target));
  }

  function finishSpeedGame() {
    if (!speedAcceptingAnswersRef.current) return;
    speedRunTokenRef.current += 1;
    focusAfterQuestionAdvance("game-panel-speed", "speed-restart");
    speedAcceptingAnswersRef.current = false;
    speedAnswerLockedRef.current = true;
    setSpeedAnswerPending(false);
    setSpeedTime(0);
    setSpeedRunning(false);
    speedCancelledRef.current = false;
    setSpeedCancelled(false);
    stopGamePlayback();
    updateStats((stats) => ({ ...stats, games: addSafeCount(stats.games, 1) }));
  }

  function startSpeedGame() {
    speedRunTokenRef.current += 1;
    if (speedFlashTimerRef.current !== null) window.clearTimeout(speedFlashTimerRef.current);
    stopGamePlayback();
    setSpeedTime(30);
    setSpeedScore(0);
    setSpeedCombo(0);
    setSpeedFlash(null);
    setSpeedFeedback("");
    speedCancelledRef.current = false;
    setSpeedCancelled(false);
    setSpeedAnswerPending(false);
    speedDeadlineRef.current = performance.now() + 30_000;
    speedAcceptingAnswersRef.current = true;
    speedAnswerLockedRef.current = false;
    setSpeedRunning(true);
    const target = pickWeightedLetter(gameStats.mistakes, audibleLetters);
    setSpeedTarget(target);
    setSpeedChoices(makeRomanChoices(target));
    focusAfterQuestionAdvance("game-panel-speed", "speed-choice-0");
  }

  async function answerSpeed(char: string) {
    if (!speedRunning || !speedAcceptingAnswersRef.current || speedAnswerLockedRef.current) return;
    const runToken = speedRunTokenRef.current;
    speedAnswerLockedRef.current = true;
    setSpeedAnswerPending(true);
    if (performance.now() >= speedDeadlineRef.current) {
      finishSpeedGame();
      return;
    }
    const feedbackStartedAt = performance.now();
    const answeredTarget = speedTarget;
    const playback = playGameLetter(answeredTarget);
    if (char === speedTarget.char) {
      const nextCombo = speedCombo + 1;
      setSpeedCombo(nextCombo);
      setSpeedScore((score) => score + 1);
      setSpeedFlash("correct");
      setSpeedFeedback(`正确：${speedTarget.char} 是 ${speedTarget.roman}。`);
      awardXp(5 + Math.min(nextCombo, 5), nextCombo);
    } else {
      setSpeedCombo(0);
      speedDeadlineRef.current -= 2_000;
      const remaining = Math.min(30, Math.max(0, Math.ceil((speedDeadlineRef.current - performance.now()) / 1000)));
      setSpeedTime(remaining);
      setSpeedFlash("wrong");
      setSpeedFeedback(`再看一次：${speedTarget.char} 是 ${speedTarget.roman}，扣 2 秒。`);
      recordMistake(speedTarget.char);
    }
    if (speedFlashTimerRef.current !== null) window.clearTimeout(speedFlashTimerRef.current);
    speedFlashTimerRef.current = window.setTimeout(() => {
      setSpeedFlash(null);
      speedFlashTimerRef.current = null;
    }, 240);
    const playbackState = await waitForSpeedFeedback(playback);
    if (runToken !== speedRunTokenRef.current || !speedAcceptingAnswersRef.current) return;
    speedDeadlineRef.current += performance.now() - feedbackStartedAt;
    if (playbackState === "timeout") stopGamePlayback();
    if (performance.now() >= speedDeadlineRef.current) {
      finishSpeedGame();
      return;
    }
    focusAfterQuestionAdvance("game-panel-speed", "speed-choice-0");
    nextSpeedTarget();
    speedAnswerLockedRef.current = false;
    setSpeedAnswerPending(false);
  }

  function createBlendQuestion(play = true, scope = blendScope) {
    resetKoreanInput();
    const questionPool = scope === "starter" ? starterBlendQuestionPool : blendQuestionPool;
    const initialCandidates = scope === "starter" ? basicConsonantChars : initialOrder;
    const vowelCandidates = scope === "starter" ? coreVowelChars : vowelOrder;
    const nextQuestion = questionPool[Math.floor(Math.random() * questionPool.length)];
    const nextInitial = nextQuestion.initial;
    const nextVowel = nextQuestion.vowel;
    blendQuestionTokenRef.current += 1;
    setBlendInitial(nextInitial);
    setBlendVowel(nextVowel);
    setBlendInitialChoices(makeBlendInitialChoices(nextInitial, nextVowel, initialCandidates));
    setBlendVowelChoices(makeBlendVowelChoices(nextInitial, nextVowel, vowelCandidates));
    setBlendSelectedInitial(null);
    setBlendSelectedVowel(null);
    setBlendFeedback(null);
    setGameAutoAdvanceCancelled(false);
    setGameAudioReady(false);
    setGameAudioFailed(false);
    if (play) void playGameSyllable(nextQuestion.syllable);
  }

  function startBlendGame(scope: BlendScope = blendScope) {
    focusAfterQuestionAdvance("game-panel-blend", "blend-replay");
    setBlendScope(scope);
    setBlendRound(1);
    setBlendScore(0);
    setBlendFinished(false);
    createBlendQuestion(true, scope);
  }

  function evaluateBlend(selectedInitial: string, selectedVowel: string) {
    if (blendFeedback !== null || !gameAudioReady) return;
    const correct = selectedInitial === blendInitial && selectedVowel === blendVowel;
    setGameAutoAdvanceCancelled(false);
    setGameAudioReady(false);
    setGameAudioFailed(false);
    setBlendFeedback(correct ? "correct" : "wrong");
    void playGameSyllable(blendTarget);
    if (correct) {
      setBlendScore((score) => score + 1);
      awardXp(12);
    } else {
      if (selectedInitial !== blendInitial) recordMistake(blendInitial);
      if (selectedVowel !== blendVowel) recordMistake(blendVowel);
    }
  }

  function selectBlendInitial(value: string) {
    if (blendFeedback !== null || !gameAudioReady) return;
    resetKoreanInput();
    setBlendSelectedInitial(value);
    if (blendSelectedVowel !== null) evaluateBlend(value, blendSelectedVowel);
  }

  function selectBlendVowel(value: string) {
    if (blendFeedback !== null || !gameAudioReady) return;
    resetKoreanInput();
    setBlendSelectedVowel(value);
    if (blendSelectedInitial !== null) evaluateBlend(blendSelectedInitial, value);
  }

  function nextBlendQuestion(expectedToken = blendQuestionTokenRef.current) {
    if (blendFeedback === null || blendFinished) return;
    if (expectedToken !== blendQuestionTokenRef.current || blendAdvancedTokenRef.current === expectedToken) return;
    blendAdvancedTokenRef.current = expectedToken;
    focusAfterQuestionAdvance("game-panel-blend", blendRound >= 8 ? "blend-restart" : "blend-replay");
    setGameAutoAdvanceCancelled(true);
    setGameAudioReady(false);
    setGameAudioFailed(false);
    if (blendRound >= 8) {
      gamePlaybackRequestRef.current += 1;
      activeAudio?.pause();
      setBlendFinished(true);
      if (blendScope === "starter" && blendScore >= 6) markBeginnerBlendCompleted();
      updateStats((current) => ({ ...current, games: addSafeCount(current.games, 1) }));
      return;
    }
    setBlendRound((round) => round + 1);
    createBlendQuestion();
  }

  function startShadowSession() {
    const pool = shadowSet === "consonants" ? consonants : shadowSet === "vowels" ? vowels : allLetters;
    const weakLetters = weakest
      .map(([char]) => pool.find((letter) => letter.char === char))
      .filter((letter): letter is Letter => Boolean(letter));
    const remainder = shuffle(pool.filter((letter) => !weakLetters.some((weak) => weak.char === letter.char)));
    const queue = [...weakLetters, ...remainder].slice(0, 8);
    setShadowQueue(queue);
    setShadowIndex(0);
    setShadowScore(0);
    setShadowStage("repeat");
    setShadowAudioFailed(false);
    void playShadowExample(queue[0]).then(() => {
      focusAfterQuestionAdvance("game-panel-shadow", "shadow-replay");
    });
  }

  async function playShadowExample(letter: Letter) {
    if (shadowAudioBusyRef.current) return false;
    audioActivityRef.current = "game";
    const request = ++shadowPlaybackRequestRef.current;
    shadowAudioBusyRef.current = true;
    setShadowAudioBusy(true);
    setShadowAudioFailed(false);
    let played = false;
    try {
      played = await playSound(letter.sample) === "ended";
    } catch {
      showNotice("完整音节示范未能播放，请再试一次");
    }
    if (request !== shadowPlaybackRequestRef.current) return false;
    shadowAudioBusyRef.current = false;
    setShadowAudioBusy(false);
    setShadowAudioFailed(!played);
    return played;
  }

  async function replayShadowExample() {
    if (shadowAudioBusyRef.current) return;
    const stage = shadowStage;
    await playShadowExample(shadowCurrent);
    focusAfterQuestionAdvance("game-panel-shadow", stage === "rate" ? "shadow-rate-unsure" : "shadow-replay");
  }

  async function confirmShadowRepeat() {
    if (shadowStage !== "repeat" || shadowAudioBusyRef.current) return;
    const played = await playShadowExample(shadowCurrent);
    if (!played) {
      focusAfterQuestionAdvance("game-panel-shadow", "shadow-replay");
      return;
    }
    focusAfterQuestionAdvance("game-panel-shadow", "shadow-rate-unsure");
    setShadowStage("rate");
  }

  function rateShadow(confident: boolean) {
    if (shadowStage !== "rate" || shadowAudioBusyRef.current) return;
    let nextQueue = shadowQueue;
    if (confident) {
      setShadowScore((score) => score + 1);
      awardXp(8);
    } else {
      recordMistake(shadowCurrent.char);
      nextQueue = [...shadowQueue, shadowCurrent];
      setShadowQueue(nextQueue);
    }
    const nextIndex = shadowIndex + 1;
    if (nextIndex >= nextQueue.length) {
      focusAfterQuestionAdvance("game-panel-shadow", "shadow-restart");
      setShadowStage("finished");
      setShadowAudioFailed(false);
      updateStats((current) => ({ ...current, games: addSafeCount(current.games, 1) }));
      return;
    }
    setShadowIndex(nextIndex);
    setShadowStage("repeat");
    void playShadowExample(nextQueue[nextIndex]).then(() => {
      focusAfterQuestionAdvance("game-panel-shadow", "shadow-replay");
    });
  }

  function switchGameMode(mode: GameMode, focusTab = false) {
    if (mode === gameMode) {
      setKeyboardZone("games");
      if (focusTab) window.requestAnimationFrame(() => document.getElementById(`game-tab-${mode}`)?.focus());
      return;
    }
    leaveTypingForMode(mode);
    prepareGameActivity();
    setGameMode(mode);
    if (mode === "listen") startListenGame();
    if (mode === "match") startMatchGame();
    if (mode === "blend") startBlendGame("all");
    if (focusTab) window.requestAnimationFrame(() => document.getElementById(`game-tab-${mode}`)?.focus());
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="回到首页" onClick={prepareReferenceActivity}>
          <span className="brand-mark" lang="ko" aria-hidden="true">한</span>
          <span><strong>韩语 40 音</strong><small>{`中文闯关版 · v${APP_VERSION}`}</small></span>
        </a>
        <nav aria-label="主要导航">
          <a href="#starter" onClick={prepareReferenceActivity}>新手路线</a>
          <a href="#games" onClick={prepareGameActivity}>闯关训练</a>
          <a href="#phrases" onClick={claimPhraseActivity}>词句背诵</a>
          <a href="#daily-review" onClick={prepareReferenceActivity}>今日复习</a>
          <a href="#pronunciation-practice" onClick={prepareReferenceActivity}>发音对比</a>
          <a href="#learn" onClick={prepareReferenceActivity}>40 音表</a>
        </nav>
        <div className="topbar-actions">
          <button className="header-keyboard" type="button" onClick={openKeyboardHelp} aria-haspopup="dialog" aria-expanded={showKeyboardHelp} aria-label="打开键盘快捷键帮助"><span aria-hidden="true">⌨</span><b>快捷键</b></button>
          <button className="header-share" type="button" onClick={() => sharePage()} aria-label="分享这个韩语学习网页"><span aria-hidden="true">↗</span><b>分享</b></button>
          <a className="header-progress xp-pill" href="#games" onClick={prepareGameActivity} aria-label={`今日获得 ${gameStats.dailyXp} XP`}><span>{gameStats.dailyXp}</span> XP 今日</a>
        </div>
      </header>

      {shareNotice && <div className="share-toast" role="status">{shareNotice}</div>}
      {showKeyboardHelp && <div className="keyboard-modal-backdrop"><div ref={keyboardModalRef} className="keyboard-modal" role="dialog" aria-modal="true" aria-labelledby="keyboard-help-title" aria-describedby="keyboard-help-description"><div className="keyboard-modal-head"><div><span id="keyboard-help-description">无需移动鼠标</span><h2 id="keyboard-help-title">键盘快捷键</h2></div><button type="button" onClick={() => setShowKeyboardHelp(false)} aria-label="关闭快捷键帮助">×</button></div><div className="shortcut-grid"><article><strong>韩文键位直接作答</strong><p><kbd>R</kbd> ㄱ · <kbd>K</kbd> ㅏ · <kbd>Shift + R</kbd> ㄲ</p><small>听音与拼读默认用韩文双拼键位。复合元音连按两键，如 H → K = ㅘ。R 不再重播；按空格或 F8 重播。也可切回 ASDF 选项。</small></article><article><strong>进入训练场</strong><p><kbd>F2</kbd> 返回训练场 · <kbd>Enter</kbd> 开始</p><small>在页面顶部可先按 Enter 进入，再按一次开始。Mac 的功能键可能需要同时按 Fn。</small></article><article><strong>四选一答题</strong><p><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> ；ASDF 模式用 <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd></p><small>听音、极速、词句闯关都通用</small></article><article><strong>播放与推进</strong><p><kbd>Space</kbd> / <kbd>F8</kbd> 重播　<kbd>Enter</kbd> 下一题</p><small>长按不会重复触发声音</small></article><article><strong>切换小游戏</strong><p><kbd>[</kbd><kbd>]</kbd> 上一个 / 下一个</p><small>训练场聚焦时也可用左右方向键轮换；Tab 仍可逐个访问按钮</small></article><article><strong>配对消除</strong><p><kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd> · <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd> · <kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd><kbd>V</kbd></p><small>按键位置与三行卡片位置一致</small></article><article><strong>拼读工坊</strong><p><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd> 选辅音　<kbd>J</kbd><kbd>K</kbd><kbd>L</kbd><kbd>;</kbd> 选元音</p><small>ASDF 模式沿用这些键；韩文键位模式直接按字母对应的键</small></article><article><strong>地铁打字</strong><p><kbd>1–4</kbd> 选线路 · <kbd>Enter</kbd> 发车 / 到站 · <kbd>F8</kbd> 重播 · <kbd>Esc</kbd> 暂停</p><small>输入框内的字母、空格与方向键只交给韩语输入法，不触发全局快捷键</small></article><article><strong>帮助与关闭</strong><p><kbd>?</kbd> 打开帮助　<kbd>Esc</kbd> 关闭</p><small>页面右上角也可以随时打开</small></article></div></div></div>}

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow"><span>韩国真人起音</span><span>起音与音节对照</span></div>
            <h1 id="hero-title">别再硬背。<br />把 40 音玩熟。</h1>
            <p className="hero-lead">手放在键盘上，就能开始练习。听到 ㄱ 按 R，听到 ㅏ 按 K；紧音用 Shift，复合元音连按两键。韩文和英文输入法下都能玩。</p>
            <div className="hero-actions">
              <a className="primary-action" href="#games" onClick={prepareGameActivity}>开始今日闯关 <span aria-hidden="true">↓</span></a>
              <a className="text-action" href="#learn" onClick={prepareReferenceActivity}>先听 40 音 <span aria-hidden="true">↗</span></a>
              <a className="text-action" href="#daily-review" onClick={prepareReferenceActivity}>复习 10 个词句 <span aria-hidden="true">↗</span></a>
            </div>
            <p className="keyboard-entry-hint">电脑端按 <kbd>Enter</kbd> 进入训练场，再按一次开始；<kbd>F2</kbd> 随时返回训练场。</p>
            <div className="audio-source-card">
              <span className="audio-source-icon" aria-hidden="true">♪</span>
              <div><strong>韩国母语者真人起音 · 已截去完整元音</strong><p>18 个可听辅音保持精修音源；ㄹ、ㄲ、ㄸ、ㅃ 以同一裸起音原样重复两次，中间留短暂停顿，让手机也能听清。</p><small className="voice-status">正式字母名称：19 / 19 条内置音频可用</small></div>
              <div className="audio-controls"><span className="audio-ready">真人 WAV</span><div className="audio-speed-toggle" role="group" aria-label="选择发音速度"><button type="button" aria-pressed={audioSpeed === 1} onClick={() => changeAudioSpeed(1)}>标准</button><button type="button" aria-pressed={audioSpeed === 0.82} onClick={() => changeAudioSpeed(0.82)}>慢放</button></div></div>
            </div>
          </div>

          <div className="builder-card" aria-labelledby="builder-title">
            <div className="builder-topline"><span className="mini-label">完整音节 · 可慢放</span><span className="sound-waves" aria-hidden="true">· )))</span></div>
            <h2 id="builder-title">拼一个，就听一个</h2>
            <p>实际组合使用固定 AI 音频；现代口语中自然合流的组合会听起来相同。</p>
            <div className="builder-controls">
              <label><span>初声 · 辅音</span><select lang="ko" value={initial} onChange={(event) => changeBuilderInitial(event.target.value)} aria-label="选择辅音">{initialOrder.map((item) => <option key={item}>{item}</option>)}</select></label>
              <span className="plus" aria-hidden="true">+</span>
              <label><span>中声 · 元音</span><select lang="ko" value={vowel} onChange={(event) => changeBuilderVowel(event.target.value)} aria-label="选择元音">{vowelOrder.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <div className="syllable-stage">
              <div className="syllable-parts" lang="ko"><span>{initial}</span><span>{vowel}</span></div>
              <span className="becomes" aria-hidden="true">→</span>
              <button className="syllable-result" type="button" onClick={() => void playSoundWithNotice(syllable)}><strong lang="ko">{syllable}</strong><span>{audioSpeed === 1 ? "标准原音" : "同音慢放"} ▶</span></button>
            </div>
            <div className="builder-note"><span aria-hidden="true">听</span><p><strong>听法</strong> 这里读的是完整音节，不是脱离元音的“裸辅音”。例如 ㄱ + ㅏ 读 가；辅音的正式名称请在 40 音表里听。</p></div>
          </div>
        </section>

        <section className="principles" aria-label="游戏学习机制">
          <article><span className="principle-number">01</span><div><strong>错音自动返场</strong><p>答错后不会立刻死记，隔几题再出现更容易留下记忆。</p></div></article>
          <article><span className="principle-number">02</span><div><strong>六种训练轮换</strong><p>听音、跟读、配对、拼读、极速认读和生活词打字交替，避免单一题型产生假熟练。</p></div></article>
          <article><span className="principle-number">03</span><div><strong>只存本机进度</strong><p>XP、连胜和薄弱音保存在当前设备，不需要注册。</p></div></article>
        </section>

        <section className="starter-section" id="starter" aria-labelledby="starter-title">
          <div className="starter-heading">
            <div><span className="section-kicker">中文零基础 · 10 分钟起步</span><h2 id="starter-title">先走一条线，<br />再补完整 40 音。</h2><p>先认 6 个核心元音和 10 个基础辅音，再拼字块、直读只含已学字母的生活词。这里是入门顺序，不承诺几天学完整门语言。</p></div>
            <div className="starter-controls"><button className="starter-continue" type="button" onClick={continueBeginnerPath}>{beginnerNextLabel} <span aria-hidden="true">→</span></button><button className="roman-mode-toggle" type="button" aria-pressed={!showRomanization} onClick={() => changeRomanization(!showRomanization)}>{showRomanization ? "隐藏罗马字，练直读" : "✓ 已隐藏罗马字"}</button><small>罗马字只是检索提示，不按汉语拼音读；判断发音以音频和口型为准。</small></div>
          </div>

          <div className="starter-path" aria-label="零基础五步学习路线">
            <article className={coreVowelMastered === coreVowelChars.length ? "done" : ""}><div className="starter-step-top"><span>01 · 2 分钟</span><strong>{coreVowelMastered}/{coreVowelChars.length} 已标记</strong></div><h3>核心元音 6 音</h3><p lang="ko">ㅏ ㅓ ㅗ ㅜ ㅡ ㅣ</p><small>先看嘴唇是否圆，再分清 ㅓ / ㅗ 与 ㅡ / ㅜ。</small><div className="starter-step-actions"><button type="button" onClick={() => openLetterLesson("core-vowels")}>看 6 张音卡</button><button type="button" onClick={() => startScopedListenDrill(coreVowelChars, "核心元音 6 音")}>听音练习</button></div></article>
            <article className={basicConsonantMastered === basicConsonantChars.length ? "done" : ""}><div className="starter-step-top"><span>02 · 3 分钟</span><strong>{basicConsonantMastered}/{basicConsonantChars.length} 已标记</strong></div><h3>基础辅音 10 音</h3><p lang="ko">ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅅ ㅇ ㅈ ㅎ</p><small>9 个可听起音；ㅇ 作初声只占位置，本来不发音。</small><div className="starter-step-actions"><button type="button" onClick={() => openLetterLesson("basic-consonants")}>看 10 张音卡</button><button type="button" onClick={() => startScopedListenDrill(basicConsonantChars, "基础辅音 9 个可听音")}>听音练习</button></div></article>
            <article className={beginnerBlendCompleted ? "done" : ""}><div className="starter-step-top"><span>03 · 3 分钟</span><strong>{beginnerBlendCompleted ? "新手拼读已达标" : "8 题答对 6 题"}</strong></div><h3>先拼读，再扩展听辨</h3><p lang="ko">가 · 나 · 머</p><small>拼读只用前两步学过的 10 个基础辅音和 6 个核心元音；下方 4 组松、紧、送气对比是扩展预览，会出现新字母。</small><div className="starter-step-actions"><button type="button" onClick={openContrastLesson}>预听 4 组对比</button><button type="button" onClick={startStarterBlend}>10 × 6 拼读</button></div></article>
            <article className={starterPhraseMastered >= starterPhraseItems.length ? "done" : ""}><div className="starter-step-top"><span>04 · 2 分钟</span><strong>{starterPhraseMastered >= starterPhraseItems.length ? `已达标 · ${starterPhraseMastered}/${starterPhraseItems.length}` : `${starterPhraseMastered}/${starterPhraseItems.length} 达标`}</strong></div><h3>已学字母首读</h3><p lang="ko">어디 · 버스</p><small>这两条生活词只使用前面学过的字母，而且没有底部收音；先直读、再听音核对，不会突然跳级。</small><div className="starter-step-actions single"><button type="button" onClick={() => openPhraseLesson("word", STARTER_PHRASE_GROUP)}>打开首读词卡</button></div></article>
            <article className={survivalMastered >= 3 ? "done" : ""}><div className="starter-step-top"><span>05 · 下一步</span><strong>{survivalMastered >= 3 ? `已达标 · ${survivalMastered}/${survivalPhraseIds.size}` : `${survivalMastered}/3 达标`}</strong></div><h3>生存 6 句</h3><p lang="ko">주세요 · 어디예요?</p><small>购物、问路、请慢说和求助各留一句；先标记 3 句能用的，再进入进阶辅音与元音。</small><div className="starter-step-actions single"><button type="button" onClick={() => openPhraseLesson("sentence", SURVIVAL_PHRASE_GROUP)}>练生存 6 句</button></div></article>
          </div>

          <div className="block-lab" aria-labelledby="block-lab-title">
            <div className="block-lab-copy"><span>韩文字块第一课</span><h3 id="block-lab-title">一个方块，是一个音节。</h3><p>韩文不是按字母横着摊开。先找初声和中声；底下还有字母时，它叫收音。这里先认位置，不急着背复杂变音。</p><div className="block-example-tabs" role="group" aria-label="选择字块例子">{blockExamples.map((item) => <button type="button" key={item.id} aria-pressed={blockExample.id === item.id} onClick={() => selectBlockExample(item.id)}><strong lang="ko">{item.syllable}</strong><span>{item.chinese}</span></button>)}</div></div>
            <div className="block-lab-workspace">
              {blockParts && <div className="block-equation"><div><small>初声</small><strong lang="ko">{blockParts.initial}</strong><span>{blockParts.initial === "ㅇ" ? "这里静音" : "开头"}</span></div><b aria-hidden="true">+</b><div><small>中声</small><strong lang="ko">{blockParts.vowel}</strong><span>元音</span></div>{blockParts.final && <><b aria-hidden="true">+</b><div className="final-part"><small>收音</small><strong lang="ko">{blockParts.final}</strong><span>放在底部</span></div></>}<i aria-hidden="true">→</i><button className="block-result" type="button" onClick={playBlockExample} aria-label={`播放完整示范 ${blockExample.syllable}`}><small>完整播放</small><strong lang="ko">{blockExample.syllable}</strong><span>▶</span></button></div>}
              <p className="block-note"><strong>现在只记这一件事：</strong>{blockExample.note}</p>
              <button type="button" className="phrase-batchim-link" onClick={() => openBatchimLesson()}>下一步：用 5 个词认识收音 ↗</button>
            </div>
          </div>

          <div className="starter-advance" aria-labelledby="starter-advance-title">
            <div className="starter-advance-copy"><span>五步入门之后</span><h3 id="starter-advance-title">沿着同一条线，补齐完整 40 音。</h3><p>先把已学松音和新字母按家族比较，再补其余元音；最后做 39 个可听音混合验收。初声静音的 ㅇ 仍在音表学习，但不进入盲听题。</p></div>
            <div className="starter-advance-grid">
              <article className={advancedConsonantMastered === advancedConsonantChars.length ? "done" : ""}><div><span>进阶辅音</span><strong>{advancedConsonantMastered}/{advancedConsonantChars.length}</strong></div><h4 lang="ko">ㄱ–ㄲ–ㅋ · ㄷ–ㄸ–ㅌ<br />ㅂ–ㅃ–ㅍ · ㅈ–ㅉ–ㅊ · ㅅ–ㅆ</h4><p>只新增 9 个字母，按松音、紧音、送气音成组听，不套汉语拼音清浊关系。</p><div><button type="button" onClick={() => openLetterLesson("advanced-consonants")}>看 9 张音卡</button><button type="button" onClick={() => startScopedListenDrill(advancedConsonantChars, "进阶辅音 9 音")}>听音专项</button></div></article>
              <article className={advancedVowelMastered === advancedVowelChars.length ? "done" : ""}><div><span>进阶元音</span><strong>{advancedVowelMastered}/{advancedVowelChars.length}</strong></div><h4 lang="ko">ㅑ ㅕ ㅛ ㅠ · ㅐ≈ㅔ<br />ㅙ≈ㅚ≈ㅞ · ㅢ</h4><p>补齐 15 个元音；现代口语里本来接近的音只做辨认，不制造虚假的唯一答案。</p><div><button type="button" onClick={() => openLetterLesson("advanced-vowels")}>看 15 张音卡</button><button type="button" onClick={() => startScopedListenDrill(advancedVowelChars, "进阶元音 15 音")}>听音专项</button></div></article>
              <article className={fullReviewCompleted ? "done" : ""}><div><span>完整验收</span><strong>{fullReviewCompleted ? fullReviewSaved ? "已通过并保存" : "本页已通过 · 未保存" : `${mastered.length}/${allLetters.length} 已标记`}</strong></div><h4>39 个可听音混合复习</h4><p>五步入门和全部字母完成后，用公平出题规则完成 10 题；答对 8 题才记录验收通过，近同音不会同时作为唯一答案。</p><div className="single"><button type="button" disabled={!fullReviewPrerequisitesComplete} onClick={startFullReview}>{fullReviewCompleted ? "再次完整复习 →" : fullReviewPrerequisitesComplete ? "开始完整验收 →" : "完成前置学习后解锁"}</button></div></article>
            </div>
          </div>
        </section>

        <section className="game-section" id="games" aria-labelledby="games-title">
          <div className="game-heading">
            <div><span className="section-kicker">今日训练场</span><h2 id="games-title">玩着玩着，耳朵、字形和输入就对上了。</h2><p>听音、配对与极速辨认保留真人短促起音；回声跟读和拼读使用完整音节；地铁打字把 32 个生活词变成四条可反复乘坐的线路。</p></div>
            <div className="daily-goal">
              <div><span>今日目标</span><strong>{Math.min(gameStats.dailyXp, 80)}<small>/80 XP</small></strong></div>
              <div className="daily-goal-track"><span style={{ width: `${Math.min((gameStats.dailyXp / 80) * 100, 100)}%` }} /></div>
              <p>{gameStats.dailyXp >= 80 ? "今日目标完成，厉害！" : `还差 ${80 - Math.min(gameStats.dailyXp, 80)} XP`}</p>
            </div>
          </div>

          <div className="game-dashboard">
            <aside className="game-sidebar">
              <div className="game-profile"><span className="level-badge">Lv.{Math.floor(gameStats.totalXp / 200) + 1}</span><div><strong>{gameStats.totalXp} XP</strong><small>累计经验</small></div></div>
              <div className="game-stats-row"><div><strong>{gameStats.bestCombo}</strong><span>最佳连胜</span></div><div><strong>{gameStats.games}</strong><span>完成局数</span></div></div>
              <div className="week-card">
                <div><span>近 7 天</span><strong>{weekData.reduce((sum, day) => sum + day.xp, 0)} XP</strong></div>
                <div className="week-bars" role="list" aria-label="近七天经验记录">{weekData.map((day) => <div className="week-day" role="listitem" key={day.key} title={`${day.key} · ${day.xp} XP`}><span className="sr-only">{day.key}，{day.xp} XP</span><span aria-hidden="true"><i style={{ height: day.xp === 0 ? "4px" : `${Math.max(10, (day.xp / weekMax) * 100)}%` }} /></span><small aria-hidden="true">{day.label}</small></div>)}</div>
              </div>
              <div className="weak-list"><span>累计易错音</span>{weakest.length === 0 ? <p>先玩一局，系统会自动记录。</p> : <div>{weakest.map(([char, count]) => { const letter = allLetters.find((item) => item.char === char); return <button type="button" key={char} onClick={() => letter && playSidebarLetterExample(letter)}><strong lang="ko">{char}</strong><small>累计错 {count} 次 · {char === "ㅇ" ? "初声静音" : "点击听"}</small></button>; })}</div>}</div>
              {weakest.some(([char]) => char !== "ㅇ") && <button className="weak-drill-button" type="button" onClick={startWeakDrill}>复习累计易错音 →</button>}
            </aside>

            <div id="keyboard-game-console" tabIndex={-1} aria-label="键盘训练场" ref={gameSectionRef} className="game-console" onMouseDown={claimGameActivity} onFocusCapture={claimGameActivity}>
              <div className="game-tabs" role="tablist" aria-label="选择小游戏">
                <button id="game-tab-listen" type="button" role="tab" aria-controls={gameMode === "listen" ? "game-panel-listen" : undefined} aria-selected={gameMode === "listen"} tabIndex={gameMode === "listen" ? 0 : -1} onClick={() => switchGameMode("listen")}><span aria-hidden="true">♫</span><div><strong>听音闯关</strong><small>错题隔轮返场</small></div></button>
                <button id="game-tab-shadow" type="button" role="tab" aria-controls={gameMode === "shadow" ? "game-panel-shadow" : undefined} aria-selected={gameMode === "shadow"} tabIndex={gameMode === "shadow" ? 0 : -1} onClick={() => switchGameMode("shadow")}><span aria-hidden="true">说</span><div><strong>回声跟读</strong><small>不稳就排回队尾</small></div></button>
                <button id="game-tab-match" type="button" role="tab" aria-controls={gameMode === "match" ? "game-panel-match" : undefined} aria-selected={gameMode === "match"} tabIndex={gameMode === "match" ? 0 : -1} onClick={() => switchGameMode("match")}><span aria-hidden="true">▦</span><div><strong>配对消除</strong><small>字形配上声音</small></div></button>
                <button id="game-tab-blend" type="button" role="tab" aria-controls={gameMode === "blend" ? "game-panel-blend" : undefined} aria-selected={gameMode === "blend"} tabIndex={gameMode === "blend" ? 0 : -1} onClick={() => switchGameMode("blend")}><span aria-hidden="true">拼</span><div><strong>拼读工坊</strong><small>声音拆成两块</small></div></button>
                <button id="game-tab-speed" type="button" role="tab" aria-controls={gameMode === "speed" ? "game-panel-speed" : undefined} aria-selected={gameMode === "speed"} tabIndex={gameMode === "speed" ? 0 : -1} onClick={() => switchGameMode("speed")}><span aria-hidden="true">⚡</span><div><strong>极速认读</strong><small>30 秒破纪录</small></div></button>
                <button id="game-tab-typing" type="button" role="tab" aria-controls={gameMode === "typing" ? "game-panel-typing" : undefined} aria-selected={gameMode === "typing"} tabIndex={gameMode === "typing" ? 0 : -1} onClick={() => switchGameMode("typing")}><span aria-hidden="true">地</span><div><strong>地铁打字</strong><small>生活词过站</small></div></button>
              </div>
              <div className="keyboard-guide"><span aria-hidden="true">⌨</span><strong>键盘模式</strong><p>{gameKeyboardHint}</p><button type="button" onClick={openKeyboardHelp}><kbd>?</kbd> 全部</button></div>
              <div className="keyboard-navigation-hint"><span><kbd>[</kbd> / <kbd>]</kbd> 切换游戏；训练场聚焦时也可用 <kbd>←</kbd> / <kbd>→</kbd></span><span>长按只响应一次 · 输入框保留正常打字</span></div>
              {(gameMode === "listen" || gameMode === "blend") && <div className="korean-input-panel">
                <div className="korean-input-heading"><strong>用自己的韩文键盘作答</strong><div role="group" aria-label="选择键盘答题方式"><button type="button" aria-pressed={keyboardInputMode === "hangul"} onClick={() => changeKeyboardInputMode("hangul")}>韩文键位</button><button type="button" aria-pressed={keyboardInputMode === "shortcuts"} onClick={() => changeKeyboardInputMode("shortcuts")}>ASDF 选项</button></div></div>
                {directKoreanKeyboard && <>
                  <p className="korean-key-status" role="status" aria-live="polite"><span className={pressedKoreanKey ? "is-pressed" : ""}><kbd>{pressedKoreanKey || "⌨"}</kbd><b lang="ko">{koreanPending || "두벌식"}</b></span><span>{koreanKeyboardStatus || "按选项旁的韩文键位直接作答。R 是 ㄱ；重播请按空格。"}</span></p>
                  <KoreanKeyboard activeKey={pressedKoreanKey} shifted={koreanShifted} onKey={handleKoreanGameKey} onShift={() => setKoreanShifted((value) => !value)} onClear={clearKoreanPending} />
                </>}
              </div>}

              {gameMode === "listen" && (
                <div id="game-panel-listen" className="listen-game game-board" role="tabpanel" aria-labelledby="game-tab-listen">
                  {!listenStarted ? (
                    <div className="game-finish listen-first-start"><span className="finish-medal" aria-hidden="true">♫</span><small>不会预设第一题答案</small><h3>先播放，再作答</h3><p>点击开始后才会随机抽题并播放示范音；完整听完后才开放作答。</p><button id="listen-start" type="button" onClick={startInitialListenGame}>播放第一题 <kbd>Enter</kbd></button></div>
                  ) : listenFinished ? (
                    <div className="game-finish"><span className="finish-medal" aria-hidden="true">★</span><small>{listenSessionLabel}</small><h3>{listenScore} / 10</h3><p>{listenQualifiesFullReview && listenScore >= 8 ? fullReviewSaved ? "完整路线验收已通过，刷新后也会保留。" : "完整路线已在本页通过，但浏览器未能保存；刷新后需要重新验收。" : listenScore >= 8 ? "你的耳朵已经开始分辨细节了。" : listenQualifiesFullReview ? "本轮还没达到 8 分；错音已记录，下局会更常遇到。" : "错音已被记住，下局会更常遇到它们。"}</p><div className="listen-finish-actions"><button id="listen-restart" type="button" onClick={restartListenSession}>同范围再练一局</button>{listenScore >= 8 && confirmableListenChars.length > 0 && <button className="confirm-mastery" type="button" onClick={markListenScopeMastered}>标记本局全对的 {confirmableListenChars.length} 个 ✓</button>}</div></div>
                  ) : (
                    <>
                      <div className="game-board-top"><span data-testid="listen-round" aria-live="polite">第 {listenRound} / 10 题</span><div className="round-track"><span style={{ width: `${listenRound * 10}%` }} /></div><div className="heart-row" role="status" aria-live="polite" aria-atomic="true"><span className="sr-only">剩余 {listenHearts} 颗心</span>{[0, 1, 2].map((heart) => <span key={heart} className={heart < listenHearts ? "alive" : "lost"} aria-hidden="true">♥</span>)}</div></div>
                      <div className="listen-prompt"><div className="listen-chips"><span className="combo-chip">连胜 × {listenCombo}</span><span className="session-chip">{listenSessionLabel}</span></div><h3>{consonantNameMap.has(listenTarget.char) ? "听韩国真人的辅音起音，选出字母" : "听元音本音，选出对应字母"}</h3><button id="listen-replay" className="big-listen" type="button" onClick={() => void replayGameLetter(listenTarget)} aria-label={`第 ${listenRound} 题，重新播放题目`}><span aria-hidden="true">▶</span><strong>再听一次</strong><small>{consonantNameMap.has(listenTarget.char) ? listenAnswer === null ? "韩国真人起音" : `真人起音 · ${consonantNameMap.get(listenTarget.char)?.ipa}` : "元音本音"} · {audioSpeed === 1 ? "标准" : "慢放"}</small></button></div>
                      <div className="game-choices" aria-busy={!gameAudioReady && listenAnswer === null}>
                        {listenChoices.map((choice, index) => {
                          const answered = listenAnswer !== null;
                          const correct = choice.char === listenTarget.char;
                          const pickedWrong = choice.char === listenAnswer && !correct;
                          return <button type="button" key={choice.char} data-testid={`listen-choice-${index}`} disabled={answered || !gameAudioReady} className={`${answered && correct ? "correct" : ""} ${pickedWrong ? "wrong" : ""} ${koreanPending === choice.char ? "keyboard-pending" : ""}`} onClick={() => answerListen(choice.char)}><kbd>{directKoreanKeyboard ? `${index + 1} / ${koreanKeyLabel(choice.char)}` : choiceKeyLabels[index]}</kbd><strong lang="ko">{choice.char}</strong><small>{answered ? showRomanization ? choice.roman : "罗马字已隐藏" : gameAudioFailed ? "先重播" : gameAudioReady ? koreanPending === choice.char ? "Enter 确认" : "选择" : "先听完"}</small></button>;
                        })}
                      </div>
                      <div className="game-feedback" aria-live="polite">
                        {listenAnswer === null ? <span>{gameAudioFailed ? "题目音频未能播放，请点“再听一次”重试；本题暂不可作答。" : gameAudioReady ? "可以作答：辅音题只播放真人裁切的起音片段；初声静音的 ㅇ 不进入盲听题。" : "请先听完整条题目音频，播放完即开放选项。"}</span> : <span className="auto-next-status">{listenAnswer === listenTarget.char ? <strong className="success">正确！+{10 + Math.min(listenCombo * 2, 10)} XP</strong> : <strong className="retry">正确答案是 {listenTarget.char}，{consonantNameMap.has(listenTarget.char) ? `真人起音目标是 ${consonantNameMap.get(listenTarget.char)?.ipa}` : `元音本音是 ${listenTarget.sample}`}。</strong>}<small>{gameAudioFailed ? "音频未能播放，已暂停自动下一题；请重播或手动继续。" : gameAutoAdvanceCancelled ? "自动推进已取消；可手动进入下一题。" : "听完反馈后自动进入下一题…"}</small></span>}
                        {listenAnswer !== null && <button type="button" onClick={() => nextListenQuestion()}>{listenRound >= 10 || listenHearts <= 0 ? "立即查看成绩" : "立即下一题 →"}</button>}
                      </div>
                    </>
                  )}
                </div>
              )}

              {gameMode === "shadow" && (
                <div id="game-panel-shadow" className="shadow-game game-board" role="tabpanel" aria-labelledby="game-tab-shadow">
                  {shadowQueue.length === 0 ? (
                    <div className="shadow-start"><span aria-hidden="true">说</span><h3>听完整音节，跟读一次，再核对</h3><p>辅音会放进真实可发出的完整音节，例如 ㄹ → 라；裁切起音只用于听辨，不再让你模仿裸辅音。</p><div className="shadow-set-toggle" role="group" aria-label="选择跟读范围"><button type="button" aria-pressed={shadowSet === "mixed"} onClick={() => setShadowSet("mixed")}>混合完整音节</button><button type="button" aria-pressed={shadowSet === "consonants"} onClick={() => setShadowSet("consonants")}>辅音进入音节</button><button type="button" aria-pressed={shadowSet === "vowels"} onClick={() => setShadowSet("vowels")}>元音进入音节</button></div><button id="shadow-start" className="shadow-start-button" type="button" onClick={startShadowSession}>开始跟读循环</button></div>
                  ) : shadowStage === "finished" ? (
                    <div className="game-finish"><span className="finish-medal" aria-hidden="true">说</span><small>完整音节跟读完成</small><h3>{shadowScore} 个示范</h3><p>所有不稳的项目都已经返场并再次确认。可以先换范围，再开始下一轮。</p><div className="shadow-set-toggle" role="group" aria-label="选择下一轮跟读范围"><button type="button" aria-pressed={shadowSet === "mixed"} onClick={() => setShadowSet("mixed")}>混合完整音节</button><button type="button" aria-pressed={shadowSet === "consonants"} onClick={() => setShadowSet("consonants")}>辅音进入音节</button><button type="button" aria-pressed={shadowSet === "vowels"} onClick={() => setShadowSet("vowels")}>元音进入音节</button></div><button id="shadow-restart" type="button" onClick={startShadowSession}>按当前范围再来一轮</button></div>
                  ) : (
                    <>
                      <div className="game-board-top"><span>第 {shadowIndex + 1} / {shadowQueue.length} 个示范</span><div className="round-track"><span style={{ width: `${((shadowIndex + 1) / shadowQueue.length) * 100}%` }} /></div><strong>{shadowScore} 已熟悉</strong></div>
                      <div className="shadow-card"><span className="combo-chip">{shadowStage === "repeat" ? "听完后，模仿完整音节一次" : "核对刚才的完整音节"}</span><strong lang="ko">{shadowCurrent.sample}</strong><div><b lang="ko">{consonantNameMap.has(shadowCurrent.char) ? `${shadowCurrent.char} + ㅏ` : `ㅇ + ${shadowCurrent.char}`}</b><span>{shadowCurrent.char === "ㅇ" ? "初声 ㅇ 静音，只听元音" : consonantNameMap.has(shadowCurrent.char) ? "辅音进入完整音节" : "初声 ㅇ 静音"}</span></div><p>{shadowCurrent.hint}</p></div>
                      {shadowStage === "repeat" ? (
                        <><p className={`shadow-audio-status ${shadowAudioFailed ? "error" : ""}`} role="status">{shadowAudioFailed ? "示范音频未能完整播放，请重播成功后再核对。" : shadowAudioBusy ? "请听完整条示范音频…" : "示范已播放完，可以跟读并核对。"}</p><div className="shadow-actions"><button id="shadow-replay" type="button" disabled={shadowAudioBusy} onClick={() => void replayShadowExample()}><kbd>Space / R</kbd> {shadowAudioBusy ? "示范播放中…" : "再听示范"}</button><button id="shadow-confirm" className="primary" type="button" disabled={shadowAudioBusy} onClick={() => void confirmShadowRepeat()}><kbd>Enter</kbd> {shadowAudioBusy ? "请先听完示范" : "我已跟读 · 播放同一示范"}</button></div></>
                      ) : (
                        <div className="shadow-rating"><p>核对示范已完整播放。刚才跟读得怎么样？</p><div><button id="shadow-rate-unsure" type="button" disabled={shadowAudioBusy} onClick={() => rateShadow(false)}><kbd>1 / A</kbd> 还不稳 · 稍后返场</button><button id="shadow-rate-confident" className="confident" type="button" disabled={shadowAudioBusy} onClick={() => rateShadow(true)}><kbd>2 / S</kbd> 挺像的 · +8 XP</button></div></div>
                      )}
                    </>
                  )}
                </div>
              )}

              {gameMode === "match" && (
                <div id="game-panel-match" className="match-game game-board" role="tabpanel" aria-labelledby="game-tab-match">
                  <div className="game-board-top"><span>已配对 {matchedLetters.length} / 6</span><div className="round-track"><span style={{ width: `${(matchedLetters.length / 6) * 100}%` }} /></div><span className="move-count">{matchMoves} 步</span></div>
                  <div className="match-intro"><h3>把字形和对应示范音频配成一对</h3><p>辅音牌播放韩国真人起音片段，元音牌播放元音本音；“听”牌不会显示答案。</p></div>
                  <div className="match-grid">
                    {matchDeck.map((card, index) => {
                      const matched = matchedLetters.includes(card.letter.char);
                      const selected = matchSelected.includes(card.uid);
                      const matchLabel = matched
                        ? `${card.letter.char} 已配对`
                        : card.type === "sound"
                          ? `第 ${index + 1} 张声音牌，播放示范并找字母，快捷键 ${matchKeys[index]}`
                          : `第 ${index + 1} 张字母牌 ${card.letter.char}，快捷键 ${matchKeys[index]}`;
                      return <button id={`match-card-${index}`} type="button" key={card.uid} className={`${matched ? "matched" : ""} ${selected ? "selected" : ""}`} disabled={matched || matchLocked} aria-pressed={selected} onClick={() => void selectMatchCard(card)} aria-label={matchLabel}><kbd>{matchKeys[index]}</kbd><span lang={card.type === "char" && !matched ? "ko" : undefined}>{matched ? "✓" : card.type === "char" ? card.letter.char : "♫"}</span><small>{matched ? showRomanization ? card.letter.roman : "已配对" : card.type === "char" ? "字形" : "听示范"}</small></button>;
                    })}
                  </div>
                  <div className="game-feedback" aria-live="polite"><span>{matchedLetters.length === 6 ? "全部消除！奖励 25 XP。" : matchFeedback}</span><button id="match-restart" type="button" onClick={startMatchGame}>{matchedLetters.length === 6 ? "再玩一局" : "重新洗牌"}</button></div>
                </div>
              )}

              {gameMode === "blend" && (
                <div id="game-panel-blend" className="blend-game game-board" role="tabpanel" aria-labelledby="game-tab-blend">
                  {blendFinished ? (
                    <div className="game-finish"><span className="finish-medal" aria-hidden="true">拼</span><small>{blendSessionLabel} · 拼读完成</small><h3>{blendScore} / 8</h3><p>{blendScore >= 6 ? "你已经能把完整音节对应回初声和中声；新手范围达到 6 分才会解锁下一步。" : "还没达到 6 分解锁线；再来一局，先判断初声、再判断中声，遇到 ㅇ 时开头没有辅音声。"}</p><button id="blend-restart" type="button" onClick={() => startBlendGame()}>同范围再拼一局</button></div>
                  ) : (
                    <>
                      <div className="game-board-top"><span aria-live="polite">第 {blendRound} / 8 题 · {blendSessionLabel}</span><div className="round-track"><span style={{ width: `${(blendRound / 8) * 100}%` }} /></div><strong>{blendScore} 分</strong></div>
                      <div className="blend-prompt">
                        <button id="blend-replay" className="blend-audio-button" type="button" onClick={() => void replayGameSyllable(blendTarget)} aria-label={`第 ${blendRound} 题，重播要判断的完整音节`}><span aria-hidden="true">▶</span><strong>听音节认字母</strong><small>判断初声和中声；ㅇ 初声无声</small></button>
                        <div className={`blend-equation ${blendFeedback ?? ""}`} lang="ko" aria-live="polite">{blendFeedback === null ? <><span>{blendSelectedInitial ?? "?"}</span><b>+</b><span>{blendSelectedVowel ?? "?"}</span><b>=</b><span>?</span></> : <><span>{blendInitial}</span><b>+</b><span>{blendVowel}</span><b>=</b><strong>{blendTarget}</strong></>}</div>
                      </div>
                      <div className="blend-choice-groups" aria-busy={!gameAudioReady && blendFeedback === null}>
                        <div className="blend-choice-group"><span>① 先选辅音</span><div className="blend-choice-row">{blendInitialChoices.map((choice, index) => <button type="button" key={choice} disabled={blendFeedback !== null || !gameAudioReady} className={`${blendSelectedInitial === choice ? "selected" : ""} ${blendFeedback !== null && choice === blendInitial ? "correct" : ""} ${blendFeedback === "wrong" && choice === blendSelectedInitial && choice !== blendInitial ? "wrong" : ""}`} onClick={() => selectBlendInitial(choice)}><kbd>{directKoreanKeyboard ? `${index + 1} / ${koreanKeyLabel(choice)}` : choiceKeyLabels[index]}</kbd><span lang="ko">{choice}</span></button>)}</div></div>
                        <div className="blend-choice-group"><span>② 再选元音</span><div className="blend-choice-row">{blendVowelChoices.map((choice, index) => <button type="button" key={choice} disabled={blendFeedback !== null || !gameAudioReady} className={`${blendSelectedVowel === choice ? "selected" : ""} ${blendFeedback !== null && choice === blendVowel ? "correct" : ""} ${blendFeedback === "wrong" && choice === blendSelectedVowel && choice !== blendVowel ? "wrong" : ""} ${koreanPending === choice ? "keyboard-pending" : ""}`} onClick={() => selectBlendVowel(choice)}><kbd>{index + 5} / {directKoreanKeyboard ? koreanKeyLabel(choice) : blendVowelKeys[index]}</kbd><span lang="ko">{choice}</span></button>)}</div></div>
                      </div>
                      <div className="game-feedback" aria-live="polite">
                        {blendFeedback === null ? <span>{gameAudioFailed ? "题目音节未能播放，请点上方播放按钮重试；本题暂不可作答。" : gameAudioReady ? "可以作答：两边各选一个，系统会自动合成答案；同音组合会自动跳过。" : "请先听完整条题目音频，播放完即开放两组选项。"}</span> : <span className="auto-next-status">{blendFeedback === "correct" ? <strong className="success">拼对了！{blendInitial} + {blendVowel} = {blendTarget} · +12 XP</strong> : <strong className="retry">再听：{blendInitial} + {blendVowel} 才是 {blendTarget}</strong>}<small>{gameAudioFailed ? "音节未能播放，已暂停自动下一题；请重播或手动继续。" : gameAutoAdvanceCancelled ? "自动推进已取消；可手动进入下一题。" : "听完正确音节后自动进入下一题…"}</small></span>}
                        {blendFeedback !== null && <button type="button" onClick={() => nextBlendQuestion()}>{blendRound >= 8 ? "立即查看成绩" : "立即下一题 →"}</button>}
                      </div>
                    </>
                  )}
                </div>
              )}

              {gameMode === "speed" && (
                <div id="game-panel-speed" className={`speed-game game-board ${speedFlash ? `flash-${speedFlash}` : ""}`} role="tabpanel" aria-labelledby="game-tab-speed">
                  <div className="game-board-top"><span>得分 {speedScore}</span><div className="speed-timer"><span style={{ width: `${(speedTime / 30) * 100}%` }} /></div><strong>{speedTime}s</strong></div>
                  {!speedRunning ? (
                    <div className="speed-start"><span aria-hidden="true">⚡</span><h3>{speedCancelled ? "本轮已取消" : speedTime === 0 ? `本轮认出 ${speedScore} 个` : "30 秒极速认读"}</h3><p>{speedCancelled ? speedFeedback : "这是专门的罗马字检索提示训练，即使背诵卡已隐藏罗马字，这里仍会显示；发音仍以真人起音和元音音频为准。初声静音的 ㅇ 不进入本模式。"}</p><button id="speed-restart" type="button" onClick={startSpeedGame}>{speedTime === 0 ? "再来一轮" : "开始计时"}</button></div>
                  ) : (
                    <>
                      <div className="speed-target"><span className="combo-chip">连胜 × {speedCombo}</span><strong lang="ko">{speedTarget.char}</strong><small>选出罗马字提示</small></div>
                      <div className="speed-options" aria-busy={speedAnswerPending}>{speedChoices.map((choice, index) => <button id={`speed-choice-${index}`} type="button" key={choice.char} disabled={speedAnswerPending} onClick={() => void answerSpeed(choice.char)}><kbd>{choiceKeyLabels[index]}</kbd>{choice.roman}</button>)}</div>
                      <p className="speed-feedback" role="status" aria-live="polite">{speedFeedback}</p>
                    </>
                  )}
                </div>
              )}

              {gameMode === "typing" && (
                <div id="game-panel-typing" className="typing-game game-board" role="tabpanel" aria-labelledby="game-tab-typing">
                  {typingPhase === "idle" ? (
                    <div className="typing-start">
                      <div className="typing-start-copy"><span aria-hidden="true">地</span><div><small>生活韩语打字地铁</small><h3>打对一个词，列车前进一站。</h3><p>看韩文、读中文，再用韩语输入法照着打。错字会留在原站，改对后继续；每条线路都是网站现有的 8 个生活高频词。</p></div></div>
                      <div className="typing-route-picker" role="group" aria-label="选择生活词线路">{typingRoutes.map((route) => { const best = typingBestRecords[route.id]; return <button id={`typing-route-${route.id}`} type="button" key={route.id} className={`theme-${route.theme}`} aria-pressed={typingRoute.id === route.id} onClick={() => selectTypingRoute(route.id)}><span><i aria-hidden="true" /><strong>{route.name}</strong><small lang="ko">{route.korean}</small></span><span className="typing-route-description">{route.description}</span><em>{best ? `最佳 ${formatTypingTime(best.elapsedMs)} · ${best.accuracy}%` : "尚无纪录 · 8 站"}</em></button>; })}</div>
                      <div className="typing-start-actions"><button id="typing-start" type="button" onClick={startTypingRun}>乘坐 {typingRoute.name} <span aria-hidden="true">→</span></button><p>电脑或手机都可使用；网站不会强制切换键盘，请先在设备上启用韩语输入法。</p></div>
                    </div>
                  ) : typingPhase === "paused" ? (
                    <div className="game-finish typing-paused"><span className="finish-medal" aria-hidden="true">Ⅱ</span><small>{typingRoute.name} · 第 {typingStopIndex + 1}/{typingItems.length} 站</small><h3>行程已暂停</h3><p role="status" aria-live="polite">{typingFeedback} 暂停期间不计时，输入内容仍保留。</p><div className="typing-finish-actions"><button id="typing-resume" type="button" onClick={resumeTypingRun}>继续行程</button><button type="button" className="secondary" onClick={resetTypingRunForRouteSelection}>结束并选线路</button></div></div>
                  ) : typingPhase === "finished" ? (
                    <div className="game-finish typing-finish"><span className="finish-medal" aria-hidden="true">✓</span><small>{typingRoute.name} · {typingItems.length} 站全部通过</small><h3 ref={typingResultHeadingRef} tabIndex={-1}>到达终点</h3><dl className="typing-result-stats"><div><dt>完成用时</dt><dd>{formatTypingTime(typingElapsedMs)}</dd></div><div><dt>准确率</dt><dd>{typingAccuracy}%</dd></div><div><dt>韩文字／分</dt><dd>{typingCpm}</dd></div></dl><p>{typingMissedIds.length === 0 ? "全程一次通过，列车没有停错站。" : `有 ${typingMissedIds.length} 个词曾输入错误，系统已把它们加入累计错词权重。`}{typingBest ? ` 当前线路最佳：${typingBest.accuracy}% · ${formatTypingTime(typingBest.elapsedMs)}。` : ""}</p>{typingMissedIds.length > 0 && <ul className="typing-missed" aria-label="本轮错词">{typingMissedIds.map((id) => { const item = phraseItemById.get(id); return item ? <li key={id}><b lang="ko">{item.korean}</b><small>{item.chinese}</small></li> : null; })}</ul>}<div className="typing-finish-actions"><button id="typing-restart" type="button" onClick={startTypingRun}>同线路再坐一趟</button><button type="button" className="secondary" onClick={resetTypingRunForRouteSelection}>换一条线路</button></div></div>
                  ) : (
                    <>
                      <div className="game-board-top"><span>第 {typingStopIndex + 1} / {typingItems.length} 站</span><div className="round-track" aria-hidden="true"><span style={{ width: `${(typingStopIndex / typingItems.length) * 100}%` }} /></div><strong>{formatTypingTime(typingElapsedMs)}</strong></div>
                      <ol className={`typing-line theme-${typingRoute.theme}`} aria-label={`${typingRoute.name}线路进度`}>{typingItems.map((item, index) => <li key={item.id} className={index < typingStopIndex ? "complete" : index === typingStopIndex ? "current" : "upcoming"} aria-current={index === typingStopIndex ? "step" : undefined}><span aria-hidden="true">{index < typingStopIndex ? "✓" : index === typingStopIndex ? "地" : index + 1}</span><small lang="ko">{item.korean}</small><em>{index < typingStopIndex ? "已通过" : index === typingStopIndex ? "当前站" : "未到达"}</em></li>)}</ol>
                      <div className="typing-cockpit">
                        <div className="typing-target"><span>{typingRoute.name} · 当前生活词</span><strong id="typing-target-korean" lang="ko">{typingCurrent.korean}</strong><p id="typing-target-chinese">中文：{typingCurrent.chinese}</p><button type="button" disabled={typingAudioBusy} onClick={() => void replayTypingWord()} aria-label={`播放 ${typingCurrent.korean} 的完整韩语音频`}><span aria-hidden="true">▶</span> {typingAudioBusy ? "正在播放…" : "听完整发音"}</button></div>
                        <form className="typing-form" onSubmit={submitTypingStop}>
                          <label htmlFor="typing-input">输入上方韩文</label>
                          <input ref={typingInputRef} id="typing-input" type="text" lang="ko" inputMode="text" enterKeyHint="done" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} disabled={typingAudioBusy} value={typingInput} aria-invalid={typingInputInvalid} aria-describedby="typing-target-korean typing-target-chinese typing-input-help" aria-errormessage={typingInputInvalid ? "typing-feedback-message" : undefined} onChange={(event) => { setTypingInput(event.target.value); if (typingInputInvalid) { setTypingInputInvalid(false); setTypingFeedback(`正在修改 ${typingCurrent.korean}；按 Enter 再确认。`); } }} onCompositionStart={() => { typingCompositionRef.current = true; }} onCompositionEnd={(event) => { typingCompositionRef.current = false; setTypingInput(event.currentTarget.value); }} onKeyDown={(event) => { if (event.key === "Enter" && (event.nativeEvent.isComposing || typingCompositionRef.current || event.keyCode === 229)) event.preventDefault(); }} />
                          <p id="typing-input-help">请切换韩语键盘；输入法候选还没完成时，Enter 不会误提交。</p>
                          <button type="submit" disabled={typingAudioBusy}>{typingAudioBusy ? "请先听完发音" : "确认到站"} <kbd>Enter</kbd></button>
                        </form>
                      </div>
                      <div className="typing-feedback" id="typing-feedback" role="status"><span id="typing-feedback-message">{typingFeedback}</span><small>输入错误 {typingWrongAttempts} 次 · 当前准确率 {typingCompletedCharacters === 0 && typingWrongAttempts === 0 ? "—" : `${typingAccuracy}%`}</small></div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        <DailyReview ref={dailyReviewRef} items={phraseItems} {...dailyReview} onPrepare={prepareReferenceActivity} playSample={playSound} />

        <section className="phrase-section" id="phrases" aria-labelledby="phrases-title" onMouseDown={claimPhraseActivity} onFocusCapture={claimPhraseActivity}>
          <div className="phrase-heading">
            <div><span className="section-kicker">从 40 音走进真实韩语</span><h2 id="phrases-title">词语会认，句子会说。</h2><p>{phraseItems.length} 条高频内容覆盖问候、交通、点餐、购物、时间和求助；先翻卡背诵，再做十题记忆闯关。</p></div>
            <div className="phrase-progress"><span>已背熟</span><strong>{masteredPhrases.length}<small>/{phraseItems.length}</small></strong><div><i style={{ width: `${(masteredPhrases.length / phraseItems.length) * 100}%` }} /></div></div>
          </div>

          <div className="phrase-tabs" role="tablist" aria-label="选择词句类型">
            <button id="phrase-tab-word" type="button" role="tab" aria-controls="phrase-panel" aria-selected={phraseTab === "word"} tabIndex={phraseTab === "word" ? 0 : -1} onClick={() => changePhraseTab("word")}><strong>生活词语</strong><span>{wordItems.length} 个</span></button>
            <button id="phrase-tab-sentence" type="button" role="tab" aria-controls="phrase-panel" aria-selected={phraseTab === "sentence"} tabIndex={phraseTab === "sentence" ? 0 : -1} onClick={() => changePhraseTab("sentence")}><strong>开口句子</strong><span>{sentenceItems.length} 句</span></button>
          </div>

          <div className="phrase-filters" role="group" aria-label="筛选背诵状态">
            <span>查看词卡：</span>
            <button id="phrase-filter-all" type="button" aria-pressed={phraseFilter === "all"} onClick={() => setPhraseFilter("all")}>全部</button>
            <button id="phrase-filter-learning" type="button" aria-pressed={phraseFilter === "learning"} onClick={() => setPhraseFilter("learning")}>待背</button>
            <button id="phrase-filter-mastered" type="button" aria-pressed={phraseFilter === "mastered"} onClick={() => setPhraseFilter("mastered")}>已背熟</button>
          </div>

          <div className="phrase-read-filters" role="group" aria-label="按已掌握字母筛选">
            <span>直读阶梯：</span>
            <button type="button" aria-pressed={phraseReadFilter === "all"} onClick={() => changePhraseReadFilter("all")}>显示全部</button>
            <button type="button" aria-pressed={phraseReadFilter === "ready"} onClick={() => changePhraseReadFilter("ready")}>按我会的字 · {phraseReadyCount}</button>
            <small>“可直读”只代表字形已学且暂不含收音；真实发音仍以完整词句音频为准。</small>
          </div>

          <div className="phrase-scenes" role="group" aria-label="筛选生活场景">
            <span>场景：</span>
            <button type="button" aria-pressed={phraseGroup === "all"} onClick={() => changePhraseGroup("all")}>全部场景</button>
            {featuredPhraseGroups.map((group) => <button id={group === SURVIVAL_PHRASE_GROUP ? "phrase-scene-survival" : "phrase-scene-starter"} type="button" key={group} aria-pressed={phraseGroup === group} onClick={() => changePhraseGroup(group)}>{group}</button>)}
            {phraseGroups.map((group) => <button type="button" key={group} aria-pressed={phraseGroup === group} onClick={() => changePhraseGroup(group)}>{group}</button>)}
          </div>

          <p className="phrase-voice-note"><span aria-hidden="true">声</span>{phraseItems.length} 条词句现在全部使用网站内置完整韩语合成音频；收音、连读和句子节奏不再由单个音节临时拼接。</p>

          <div id="phrase-panel" className={`phrase-layout ${phraseGroup === STARTER_PHRASE_GROUP || phraseGroup === SURVIVAL_PHRASE_GROUP ? "beginner-phrase-flow" : ""}`} role="tabpanel" aria-labelledby={`phrase-tab-${phraseTab}`}>
            <div className="phrase-library">
              <div className="phrase-library-head"><div><strong>翻卡背诵</strong><span>先听、先读，最后再翻中文</span></div><div className="phrase-library-tools"><small>{phraseGroup === "all" ? (phraseTab === "word" ? `共 ${phraseTypeItems.length} 个 · 可按会的字筛选` : "按意群整句跟读") : `正在练：${phraseGroup}`}</small><button type="button" aria-pressed={!showRomanization} onClick={() => changeRomanization(!showRomanization)}>{showRomanization ? "隐藏罗马字" : "✓ 直读模式"}</button></div></div>
              <div className={`phrase-grid ${phraseTab === "sentence" ? "sentence-grid" : ""}`}>
                {visiblePhraseItems.map((item) => {
                  const revealed = revealedPhrases.includes(item.id);
                  const masteredPhrase = masteredPhrases.includes(item.id);
                  const expanded = expandedPhraseId === item.id;
                  const blockWords = item.korean.split(/\s+/).map((word) => decomposeHangulText(word)).filter((word) => word.length > 0);
                  const readingLevel = phraseReadingLevels.get(item.id) ?? "new";
                  const readingLabel = readingLevel === "ready" ? "现在可直读" : readingLevel === "batchim" ? "收音下一关" : "含新字母";
                  return <article className={`${revealed ? "revealed" : ""} ${masteredPhrase ? "mastered" : ""}`} key={item.id}>
                    <button className="phrase-audio" type="button" onClick={() => void playPhraseItemWithNotice(item)}><span>{item.group} · 完整合成音频</span><strong lang="ko">{item.korean}</strong><small>{showRomanization ? item.roman : "罗马字已隐藏 · 先直接读韩文"}</small><i aria-hidden="true">▶</i></button>
                    <button id={`phrase-block-toggle-${item.id}`} className={`phrase-block-toggle ${readingLevel}`} type="button" aria-expanded={expanded} aria-controls={`phrase-blocks-${item.id}`} onClick={() => togglePhraseBreakdown(item.id)}><span>{readingLabel}</span><strong>{expanded ? "收起拆字" : "拆字透视"} <i aria-hidden="true">{expanded ? "−" : "+"}</i></strong></button>
                    <div id={`phrase-blocks-${item.id}`} className="phrase-block-breakdown" hidden={!expanded} aria-labelledby={`phrase-block-toggle-${item.id}`}>{expanded && <><div role="region" aria-label={`${item.korean} 音节拆解，可横向滚动`} tabIndex={0}>{blockWords.map((word, wordIndex) => <div className="phrase-block-word" key={`${item.id}-word-${wordIndex}`}>{word.map(({ syllable, initial: blockInitial, vowel: blockVowel, final }, blockIndex) => { const initialKnown = masteredLetterSet.has(blockInitial); const vowelKnown = masteredLetterSet.has(blockVowel); return <div className="phrase-block-syllable" key={`${item.id}-${wordIndex}-${blockIndex}`}><strong lang="ko">{syllable}</strong><span className={initialKnown ? "known" : ""} aria-label={`初声 ${blockInitial}，${initialKnown ? "已学" : "未学"}${blockInitial === "ㅇ" ? "，此处静音" : ""}`}><small>初</small><b lang="ko">{blockInitial}</b><em>{initialKnown ? "已学" : "未学"}{blockInitial === "ㅇ" ? " · 静音" : ""}</em></span><span className={vowelKnown ? "known" : ""} aria-label={`中声 ${blockVowel}，${vowelKnown ? "已学" : "未学"}`}><small>中</small><b lang="ko">{blockVowel}</b><em>{vowelKnown ? "已学" : "未学"}</em></span>{final && <span className="final" aria-label={`收音 ${final}，下一关`}><small>收</small><b lang="ko">{final}</b><em>下一关</em></span>}</div>; })}</div>)}</div><p>空隙保留原句分词；这里只拆字形。请听上方整条音频，收音不会被单独拼接；前有收音再接初声 ㅇ 时，也以整词连读为准。</p></>}</div>
                    {expanded && blockWords.some((word) => word.some((block) => block.final !== null)) && <a className="phrase-batchim-link" href="#batchim-lesson" onClick={(event) => { event.preventDefault(); openBatchimLesson(item.id); }}>收音入门：先练 ㄹ／ㅁ／ㅇ ↗</a>}
                    <div className="phrase-meaning"><p>{revealed ? item.chinese : "先回忆中文意思"}</p><button type="button" onClick={() => togglePhraseReveal(item.id)}>{revealed ? "收起中文" : "翻开答案"}</button><button id={`phrase-master-${item.id}`} type="button" aria-pressed={masteredPhrase} onClick={() => togglePhraseMastered(item.id)}>{masteredPhrase ? "✓ 已背熟" : "标记背熟"}</button></div>
                  </article>;
                })}
                {visiblePhraseItems.length === 0 && <div className="phrase-empty"><strong>{phraseReadFilter === "ready" ? phraseReadyCount === 0 ? "当前还没有可直读的内容" : "当前筛选组合没有显示内容" : phraseFilter === "mastered" ? "还没有标记背熟" : "这一组已经全部背熟了"}</strong><p>{phraseReadFilter === "ready" ? phraseReadyCount === 0 ? "先回到 40 音表标记已经认得的字母，系统会自动把不含收音、现在能拼读的词句筛出来。" : "这一组有可直读内容，但不符合当前“待背／已背熟”状态；清除筛选即可查看。" : phraseFilter === "mastered" ? "背会后点一下“标记背熟”，它就会来到这里。" : "可以切到“已背熟”复习，或继续做右侧闯关。"}</p><button type="button" onClick={() => { setPhraseFilter("all"); changePhraseReadFilter("all"); }}>查看全部</button></div>}
              </div>
            </div>

            <aside ref={phraseSectionRef} id="phrase-quiz-panel" tabIndex={-1} className="phrase-quiz" aria-label="词句记忆闯关">
              <div className="phrase-quiz-top"><span>记忆闯关</span><small><kbd>1–4 / A S D F</kbd> 选择 · <kbd>Space / R</kbd> 重播 · <kbd>Enter</kbd> 下一题</small></div>
              {!phraseQuizStarted ? (
                <div className="phrase-quiz-start"><span aria-hidden="true">记</span><h3>{phraseTab === "word" ? "听读词语，选中文" : "听读句子，选中文"}</h3><p>{phraseQuizTotal === 0 ? "当前筛选还没有可出题的内容；先学习并标记字母，或切回“显示全部”。" : phraseQuizTotal === 1 ? "本组只有 1 条内容，本轮只考 1 题；选项仍会混入同类型干扰项。" : `共 ${phraseQuizTotal} 题；同组内容不会连续重复，错题会加权返场，不足四条时只混入同类型干扰项。`}</p><button id="phrase-quiz-restart" type="button" disabled={phraseQuizTotal === 0} onClick={startPhraseQuiz}>{phraseQuizTotal === 0 ? "暂无可练内容" : <>开始背诵闯关 <kbd>Enter</kbd></>}</button></div>
              ) : phraseQuizFinished ? (
                <div className="phrase-quiz-finish"><span aria-hidden="true">★</span><small>本轮完成</small><h3>{phraseQuizScore} / {phraseQuizTotal}</h3><p>{phraseQuizScore / phraseQuizTotal >= 0.8 ? "本轮已经较熟，隔天再测一次会更牢。" : "错题已记住，下一轮会更常遇见。"}</p><div><button id="phrase-quiz-restart" type="button" onClick={startPhraseQuiz}>再背一轮</button>{phraseQuizScore / phraseQuizTotal >= 0.8 && (phraseGroup === STARTER_PHRASE_GROUP || phraseGroup === SURVIVAL_PHRASE_GROUP) && confirmablePhraseItems.length > 0 && <button className="confirm-mastery" type="button" onClick={markCurrentPhraseGroupMastered}>标记本局全对的 {confirmablePhraseItems.length} 条 ✓</button>}<button className="share-score" type="button" onClick={() => sharePage(phraseQuizScore, phraseQuizTotal)}>分享成绩 ↗</button></div></div>
              ) : (
                <div className="phrase-quiz-body">
                  <div className="phrase-quiz-status"><span data-testid="phrase-round" aria-live="polite">第 {phraseQuizRound} / {phraseQuizTotal} 题</span><div><i style={{ width: `${(phraseQuizRound / phraseQuizTotal) * 100}%` }} /></div><strong>{phraseQuizScore} 分</strong></div>
                  <button id="phrase-quiz-replay" className="phrase-quiz-sound" type="button" onClick={replayPhraseQuizAudio} aria-label={`第 ${phraseQuizRound} 题，重播词句`}><span aria-hidden="true">▶</span><strong lang={phraseQuizAnswer === null ? undefined : "ko"}>{phraseQuizAnswer === null ? "只听声音" : phraseQuizTarget.korean}</strong><small>{phraseQuizAnswer === null ? "盲听后用 1–4 或 A/S/D/F 选择中文" : showRomanization ? phraseQuizTarget.roman : "罗马字已隐藏 · 再听完整音频"}</small></button>
                  <div className="phrase-quiz-choices" aria-busy={!phraseAudioReady && phraseQuizAnswer === null}>{phraseQuizChoices.map((choice, index) => {
                    const answered = phraseQuizAnswer !== null;
                    const correct = choice.id === phraseQuizTarget.id;
                    const pickedWrong = choice.id === phraseQuizAnswer && !correct;
                    return <button type="button" key={choice.id} data-testid={`phrase-choice-${index}`} disabled={answered || !phraseAudioReady} className={`${answered && correct ? "correct" : ""} ${pickedWrong ? "wrong" : ""}`} onClick={() => answerPhraseQuiz(choice.id)}><kbd>{choiceKeyLabels[index]}</kbd><span>{choice.chinese}</span></button>;
                  })}</div>
                  <div className="phrase-quiz-feedback" aria-live="polite">{phraseQuizAnswer === null ? <span>{phraseAudioFailed ? "音频未能播放，请用 Space、R 或上方按钮重试；本题暂不可作答。" : phraseAudioReady ? "可以作答；Space 或 R 可以重播，不扣分。" : "请先听完整条词句音频，播放完即开放选项。"}</span> : <span className="auto-next-status">{phraseQuizAnswer === phraseQuizTarget.id ? <strong>正确！+10 XP</strong> : <strong className="wrong">答案：{phraseQuizTarget.chinese}</strong>}<small>{phraseAudioFailed ? "音频未能播放，已暂停自动下一题；请重试或手动继续。" : phraseAutoAdvanceCancelled ? "自动推进已取消；返回后可手动进入下一题。" : "听完当前词句后自动进入下一题…"}</small></span>}{phraseQuizAnswer !== null && <button type="button" onClick={() => nextPhraseQuestion()}>{phraseQuizRound >= phraseQuizTotal ? "立即查看成绩" : "立即下一题 →"}</button>}</div>
                </div>
              )}
            </aside>
          </div>
        </section>

        <section className="learning-section" id="learn" aria-labelledby="learn-title">
          <div className="section-heading">
            <div><span className="section-kicker">随时查音</span><h2 id="learn-title">韩语 40 音表 · 真人起音版</h2><p>辅音卡的第二个按钮播放韩国母语者的短促起音片段，用于辨认字母，不把它说成脱离语境的唯一读音。ㅇ 作初声时本来就是静音。</p></div>
            <div className="mastery-meter" aria-label={`已标记进度 ${mastered.length} / 40`}><div><span>已标记</span><strong>{mastered.length}<small>/40</small></strong></div><div className="meter-track"><span style={{ width: `${(mastered.length / 40) * 100}%` }} /></div></div>
          </div>
          <div className="letter-tabs" role="tablist" aria-label="选择字母类型">
            <button id="letter-tab-consonants" type="button" role="tab" aria-controls="letter-panel" aria-selected={activeSet === "consonants"} tabIndex={activeSet === "consonants" ? 0 : -1} onKeyDown={handleLetterTabKeyDown} onClick={() => changeActiveSet("consonants")}><span>辅音</span><strong>19</strong><small>正式名称 + 真人起音</small></button>
            <button id="letter-tab-vowels" type="button" role="tab" aria-controls="letter-panel" aria-selected={activeSet === "vowels"} tabIndex={activeSet === "vowels" ? 0 : -1} onKeyDown={handleLetterTabKeyDown} onClick={() => changeActiveSet("vowels")}><span>元音</span><strong>21</strong><small>看口型和舌位</small></button>
          </div>
          {activeSet === "consonants" && (
            <section className="onset-lab" aria-labelledby="onset-lab-title" aria-busy={comparisonBusy}>
              <div className="onset-lab-copy"><span>v32 教学清晰重播</span><h3 id="onset-lab-title">真人起音 ↔ 完整音节对照器</h3><p>左边只播辅音起音；ㄹ、ㄲ、ㄸ、ㅃ 会把同一真人裸起音原样重复两次。盲听与配对仍统一播放单次起音，右边才把辅音和元音合成完整音节。</p></div>
              <div className="onset-lab-workspace">
                <div className="onset-lab-controls">
                  <label><span>选辅音</span><select lang="ko" value={comparisonConsonant} onChange={(event) => { cancelComparisonSequence(); setComparisonConsonant(event.target.value); setComparisonStatus("已换辅音；可分别试听或做顺序对照。"); }}>{initialOrder.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <span aria-hidden="true">+</span>
                  <label><span>选元音</span><select lang="ko" value={comparisonVowel} onChange={(event) => { cancelComparisonSequence(); setComparisonVowel(event.target.value); setComparisonStatus("已换元音；完整音节会跟着变化。"); }}>{comparisonVowels.map((item) => <option key={item}>{item}</option>)}</select></label>
                </div>
                <div className="onset-lab-demo">
                  <button type="button" onClick={() => void playComparisonOnset()}><small>只听辅音起音</small><strong lang="ko">{comparisonConsonant}</strong><span>{comparisonConsonant === "ㅇ" ? "初声静音 · 说明" : `${showRomanization ? `${comparisonLetter.roman} · ` : ""}真人 ▶`}</span></button>
                  <span className="onset-lab-arrow" aria-hidden="true">→</span>
                  <button type="button" onClick={() => void playComparisonSyllable()}><small>再听完整音节</small><strong lang="ko">{comparisonSyllable}</strong><span>包含 <span lang="ko">{comparisonVowel}</span> · 播放 ▶</span></button>
                </div>
                <div className="onset-lab-actions"><button type="button" disabled={comparisonBusy} onClick={() => void playComparisonSequence()}>{comparisonBusy ? "正在顺序播放…" : "顺序播放：起音 → 完整音节"}</button><p role="status" aria-live="polite">{comparisonStatus}</p></div>
              </div>
            </section>
          )}
          {activeSet === "vowels" && <p className="vowel-group-note">卡片按字母写法和学习难点分组，不是按“单元音／双元音”分类。ㅑ、ㅛ、ㅠ 带滑音；ㅐ、ㅔ 不要拆成两个音。ㅚ、ㅟ 的单元音和双元音读法均获允许。<a href="https://www.korean.go.kr/front/onlineQna/onlineQnaView.do?mn_id=216&amp;pageIndex=1&amp;qna_seq=313229" target="_blank" rel="noreferrer">查看国立国语院说明 ↗</a></p>}
          <div className="letter-filter-bar">
            <div>{letterLesson !== "all" && <button className="lesson-scope-button" type="button" onClick={() => setLetterLesson("all")}>{letterLessonLabel} ×</button>}<button id="letter-filter-learning" type="button" aria-pressed={letterFilter === "learning"} onClick={() => setLetterFilter((current) => current === "learning" ? "all" : "learning")}>{letterFilter === "learning" ? "✓ 只看未标记" : "只看未标记"}</button><span>当前显示 {visibleLetters.length} / {lessonLetters.length}</span></div>
            <div className="letter-filter-actions"><button className="roman-inline-toggle" type="button" aria-pressed={!showRomanization} onClick={() => changeRomanization(!showRomanization)}>{showRomanization ? "隐藏罗马字" : "✓ 直读模式"}</button><button className="unmastered-drill-button" type="button" disabled={currentDrillPool.length === 0} onClick={startUnmasteredDrill}>当前范围专项闯关 →</button></div>
          </div>
          <div id="letter-panel" className="letter-grid" role="tabpanel" aria-labelledby={`letter-tab-${activeSet}`}>
            {visibleLetters.map((letter) => {
              const isMastered = mastered.includes(letter.char);
              const consonantName = consonantNameMap.get(letter.char);
              return <article className={`letter-card ${isMastered ? "is-mastered" : ""}`} key={letter.char}><button id={`letter-master-${letter.char}`} className="master-button" type="button" onClick={() => toggleMastered(letter.char)} aria-label={`${isMastered ? "取消" : "标记"} ${letter.char} 已学过`} aria-pressed={isMastered}>{isMastered ? "✓" : ""}</button><div className="letter-sound"><span className="card-group">{letter.group}</span><strong className="jamo" lang="ko">{letter.char}</strong><span className="roman">{showRomanization ? letter.roman : "罗马字已隐藏"}</span>{consonantName ? <div className="letter-audio-actions"><button type="button" className="name-audio" onClick={() => void playLetterName(consonantName.name)}><span>正式名称 · 合成音频</span><strong lang="ko">{consonantName.name}<i aria-hidden="true">▶</i></strong></button><button type="button" onClick={() => void playLetterExample(letter)}><span>{consonantName.initialSilent ? "初声静音" : clarityReplayConsonants.has(letter.char) ? "听清晰重播" : "听真人起音"}</span><strong lang={consonantName.initialSilent ? undefined : "ko"}>{consonantName.initialSilent ? "不发声" : `${letter.char} ${consonantName.ipa}`}<i aria-hidden="true">{consonantName.initialSilent ? "说明" : "▶"}</i></strong></button></div> : <div className="letter-audio-actions vowel-audio"><button type="button" onClick={() => void playSoundWithNotice(letter.sample)}><span>元音发音</span><strong lang="ko">{letter.sample}<i aria-hidden="true">▶</i></strong></button></div>}<span className="hint">{letter.hint}</span></div></article>;
            })}
            {visibleLetters.length === 0 && <div className="letter-grid-empty"><strong>这一组已经全部掌握了</strong><p>可以取消“只看未掌握”，复习全部字母。</p><button type="button" onClick={() => setLetterFilter("all")}>显示全部</button></div>}
          </div>
          <p className="pronunciation-note"><span className="pronunciation-note-icon" aria-hidden="true">♪</span><span className="pronunciation-note-copy"><strong>真人起音说明：</strong>18 条起音来自韩国母语者 호로조 的 CC0 原始 WAV，按声谱边界截去完整元音和词尾。ㄹ、ㄲ、ㄸ、ㅃ 的单次片段过短，因此清晰版只做“原片段 + 120ms 静音 + 同一原片段”；没有加入 ㅏ、没有拉伸，也没有合成长音。起音用于字母听辨；跟读统一使用完整音节。ㅇ 初声无声，已从盲听题排除。<a href="https://commons.wikimedia.org/wiki/Category:Lingua_Libre_pronunciation_by_%ED%98%B8%EB%A1%9C%EC%A1%B0" target="_blank" rel="noreferrer">查看真人音源</a><a href="https://www.korean.go.kr/front/onlineQna/onlineQnaView.do?mn_id=261&amp;pageIndex=1&amp;qna_seq=329921" target="_blank" rel="noreferrer">查看 ㅇ 官方说明</a></span></p>
        </section>

        <VowelPractice ref={vowelPracticeRef} onPrepare={prepareReferenceActivity} playSample={playSound} speed={audioSpeed} onSpeedChange={changeAudioSpeed} />

        <BatchimLesson ref={batchimLessonRef} items={phraseItems} onPrepare={prepareReferenceActivity} playSample={playSound} />

        <section className="compare-section" id="compare" aria-labelledby="compare-title">
          <div className="compare-intro"><span className="section-kicker">易混音擂台</span><h2 id="compare-title">固定同一元音，<br />比较开头差别。</h2><p>这里固定元音 ㅏ，并按同一播放速度依次听完整音节。素材用于练习松音、紧音和送气音的相对差别；录音时长本身不作为答题线索。可把薄纸放在嘴前辅助观察气流。</p><div className="air-legend"><div><span className="dot plain" /><strong>松音</strong><small>轻、自然</small></div><div><span className="dot tense" /><strong>紧音</strong><small>喉咙绷紧</small></div><div><span className="dot air" /><strong>送气音</strong><small>通常最明显</small></div></div></div>
          <div className="compare-list">{compareGroups.map((group, groupIndex) => <article className="compare-row" key={group.title}><div><h3 lang="ko">{group.title}</h3><p>{group.cue}</p></div><div className="compare-buttons">{group.items.map((item, index) => <button id={groupIndex === 0 && index === 0 ? "compare-first-sound" : undefined} type="button" key={item.text} className={`tone-${index}`} onClick={() => void playSoundWithNotice(item.text)}><strong lang="ko">{item.text}</strong><span>{item.label}</span><i aria-hidden="true">▶</i></button>)}</div></article>)}</div>
        </section>
      </main>

      <footer><div className="footer-mark" aria-hidden="true">한</div><div><strong>每天练 10 分钟，更容易坚持并反复复习。</strong><p>系统会记住你的错音，让下一次练习更懂你。</p></div><a href="#top" onClick={prepareReferenceActivity}>回到顶部 ↑</a></footer>
    </div>
  );
}
