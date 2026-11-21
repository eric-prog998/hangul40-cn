import { emptyDayHistory, isDayCard, makeDayCards, parseDayHistory, recordDayCard, type DayCard, type DayHistory } from "./day-letters.ts";
import { isProgressDateKey } from "./progress-ledger.ts";

export const MY_DAY_KEY = "hangul-my-day-v51";
export type Rating = "again" | "good";
type Memory = { day: string; result: Rating };
type Mark = { result: Rating; replayed: boolean };
export type Session = {
  day: string; cards: DayCard[]; marks: Mark[]; scene: number; recall: number | null;
  recalled: Rating | null; done: Rating | null; extra: number | null;
};
export type Notebook = { version: 1; history: DayHistory; conversations: (Memory | null)[]; session: Session | null };
export const emptyBook = (): Notebook => ({ version: 1, history: emptyDayHistory(), conversations: [null, null, null], session: null });
const isIndex = (v: unknown): v is number => v === 0 || v === 1 || v === 2;
const isRating = (v: unknown): v is Rating => v === "again" || v === "good";
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isMark = (v: unknown): v is Mark => object(v) && isRating(v.result) && typeof v.replayed === "boolean";

/** A bad or newer save is never silently replaced. The UI can offer an in-memory lesson. */
export function readBook(raw: string | null): Notebook {
  if (raw === null) return emptyBook();
  if (raw.length > 250_000) throw Error("notebook too large");
  const b: unknown = JSON.parse(raw);
  if (!object(b) || b.version !== 1 || !object(b.history) || !Array.isArray(b.conversations) || b.conversations.length !== 3) throw Error("invalid notebook");
  const conversations = b.conversations.map((m: unknown): Memory | null => {
    if (m === null) return null;
    if (!object(m) || !isProgressDateKey(m.day) || !isRating(m.result)) throw Error("invalid conversation");
    return { day: m.day, result: m.result };
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
  return { version: 1, history, conversations, session: { day: s.day, cards: s.cards, marks: s.marks, scene: s.scene, recall: s.recall, recalled: s.recalled, done: s.done, extra: s.extra } };
}
export function beginDay(book: Notebook, day: string, legacy: readonly string[]): Notebook {
  if (!isProgressDateKey(day) || book.session?.day === day) return book;
  const prior = book.conversations.map((m, index) => ({ m, index })).filter(x => x.m && x.m.day < day);
  // Choose one earlier conversation for retrieval; for ties, prefer the one needing work.
  prior.sort((a, b) => Number(b.m!.result === "again") - Number(a.m!.result === "again") || b.m!.day.localeCompare(a.m!.day));
  const scene = book.session ? (book.session.scene + 1) % 3 : 0;
  return { ...book, session: { day, cards: makeDayCards(day, book.history, legacy), marks: [], scene, recall: prior[0]?.index ?? null, recalled: null, done: null, extra: null } };
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
  return { ...b, history: recordDayCard(b.history, card, s.day, result, replayed), session: { ...s, marks: [...s.marks, { result, replayed }] } };
}
export function gradeDialogue(b: Notebook, result: Rating): Notebook {
  const s = b.session;
  if (!s) return b;
  const step = currentStep(s);
  if (step === "letters" || step === "finish") return b;
  const i = step === "recall" ? s.recall! : step === "extra" ? s.extra! : s.scene;
  const conversations = b.conversations.map((m, index) => index === i ? { day: s.day, result } : m);
  return { ...b, conversations, session: step === "recall" ? { ...s, recalled: result } : step === "extra" ? { ...s, extra: null } : { ...s, done: result } };
}
