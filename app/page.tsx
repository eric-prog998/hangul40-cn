"use client";

import { useEffect, useMemo, useState } from "react";
import phraseData from "../data/phrases.json";
import consonantNameData from "../data/consonant-names.json";

type Letter = {
  char: string;
  roman: string;
  hint: string;
  sample: string;
  group: string;
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

const consonants: Letter[] = [
  { char: "ㄱ", roman: "g / k", hint: "介于 g、k 之间，词首轻轻发，不要猛送气", sample: "가", group: "松音" },
  { char: "ㄴ", roman: "n", hint: "像汉语 n，舌尖贴上齿龈", sample: "나", group: "基础音" },
  { char: "ㄷ", roman: "d / t", hint: "介于 d、t 之间，词首气流很轻", sample: "다", group: "松音" },
  { char: "ㄹ", roman: "r / l", hint: "音节开头通常轻弹成 [ɾ]；作收音通常是 [l]。这里的真人起音片段示范前者", sample: "라", group: "易错音" },
  { char: "ㅁ", roman: "m", hint: "像汉语 m，双唇闭合后放开", sample: "마", group: "基础音" },
  { char: "ㅂ", roman: "b / p", hint: "介于 b、p 之间，双唇轻开，不强送气", sample: "바", group: "松音" },
  { char: "ㅅ", roman: "s", hint: "像 s；遇到 ㅣ、ㅑ 等时会更接近“西”的开头", sample: "사", group: "易错音" },
  { char: "ㅇ", roman: "— / ng", hint: "作初声不发音；例如 이 的起始处没有辅音，听到的是 ㅣ；作收音才读 [ŋ]", sample: "아", group: "位置音" },
  { char: "ㅈ", roman: "j", hint: "像轻轻的 z / j 之间，不要卷舌", sample: "자", group: "松音" },
  { char: "ㅊ", roman: "ch", hint: "比 ㅈ 送气更强，纸片会明显被吹动", sample: "차", group: "送气音" },
  { char: "ㅋ", roman: "k", hint: "强送气的 k，重点是气流，不是更大声", sample: "카", group: "送气音" },
  { char: "ㅌ", roman: "t", hint: "强送气的 t，舌尖放开时带一股气", sample: "타", group: "送气音" },
  { char: "ㅍ", roman: "p", hint: "强送气的 p，双唇打开时吹动纸片", sample: "파", group: "送气音" },
  { char: "ㅎ", roman: "h", hint: "像轻柔的 h，气流从喉咙通过", sample: "하", group: "基础音" },
  { char: "ㄲ", roman: "kk", hint: "喉部收紧、几乎不送气；不是两个 ㄱ", sample: "까", group: "紧音" },
  { char: "ㄸ", roman: "tt", hint: "舌位像 ㄷ，但喉部更紧、爆发更干脆", sample: "따", group: "紧音" },
  { char: "ㅃ", roman: "pp", hint: "双唇先绷紧再打开，短促而不送气", sample: "빠", group: "紧音" },
  { char: "ㅆ", roman: "ss", hint: "比 ㅅ 更紧更长，齿缝气流集中", sample: "싸", group: "紧音" },
  { char: "ㅉ", roman: "jj", hint: "比 ㅈ 更紧、更短促，不要加很强的气", sample: "짜", group: "紧音" },
];

const vowels: Letter[] = [
  { char: "ㅏ", roman: "a", hint: "嘴巴自然张开，像 a，但更短更干脆", sample: "아", group: "单元音" },
  { char: "ㅑ", roman: "ya", hint: "先带一点 i，再快速滑向 ㅏ", sample: "야", group: "单元音" },
  { char: "ㅓ", roman: "eo", hint: "嘴自然张开、舌位偏后；不要直接读成“饿”", sample: "어", group: "易错音" },
  { char: "ㅕ", roman: "yeo", hint: "在 ㅓ 前加一个很短的 y 滑音", sample: "여", group: "易错音" },
  { char: "ㅗ", roman: "o", hint: "嘴唇收圆向前，舌位比 ㅓ 高", sample: "오", group: "单元音" },
  { char: "ㅛ", roman: "yo", hint: "快速的 y 加 ㅗ，嘴唇保持圆形", sample: "요", group: "单元音" },
  { char: "ㅜ", roman: "u", hint: "嘴唇收得更圆，接近汉语 u", sample: "우", group: "单元音" },
  { char: "ㅠ", roman: "yu", hint: "先有短 y，再滑到 ㅜ", sample: "유", group: "单元音" },
  { char: "ㅡ", roman: "eu", hint: "汉语无对应音：嘴唇放平，舌根抬起，不要噘嘴", sample: "으", group: "易错音" },
  { char: "ㅣ", roman: "i", hint: "接近汉语 i，嘴角自然向两侧", sample: "이", group: "单元音" },
  { char: "ㅐ", roman: "ae", hint: "现代首尔语中常与 ㅔ 很接近，不必过度拉开", sample: "애", group: "复合元音" },
  { char: "ㅒ", roman: "yae", hint: "短 y 加 ㅐ；现代口语中并不常见", sample: "얘", group: "复合元音" },
  { char: "ㅔ", roman: "e", hint: "接近 e；现代口语常与 ㅐ 合流", sample: "에", group: "复合元音" },
  { char: "ㅖ", roman: "ye", hint: "短 y 加 ㅔ，连读时要一口气完成", sample: "예", group: "复合元音" },
  { char: "ㅘ", roman: "wa", hint: "从 ㅗ 快速滑向 ㅏ，不要拆成两个音节", sample: "와", group: "复合元音" },
  { char: "ㅙ", roman: "wae", hint: "从圆唇开始，快速滑向 ㅐ", sample: "왜", group: "复合元音" },
  { char: "ㅚ", roman: "oe / we", hint: "现代口语通常读得接近 we", sample: "외", group: "复合元音" },
  { char: "ㅝ", roman: "wo", hint: "从 ㅜ 快速滑向 ㅓ，注意不是汉语“窝”", sample: "워", group: "复合元音" },
  { char: "ㅞ", roman: "we", hint: "从 ㅜ 滑向 ㅔ，和 ㅙ、ㅚ 常很接近", sample: "웨", group: "复合元音" },
  { char: "ㅟ", roman: "wi", hint: "从圆唇的 ㅜ 快速滑向 ㅣ", sample: "위", group: "复合元音" },
  { char: "ㅢ", roman: "ui", hint: "先 ㅡ 后 ㅣ；在实际词语中常发生变读", sample: "의", group: "易错音" },
];

const allLetters = [...consonants, ...vowels];
const consonantNames = consonantNameData as ConsonantName[];
const consonantNameMap = new Map(consonantNames.map((item) => [item.char, item]));
const audibleConsonants = consonants.filter((letter) => letter.char !== "ㅇ");
const audibleLetters = [...audibleConsonants, ...vowels];
const phraseItems = phraseData as PhraseItem[];
const wordItems = phraseItems.filter((item) => item.type === "word");
const sentenceItems = phraseItems.filter((item) => item.type === "sentence");
const phraseAudioPaths = new Map(phraseItems.map((item) => [item.korean, `/audio/phrases/${item.id}.mp3`]));
const choiceKeys = ["A", "S", "D", "F"];
const choiceKeyLabels = ["1 / A", "2 / S", "3 / D", "4 / F"];
const blendVowelKeys = ["J", "K", "L", ";"];
const matchKeys = ["Q", "W", "E", "R", "A", "S", "D", "F", "Z", "X", "C", "V"];
const gameModes = ["listen", "shadow", "match", "blend", "speed"] as const;
const AUTO_ADVANCE_DELAY_MS = 2200;
const preferredKoreanVoiceNames = ["sunhi", "yuna", "heami", "seoyeon", "google 한국", "google korean", "korean"];
const noveltyKoreanVoiceNames = /eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley/i;
const initialOrder = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const vowelOrder = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];

const compareGroups = [
  { title: "가 · 까 · 카", cue: "松音 → 紧音 → 送气音", items: [{ text: "가", label: "ㄱ 松音" }, { text: "까", label: "ㄲ 紧音" }, { text: "카", label: "ㅋ 送气" }] },
  { title: "다 · 따 · 타", cue: "气流不是越大越好，先分清喉咙是否绷紧", items: [{ text: "다", label: "ㄷ 松音" }, { text: "따", label: "ㄸ 紧音" }, { text: "타", label: "ㅌ 送气" }] },
  { title: "바 · 빠 · 파", cue: "把纸片放在嘴前，只有最后一个应明显吹动", items: [{ text: "바", label: "ㅂ 松音" }, { text: "빠", label: "ㅃ 紧音" }, { text: "파", label: "ㅍ 送气" }] },
  { title: "자 · 짜 · 차", cue: "都不要卷舌，差别在紧张度和送气量", items: [{ text: "자", label: "ㅈ 松音" }, { text: "짜", label: "ㅉ 紧音" }, { text: "차", label: "ㅊ 送气" }] },
];

const emptyStats: GameStats = { date: "", dailyXp: 0, totalXp: 0, bestCombo: 0, games: 0, mistakes: {}, phraseMistakes: {}, history: {} };
const initialMatchDeck: MatchCard[] = audibleConsonants.slice(0, 6).flatMap((letter) => [
  { uid: `${letter.char}-char`, letter, type: "char" as const },
  { uid: `${letter.char}-sound`, letter, type: "sound" as const },
]);

let activeAudio: HTMLAudioElement | null = null;
const audioCache = new Map<string, HTMLAudioElement>();

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
  if (phraseSource) return phraseSource;
  const syllable = text.match(/[가-힣]/)?.[0];
  return syllable ? `/audio/hangul-natural/s-${syllable.codePointAt(0)?.toString(16)}.mp3` : "";
}

function consonantSoundPath(letter: Letter) {
  const audioFile = consonantNameMap.get(letter.char)?.audioFile;
  return audioFile ? `/audio/consonant-human-onset/${audioFile}` : "";
}

function preloadAudioSource(source: string) {
  if (typeof window === "undefined") return;
  if (!source || audioCache.has(source)) return;
  const audio = new Audio(source);
  audio.preload = "auto";
  audio.load();
  audioCache.set(source, audio);
}

function playAudioSource(source: string, speed = 1) {
  if (typeof window === "undefined") return;
  if (!source) return;
  window.speechSynthesis?.cancel();
  preloadAudioSource(source);
  activeAudio?.pause();
  activeAudio = (audioCache.get(source)?.cloneNode(true) as HTMLAudioElement | undefined) ?? new Audio(source);
  activeAudio.volume = 1;
  activeAudio.preservesPitch = true;
  activeAudio.playbackRate = speed;
  void activeAudio.play().catch(() => undefined);
}

function preloadKorean(text: string) {
  preloadAudioSource(audioPath(text));
}

function playKorean(text: string, speed = 1) {
  playAudioSource(audioPath(text), speed);
}

function preloadLetterExample(letter: Letter) {
  preloadAudioSource(consonantNameMap.has(letter.char) ? consonantSoundPath(letter) : audioPath(letter.sample));
}

function playLetterExampleAudio(letter: Letter, speed = 1) {
  const source = consonantNameMap.has(letter.char) ? consonantSoundPath(letter) : audioPath(letter.sample);
  if (!source) return false;
  playAudioSource(source, speed);
  return true;
}

function playConsonantName(name: string, speed = 1, voiceURI = "") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const voice = window.speechSynthesis.getVoices().find((candidate) => candidate.voiceURI === voiceURI)
    ?? pickPreferredKoreanVoice(window.speechSynthesis.getVoices());
  if (!voice) return false;
  activeAudio?.pause();
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(name);
  utterance.lang = "ko-KR";
  utterance.rate = speed === 0.82 ? 0.76 : 0.88;
  utterance.pitch = 1;
  utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
  return true;
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeSyllable(initial: string, vowel: string) {
  return String.fromCharCode(0xac00 + (initialOrder.indexOf(initial) * 21 + vowelOrder.indexOf(vowel)) * 28);
}

function makeChoices(target: Letter, pool?: Letter[]) {
  const scopedPool = pool ?? (consonantNameMap.has(target.char) ? audibleConsonants : vowels);
  const extras = shuffle(scopedPool.filter((item) => item.char !== target.char)).slice(0, 3);
  return shuffle([target, ...extras]);
}

function phraseAutoAdvanceDelay(text: string, speed: 1 | 0.82) {
  const spokenLength = text.replace(/\s/g, "").length;
  const normalSpeedDelay = Math.min(5200, Math.max(2600, 1300 + spokenLength * 190));
  return Math.ceil(normalSpeedDelay / speed);
}

function pickPreferredKoreanVoice(voices: SpeechSynthesisVoice[]) {
  const koreanVoices = voices.filter((voice) => voice.lang.toLowerCase().replace("_", "-").startsWith("ko"));
  const safeVoices = koreanVoices.filter((voice) => !noveltyKoreanVoiceNames.test(voice.name));
  return safeVoices.sort((left, right) => {
    const score = (voice: SpeechSynthesisVoice) => {
      const name = voice.name.toLowerCase();
      const preference = preferredKoreanVoiceNames.findIndex((candidate) => name.includes(candidate));
      return (preference < 0 ? 0 : 100 - preference * 10) + (voice.localService ? 5 : 0);
    };
    return score(right) - score(left);
  })[0] ?? null;
}

function makeRomanChoices(target: Letter) {
  const unique = allLetters.filter((item) => item.char !== target.char && item.roman !== target.roman);
  return shuffle([target, ...shuffle(unique).slice(0, 3)]);
}

function makeJamoChoices(target: string, pool: string[]) {
  return shuffle([target, ...shuffle(pool.filter((item) => item !== target)).slice(0, 3)]);
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
  return shuffle([target, ...shuffle(pool.filter((item) => item.id !== target.id)).slice(0, 3)]);
}

function pickWeightedPhrase(pool: PhraseItem[], mistakes: Record<string, number>) {
  const weighted = pool.flatMap((item) => Array.from({ length: 1 + Math.min(mistakes[item.id] ?? 0, 4) }, () => item));
  return weighted[Math.floor(Math.random() * weighted.length)];
}

export default function Home() {
  const [activeSet, setActiveSet] = useState<"consonants" | "vowels">("consonants");
  const [mastered, setMastered] = useState<string[]>([]);
  const [initial, setInitial] = useState("ㄱ");
  const [vowel, setVowel] = useState("ㅏ");
  const [gameStats, setGameStats] = useState<GameStats>(emptyStats);
  const [localToday, setLocalToday] = useState("");
  const [audioSpeed, setAudioSpeed] = useState<1 | 0.82>(1);
  const [gameMode, setGameMode] = useState<"listen" | "shadow" | "match" | "blend" | "speed">("listen");
  const [keyboardZone, setKeyboardZone] = useState<"games" | "phrases">("games");

  const [listenTarget, setListenTarget] = useState<Letter>(consonants[0]);
  const [listenChoices, setListenChoices] = useState<Letter[]>(consonants.slice(0, 4));
  const [listenAnswer, setListenAnswer] = useState<string | null>(null);
  const [listenRound, setListenRound] = useState(1);
  const [listenHearts, setListenHearts] = useState(3);
  const [listenCombo, setListenCombo] = useState(0);
  const [listenScore, setListenScore] = useState(0);
  const [listenFinished, setListenFinished] = useState(false);
  const [retryQueue, setRetryQueue] = useState<Letter[]>([]);

  const [matchDeck, setMatchDeck] = useState<MatchCard[]>(initialMatchDeck);
  const [matchSelected, setMatchSelected] = useState<string[]>([]);
  const [matchedLetters, setMatchedLetters] = useState<string[]>([]);
  const [matchMoves, setMatchMoves] = useState(0);
  const [matchLocked, setMatchLocked] = useState(false);

  const [speedTarget, setSpeedTarget] = useState<Letter>(vowels[0]);
  const [speedChoices, setSpeedChoices] = useState<Letter[]>(vowels.slice(0, 4));
  const [speedRunning, setSpeedRunning] = useState(false);
  const [speedTime, setSpeedTime] = useState(30);
  const [speedScore, setSpeedScore] = useState(0);
  const [speedCombo, setSpeedCombo] = useState(0);
  const [speedFlash, setSpeedFlash] = useState<"correct" | "wrong" | null>(null);

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

  const [shadowSet, setShadowSet] = useState<"mixed" | "consonants" | "vowels">("mixed");
  const [shadowQueue, setShadowQueue] = useState<Letter[]>([]);
  const [shadowIndex, setShadowIndex] = useState(0);
  const [shadowStage, setShadowStage] = useState<"repeat" | "rate" | "finished">("repeat");
  const [shadowScore, setShadowScore] = useState(0);

  const [phraseTab, setPhraseTab] = useState<"word" | "sentence">("word");
  const [phraseFilter, setPhraseFilter] = useState<"all" | "learning" | "mastered">("all");
  const [revealedPhrases, setRevealedPhrases] = useState<string[]>([]);
  const [masteredPhrases, setMasteredPhrases] = useState<string[]>([]);
  const [phraseQuizTarget, setPhraseQuizTarget] = useState<PhraseItem>(wordItems[0]);
  const [phraseQuizChoices, setPhraseQuizChoices] = useState<PhraseItem[]>(wordItems.slice(0, 4));
  const [phraseQuizAnswer, setPhraseQuizAnswer] = useState<string | null>(null);
  const [phraseQuizRound, setPhraseQuizRound] = useState(1);
  const [phraseQuizScore, setPhraseQuizScore] = useState(0);
  const [phraseQuizStarted, setPhraseQuizStarted] = useState(false);
  const [phraseQuizFinished, setPhraseQuizFinished] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [koreanVoice, setKoreanVoice] = useState<{ uri: string; name: string } | null>(null);

  const syllable = useMemo(() => makeSyllable(initial, vowel), [initial, vowel]);
  const blendTarget = useMemo(() => makeSyllable(blendInitial, blendVowel), [blendInitial, blendVowel]);
  const currentLetters = activeSet === "consonants" ? consonants : vowels;
  const shadowCurrent = shadowQueue[shadowIndex] ?? consonants[0];
  const phraseTypeItems = phraseTab === "word" ? wordItems : sentenceItems;
  const visiblePhraseItems = phraseTypeItems.filter((item) => phraseFilter === "all" || (phraseFilter === "mastered" ? masteredPhrases.includes(item.id) : !masteredPhrases.includes(item.id)));
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
  const gameKeyboardHint = gameMode === "listen" ? "1–4 / A S D F 选择 · Space / R 重播 · Enter 下一题" : gameMode === "shadow" ? "Space / R 重播 · Enter 核对 · A 不稳 · S 熟悉" : gameMode === "match" ? "Q W E R / A S D F / Z X C V 翻牌" : gameMode === "blend" ? "A S D F 辅音 · J K L ; 元音 · Space / R 重播" : "1–4 / A S D F 选择 · Enter 开始";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        setLocalToday(localDateKey());
        const savedAudioSpeed = Number(window.localStorage.getItem("hangul-audio-speed"));
        if (savedAudioSpeed === 0.82) setAudioSpeed(0.82);
        const savedMastered = window.localStorage.getItem("hangul-mastered");
        if (savedMastered) setMastered(JSON.parse(savedMastered));
        const savedPhrases = window.localStorage.getItem("hangul-phrase-mastered");
        if (savedPhrases) setMasteredPhrases(JSON.parse(savedPhrases));
        const savedStats = window.localStorage.getItem("hangul-game-stats");
        if (savedStats) {
          const raw = JSON.parse(savedStats) as Partial<GameStats>;
          const today = localDateKey();
          const history = { ...(raw.history ?? {}) };
          if (raw.date === today && raw.dailyXp && history[today] === undefined) history[today] = raw.dailyXp;
          const parsed = { ...emptyStats, ...raw, history } as GameStats;
          setGameStats(parsed.date === today ? parsed : { ...parsed, date: today, dailyXp: 0 });
        }
      } catch {
        // Local progress is optional; the learning tools still work without it.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const updateVoice = () => {
      const voice = pickPreferredKoreanVoice(window.speechSynthesis.getVoices());
      setKoreanVoice(voice ? { uri: voice.voiceURI, name: voice.name } : null);
    };
    updateVoice();
    const retry = window.setTimeout(updateVoice, 350);
    window.speechSynthesis.addEventListener("voiceschanged", updateVoice);
    return () => {
      window.clearTimeout(retry);
      window.speechSynthesis.removeEventListener("voiceschanged", updateVoice);
    };
  }, []);

  useEffect(() => {
    [syllable, blendTarget, phraseQuizTarget.korean].forEach(preloadKorean);
    [listenTarget, speedTarget, shadowCurrent, ...matchDeck.map((card) => card.letter)].forEach(preloadLetterExample);
  }, [syllable, blendTarget, phraseQuizTarget.korean, listenTarget, speedTarget, shadowCurrent, matchDeck]);

  useEffect(() => {
    audibleConsonants.forEach(preloadLetterExample);
  }, []);

  useEffect(() => {
    if (gameMode !== "listen" || listenFinished || listenAnswer === null) return;
    const timer = window.setTimeout(nextListenQuestion, AUTO_ADVANCE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // The answer/round state deliberately chooses the exact question-advance closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode, listenAnswer, listenFinished, listenRound, listenHearts]);

  useEffect(() => {
    if (!phraseQuizStarted || phraseQuizFinished || phraseQuizAnswer === null) return;
    const timer = window.setTimeout(nextPhraseQuestion, phraseAutoAdvanceDelay(phraseQuizTarget.korean, audioSpeed));
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSpeed, phraseQuizAnswer, phraseQuizFinished, phraseQuizRound, phraseQuizStarted, phraseQuizTarget.korean]);

  useEffect(() => {
    if (gameMode !== "blend" || blendFinished || blendFeedback === null) return;
    const timer = window.setTimeout(nextBlendQuestion, AUTO_ADVANCE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blendFeedback, blendFinished, blendRound, gameMode]);

  useEffect(() => {
    if (!speedRunning) return;
    const timer = window.setInterval(() => {
      setSpeedTime((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setSpeedRunning(false);
          updateStats((stats) => ({ ...stats, games: stats.games + 1 }));
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [speedRunning]);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const element = event.target as HTMLElement | null;
      if (element && (["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName) || element.isContentEditable)) return;
      if (event.repeat) return;
      const key = event.key.toLowerCase();

      if (event.key === "?") {
        event.preventDefault();
        setShowKeyboardHelp((current) => !current);
        return;
      }
      if (event.key === "Escape") {
        if (showKeyboardHelp) event.preventDefault();
        setShowKeyboardHelp(false);
        return;
      }
      if (showKeyboardHelp) return;
      if (element?.tagName === "BUTTON" && (event.key === "Enter" || event.key === " ")) return;
      const numberIndex = /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : -1;
      const letterChoiceIndex = choiceKeys.findIndex((choice) => choice.toLowerCase() === key);
      const fourChoiceIndex = numberIndex >= 0 && numberIndex < 4 ? numberIndex : letterChoiceIndex;
      const replayKey = event.key === " " || key === "r";

      if (keyboardZone === "games" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        const currentIndex = gameModes.indexOf(gameMode);
        const direction = event.key === "ArrowRight" ? 1 : -1;
        switchGameMode(gameModes[(currentIndex + direction + gameModes.length) % gameModes.length]);
        return;
      }

      if (keyboardZone === "phrases") {
        if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && (!phraseQuizStarted || phraseQuizFinished)) {
          event.preventDefault();
          changePhraseTab(phraseTab === "word" ? "sentence" : "word");
          return;
        }
        if (event.key === "Enter" && (!phraseQuizStarted || phraseQuizFinished)) {
          event.preventDefault();
          startPhraseQuiz();
          return;
        }
        if (!phraseQuizStarted || phraseQuizFinished) return;
        if (replayKey) {
          event.preventDefault();
          playSound(phraseQuizTarget.korean);
        } else if (fourChoiceIndex >= 0 && phraseQuizAnswer === null) {
          event.preventDefault();
          answerPhraseQuiz(phraseQuizChoices[fourChoiceIndex].id);
        } else if (event.key === "Enter" && phraseQuizAnswer !== null) {
          event.preventDefault();
          nextPhraseQuestion();
        }
        return;
      }

      if (gameMode === "listen") {
        if (replayKey) {
          event.preventDefault();
          playLetterExample(listenTarget);
        } else if (listenFinished && event.key === "Enter") {
          event.preventDefault();
          startListenGame();
        } else if (fourChoiceIndex >= 0 && listenAnswer === null && !listenFinished) {
          event.preventDefault();
          answerListen(listenChoices[fourChoiceIndex].char);
        } else if (event.key === "Enter" && listenAnswer !== null) {
          event.preventDefault();
          nextListenQuestion();
        }
      } else if (gameMode === "match") {
        const matchIndex = matchKeys.indexOf(event.key.toUpperCase());
        if (matchIndex >= 0 && matchDeck[matchIndex]) {
          event.preventDefault();
          selectMatchCard(matchDeck[matchIndex]);
        }
      } else if (gameMode === "blend") {
        const vowelKeyIndex = blendVowelKeys.findIndex((choice) => choice.toLowerCase() === key);
        const initialChoiceIndex = fourChoiceIndex;
        const vowelChoiceIndex = numberIndex >= 4 && numberIndex < 8 ? numberIndex - 4 : vowelKeyIndex;
        if (replayKey) {
          event.preventDefault();
          playSound(blendTarget);
        } else if (blendFinished && event.key === "Enter") {
          event.preventDefault();
          startBlendGame();
        } else if (initialChoiceIndex >= 0 && blendFeedback === null) {
          event.preventDefault();
          selectBlendInitial(blendInitialChoices[initialChoiceIndex]);
        } else if (vowelChoiceIndex >= 0 && blendFeedback === null) {
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
          answerSpeed(speedChoices[fourChoiceIndex].char);
        }
      } else if (gameMode === "shadow") {
        if ((shadowQueue.length === 0 || shadowStage === "finished") && event.key === "Enter") {
          event.preventDefault();
          startShadowSession();
        } else if (shadowQueue.length > 0 && shadowStage !== "finished" && replayKey) {
          event.preventDefault();
          playLetterExample(shadowCurrent);
        } else if (shadowStage === "repeat" && event.key === "Enter") {
          event.preventDefault();
          confirmShadowRepeat();
        } else if (shadowStage === "rate" && (event.key === "1" || key === "a")) {
          event.preventDefault();
          rateShadow(false);
        } else if (shadowStage === "rate" && (event.key === "2" || key === "s")) {
          event.preventDefault();
          rateShadow(true);
        }
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  });

  function updateStats(updater: (current: GameStats) => GameStats) {
    setGameStats((current) => {
      const today = localDateKey();
      const normalized = current.date === today ? current : { ...current, date: today, dailyXp: 0 };
      const next = updater(normalized);
      try {
        window.localStorage.setItem("hangul-game-stats", JSON.stringify(next));
      } catch {
        // Ignore storage errors without interrupting a game.
      }
      return next;
    });
  }

  function awardXp(points: number, combo = 0) {
    updateStats((current) => ({
      ...current,
      dailyXp: current.dailyXp + points,
      totalXp: current.totalXp + points,
      bestCombo: Math.max(current.bestCombo, combo),
      history: { ...current.history, [current.date]: (current.history[current.date] ?? 0) + points },
    }));
  }

  function recordMistake(char: string) {
    updateStats((current) => ({ ...current, mistakes: { ...current.mistakes, [char]: (current.mistakes[char] ?? 0) + 1 } }));
  }

  function recordPhraseMistake(id: string) {
    updateStats((current) => ({ ...current, phraseMistakes: { ...current.phraseMistakes, [id]: (current.phraseMistakes[id] ?? 0) + 1 } }));
  }

  function playSound(text: string, speed = audioSpeed) {
    playKorean(text, speed);
  }

  function playLetterExample(letter: Letter, speed = audioSpeed) {
    if (playLetterExampleAudio(letter, speed)) return;
    activeAudio?.pause();
    window.speechSynthesis?.cancel();
    setShareNotice("ㅇ 作初声本来就是静音；放在收尾时才读 ng");
    window.setTimeout(() => setShareNotice(""), 3200);
  }

  function playLetterName(name: string) {
    const played = playConsonantName(name, audioSpeed, koreanVoice?.uri);
    if (played) return;
    setShareNotice("没有检测到可靠的韩国韩语声线，请先安装系统韩语语音");
    window.setTimeout(() => setShareNotice(""), 3200);
  }

  function changeAudioSpeed(speed: 1 | 0.82) {
    setAudioSpeed(speed);
    try {
      window.localStorage.setItem("hangul-audio-speed", String(speed));
    } catch {
      // The speed switch still works when storage is unavailable.
    }
  }

  function toggleMastered(char: string) {
    setMastered((current) => {
      const next = current.includes(char) ? current.filter((item) => item !== char) : [...current, char];
      try {
        window.localStorage.setItem("hangul-mastered", JSON.stringify(next));
      } catch {
        // Ignore storage errors without interrupting practice.
      }
      return next;
    });
  }

  function togglePhraseReveal(id: string) {
    setRevealedPhrases((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function togglePhraseMastered(id: string) {
    setMasteredPhrases((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try {
        window.localStorage.setItem("hangul-phrase-mastered", JSON.stringify(next));
      } catch {
        // Phrase review still works when storage is unavailable.
      }
      return next;
    });
  }

  function changePhraseTab(tab: "word" | "sentence") {
    setPhraseTab(tab);
    setPhraseFilter("all");
    setPhraseQuizStarted(false);
    setPhraseQuizFinished(false);
    setPhraseQuizAnswer(null);
  }

  function startPhraseQuiz() {
    const pool = phraseTab === "word" ? wordItems : sentenceItems;
    const target = pickWeightedPhrase(pool, gameStats.phraseMistakes);
    setPhraseQuizTarget(target);
    setPhraseQuizChoices(makePhraseChoices(target, pool));
    setPhraseQuizAnswer(null);
    setPhraseQuizRound(1);
    setPhraseQuizScore(0);
    setPhraseQuizStarted(true);
    setPhraseQuizFinished(false);
    setKeyboardZone("phrases");
    playSound(target.korean);
  }

  function answerPhraseQuiz(id: string) {
    if (phraseQuizAnswer !== null || !phraseQuizStarted || phraseQuizFinished) return;
    setPhraseQuizAnswer(id);
    playSound(phraseQuizTarget.korean);
    if (id === phraseQuizTarget.id) {
      setPhraseQuizScore((score) => score + 1);
      awardXp(10);
    } else {
      recordPhraseMistake(phraseQuizTarget.id);
    }
  }

  function nextPhraseQuestion() {
    if (phraseQuizRound >= 10) {
      setPhraseQuizFinished(true);
      updateStats((current) => ({ ...current, games: current.games + 1 }));
      return;
    }
    const pool = phraseTab === "word" ? wordItems : sentenceItems;
    const target = pickWeightedPhrase(pool, gameStats.phraseMistakes);
    setPhraseQuizTarget(target);
    setPhraseQuizChoices(makePhraseChoices(target, pool));
    setPhraseQuizAnswer(null);
    setPhraseQuizRound((round) => round + 1);
    playSound(target.korean);
  }

  async function sharePage(score?: number) {
    const url = `${window.location.origin}${window.location.pathname}`;
    const text = score === undefined
      ? "这个韩语 40 音网页可以练发音、背单词和句子，还能用键盘闯关。"
      : `我在韩语词句记忆闯关拿了 ${score}/10，你也来挑战一下！`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "韩语 40 音｜中文闯关版", text, url });
        setShareNotice("分享面板已打开");
      } else {
        const shareText = `${text}\n${url}`;
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareText);
        } else {
          const field = document.createElement("textarea");
          field.value = shareText;
          field.style.position = "fixed";
          field.style.opacity = "0";
          document.body.appendChild(field);
          field.select();
          document.execCommand("copy");
          field.remove();
        }
        setShareNotice("分享链接已复制");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareNotice("暂时无法自动复制，请复制浏览器地址");
    }
    window.setTimeout(() => setShareNotice(""), 2600);
  }

  function resetListenGame(target: Letter) {
    setListenTarget(target);
    setListenChoices(makeChoices(target));
    setListenAnswer(null);
    setListenRound(1);
    setListenHearts(3);
    setListenCombo(0);
    setListenScore(0);
    setRetryQueue([]);
    setListenFinished(false);
    playLetterExample(target);
  }

  function startListenGame() {
    resetListenGame(pickWeightedLetter(gameStats.mistakes, audibleLetters));
  }

  function startWeakDrill() {
    const weakestAudibleChar = weakest.find(([char]) => char !== "ㅇ")?.[0];
    const target = audibleLetters.find((letter) => letter.char === weakestAudibleChar);
    if (!target) return;
    setGameMode("listen");
    resetListenGame(target);
  }

  function answerListen(char: string) {
    if (listenAnswer !== null) return;
    setListenAnswer(char);
    playLetterExample(listenTarget);
    if (char === listenTarget.char) {
      const nextCombo = listenCombo + 1;
      setListenCombo(nextCombo);
      setListenScore((score) => score + 1);
      awardXp(10 + Math.min(nextCombo * 2, 10), nextCombo);
    } else {
      setListenHearts((hearts) => Math.max(0, hearts - 1));
      setListenCombo(0);
      setRetryQueue((queue) => [...queue, listenTarget]);
      recordMistake(listenTarget.char);
    }
  }

  function nextListenQuestion() {
    if (listenRound >= 10 || listenHearts <= 0) {
      setListenFinished(true);
      updateStats((current) => ({ ...current, games: current.games + 1 }));
      return;
    }
    let target: Letter;
    if ((listenRound + 1) % 3 === 0 && retryQueue.length > 0) {
      target = retryQueue[0];
      setRetryQueue((queue) => queue.slice(1));
    } else {
      target = pickWeightedLetter(gameStats.mistakes, audibleLetters);
    }
    setListenRound((round) => round + 1);
    setListenTarget(target);
    setListenChoices(makeChoices(target));
    setListenAnswer(null);
    playLetterExample(target);
  }

  function startMatchGame() {
    const weakChars = weakest.map(([char]) => char);
    const weakLetters = weakChars.map((char) => audibleLetters.find((item) => item.char === char)).filter((item): item is Letter => Boolean(item)).slice(0, 6);
    const remainder = shuffle(audibleLetters.filter((letter) => !weakChars.includes(letter.char))).slice(0, 6 - weakLetters.length);
    setMatchDeck(makeMatchDeck([...weakLetters, ...remainder]));
    setMatchSelected([]);
    setMatchedLetters([]);
    setMatchMoves(0);
    setMatchLocked(false);
  }

  function selectMatchCard(card: MatchCard) {
    if (matchLocked || matchedLetters.includes(card.letter.char) || matchSelected.includes(card.uid)) return;
    if (card.type === "sound") playLetterExample(card.letter);
    if (matchSelected.length === 0) {
      setMatchSelected([card.uid]);
      return;
    }
    const first = matchDeck.find((item) => item.uid === matchSelected[0]);
    setMatchMoves((moves) => moves + 1);
    if (first && first.letter.char === card.letter.char && first.type !== card.type) {
      const nextMatched = [...matchedLetters, card.letter.char];
      setMatchedLetters(nextMatched);
      setMatchSelected([]);
      awardXp(8);
      if (nextMatched.length === 6) {
        awardXp(25);
        updateStats((current) => ({ ...current, games: current.games + 1 }));
      }
    } else {
      setMatchSelected([matchSelected[0], card.uid]);
      setMatchLocked(true);
      window.setTimeout(() => {
        setMatchSelected([]);
        setMatchLocked(false);
      }, 680);
    }
  }

  function nextSpeedTarget() {
    const target = pickWeightedLetter(gameStats.mistakes, audibleLetters);
    setSpeedTarget(target);
    setSpeedChoices(makeRomanChoices(target));
  }

  function startSpeedGame() {
    setSpeedTime(30);
    setSpeedScore(0);
    setSpeedCombo(0);
    setSpeedFlash(null);
    setSpeedRunning(true);
    const target = pickWeightedLetter(gameStats.mistakes, audibleLetters);
    setSpeedTarget(target);
    setSpeedChoices(makeRomanChoices(target));
  }

  function answerSpeed(char: string) {
    if (!speedRunning) return;
    playLetterExample(speedTarget);
    if (char === speedTarget.char) {
      const nextCombo = speedCombo + 1;
      setSpeedCombo(nextCombo);
      setSpeedScore((score) => score + 1);
      setSpeedFlash("correct");
      awardXp(5 + Math.min(nextCombo, 5), nextCombo);
    } else {
      setSpeedCombo(0);
      setSpeedTime((time) => Math.max(0, time - 2));
      setSpeedFlash("wrong");
      recordMistake(speedTarget.char);
    }
    window.setTimeout(() => setSpeedFlash(null), 240);
    nextSpeedTarget();
  }

  function createBlendQuestion(play = true) {
    const nextInitial = initialOrder[Math.floor(Math.random() * initialOrder.length)];
    const nextVowel = vowelOrder[Math.floor(Math.random() * vowelOrder.length)];
    setBlendInitial(nextInitial);
    setBlendVowel(nextVowel);
    setBlendInitialChoices(makeJamoChoices(nextInitial, initialOrder));
    setBlendVowelChoices(makeJamoChoices(nextVowel, vowelOrder));
    setBlendSelectedInitial(null);
    setBlendSelectedVowel(null);
    setBlendFeedback(null);
    if (play) playSound(makeSyllable(nextInitial, nextVowel));
  }

  function startBlendGame() {
    setBlendRound(1);
    setBlendScore(0);
    setBlendFinished(false);
    createBlendQuestion();
  }

  function evaluateBlend(selectedInitial: string, selectedVowel: string) {
    if (blendFeedback !== null) return;
    const correct = selectedInitial === blendInitial && selectedVowel === blendVowel;
    setBlendFeedback(correct ? "correct" : "wrong");
    playSound(blendTarget);
    if (correct) {
      setBlendScore((score) => score + 1);
      awardXp(12);
    } else {
      if (selectedInitial !== blendInitial) recordMistake(blendInitial);
      if (selectedVowel !== blendVowel) recordMistake(blendVowel);
    }
  }

  function selectBlendInitial(value: string) {
    if (blendFeedback !== null) return;
    setBlendSelectedInitial(value);
    if (blendSelectedVowel !== null) evaluateBlend(value, blendSelectedVowel);
  }

  function selectBlendVowel(value: string) {
    if (blendFeedback !== null) return;
    setBlendSelectedVowel(value);
    if (blendSelectedInitial !== null) evaluateBlend(blendSelectedInitial, value);
  }

  function nextBlendQuestion() {
    if (blendRound >= 8) {
      setBlendFinished(true);
      updateStats((current) => ({ ...current, games: current.games + 1 }));
      return;
    }
    setBlendRound((round) => round + 1);
    createBlendQuestion();
  }

  function startShadowSession() {
    const pool = shadowSet === "consonants" ? audibleConsonants : shadowSet === "vowels" ? vowels : audibleLetters;
    const weakLetters = weakest
      .map(([char]) => pool.find((letter) => letter.char === char))
      .filter((letter): letter is Letter => Boolean(letter));
    const remainder = shuffle(pool.filter((letter) => !weakLetters.some((weak) => weak.char === letter.char)));
    const queue = [...weakLetters, ...remainder].slice(0, 8);
    setShadowQueue(queue);
    setShadowIndex(0);
    setShadowScore(0);
    setShadowStage("repeat");
    playLetterExample(queue[0]);
  }

  function confirmShadowRepeat() {
    if (shadowStage !== "repeat") return;
    playLetterExample(shadowCurrent);
    setShadowStage("rate");
  }

  function rateShadow(confident: boolean) {
    if (shadowStage !== "rate") return;
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
      setShadowStage("finished");
      updateStats((current) => ({ ...current, games: current.games + 1 }));
      return;
    }
    setShadowIndex(nextIndex);
    setShadowStage("repeat");
    playLetterExample(nextQueue[nextIndex]);
  }

  function switchGameMode(mode: "listen" | "shadow" | "match" | "blend" | "speed") {
    setGameMode(mode);
    if (mode === "listen") startListenGame();
    if (mode === "match") startMatchGame();
    if (mode === "blend") startBlendGame();
    if (mode === "speed") setSpeedRunning(false);
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="回到首页">
          <span className="brand-mark" aria-hidden="true">한</span>
          <span><strong>韩语 40 音</strong><small>中文闯关版 · v13</small></span>
        </a>
        <nav aria-label="主要导航">
          <a href="#games">闯关训练</a>
          <a href="#phrases">词句背诵</a>
          <a href="#learn">40 音表</a>
        </nav>
        <div className="topbar-actions">
          <button className="header-keyboard" type="button" onClick={() => setShowKeyboardHelp(true)} aria-haspopup="dialog" aria-expanded={showKeyboardHelp} aria-label="打开键盘快捷键帮助"><span aria-hidden="true">⌨</span><b>快捷键</b></button>
          <button className="header-share" type="button" onClick={() => sharePage()} aria-label="分享这个韩语学习网页"><span aria-hidden="true">↗</span><b>分享</b></button>
          <a className="header-progress xp-pill" href="#games" aria-label={`今日获得 ${gameStats.dailyXp} XP`}><span>{gameStats.dailyXp}</span> XP 今日</a>
        </div>
      </header>

      {shareNotice && <div className="share-toast" role="status">{shareNotice}</div>}
      {showKeyboardHelp && <div className="keyboard-modal-backdrop"><div className="keyboard-modal" role="dialog" aria-modal="true" aria-labelledby="keyboard-help-title"><div className="keyboard-modal-head"><div><span>无需移动鼠标</span><h2 id="keyboard-help-title">键盘快捷键</h2></div><button type="button" autoFocus onClick={() => setShowKeyboardHelp(false)} aria-label="关闭快捷键帮助">×</button></div><div className="shortcut-grid"><article><strong>四选一答题</strong><p><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> 或 <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd></p><small>听音、极速、词句闯关都通用</small></article><article><strong>播放与推进</strong><p><kbd>Space</kbd> / <kbd>R</kbd> 重播　<kbd>Enter</kbd> 下一题</p><small>长按不会重复触发声音</small></article><article><strong>切换小游戏</strong><p><kbd>←</kbd><kbd>→</kbd> 上一个 / 下一个</p><small>在训练场中直接轮换五种玩法</small></article><article><strong>配对消除</strong><p><kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd> · <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd> · <kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd><kbd>V</kbd></p><small>按键位置与三行卡片位置一致</small></article><article><strong>拼读工坊</strong><p><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd> 选辅音　<kbd>J</kbd><kbd>K</kbd><kbd>L</kbd><kbd>;</kbd> 选元音</p><small>左右手分工，听完直接组合</small></article><article><strong>帮助与关闭</strong><p><kbd>?</kbd> 打开帮助　<kbd>Esc</kbd> 关闭</p><small>页面右上角也可以随时打开</small></article></div></div></div>}

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow"><span>韩国真人起音</span><span>答题自动推进</span></div>
            <h1 id="hero-title">别再硬背。<br />把 40 音玩熟。</h1>
            <p className="hero-lead">40 音表和所有单辅音闯关改用韩国母语者的短促起音片段：不是“辅音 + ㅏ / ㅡ”，也不会读出完整音节或单词。</p>
            <div className="hero-actions">
              <a className="primary-action" href="#games">开始今日闯关 <span aria-hidden="true">↓</span></a>
              <a className="text-action" href="#learn">先听 40 音 <span aria-hidden="true">↗</span></a>
            </div>
            <div className="audio-source-card">
              <span className="audio-source-icon" aria-hidden="true">♪</span>
              <div><strong>韩国母语者真人起音 · 已截去完整元音</strong><p>18 个可听辅音来自同一位韩国母语者的原始 WAV，只保留真人爆破、摩擦、鼻音、送气和最多 35 毫秒起声过渡；ㅇ 作初声保持真正静音。</p><small className="voice-status">正式字母名称声线：{koreanVoice?.name ?? "正在检测 / 未安装"}</small></div>
              <div className="audio-controls"><span className="audio-ready">真人 WAV</span><div className="audio-speed-toggle" role="group" aria-label="选择发音速度"><button type="button" aria-pressed={audioSpeed === 1} onClick={() => changeAudioSpeed(1)}>标准</button><button type="button" aria-pressed={audioSpeed === 0.82} onClick={() => changeAudioSpeed(0.82)}>慢放</button></div></div>
            </div>
          </div>

          <div className="builder-card" aria-labelledby="builder-title">
            <div className="builder-topline"><span className="mini-label">自然原音 · 可慢放</span><span className="sound-waves" aria-hidden="true">· )))</span></div>
            <h2 id="builder-title">拼一个，就听一个</h2>
            <p>实际组合使用固定 AI 音频；现代口语中自然合流的组合会听起来相同。</p>
            <div className="builder-controls">
              <label><span>初声 · 辅音</span><select value={initial} onChange={(event) => setInitial(event.target.value)} aria-label="选择辅音">{initialOrder.map((item) => <option key={item}>{item}</option>)}</select></label>
              <span className="plus" aria-hidden="true">+</span>
              <label><span>中声 · 元音</span><select value={vowel} onChange={(event) => setVowel(event.target.value)} aria-label="选择元音">{vowelOrder.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <div className="syllable-stage">
              <div className="syllable-parts"><span>{initial}</span><span>{vowel}</span></div>
              <span className="becomes" aria-hidden="true">→</span>
              <button className="syllable-result" type="button" onClick={() => playSound(syllable)} aria-label={`播放 ${syllable} 的单次发音`}><strong>{syllable}</strong><span>{audioSpeed === 1 ? "标准原音" : "同音慢放"} ▶</span></button>
            </div>
            <div className="builder-note"><span aria-hidden="true">听</span><p><strong>听法</strong> 这里读的是完整音节，不是脱离元音的“裸辅音”。例如 ㄱ + ㅏ 读 가；辅音的正式名称请在 40 音表里听。</p></div>
          </div>
        </section>

        <section className="principles" aria-label="游戏学习机制">
          <article><span className="principle-number">01</span><div><strong>错音自动返场</strong><p>答错后不会立刻死记，隔几题再出现更容易留下记忆。</p></div></article>
          <article><span className="principle-number">02</span><div><strong>五种训练轮换</strong><p>听音、跟读、配对、拼读、极速认读交替，避免单一题型产生假熟练。</p></div></article>
          <article><span className="principle-number">03</span><div><strong>只存本机进度</strong><p>XP、连胜和薄弱音保存在当前设备，不需要注册。</p></div></article>
        </section>

        <section className="game-section" id="games" aria-labelledby="games-title">
          <div className="game-heading">
            <div><span className="section-kicker">今日训练场</span><h2 id="games-title">玩着玩着，耳朵和字形就对上了。</h2><p>答题后自动播放真人起音并进入下一题；塞音本来就很短，完整差别仍可在拼读区结合元音练习。</p></div>
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
                <div className="week-bars" aria-label="近七天经验记录">{weekData.map((day) => <div className="week-day" key={day.key} title={`${day.key} · ${day.xp} XP`}><span><i style={{ height: day.xp === 0 ? "4px" : `${Math.max(10, (day.xp / weekMax) * 100)}%` }} /></span><small>{day.label}</small></div>)}</div>
              </div>
              <div className="weak-list"><span>系统发现的薄弱音</span>{weakest.length === 0 ? <p>先玩一局，系统会自动发现。</p> : <div>{weakest.map(([char, count]) => { const letter = allLetters.find((item) => item.char === char); return <button type="button" key={char} onClick={() => letter && playLetterExample(letter)}><strong>{char}</strong><small>错 {count} 次 · {char === "ㅇ" ? "初声静音" : "点击听"}</small></button>; })}</div>}</div>
              {weakest.some(([char]) => char !== "ㅇ") && <button className="weak-drill-button" type="button" onClick={startWeakDrill}>专练最弱音 →</button>}
            </aside>

            <div className="game-console" onMouseDown={() => setKeyboardZone("games")} onFocusCapture={() => setKeyboardZone("games")}>
              <div className="game-tabs" role="tablist" aria-label="选择小游戏">
                <button type="button" role="tab" aria-selected={gameMode === "listen"} onClick={() => switchGameMode("listen")}><span aria-hidden="true">♫</span><div><strong>听音闯关</strong><small>错题隔轮返场</small></div></button>
                <button type="button" role="tab" aria-selected={gameMode === "shadow"} onClick={() => switchGameMode("shadow")}><span aria-hidden="true">说</span><div><strong>回声跟读</strong><small>不稳就排回队尾</small></div></button>
                <button type="button" role="tab" aria-selected={gameMode === "match"} onClick={() => switchGameMode("match")}><span aria-hidden="true">▦</span><div><strong>配对消除</strong><small>字形配上声音</small></div></button>
                <button type="button" role="tab" aria-selected={gameMode === "blend"} onClick={() => switchGameMode("blend")}><span aria-hidden="true">拼</span><div><strong>拼读工坊</strong><small>声音拆成两块</small></div></button>
                <button type="button" role="tab" aria-selected={gameMode === "speed"} onClick={() => switchGameMode("speed")}><span aria-hidden="true">⚡</span><div><strong>极速认读</strong><small>30 秒破纪录</small></div></button>
              </div>
              <div className="keyboard-guide"><span aria-hidden="true">⌨</span><strong>键盘模式</strong><p>{gameKeyboardHint}</p><button type="button" onClick={() => setShowKeyboardHelp(true)}><kbd>?</kbd> 全部</button></div>

              {gameMode === "listen" && (
                <div className="listen-game game-board">
                  {listenFinished ? (
                    <div className="game-finish"><span className="finish-medal" aria-hidden="true">★</span><small>本局结束</small><h3>{listenScore} / 10</h3><p>{listenScore >= 8 ? "你的耳朵已经开始分辨细节了。" : "错音已被记住，下局会更常遇到它们。"}</p><button type="button" onClick={startListenGame}>再闯一局</button></div>
                  ) : (
                    <>
                      <div className="game-board-top"><span data-testid="listen-round">第 {listenRound} / 10 题</span><div className="round-track"><span style={{ width: `${listenRound * 10}%` }} /></div><div className="heart-row" aria-label={`剩余 ${listenHearts} 颗心`}>{[0, 1, 2].map((heart) => <span key={heart} className={heart < listenHearts ? "alive" : "lost"}>♥</span>)}</div></div>
                      <div className="listen-prompt"><span className="combo-chip">连胜 × {listenCombo}</span><h3>{consonantNameMap.has(listenTarget.char) ? "听韩国真人的辅音起音，选出字母" : "听元音本音，选出对应字母"}</h3><button className="big-listen" type="button" onClick={() => playLetterExample(listenTarget)} aria-label="重新播放题目"><span aria-hidden="true">▶</span><strong>再听一次</strong><small>{consonantNameMap.has(listenTarget.char) ? listenAnswer === null ? "韩国真人起音" : `真人起音 · ${consonantNameMap.get(listenTarget.char)?.ipa}` : "元音本音"} · {audioSpeed === 1 ? "标准" : "慢放"}</small></button></div>
                      <div className="game-choices">
                        {listenChoices.map((choice, index) => {
                          const answered = listenAnswer !== null;
                          const correct = choice.char === listenTarget.char;
                          const pickedWrong = choice.char === listenAnswer && !correct;
                          return <button type="button" key={choice.char} data-testid={`listen-choice-${index}`} disabled={answered} className={`${answered && correct ? "correct" : ""} ${pickedWrong ? "wrong" : ""}`} onClick={() => answerListen(choice.char)}><kbd>{choiceKeyLabels[index]}</kbd><strong>{choice.char}</strong><small>{answered ? choice.roman : "选择"}</small></button>;
                        })}
                      </div>
                      <div className="game-feedback" aria-live="polite">
                        {listenAnswer === null ? <span>辅音题只播放真人裁切的起音片段；初声静音的 ㅇ 不进入盲听题。</span> : <span className="auto-next-status">{listenAnswer === listenTarget.char ? <strong className="success">正确！+{10 + Math.min(listenCombo * 2, 10)} XP</strong> : <strong className="retry">正确答案是 {listenTarget.char}，真人起音目标是 {consonantNameMap.get(listenTarget.char)?.ipa ?? listenTarget.sample}。</strong>}<small>正在播放反馈，随后自动进入下一题…</small></span>}
                        {listenAnswer !== null && <button type="button" onClick={nextListenQuestion}>{listenRound >= 10 || listenHearts <= 0 ? "立即查看成绩" : "立即下一题 →"}</button>}
                      </div>
                    </>
                  )}
                </div>
              )}

              {gameMode === "shadow" && (
                <div className="shadow-game game-board">
                  {shadowQueue.length === 0 ? (
                    <div className="shadow-start"><span aria-hidden="true">说</span><h3>听一个示范，跟读一次，再核对</h3><p>每轮抽 8 个字母示范。不稳的项目会自动排回本局末尾，直到真正熟悉。</p><div className="shadow-set-toggle" role="group" aria-label="选择跟读范围"><button type="button" aria-pressed={shadowSet === "mixed"} onClick={() => setShadowSet("mixed")}>混合字母示范</button><button type="button" aria-pressed={shadowSet === "consonants"} onClick={() => setShadowSet("consonants")}>只练辅音起音</button><button type="button" aria-pressed={shadowSet === "vowels"} onClick={() => setShadowSet("vowels")}>只练元音</button></div><button className="shadow-start-button" type="button" onClick={startShadowSession}>开始跟读循环</button></div>
                  ) : shadowStage === "finished" ? (
                    <div className="game-finish"><span className="finish-medal" aria-hidden="true">说</span><small>跟读完成</small><h3>{shadowScore} 个示范</h3><p>所有不稳的项目都已经返场并再次确认。</p><button type="button" onClick={startShadowSession}>再来一轮</button></div>
                  ) : (
                    <>
                      <div className="game-board-top"><span>第 {shadowIndex + 1} / {shadowQueue.length} 个示范</span><div className="round-track"><span style={{ width: `${((shadowIndex + 1) / shadowQueue.length) * 100}%` }} /></div><strong>{shadowScore} 已熟悉</strong></div>
                      <div className="shadow-card"><span className="combo-chip">{shadowStage === "repeat" ? "听完后，模仿发音动作一次" : "核对刚才的发音动作"}</span><strong>{shadowCurrent.char}</strong><div><b>{consonantNameMap.get(shadowCurrent.char)?.ipa ?? shadowCurrent.sample}</b><span>{shadowCurrent.roman}</span></div><p>{shadowCurrent.hint}</p></div>
                      {shadowStage === "repeat" ? (
                        <div className="shadow-actions"><button type="button" onClick={() => playLetterExample(shadowCurrent)}><kbd>Space / R</kbd> 再听示范</button><button className="primary" type="button" onClick={confirmShadowRepeat}><kbd>Enter</kbd> 我已跟读 · 播放同一示范</button></div>
                      ) : (
                        <div className="shadow-rating"><p>核对示范和前面是同一条录音。刚才跟读得怎么样？</p><div><button type="button" onClick={() => rateShadow(false)}><kbd>1 / A</kbd> 还不稳 · 稍后返场</button><button className="confident" type="button" onClick={() => rateShadow(true)}><kbd>2 / S</kbd> 挺像的 · +8 XP</button></div></div>
                      )}
                    </>
                  )}
                </div>
              )}

              {gameMode === "match" && (
                <div className="match-game game-board">
                  <div className="game-board-top"><span>已配对 {matchedLetters.length} / 6</span><div className="round-track"><span style={{ width: `${(matchedLetters.length / 6) * 100}%` }} /></div><span className="move-count">{matchMoves} 步</span></div>
                  <div className="match-intro"><h3>把字形和对应示范音频配成一对</h3><p>辅音牌播放韩国真人起音片段，元音牌播放元音本音；“听”牌不会显示答案。</p></div>
                  <div className="match-grid">
                    {matchDeck.map((card, index) => {
                      const matched = matchedLetters.includes(card.letter.char);
                      const selected = matchSelected.includes(card.uid);
                      return <button type="button" key={card.uid} className={`${matched ? "matched" : ""} ${selected ? "selected" : ""}`} disabled={matched} onClick={() => selectMatchCard(card)} aria-label={card.type === "char" ? `字母 ${card.letter.char}` : `播放字母示范并寻找对应字母`}><kbd>{matchKeys[index]}</kbd><span>{matched ? "✓" : card.type === "char" ? card.letter.char : "♫"}</span><small>{matched ? card.letter.roman : card.type === "char" ? "字形" : "听示范"}</small></button>;
                    })}
                  </div>
                  <div className="game-feedback"><span>{matchedLetters.length === 6 ? "全部消除！奖励 25 XP。" : "每配成一对获得 8 XP。"}</span><button type="button" onClick={startMatchGame}>{matchedLetters.length === 6 ? "再玩一局" : "重新洗牌"}</button></div>
                </div>
              )}

              {gameMode === "blend" && (
                <div className="blend-game game-board">
                  {blendFinished ? (
                    <div className="game-finish"><span className="finish-medal" aria-hidden="true">拼</span><small>拼读完成</small><h3>{blendScore} / 8</h3><p>{blendScore >= 6 ? "你已经能把完整音节对应回初声和中声了。" : "再来一局，先判断初声字母、再判断中声；遇到 ㅇ 时开头没有辅音声。"}</p><button type="button" onClick={startBlendGame}>再拼一局</button></div>
                  ) : (
                    <>
                      <div className="game-board-top"><span>第 {blendRound} / 8 题</span><div className="round-track"><span style={{ width: `${(blendRound / 8) * 100}%` }} /></div><strong>{blendScore} 分</strong></div>
                      <div className="blend-prompt">
                        <button className="blend-audio-button" type="button" onClick={() => playSound(blendTarget)} aria-label="重播要判断的完整音节"><span aria-hidden="true">▶</span><strong>听音节认字母</strong><small>判断初声和中声；ㅇ 初声无声</small></button>
                        <div className={`blend-equation ${blendFeedback ?? ""}`} aria-live="polite">{blendFeedback === null ? <><span>{blendSelectedInitial ?? "?"}</span><b>+</b><span>{blendSelectedVowel ?? "?"}</span><b>=</b><span>?</span></> : <><span>{blendInitial}</span><b>+</b><span>{blendVowel}</span><b>=</b><strong>{blendTarget}</strong></>}</div>
                      </div>
                      <div className="blend-choice-groups">
                        <div className="blend-choice-group"><span>① 先选辅音</span><div className="blend-choice-row">{blendInitialChoices.map((choice, index) => <button type="button" key={choice} disabled={blendFeedback !== null} className={`${blendSelectedInitial === choice ? "selected" : ""} ${blendFeedback !== null && choice === blendInitial ? "correct" : ""} ${blendFeedback === "wrong" && choice === blendSelectedInitial && choice !== blendInitial ? "wrong" : ""}`} onClick={() => selectBlendInitial(choice)}><kbd>{choiceKeyLabels[index]}</kbd>{choice}</button>)}</div></div>
                        <div className="blend-choice-group"><span>② 再选元音</span><div className="blend-choice-row">{blendVowelChoices.map((choice, index) => <button type="button" key={choice} disabled={blendFeedback !== null} className={`${blendSelectedVowel === choice ? "selected" : ""} ${blendFeedback !== null && choice === blendVowel ? "correct" : ""} ${blendFeedback === "wrong" && choice === blendSelectedVowel && choice !== blendVowel ? "wrong" : ""}`} onClick={() => selectBlendVowel(choice)}><kbd>{index + 5} / {blendVowelKeys[index]}</kbd>{choice}</button>)}</div></div>
                      </div>
                      <div className="game-feedback" aria-live="polite">
                        {blendFeedback === null ? <span>两边各选一个，系统会自动合成答案。</span> : <span className="auto-next-status">{blendFeedback === "correct" ? <strong className="success">拼对了！{blendInitial} + {blendVowel} = {blendTarget} · +12 XP</strong> : <strong className="retry">再听：{blendInitial} + {blendVowel} 才是 {blendTarget}</strong>}<small>正在播放正确音节，随后自动进入下一题…</small></span>}
                        {blendFeedback !== null && <button type="button" onClick={nextBlendQuestion}>{blendRound >= 8 ? "立即查看成绩" : "立即下一题 →"}</button>}
                      </div>
                    </>
                  )}
                </div>
              )}

              {gameMode === "speed" && (
                <div className={`speed-game game-board ${speedFlash ? `flash-${speedFlash}` : ""}`}>
                  <div className="game-board-top"><span>得分 {speedScore}</span><div className="speed-timer"><span style={{ width: `${(speedTime / 30) * 100}%` }} /></div><strong>{speedTime}s</strong></div>
                  {!speedRunning ? (
                    <div className="speed-start"><span aria-hidden="true">⚡</span><h3>{speedTime === 0 ? `本轮认出 ${speedScore} 个` : "30 秒极速认读"}</h3><p>看到字母，快速选罗马字提示；辅音题播放韩国真人起音，元音题播放元音本音。初声静音的 ㅇ 不进入本模式。</p><button type="button" onClick={startSpeedGame}>{speedTime === 0 ? "刷新纪录" : "开始计时"}</button></div>
                  ) : (
                    <>
                      <div className="speed-target"><span className="combo-chip">连胜 × {speedCombo}</span><strong>{speedTarget.char}</strong><small>选出罗马字提示</small></div>
                      <div className="speed-options">{speedChoices.map((choice, index) => <button type="button" key={choice.char} onClick={() => answerSpeed(choice.char)}><kbd>{choiceKeyLabels[index]}</kbd>{choice.roman}</button>)}</div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="phrase-section" id="phrases" aria-labelledby="phrases-title" onMouseDown={() => setKeyboardZone("phrases")} onFocusCapture={() => setKeyboardZone("phrases")}>
          <div className="phrase-heading">
            <div><span className="section-kicker">从 40 音走进真实韩语</span><h2 id="phrases-title">单词会认，句子会说。</h2><p>先翻卡背诵，再做十题记忆闯关。答错的词句会在以后更常出现。</p></div>
            <div className="phrase-progress"><span>已背熟</span><strong>{masteredPhrases.length}<small>/{phraseItems.length}</small></strong><div><i style={{ width: `${(masteredPhrases.length / phraseItems.length) * 100}%` }} /></div></div>
          </div>

          <div className="phrase-tabs" role="tablist" aria-label="选择词句类型">
            <button type="button" role="tab" aria-selected={phraseTab === "word"} onClick={() => changePhraseTab("word")}><strong>生活单词</strong><span>{wordItems.length} 个</span></button>
            <button type="button" role="tab" aria-selected={phraseTab === "sentence"} onClick={() => changePhraseTab("sentence")}><strong>开口句子</strong><span>{sentenceItems.length} 句</span></button>
          </div>

          <div className="phrase-filters" role="group" aria-label="筛选背诵状态">
            <span>查看：</span>
            <button type="button" aria-pressed={phraseFilter === "all"} onClick={() => setPhraseFilter("all")}>全部</button>
            <button type="button" aria-pressed={phraseFilter === "learning"} onClick={() => setPhraseFilter("learning")}>待背</button>
            <button type="button" aria-pressed={phraseFilter === "mastered"} onClick={() => setPhraseFilter("mastered")}>已背熟</button>
          </div>

          <div className="phrase-layout">
            <div className="phrase-library">
              <div className="phrase-library-head"><div><strong>翻卡背诵</strong><span>先听、先读，最后再翻中文</span></div><small>{phraseTab === "word" ? "适合每天背 6 个" : "按意群整句跟读"}</small></div>
              <div className={`phrase-grid ${phraseTab === "sentence" ? "sentence-grid" : ""}`}>
                {visiblePhraseItems.map((item) => {
                  const revealed = revealedPhrases.includes(item.id);
                  const masteredPhrase = masteredPhrases.includes(item.id);
                  return <article className={`${revealed ? "revealed" : ""} ${masteredPhrase ? "mastered" : ""}`} key={item.id}><button className="phrase-audio" type="button" onClick={() => playSound(item.korean)} aria-label={`播放 ${item.korean}`}><span>{item.group}</span><strong>{item.korean}</strong><small>{item.roman}</small><i aria-hidden="true">▶</i></button><div className="phrase-meaning"><p>{revealed ? item.chinese : "先回忆中文意思"}</p><button type="button" onClick={() => togglePhraseReveal(item.id)}>{revealed ? "收起中文" : "翻开答案"}</button><button type="button" aria-pressed={masteredPhrase} onClick={() => togglePhraseMastered(item.id)}>{masteredPhrase ? "✓ 已背熟" : "标记背熟"}</button></div></article>;
                })}
                {visiblePhraseItems.length === 0 && <div className="phrase-empty"><strong>{phraseFilter === "mastered" ? "还没有标记背熟" : "这一组已经全部背熟了"}</strong><p>{phraseFilter === "mastered" ? "背会后点一下“标记背熟”，它就会来到这里。" : "可以切到“已背熟”复习，或继续做右侧闯关。"}</p><button type="button" onClick={() => setPhraseFilter("all")}>查看全部</button></div>}
              </div>
            </div>

            <aside className="phrase-quiz" aria-label="词句记忆闯关">
              <div className="phrase-quiz-top"><span>记忆闯关</span><small><kbd>1–4 / A S D F</kbd> 选择 · <kbd>Space / R</kbd> 重播 · <kbd>Enter</kbd> 下一题</small></div>
              {!phraseQuizStarted ? (
                <div className="phrase-quiz-start"><span aria-hidden="true">记</span><h3>{phraseTab === "word" ? "听读单词，选中文" : "听读句子，选中文"}</h3><p>共 10 题，错过的内容会被系统记住并加权返场。</p><button type="button" onClick={startPhraseQuiz}>开始背诵闯关 <kbd>Enter</kbd></button></div>
              ) : phraseQuizFinished ? (
                <div className="phrase-quiz-finish"><span aria-hidden="true">★</span><small>本轮完成</small><h3>{phraseQuizScore} / 10</h3><p>{phraseQuizScore >= 8 ? "这些词句已经开始进入长期记忆。" : "错题已记住，下一轮会更常遇见。"}</p><div><button type="button" onClick={startPhraseQuiz}>再背一轮</button><button className="share-score" type="button" onClick={() => sharePage(phraseQuizScore)}>分享成绩 ↗</button></div></div>
              ) : (
                <div className="phrase-quiz-body">
                  <div className="phrase-quiz-status"><span data-testid="phrase-round">第 {phraseQuizRound} / 10 题</span><div><i style={{ width: `${phraseQuizRound * 10}%` }} /></div><strong>{phraseQuizScore} 分</strong></div>
                  <button className="phrase-quiz-sound" type="button" onClick={() => playSound(phraseQuizTarget.korean)}><span aria-hidden="true">▶</span><strong>{phraseQuizAnswer === null ? "只听声音" : phraseQuizTarget.korean}</strong><small>{phraseQuizAnswer === null ? "盲听后用 1–4 或 A/S/D/F 选择中文" : phraseQuizTarget.roman}</small></button>
                  <div className="phrase-quiz-choices">{phraseQuizChoices.map((choice, index) => {
                    const answered = phraseQuizAnswer !== null;
                    const correct = choice.id === phraseQuizTarget.id;
                    const pickedWrong = choice.id === phraseQuizAnswer && !correct;
                    return <button type="button" key={choice.id} data-testid={`phrase-choice-${index}`} disabled={answered} className={`${answered && correct ? "correct" : ""} ${pickedWrong ? "wrong" : ""}`} onClick={() => answerPhraseQuiz(choice.id)}><kbd>{choiceKeyLabels[index]}</kbd><span>{choice.chinese}</span></button>;
                  })}</div>
                  <div className="phrase-quiz-feedback" aria-live="polite">{phraseQuizAnswer === null ? <span>Space 或 R 可以重播，不扣分。</span> : <span className="auto-next-status">{phraseQuizAnswer === phraseQuizTarget.id ? <strong>正确！+10 XP</strong> : <strong className="wrong">答案：{phraseQuizTarget.chinese}</strong>}<small>听完当前词句后自动进入下一题…</small></span>}{phraseQuizAnswer !== null && <button type="button" onClick={nextPhraseQuestion}>{phraseQuizRound >= 10 ? "立即查看成绩" : "立即下一题 →"}</button>}</div>
                </div>
              )}
            </aside>
          </div>
        </section>

        <section className="learning-section" id="learn" aria-labelledby="learn-title">
          <div className="section-heading">
            <div><span className="section-kicker">随时查音</span><h2 id="learn-title">韩语 40 音表 · 真人起音版</h2><p>辅音卡的第二个按钮播放韩国母语者的短促起音片段，不再读“辅音 + ㅏ”或完整短词。ㅇ 作初声时本来就是静音。</p></div>
            <div className="mastery-meter" aria-label={`总进度 ${mastered.length} / 40`}><div><span>已掌握</span><strong>{mastered.length}<small>/40</small></strong></div><div className="meter-track"><span style={{ width: `${(mastered.length / 40) * 100}%` }} /></div></div>
          </div>
          <div className="letter-tabs" role="tablist" aria-label="选择字母类型">
            <button type="button" role="tab" aria-selected={activeSet === "consonants"} onClick={() => setActiveSet("consonants")}><span>辅音</span><strong>19</strong><small>正式名称 + 真人起音</small></button>
            <button type="button" role="tab" aria-selected={activeSet === "vowels"} onClick={() => setActiveSet("vowels")}><span>元音</span><strong>21</strong><small>看口型和舌位</small></button>
          </div>
          <div className="letter-grid" role="tabpanel">
            {currentLetters.map((letter) => {
              const isMastered = mastered.includes(letter.char);
              const consonantName = consonantNameMap.get(letter.char);
              return <article className={`letter-card ${isMastered ? "is-mastered" : ""}`} key={letter.char}><button className="master-button" type="button" onClick={() => toggleMastered(letter.char)} aria-label={`${isMastered ? "取消" : "标记"} ${letter.char} 已掌握`} aria-pressed={isMastered}>{isMastered ? "✓" : ""}</button><div className="letter-sound"><span className="card-group">{letter.group}</span><strong className="jamo">{letter.char}</strong><span className="roman">{letter.roman}</span>{consonantName ? <div className="letter-audio-actions"><button type="button" className="name-audio" disabled={!koreanVoice} onClick={() => playLetterName(consonantName.name)} aria-label={`播放辅音 ${letter.char} 的正式字母名称 ${consonantName.name}`}><span>{koreanVoice ? "正式名称" : "需要韩语声线"}</span><strong>{consonantName.name}<i aria-hidden="true">▶</i></strong></button><button type="button" onClick={() => playLetterExample(letter)} aria-label={consonantName.initialSilent ? `说明辅音 ${letter.char} 作初声时静音` : `播放辅音 ${letter.char} 的韩国真人起音 ${consonantName.ipa}`}><span>{consonantName.initialSilent ? "初声静音" : "听真人起音"}</span><strong>{consonantName.initialSilent ? "不发声" : `${letter.char} ${consonantName.ipa}`}<i aria-hidden="true">{consonantName.initialSilent ? "说明" : "▶"}</i></strong></button></div> : <div className="letter-audio-actions vowel-audio"><button type="button" onClick={() => playSound(letter.sample)} aria-label={`播放元音 ${letter.char} 的发音 ${letter.sample}`}><span>元音发音</span><strong>{letter.sample}<i aria-hidden="true">▶</i></strong></button></div>}<span className="hint">{letter.hint}</span></div></article>;
            })}
          </div>
          <p className="pronunciation-note"><span aria-hidden="true">♪</span><strong>这次是真人：</strong>18 条起音来自韩国母语者 호로조 的 CC0 原始 WAV，按声谱边界截去完整元音和词尾，只保留真人发音动作及最多 35 毫秒起声过渡，并在末端快速淡出。它不会读成完整的 가、그 或单词；塞音和 ㄹ 本来就只能很短。ㅇ 初声无声，已从盲听和跟读题排除。<a href="https://commons.wikimedia.org/wiki/Category:Lingua_Libre_pronunciation_by_%ED%98%B8%EB%A1%9C%EC%A1%B0" target="_blank" rel="noreferrer">查看真人音源</a>　<a href="https://www.korean.go.kr/front/onlineQna/onlineQnaView.do?mn_id=261&amp;pageIndex=1&amp;qna_seq=329921" target="_blank" rel="noreferrer">查看 ㅇ 官方说明</a></p>
        </section>

        <section className="compare-section" id="compare" aria-labelledby="compare-title">
          <div className="compare-intro"><span className="section-kicker">易混音擂台</span><h2 id="compare-title">同一套音色，<br />差别更容易听见。</h2><p>这里故意固定元音 ㅏ，并使用同一音色、速度和音量，以便只比较开头辅音。把一张薄纸放在嘴前，再依次点击右边三组音。</p><div className="air-legend"><div><span className="dot plain" /><strong>松音</strong><small>轻、自然</small></div><div><span className="dot tense" /><strong>紧音</strong><small>喉咙绷紧</small></div><div><span className="dot air" /><strong>送气音</strong><small>纸片吹动</small></div></div></div>
          <div className="compare-list">{compareGroups.map((group) => <article className="compare-row" key={group.title}><div><h3>{group.title}</h3><p>{group.cue}</p></div><div className="compare-buttons">{group.items.map((item, index) => <button type="button" key={item.text} className={`tone-${index}`} onClick={() => playSound(item.text)} aria-label={`播放 ${item.text}，${item.label}`}><strong>{item.text}</strong><span>{item.label}</span><i aria-hidden="true">▶</i></button>)}</div></article>)}</div>
        </section>
      </main>

      <footer><div className="footer-mark" aria-hidden="true">한</div><div><strong>今天玩 10 分钟，比硬背 1 小时更有用。</strong><p>系统会记住你的错音，让下一次练习更懂你。</p></div><a href="#top">回到顶部 ↑</a></footer>
    </div>
  );
}
