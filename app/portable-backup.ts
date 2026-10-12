import { mergeLegacyProgressStatsHighWater, parseProgressEpochBaseline, type ProgressSnapshot, type ProgressValidation } from "./progress-ledger.ts";
import { localDateKey, parseReviewRecord, type ReviewRecords } from "./review-logic.ts";
import { parseTypingBestRecords, type TypingBestRecord } from "./typing-logic.ts";
import { mergeVowelHistory, parseVowelHistoryEntry, VOWEL_HISTORY_LIMIT, type VowelHistoryEntry } from "./vowel-history.ts";
import { validAutoAdvance, type AutoAdvanceDelay } from "./learning-settings.ts";

export const BACKUP_MAX_BYTES = 2_000_000;
export type BackupPreferences = { autoAdvanceMs: AutoAdvanceDelay; audioSpeed: 1 | 0.82; showRomanization: boolean; keyboardMode: "hangul" | "shortcuts"; beginnerBlendCompleted: boolean; fullReviewCompleted: boolean };
export type PortableBackup = {
  format: "hangul40-progress"; version: 1; createdAt: string;
  progress: ProgressSnapshot; reviews: ReviewRecords; typing: Record<string, TypingBestRecord>;
  vowelHistory: VowelHistoryEntry[]; preferences: BackupPreferences;
};
type Validation = ProgressValidation & { allowedRouteIds: ReadonlySet<string> };
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function fail(): never { throw new Error("备份格式不完整或含有无效记录；未导入任何内容。请选择本网站导出的 JSON 备份。"); }

export function parsePortableBackup(text: string, validation: Validation): PortableBackup {
  if (new TextEncoder().encode(text).byteLength > BACKUP_MAX_BYTES) throw new Error("备份超过 2 MB，无法导入。");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("这不是有效的 JSON 备份文件；原进度未改变。"); }
  if (!object(value) || value.format !== "hangul40-progress" || value.version !== 1) throw new Error("不是本网站支持的进度备份版本；原进度未改变。");
  if (Object.keys(value).sort().join(",") !== "createdAt,format,preferences,progress,reviews,typing,version,vowelHistory") fail();
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) || new Date(value.createdAt).toISOString() !== value.createdAt) fail();
  const baseline = parseProgressEpochBaseline(JSON.stringify({ version: 1, snapshot: value.progress }), validation);
  if (!baseline || !object(value.reviews) || !object(value.typing) || !Array.isArray(value.vowelHistory) || !object(value.preferences)) fail();
  const reviews: ReviewRecords = {};
  for (const [id, raw] of Object.entries(value.reviews)) {
    if (!validation.allowedPhraseIds.has(id)) fail();
    const entry = parseReviewRecord(JSON.stringify(raw), id);
    if (!entry) fail(); reviews[id] = entry;
  }
  const typing = parseTypingBestRecords(JSON.stringify(value.typing), validation.allowedRouteIds);
  if (Object.keys(typing).length !== Object.keys(value.typing).length) fail();
  for (const entry of Object.values(value.typing)) if (!object(entry) || Object.keys(entry).sort().join(",") !== "accuracy,cpm,elapsedMs") fail();
  const vowelHistory = value.vowelHistory.map(parseVowelHistoryEntry);
  if (vowelHistory.length > VOWEL_HISTORY_LIMIT || vowelHistory.some(entry => !entry)) fail();
  if (new Set(vowelHistory.map(entry => entry!.id)).size !== vowelHistory.length) fail();
  const p = value.preferences;
  if (Object.keys(p).sort().join(",") !== "audioSpeed,autoAdvanceMs,beginnerBlendCompleted,fullReviewCompleted,keyboardMode,showRomanization"
    || !validAutoAdvance(p.autoAdvanceMs) || (p.audioSpeed !== 1 && p.audioSpeed !== 0.82)
    || typeof p.showRomanization !== "boolean" || typeof p.beginnerBlendCompleted !== "boolean" || typeof p.fullReviewCompleted !== "boolean"
    || (p.keyboardMode !== "hangul" && p.keyboardMode !== "shortcuts")) fail();
  return { format: "hangul40-progress", version: 1, createdAt: value.createdAt, progress: baseline.snapshot, reviews, typing, vowelHistory: mergeVowelHistory(vowelHistory as VowelHistoryEntry[]), preferences: { autoAdvanceMs: p.autoAdvanceMs, audioSpeed: p.audioSpeed, showRomanization: p.showRomanization, keyboardMode: p.keyboardMode, beginnerBlendCompleted: p.beginnerBlendCompleted, fullReviewCompleted: p.fullReviewCompleted } };
}

/** Named after the learner's local calendar day; `createdAt` itself stays an exact UTC timestamp. */
export function backupFileName(createdAt: string) {
  return `hangul40-progress-${localDateKey(new Date(createdAt))}.json`;
}

export function mergePortableProgress(current: ProgressSnapshot, incoming: ProgressSnapshot, today: string): ProgressSnapshot {
  return { stats: mergeLegacyProgressStatsHighWater(current.stats, incoming.stats, today), mastered: [...new Set([...current.mastered, ...incoming.mastered])], masteredPhrases: [...new Set([...current.masteredPhrases, ...incoming.masteredPhrases])] };
}

export function newerReviewRecords(current: ReviewRecords, incoming: ReviewRecords): ReviewRecords {
  const result = { ...current };
  for (const [id, record] of Object.entries(incoming)) if (!result[id] || record.updatedAt > result[id].updatedAt) result[id] = record;
  return result;
}
