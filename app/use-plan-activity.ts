"use client";

import { useCallback, useEffect, useState } from "react";

/** The two route steps that open an existing learning section in a shorter form. */
export type PlanActivity = "review" | "listening";

/** The section each route step opens. */
export const PLAN_ACTIVITY_SECTIONS: Record<PlanActivity, string> = {
  review: "daily-review",
  listening: "pronunciation-practice",
};

/**
 * Whether a click means the learner has moved on from the section a route step opened.
 * Clicks inside that section keep the short form, and so do dialogs shown over it (the
 * shortcut help and the button that opens it). Anything else leaves: the navigation bar,
 * another section, and the route card itself, whose buttons then open the step they name.
 */
export function clickLeavesPlanActivity(target: EventTarget | null, activity: PlanActivity) {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!element) return false;
  if (element.ownerDocument.querySelector('[aria-modal="true"]')) return false;
  return !element.closest(`#${PLAN_ACTIVITY_SECTIONS[activity]}, [role="dialog"], [aria-haspopup="dialog"]`);
}

/**
 * Which route step, if any, opened daily review or blind listening. This is a temporary
 * mode, not a page setting: a click anywhere else ends it, so the next visit to the same
 * section — by scrolling, a link or a shortcut — shows the regular form (up to 10 reviews,
 * no "return to route" bar). Keyboard jumps to other sections call `end` themselves.
 */
export function usePlanActivity() {
  const [activity, setActivity] = useState<PlanActivity | null>(null);
  const start = useCallback((next: PlanActivity) => setActivity(next), []);
  const end = useCallback(() => setActivity(null), []);

  useEffect(() => {
    if (!activity) return;
    // Capturing on window runs before the page's own click handlers, so a route button
    // can end the current step and open the one it names within the same click.
    // Script-made clicks (e.g. starting a file download) are not the learner moving on.
    const leave = (event: MouseEvent) => {
      if (event.isTrusted && clickLeavesPlanActivity(event.target, activity)) setActivity(null);
    };
    window.addEventListener("click", leave, true);
    return () => window.removeEventListener("click", leave, true);
  }, [activity]);

  return { activity, start, end };
}
