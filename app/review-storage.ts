import { localDateKey, parseReviewRecord, rateReview, readReviewRecords, reviewStorageKey, type ReviewRating, type ReviewRecords } from "./review-logic.ts";

export type ReviewStorage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };
export type ReviewSnapshot = { records: ReviewRecords; today: string; storageMessage: string };

/** A separate, per-card store: a self-rating never changes existing mastery or XP. */
export class DailyReviewRepository {
  private records: ReviewRecords = {};
  private unsaved: ReviewRecords = {};
  private message = "复习安排只保存在这个浏览器，不上传；不会改变词卡的“背熟”标记。";
  private readonly ids: Set<string>;
  private readonly catalog: readonly string[];
  private readonly getStorage: () => ReviewStorage;
  private readonly now: () => Date;

  constructor(catalog: readonly string[], getStorage: () => ReviewStorage, now: () => Date = () => new Date()) {
    this.ids = new Set(catalog);
    this.catalog = catalog;
    this.getStorage = getStorage;
    this.now = now;
  }

  snapshot(): ReviewSnapshot {
    return { records: { ...this.records }, today: localDateKey(this.now()), storageMessage: this.message };
  }

  refresh(discardUnsaved = false): ReviewSnapshot {
    if (discardUnsaved) this.unsaved = {};
    try {
      const loaded = readReviewRecords(this.getStorage(), [...this.catalog]);
      this.records = loaded.failed
        ? { ...this.records, ...loaded.records, ...this.unsaved }
        : { ...loaded.records, ...this.unsaved };
      this.message = loaded.failed || Object.keys(this.unsaved).length > 0
        ? "浏览器暂时未能保存全部复习记录；未保存的部分仅本页有效，刷新后可能丢失。"
        : loaded.invalidCount > 0
          ? "部分复习记录格式异常，已跳过且未主动覆盖；其他记录仍保留。重新自评对应词句可重建该项。"
          : "复习安排只保存在这个浏览器，不上传；不会改变词卡的“背熟”标记。";
    } catch {
      this.message = "当前浏览器无法读取本地存储；可以继续练习，但新记录仅本页有效。";
    }
    return this.snapshot();
  }

  rate(id: string, rating: ReviewRating, displayedDay: string) {
    const now = this.now();
    const today = localDateKey(now);
    if (!this.ids.has(id) || !["again", "remembered"].includes(rating)) return { ok: false, message: "这张复习卡已经失效，请刷新后重试。" };
    if (displayedDay !== today) {
      this.refresh();
      return { ok: false, message: "日期已变化，复习清单已更新；请查看当前卡片后再自评。" };
    }

    let storage: ReviewStorage | null = null;
    let previous = this.records[id];
    try {
      storage = this.getStorage();
      const latest = parseReviewRecord(storage.getItem(reviewStorageKey(id)), id);
      if (latest && (!previous || latest.updatedAt >= previous.updatedAt)) previous = latest;
    } catch { storage = null; /* Do not overwrite a record whose current value could not be read. */ }
    if (previous && previous.lastReviewed > today) {
      this.records = { ...this.records, [id]: previous };
      return { ok: false, message: "系统日期早于这项的上次复习日期，原记录已保留。请检查电脑日期后再试。" };
    }
    if (previous?.lastReviewed === today) {
      this.records = { ...this.records, [id]: previous };
      return { ok: false, message: "这项今天已经记录过（可能来自另一个标签页），已更新清单，不重复计数。" };
    }

    const record = rateReview(previous, id, rating, today, now.getTime());
    const serialized = JSON.stringify(record);
    let saved = false;
    try {
      if (storage) {
        storage.setItem(reviewStorageKey(id), serialized);
        saved = storage.getItem(reviewStorageKey(id)) === serialized;
      }
    } catch { /* Keep the user's answer for this visit and state the limitation. */ }
    this.records = { ...this.records, [id]: record };
    if (saved) delete this.unsaved[id];
    else this.unsaved[id] = record;
    this.message = Object.keys(this.unsaved).length
      ? "有复习记录未能保存，仅本页有效；刷新后可能丢失。浏览器允许本地存储后，新自评会再次尝试保存。"
      : "已保存到这个浏览器；不会改变词卡的“背熟”标记，也不会上传。";
    return { ok: true, message: `${rating === "again" ? "已记下：还需再练" : "已记下：这次想起来了"}。下次复习：${record.due}。${saved ? "" : "本次仅本页保留。"}` };
  }
}
