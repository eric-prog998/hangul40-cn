import { emptyDayHistory, isDayCard, makeDayCards, parseDayHistory, recordDayCard, type DayCard, type DayHistory } from "./day-letters.ts";
import { isProgressDateKey } from "./progress-ledger.ts";

export const MY_DAY_KEY = "hangul-my-day-v51";
export type Rating = "again" | "good";
// v51 saved only the latest practice day/result. Keep that shape valid, and
// separately remember when a scene was actually recalled, not just presented.
type Memory = { day: string; result: Rating; lastRecall?: string };
type Mark = { result: Rating; replayed: boolean };
export type DayAnswer = "correct" | "incorrect" | "hint";
export type DayAttempt = { key: string; plays: 0 | 1 | 2; answer: DayAnswer | null };
export type DayAction = "heard" | DayAnswer;
export type Session = {
  day: string; cards: DayCard[]; marks: Mark[]; scene: number; recall: number | null;
  recalled: Rating | null; done: Rating | null; extra: number | null; attempt?: DayAttempt;
};
export type Notebook = { version: 1; history: DayHistory; conversations: (Memory | null)[]; session: Session | null };
export const emptyBook = (): Notebook => ({ version: 1, history: emptyDayHistory(), conversations: [null, null, null], session: null });
const isIndex = (v: unknown): v is 0 | 1 | 2 => v === 0 || v === 1 || v === 2;
const isRating = (v: unknown): v is Rating => v === "again" || v === "good";
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isMark = (v: unknown): v is Mark => object(v) && isRating(v.result) && typeof v.replayed === "boolean";

// Include the session, position and prompt. An old tab or delayed audio
// completion must never attach evidence to the next card.
export function dayAttemptKey(s: Session): string | null {
  const i = s.marks.length, c = s.cards[i];
  return c ? [s.day,i,c.skill,c.char,c.example,c.alternative,c.correctSide ?? ""].join(":") : null;
}

export function noteDayAttempt(book: Notebook, key: string, action: DayAction): Notebook {
  const s = book.session;
  if (!s || dayAttemptKey(s) !== key) return book;
  const old = s.attempt ?? { key, plays: 0, answer: null };
  // The first reveal stands; successful play counts only ever increase.
  if (action === "heard" ? old.plays === 2 : old.answer !== null) return book;
  const attempt: DayAttempt = action === "heard"
    ? { ...old, plays: old.plays === 0 ? 1 : 2 }
    : { ...old, answer: action };
  return { ...book, session: { ...s, attempt } };
}

/** A bad or newer save is never silently replaced. The UI can offer an in-memory lesson. */
export function readBook(raw: string | null): Notebook {
  if (raw === null) return emptyBook();
  if (raw.length > 250_000) throw Error("notebook too large");
  const b: unknown = JSON.parse(raw);
  if (!object(b) || b.version !== 1 || !object(b.history) || !Array.isArray(b.conversations) || b.conversations.length !== 3) throw Error("invalid notebook");
  const conversations = b.conversations.map((m: unknown): Memory | null => {
    if (m === null) return null;
    if (!object(m) || !isProgressDateKey(m.day) || !isRating(m.result)) throw Error("invalid conversation");
    if (m.lastRecall !== undefined && (!isProgressDateKey(m.lastRecall) || m.lastRecall > m.day)) throw Error("invalid recall date");
    return m.lastRecall === undefined ? { day: m.day, result: m.result } : { day: m.day, result: m.result, lastRecall: m.lastRecall };
  });
  const history = parseDayHistory(b.history);
  const s = b.session;
  if (s === null) return { version: 1, history, conversations, session: null };
  if (!object(s) || !isProgressDateKey(s.day) || !Array.isArray(s.cards) || !s.cards.length || s.cards.length > 20 || !s.cards.every(isDayCard)
    || !Array.isArray(s.marks) || s.marks.length > s.cards.length || !s.marks.every(isMark) || !isIndex(s.scene)
    || !(s.recall === null || isIndex(s.recall)) || !(s.extra === null || isIndex(s.extra))
    || !(s.recalled === null || isRating(s.recalled)) || !(s.done === null || isRating(s.done))
    || (s.recalled !== null && s.recall === null) || (s.extra !== null && s.done === null)
    || ((s.done !== null || s.recalled !== null) && s.marks.length !== s.cards.length)
    || (s.done !== null && s.recall !== null && s.recalled === null)) throw Error("invalid lesson");
  const session: Session = { day: s.day, cards: s.cards, marks: s.marks, scene: s.scene, recall: s.recall, recalled: s.recalled, done: s.done, extra: s.extra };
  const a = s.attempt;
  if (a !== undefined) {
    if (!object(a) || typeof a.key !== "string" || a.key !== dayAttemptKey(session) || !isIndex(a.plays)
      || !(a.answer === null || a.answer === "correct" || a.answer === "incorrect" || a.answer === "hint")) throw Error("invalid card attempt");
    session.attempt = {key:a.key,plays:a.plays,answer:a.answer};
  }
  return { version: 1, history, conversations, session };
}
function chooseRecall(book: Notebook, day: string, scene: number): number | null {
  const learned = book.conversations.flatMap((m, index) => m && m.day < day ? [{ m, index }] : []);
  const different = learned.filter(x => x.index !== scene);
  const candidates = different.length ? different : learned;
  // Try every learned scene at least once. After that an "again" becomes due
  // two days earlier than a "good"; an older good recall will still win.
  const due = (m: Memory) => Date.parse(m.lastRecall + "T00:00:00Z") + (m.result === "again" ? 1 : 3) * 86400000;
  candidates.sort((a, b) => {
    if (!!a.m.lastRecall !== !!b.m.lastRecall) return a.m.lastRecall ? 1 : -1;
    const age = a.m.lastRecall && b.m.lastRecall ? due(a.m) - due(b.m) : 0;
    return age || Number(b.m.result === "again") - Number(a.m.result === "again")
      || Number(b.index === book.session?.scene) - Number(a.index === book.session?.scene) || a.index - b.index;
  });
  return candidates[0]?.index ?? null;
}
export function beginDay(book: Notebook, day: string, legacy: readonly string[]): Notebook {
  if (!isProgressDateKey(day) || (book.session && day <= book.session.day)) return book;
  const scene = book.session ? (book.session.scene + 1) % 3 : 0;
  return { ...book, session: { day, cards: makeDayCards(day, book.history, legacy), marks: [], scene, recall: chooseRecall(book, day, scene), recalled: null, done: null, extra: null } };
}
export function currentStep(s: Session) {
  if (s.marks.length < s.cards.length) return "letters" as const;
  if (s.recall !== null && s.recalled === null) return "recall" as const;
  if (s.done === null) return "dialogue" as const;
  return s.extra === null ? "finish" as const : "extra" as const;
}
export function gradeLetter(b: Notebook, result: Rating, replayed: boolean): Notebook {
  const s = b.session;
  if (!s || currentStep(s) !== "letters") return b;
  const card = s.cards[s.marks.length];
  if (s.attempt && result === "good" && card.skill !== "read" && s.attempt.answer !== "correct") return b;
  const repeated = replayed || s.attempt?.plays === 2;
  const session = { ...s, marks: [...s.marks, { result, replayed: repeated }] };
  delete session.attempt;
  return { ...b, history: recordDayCard(b.history, card, s.day, result, repeated), session };
}
export function gradeDialogue(b: Notebook, result: Rating): Notebook {
  const s = b.session;
  if (!s) return b;
  const step = currentStep(s);
  if (step === "letters" || step === "finish") return b;
  const i = step === "recall" ? s.recall! : step === "extra" ? s.extra! : s.scene;
  const conversations = b.conversations.map((m, index) => index !== i ? m
    : { ...m, day: s.day, result, ...(step === "recall" ? { lastRecall: s.day } : {}) });
  return { ...b, conversations, session: step === "recall" ? { ...s, recalled: result } : step === "extra" ? { ...s, extra: null } : { ...s, done: result } };
}
