import { addLocalDays, createDailyReviewQueue, localDateKey, parseReviewRecord, type ReviewRecords } from "./review-logic.ts";
import { mergeVowelHistory, parseVowelHistoryEntry, pendingVowelQuestions, type VowelHistoryEntry } from "./vowel-history.ts";

export const DAILY_PLAN_REVIEW_TARGET = 5;
export const DAILY_PLAN_LISTEN_TARGET = 8;

/** A read-only view of existing records: opening a panel never earns completion. */
export function dailyPlanSummary(ids: readonly string[], records: ReviewRecords, history: readonly VowelHistoryEntry[], today: string) {
  try { addLocalDays(today, 0); } catch { return null; }
  const catalog = [...new Set(ids)];
  const valid: ReviewRecords = Object.create(null);
  for (const id of catalog) {
    if (!Object.hasOwn(records, id)) continue;
    const record = parseReviewRecord(JSON.stringify(records[id]), id);
    if (record) valid[id] = record;
  }
  const reviewed = catalog.filter(id => valid[id]?.lastReviewed === today).length;
  const available = createDailyReviewQueue(catalog, valid, today, catalog.length);
  const reviewTarget = Math.min(DAILY_PLAN_REVIEW_TARGET, reviewed + available.length);
  const due = available.filter(id => valid[id]).length;
  const nextDue = Object.values(valid).map(record => record.due).filter(day => day > today).sort()[0] ?? null;
  const safeHistory = mergeVowelHistory(history.map(parseVowelHistoryEntry).filter((entry): entry is VowelHistoryEntry => entry !== null));
  const attempts = safeHistory.filter(entry => {
    try { return localDateKey(new Date(entry.at)) === today; } catch { return false; }
  }).length;
  const pending = pendingVowelQuestions(safeHistory).length;
  const reviewComplete = reviewed >= reviewTarget;
  const listeningComplete = attempts >= DAILY_PLAN_LISTEN_TARGET;
  return {
    today,
    review: { reviewed, target: reviewTarget, remaining: Math.max(0, reviewTarget - reviewed), due, nextDue, complete: reviewComplete },
    listening: { attempts, target: DAILY_PLAN_LISTEN_TARGET, pending, complete: listeningComplete },
    complete: reviewComplete && listeningComplete,
    completedGoals: Number(reviewComplete) + Number(listeningComplete),
  };
}

export type DailyPlanSummary = NonNullable<ReturnType<typeof dailyPlanSummary>>;
