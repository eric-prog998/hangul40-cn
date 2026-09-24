"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { millisecondsUntilNextLocalMidnight } from "./date-logic";
import { REVIEW_STORAGE_PREFIX, type ReviewRating } from "./review-logic";
import { DailyReviewRepository, type ReviewSnapshot } from "./review-storage";

export function useDailyReview(ids: readonly string[]) {
  const repository = useRef<DailyReviewRepository | null>(null);
  const [state, setState] = useState<ReviewSnapshot>({ records: {}, today: "", storageMessage: "正在读取本地复习清单…" });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const controller = new DailyReviewRepository(ids, () => window.localStorage);
    repository.current = controller;
    let midnight: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      setState(controller.refresh());
      setReady(true);
      if (midnight !== null) clearTimeout(midnight);
      midnight = setTimeout(refresh, millisecondsUntilNextLocalMidnight());
    };
    const initial = window.requestAnimationFrame(refresh);
    const onStorage = (event: StorageEvent) => {
      try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch { return; }
      if (event.key === null || event.key.startsWith(REVIEW_STORAGE_PREFIX)) {
        setState(controller.refresh(event.key === null));
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.cancelAnimationFrame(initial);
      if (midnight !== null) clearTimeout(midnight);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      if (repository.current === controller) repository.current = null;
    };
  }, [ids]);

  const onRate = useCallback((id: string, rating: ReviewRating) => {
    const controller = repository.current;
    if (!controller) return { ok: false, message: "复习清单还未准备好，请稍后再试。" };
    const result = controller.rate(id, rating, state.today);
    setState(controller.snapshot());
    return result;
  }, [state.today]);

  return { ...state, ready, onRate };
}
