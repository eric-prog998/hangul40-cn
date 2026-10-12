import { makeVowelQuestions, type VowelQuestion } from "./vowel-challenge-logic.ts";

export const VOWEL_HISTORY_PREFIX = "hangul-vowel-attempt-v41:";
export const VOWEL_HISTORY_LIMIT = 200;
export type VowelHistoryEntry = { id: string; questionId: string; choice: 0 | 1; at: number };
export type HistoryStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;
const questions = makeVowelQuestions(() => 0.5);
const questionMap = new Map(questions.map(question => [question.id, question]));

export function parseVowelHistoryEntry(value: unknown): VowelHistoryEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "at,choice,id,questionId"
    || typeof record.id !== "string" || !/^[a-z0-9-]{16,80}$/.test(record.id)
    || typeof record.questionId !== "string" || !questionMap.has(record.questionId)
    || (record.choice !== 0 && record.choice !== 1)
    || !Number.isSafeInteger(record.at) || Number(record.at) < 0 || Number(record.at) > 253402300799999) return null;
  return { id: record.id, questionId: record.questionId, choice: record.choice, at: Number(record.at) };
}

/**
 * A new attempt id. Older browsers have no crypto.randomUUID; the fallback
 * still satisfies the id format checked by parseVowelHistoryEntry.
 */
export function createVowelAttemptId(
  source: { randomUUID?: () => string } | null = globalThis.crypto ?? null,
  random: () => number = Math.random,
  now: () => number = Date.now,
) {
  const uuid = typeof source?.randomUUID === "function" ? source.randomUUID().toLowerCase() : "";
  if (/^[a-z0-9-]{16,80}$/.test(uuid)) return uuid;
  const part = () => Math.floor(random() * 36 ** 8).toString(36).padStart(8, "0");
  return `attempt-${now().toString(36)}-${part()}-${part()}`;
}

export function mergeVowelHistory(...sources: readonly VowelHistoryEntry[][]): VowelHistoryEntry[] {
  const records = new Map<string, VowelHistoryEntry>();
  // Existing entries win an ID conflict: importing cannot rewrite an answer.
  for (const source of sources) for (const entry of source) if (!records.has(entry.id)) records.set(entry.id, entry);
  return [...records.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).slice(-VOWEL_HISTORY_LIMIT);
}

export function readVowelHistory(storage: HistoryStorage) {
  const entries: VowelHistoryEntry[] = [];
  let invalid = false;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(VOWEL_HISTORY_PREFIX)) continue;
    try {
      const record = parseVowelHistoryEntry(JSON.parse(storage.getItem(key) ?? "null"));
      if (record && key === VOWEL_HISTORY_PREFIX + record.id) entries.push(record); else invalid = true;
    } catch { invalid = true; }
  }
  return { records: mergeVowelHistory(entries), invalid };
}

export function writeVowelHistory(storage: HistoryStorage, incoming: readonly VowelHistoryEntry[]) {
  const current = readVowelHistory(storage).records;
  const records = mergeVowelHistory(current, [...incoming]);
  for (const entry of records) {
    const key = VOWEL_HISTORY_PREFIX + entry.id;
    const existing = storage.getItem(key);
    if (existing !== null) {
      let parsed: VowelHistoryEntry | null = null;
      try { parsed = parseVowelHistoryEntry(JSON.parse(existing)); } catch { /* Preserve corrupt data for diagnosis. */ }
      if (!parsed || parsed.id !== entry.id) throw new Error("存在不可读取的盲听记录，未覆盖；请保留备份。");
      continue;
    }
    const raw = JSON.stringify(entry);
    storage.setItem(key, raw);
    if (storage.getItem(key) !== raw) throw new Error("盲听记录未能保存，请保留备份后重试。");
  }
  // Prune only valid older entries after every new write has succeeded.
  const all = readVowelHistory(storage).records;
  const oldest = all[0];
  if (all.length === VOWEL_HISTORY_LIMIT && oldest) {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(VOWEL_HISTORY_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      try {
        const entry = parseVowelHistoryEntry(JSON.parse(storage.getItem(key) ?? "null"));
        if (entry && (entry.at < oldest.at || (entry.at === oldest.at && entry.id.localeCompare(oldest.id) < 0))) storage.removeItem(key);
      } catch { /* Cleanup is optional; never discard a record that cannot be read. */ }
    }
  }
  return readVowelHistory(storage).records;
}

export function pendingVowelQuestions(entries: readonly VowelHistoryEntry[]): VowelQuestion[] {
  const state = new Map<string, { wrong: boolean; streak: number }>();
  for (const entry of mergeVowelHistory([...entries])) {
    const question = questionMap.get(entry.questionId)!;
    const previous = state.get(entry.questionId) ?? { wrong: false, streak: 0 };
    const correct = entry.choice === question.answer;
    const streak = correct ? previous.streak + 1 : 0;
    state.set(entry.questionId, { wrong: !correct || (previous.wrong && streak < 2), streak });
  }
  return questions.filter(question => state.get(question.id)?.wrong);
}

export function recentVowelResults(entries: readonly VowelHistoryEntry[]) {
  const recent = mergeVowelHistory([...entries]).slice(-20);
  return { total: recent.length, correct: recent.filter(entry => questionMap.get(entry.questionId)?.answer === entry.choice).length };
}
