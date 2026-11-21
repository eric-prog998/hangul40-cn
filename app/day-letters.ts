import { INITIAL_ORDER, VOWEL_ORDER, makeSyllable, decomposeHangulSyllable, isFairBlendTarget, areBlindLettersConfusable, areBlendPartsEquivalent } from "./learning-logic.ts";
import { addLocalDays } from "./review-logic.ts";

export type DaySkill = "read" | "listen" | "keys";
export type DayCard = { char: string; skill: DaySkill; example: string; alternative: string };
type Entry = { day: string; due: string; stage: 0 | 1 | 2; example: string };
export type DayHistory = Record<string, Entry>;
export const DAY_JAMO = [..."ㅏㄱㅓㄴㅗㅁㅜㄷㅡㅅㅣㅇㄹㅂㅈㅎㅑㅕㅛㅠㅋㅌㅍㅊㅐㅔㄲㄸㅃㅆㅉㅒㅖㅘㅝㅚㅟㅙㅞㅢ"];
const skills: DaySkill[] = ["read", "listen", "keys"];
// Teach these spellings through reading/keyboard practice, never require guessing
// a spelling from merged vowel sounds. ㅇ is not an audible initial.
const noBlindTarget = new Set([..."ㅇㅐㅔㅒㅖㅚㅙㅞ"]);
const id = (char: string, skill: DaySkill) => char + ":" + skill;
const intervals = [1, 1, 4];
export const emptyDayHistory = (): DayHistory => ({});
export function daySkillTotals(history: DayHistory) {
  return skills.map(skill => {
    const chars = DAY_JAMO.filter(char => skill !== "listen" || !noBlindTarget.has(char));
    return { skill, total: chars.length, practiced: chars.filter(char => history[id(char, skill)]).length,
      confirmed: chars.filter(char => history[id(char, skill)]?.stage === 2).length };
  });
}

function examplesFor(char: string) {
  if (!DAY_JAMO.includes(char)) return [];
  const pairs = INITIAL_ORDER.includes(char)
    ? ["ㅏ", "ㅗ", "ㅜ", "ㅓ", "ㅣ"].map(v => [char, v])
    : ["ㅇ", "ㄱ", "ㄴ", "ㅁ", "ㅂ"].map(c => [c, char]);
  return pairs.filter(([c, v]) => isFairBlendTarget(c, v)).map(([c, v]) => makeSyllable(c, v));
}
const examples = new Map(DAY_JAMO.map(char => [char, examplesFor(char)]));
const typeIsConsonant = (char: string) => INITIAL_ORDER.includes(char);

function distractors(char: string, example: string) {
  if (noBlindTarget.has(char)) return [];
  const { initial, vowel } = decomposeHangulSyllable(example)!;
  return (typeIsConsonant(char) ? ["ㅁ", "ㄴ", "ㅂ", "ㅅ", "ㄱ"] : ["ㅏ", "ㅜ", "ㅣ", "ㅓ", "ㅡ", "ㅗ"])
    .filter(other => !areBlindLettersConfusable(char, other))
    .map(other => typeIsConsonant(char) ? [other, vowel] : [initial, other])
    .filter(([c, v]) => isFairBlendTarget(c, v) && !areBlendPartsEquivalent(initial, vowel, c, v))
    .map(([c,v]) => makeSyllable(c,v));
}

export function isDayCard(value: unknown): value is DayCard {
  if (!value || typeof value !== "object") return false;
  const c = value as DayCard;
  if (!skills.includes(c.skill) || !examples.get(c.char)?.includes(c.example)) return false;
  return c.skill === "listen" ? distractors(c.char,c.example).includes(c.alternative) : c.alternative === "";
}

export function parseDayHistory(value: unknown): DayHistory {
  const result = emptyDayHistory();
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const char of DAY_JAMO) for (const skill of skills) {
    const key = id(char,skill);
    const row: unknown = (value as Record<string,unknown>)[key];
    if (!row || typeof row !== "object" || (skill === "listen" && noBlindTarget.has(char))) continue;
    const { day, due, stage, example } = row as Entry;
    if (![0,1,2].includes(stage) || !examples.get(char)!.includes(example)) continue;
    try { if (due !== addLocalDays(day,intervals[stage])) continue; } catch { continue; }
    result[key] = {day, due, stage, example};
  }
  return result;
}

function makeCard(char: string, skill: DaySkill, history: DayHistory, day: string): DayCard {
  const old = history[id(char,skill)];
  const variants = examples.get(char)!;
  const example = variants[(variants.indexOf(old?.example ?? "") + 1) % variants.length];
  const options = skill === "listen" ? distractors(char,example) : [];
  const alternative = options.length ? options[(Number(day.slice(-2)) + DAY_JAMO.indexOf(char)) % options.length] : "";
  return {char,skill,example,alternative};
}

/** A short lesson always reserves slots for new reading, even if a learner has
 * many weak letters. A saved legacy check mark changes ordering, not ability. */
export function makeDayCards(day: string, history: DayHistory, legacyMarked: readonly string[]): DayCard[] {
  const deck: DayCard[] = [];
  const last = (char: string, skill: DaySkill) => history[id(char,skill)];
  const take = (char: string, skill: DaySkill) => deck.push(makeCard(char,skill,history,day));
  const candidates = (skill: DaySkill) => DAY_JAMO.filter(char =>
    !(skill === "listen" && noBlindTarget.has(char)) && !deck.some(c => c.char === char && c.skill === skill));
  const due = (skill: DaySkill) => candidates(skill).filter(char => last(char,skill)?.due <= day)
    .sort((a,b) => last(a,skill).stage - last(b,skill).stage || last(a,skill).due.localeCompare(last(b,skill).due));
  const freshRead = () => candidates("read").filter(char => !last(char,"read"))
    .sort((a,b) => Number(legacyMarked.includes(a)) - Number(legacyMarked.includes(b)));
  const weak = skills.flatMap(skill => due(skill).filter(char => last(char,skill).stage === 0).map(char => ({char, skill})))
    .sort((a,b) => last(a.char,a.skill).due.localeCompare(last(b.char,b.skill).due));
  if (weak.length) take(weak[0].char, weak[0].skill);
  else take(due("read")[0] ?? freshRead()[0] ?? DAY_JAMO[0], "read");
  for (let i=0; i<3; i++) {
    const char = (i === 0 ? due("read")[0] : undefined) ?? freshRead()[0] ?? due("read")[0]
      ?? candidates("read").sort((a,b) => last(a,"read").day.localeCompare(last(b,"read").day))[0];
    take(char, "read");
  }
  for (const skill of ["listen", "keys"] as const) {
    const pool = candidates(skill).filter(char => Boolean(last(char,"read")) || deck.some(card => card.char === char && card.skill === "read"));
    const fresh = pool.find(char => !last(char,skill));
    // Alternate a new task with retrieval, so a difficult backlog cannot starve
    // the rest of the keyboard or the first exposure of another letter.
    const priority = Number(day.slice(-2)) % 2 ? fresh : due(skill)[0];
    take(priority ?? fresh ?? due(skill)[0] ?? pool[0] ?? candidates(skill)[0], skill);
  }
  return deck;
}

/** No award for replay/help; a same-day repeat cannot claim cross-day evidence. */
export function recordDayCard(history: DayHistory, card: DayCard, day: string, result: "again"|"good", replayed: boolean): DayHistory {
  if (!isDayCard(card)) return history;
  const key = id(card.char, card.skill);
  const prev = history[key];
  if (prev && prev.day > day) return history;
  let stage: Entry["stage"] = 0;
  if (result === "good" && !replayed) {
    stage = prev && prev.stage > 0 && (prev.stage === 2 || (prev.day < day && (card.skill === "keys" || prev.example !== card.example || examples.get(card.char)!.length === 1))) ? 2 : 1;
  }
  return {...history, [key]:{day,due:addLocalDays(day,intervals[stage]),stage,example:card.example}};
}

export function dayAudioPath(card: DayCard) {
  return "/audio/hangul-natural/s-" + card.example.codePointAt(0)!.toString(16) + ".mp3";
}
export function dayHearingOptions(card: DayCard) {
  const place = (VOWEL_ORDER.indexOf(card.char) + INITIAL_ORDER.indexOf(card.char) + card.example.codePointAt(0)!) % 3;
  return place === 0 ? [card.example,card.alternative] : [card.alternative,card.example];
}
