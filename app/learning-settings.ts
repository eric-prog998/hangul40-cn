export const AUTO_ADVANCE_KEY = "hangul-auto-advance-v41";
export const AUTO_ADVANCE_OPTIONS = [0, 2000, 3000, 5000] as const;
export type AutoAdvanceDelay = typeof AUTO_ADVANCE_OPTIONS[number];
export function validAutoAdvance(value: unknown): value is AutoAdvanceDelay {
  return typeof value === "number" && AUTO_ADVANCE_OPTIONS.includes(value as AutoAdvanceDelay);
}
export function parseAutoAdvance(raw: string | null): AutoAdvanceDelay {
  if (raw === null) return 3000;
  const value = Number(raw);
  return raw.trim() !== "" && validAutoAdvance(value) ? value : 3000;
}
