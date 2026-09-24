export const REVIEW_STORAGE_PREFIX = "hangul-daily-review-v1:";

export type ReviewRating = "again" | "remembered";
export type ReviewRecord = {
  id: string;
  stage: 0 | 1 | 2 | 3;
  lastReviewed: string;
  due: string;
  rating: ReviewRating;
  updatedAt: number;
};
export type ReviewRecords = Record<string, ReviewRecord>;

type ReviewStorage = Pick<Storage, "getItem">;
const INTERVAL_DAYS = [1, 1, 3, 7] as const;
const MAX_TIMESTAMP = 253402300799999; // End of year 9999; no unbounded/corrupt timestamps.
const MAX_RECORD_LENGTH = 2048;

function validId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 200 && id.trim() === id && !/[\u0000-\u001f\u007f]/.test(id);
}

function calendarDate(key: unknown): Date | null {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  // setUTCFullYear avoids Date.UTC's special treatment of years 0–99.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function padDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Local calendar days, not UTC dates: a late-night practice counts on the user's day. */
export function localDateKey(date: Date): string {
  if (!Number.isFinite(date.getTime()) || date.getFullYear() < 1 || date.getFullYear() > 9999) throw new RangeError("Invalid local date");
  return padDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Calendar arithmetic avoids 23/25-hour daylight-saving days. */
export function addLocalDays(dateKey: string, days: number): string {
  const date = calendarDate(dateKey);
  if (!date || !Number.isSafeInteger(days)) throw new RangeError("Invalid review date or day count");
  date.setUTCDate(date.getUTCDate() + days);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) throw new RangeError("Review date out of range");
  return padDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMESTAMP;
}

function validatedRecord(value: unknown, id: string): ReviewRecord | null {
  if (!validId(id) || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<ReviewRecord>;
  if (record.id !== id || !Number.isInteger(record.stage) || record.stage! < 0 || record.stage! > 3) return null;
  if (record.rating !== "again" && record.rating !== "remembered") return null;
  if (record.rating === "again" && record.stage !== 0) return null;
  if (!calendarDate(record.lastReviewed) || !calendarDate(record.due) || !validTimestamp(record.updatedAt)) return null;
  const stage = record.stage as ReviewRecord["stage"];
  try {
    if (record.due !== addLocalDays(record.lastReviewed!, INTERVAL_DAYS[stage])) return null;
  } catch { return null; }
  return { id, stage, lastReviewed: record.lastReviewed!, due: record.due!, rating: record.rating, updatedAt: record.updatedAt };
}

/** Future-but-valid dates survive a device clock correction; queue selection excludes them. */
export function parseReviewRecord(raw: string | null, id: string): ReviewRecord | null {
  if (typeof raw !== "string" || raw.length > MAX_RECORD_LENGTH) return null;
  try { return validatedRecord(JSON.parse(raw), id); } catch { return null; }
}

export function reviewStorageKey(id: string): string {
  if (!validId(id)) throw new RangeError("Invalid review id");
  return `${REVIEW_STORAGE_PREFIX}${id}`;
}

/** A simple self-rating schedule, not a pronunciation score or a claim of mastery. */
export function rateReview(previous: ReviewRecord | undefined, id: string, rating: ReviewRating, today: string, now: number): ReviewRecord {
  if (!validId(id) || !calendarDate(today) || !validTimestamp(now) || (rating !== "again" && rating !== "remembered")) throw new RangeError("Invalid review rating input");
  const validPrevious = validatedRecord(previous, id);
  if (validPrevious && validPrevious.lastReviewed > today) throw new RangeError("Device date precedes the previous review");
  const sameDay = validPrevious?.lastReviewed === today;
  const stage: ReviewRecord["stage"] = rating === "again" ? 0
    : sameDay ? validPrevious.stage
      : Math.min(3, (validPrevious?.stage ?? 0) + 1) as ReviewRecord["stage"];
  return { id, stage, lastReviewed: today, due: addLocalDays(today, INTERVAL_DAYS[stage]), rating, updatedAt: now };
}

/** Due items first (oldest due, then catalog order), then unseen items; never repeat today's ratings. */
export function createDailyReviewQueue(ids: string[], records: ReviewRecords, today: string, limit = 10): string[] {
  if (!calendarDate(today) || !Number.isFinite(limit) || limit <= 0) return [];
  const count = Math.floor(limit);
  if (count === 0) return [];
  const seen = new Set<string>();
  const due: Array<{ id: string; due: string; index: number }> = [];
  const unseen: string[] = [];
  ids.forEach((id, index) => {
    if (!validId(id) || seen.has(id)) return;
    seen.add(id);
    const raw = Object.prototype.hasOwnProperty.call(records, id) ? records[id] : undefined;
    const record = validatedRecord(raw, id);
    if (!record) unseen.push(id);
    else if (record.lastReviewed < today && record.due <= today) due.push({ id, due: record.due, index });
  });
  due.sort((a, b) => a.due.localeCompare(b.due) || a.index - b.index);
  return [...due.map((record) => record.id), ...unseen].slice(0, count);
}

/** Each item has its own key; one malformed/blocked read never erases another item's progress. */
export function readReviewRecords(storage: ReviewStorage, ids: string[]): { records: ReviewRecords; failed: boolean; invalidCount: number } {
  const records: ReviewRecords = Object.create(null);
  let failed = false;
  let invalidCount = 0;
  for (const id of new Set(ids)) {
    if (!validId(id)) { invalidCount++; continue; }
    try {
      const raw = storage.getItem(reviewStorageKey(id));
      if (raw === null) continue;
      const record = parseReviewRecord(raw, id);
      if (record) records[id] = record;
      else invalidCount++;
    } catch { failed = true; }
  }
  return { records, failed, invalidCount };
}
