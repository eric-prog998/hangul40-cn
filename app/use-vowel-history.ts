"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createVowelAttemptId, mergeVowelHistory, readVowelHistory, VOWEL_HISTORY_PREFIX, writeVowelHistory, type VowelHistoryEntry } from "./vowel-history";
import type { VowelQuestion } from "./vowel-challenge-logic";

export function useVowelHistory() {
  const [records, setRecords] = useState<VowelHistoryEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [storageMessage, setStorageMessage] = useState("正在读取盲听记录…");
  const unsaved = useRef<VowelHistoryEntry[]>([]);
  const latest = useRef<VowelHistoryEntry[]>([]);
  const refresh = useCallback(() => {
    try {
      const loaded = readVowelHistory(window.localStorage);
      latest.current = mergeVowelHistory(loaded.records, unsaved.current);
      setStorageMessage(unsaved.current.length ? "有盲听记录仅本页有效，请导出备份；下次作答会再次尝试保存。" : loaded.invalid ? "部分盲听记录格式异常，已跳过且未覆盖。" : "最近 200 次作答保存在本浏览器，不上传。");
    } catch { setStorageMessage("本地存储暂不可用，盲听记录仅本页有效；请暂勿关闭页面，可在设置中尝试导出备份。"); }
    setRecords(latest.current); setReady(true);
    return latest.current;
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(refresh);
    const onStorage = (event: StorageEvent) => {
      if (event.key === null) { unsaved.current = []; latest.current = []; }
      if (event.key === null || event.key.startsWith(VOWEL_HISTORY_PREFIX)) refresh();
    };
    window.addEventListener("storage", onStorage); window.addEventListener("focus", refresh);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("storage", onStorage); window.removeEventListener("focus", refresh); };
  }, [refresh]);
  const record = useCallback((question: VowelQuestion, choice: 0 | 1) => {
    const entry: VowelHistoryEntry = { id: createVowelAttemptId(), questionId: question.id, choice, at: Date.now() };
    latest.current = mergeVowelHistory(latest.current, [entry]);
    unsaved.current = mergeVowelHistory(unsaved.current, [entry]);
    try { latest.current = writeVowelHistory(window.localStorage, unsaved.current); unsaved.current = []; }
    catch { /* The current page and export keep unsaved answers. */ }
    refresh();
  }, [refresh]);
  return { records, ready, storageMessage, record, refresh };
}
export type VowelHistoryModel = ReturnType<typeof useVowelHistory>;
