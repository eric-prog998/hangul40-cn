export type TypingBestRecord = {
  elapsedMs: number;
  accuracy: number;
  cpm: number;
};

function safeCharacters(value: string) {
  return Array.from(value.normalize("NFC"));
}

export function normalizeTypingInput(value: string) {
  return value.normalize("NFC").trim();
}

export function isTypingAnswerCorrect(input: string, target: string) {
  return normalizeTypingInput(input) === normalizeTypingInput(target);
}

export function typingErrorDistance(input: string, target: string) {
  const left = safeCharacters(normalizeTypingInput(input));
  const right = safeCharacters(normalizeTypingInput(target));
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const replaceCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + replaceCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

export function calculateTypingAccuracy(correctCharacters: number, errorCharacters: number) {
  const correct = Number.isSafeInteger(correctCharacters) && correctCharacters > 0 ? correctCharacters : 0;
  const errors = Number.isSafeInteger(errorCharacters) && errorCharacters > 0 ? errorCharacters : 0;
  const total = correct + errors;
  return total === 0 ? 100 : Math.round((correct / total) * 100);
}

export function calculateTypingCpm(correctCharacters: number, elapsedMs: number) {
  if (!Number.isSafeInteger(correctCharacters) || correctCharacters <= 0 || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.round(correctCharacters / (elapsedMs / 60_000));
}

export function formatTypingTime(elapsedMs: number) {
  const safeElapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const totalTenths = Math.floor(safeElapsed / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function isTypingBestRecord(value: unknown): value is TypingBestRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Number.isSafeInteger(record.elapsedMs) && Number(record.elapsedMs) > 0
    && Number.isSafeInteger(record.accuracy) && Number(record.accuracy) >= 0 && Number(record.accuracy) <= 100
    && Number.isSafeInteger(record.cpm) && Number(record.cpm) >= 0;
}

export function parseTypingBestRecords(value: string | null, allowedRouteIds: ReadonlySet<string>) {
  const records: Record<string, TypingBestRecord> = {};
  if (value === null) return records;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return records;
    for (const [routeId, record] of Object.entries(parsed)) {
      if (allowedRouteIds.has(routeId) && isTypingBestRecord(record)) records[routeId] = record;
    }
  } catch {
    // A malformed local best must never block a new run.
  }
  return records;
}

export function chooseTypingBest(current: TypingBestRecord | undefined, candidate: TypingBestRecord) {
  if (!current) return candidate;
  if (candidate.accuracy !== current.accuracy) return candidate.accuracy > current.accuracy ? candidate : current;
  if (candidate.elapsedMs !== current.elapsedMs) return candidate.elapsedMs < current.elapsedMs ? candidate : current;
  return candidate.cpm > current.cpm ? candidate : current;
}

export function mergeTypingBestRecords(...sources: Array<Record<string, TypingBestRecord>>) {
  const merged: Record<string, TypingBestRecord> = {};
  for (const source of sources) {
    for (const [routeId, record] of Object.entries(source)) {
      merged[routeId] = chooseTypingBest(merged[routeId], record);
    }
  }
  return merged;
}

export function typingBestRecordsCover(
  actual: Record<string, TypingBestRecord>,
  expected: Record<string, TypingBestRecord>,
) {
  return Object.entries(expected).every(([routeId, record]) => {
    const stored = actual[routeId];
    return Boolean(stored && chooseTypingBest(stored, record) === stored);
  });
}
