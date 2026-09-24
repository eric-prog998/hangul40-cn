export const PROGRESS_LEDGER_VERSION = 1 as const;
export const PROGRESS_LEDGER_KEY_PREFIX = "hangul-progress-ledger-v19:";
export const PROGRESS_LEDGER_SEAL_KEY_PREFIX = "hangul-progress-ledger-seal-v19:";
export const PROGRESS_CHECKPOINT_KEY = "hangul-progress-checkpoint-v19";
export const PROGRESS_CHECKPOINT_BACKUP_KEY = "hangul-progress-checkpoint-backup-v21";
export const PROGRESS_SESSION_LEDGER_ID_KEY = "hangul-progress-session-ledger-v19";
export const LEGACY_MASTERY_SNAPSHOT_KEY = "hangul-legacy-mastery-snapshot-v19";
export const PROGRESS_EPOCH_META_KEY = "hangul-progress-epoch-meta-v31";
export const PROGRESS_EPOCH_LOCK_NAME = "hangul-progress-epoch-v31:init";
export const PROGRESS_EPOCH_NAMESPACE_PREFIX = "hangul-progress-v31:";
export const PROGRESS_EPOCH_BASELINE_VERSION = 1 as const;
export const PROGRESS_CHECKPOINT_VERSION = 1 as const;
export const MAX_PROGRESS_CLOCK_DIGITS = 256;

export type ProgressCountMap = Record<string, number>;
export type ProgressClock = string;
type ProgressClockInput = ProgressClock | number;

export type ProgressStats = {
  date: string;
  dailyXp: number;
  totalXp: number;
  bestCombo: number;
  games: number;
  mistakes: ProgressCountMap;
  phraseMistakes: ProgressCountMap;
  history: ProgressCountMap;
};

export type ProgressSnapshot = {
  stats: ProgressStats;
  mastered: string[];
  masteredPhrases: string[];
};

/**
 * Every field is monotonic. `bestCombo` is a candidate value and is merged
 * with max; the other fields are additions to the immutable legacy baseline.
 * `dailyXp` is deliberately absent because it is derived from history[today].
 */
export type ProgressStatsDelta = {
  totalXp: number;
  bestCombo: number;
  games: number;
  mistakes: ProgressCountMap;
  phraseMistakes: ProgressCountMap;
  history: ProgressCountMap;
};

export type MasteryLedgerWrite = {
  value: boolean;
  clock: ProgressClock;
};

export type ProgressLedger = {
  version: typeof PROGRESS_LEDGER_VERSION;
  ledgerId: string;
  clock: ProgressClock;
  stats: ProgressStatsDelta;
  mastered: Record<string, MasteryLedgerWrite>;
  masteredPhrases: Record<string, MasteryLedgerWrite>;
};

export type CheckpointMasteryWrite = MasteryLedgerWrite & {
  ledgerId: string;
};

/**
 * A checkpoint contains only ledgers that were explicitly sealed by a
 * terminal pagehide. `included` is a short-lived crash-safety tombstone: a
 * ledger is ignored while its key is being removed, then the entry is pruned
 * once absence has been verified.
 */
export type ProgressCheckpoint = {
  version: typeof PROGRESS_CHECKPOINT_VERSION;
  clock: ProgressClock;
  stats: ProgressStatsDelta;
  mastered: Record<string, CheckpointMasteryWrite>;
  masteredPhrases: Record<string, CheckpointMasteryWrite>;
  included: Record<string, ProgressClock>;
};

export type ProgressLedgerSeal = {
  version: 1;
  ledgerId: string;
  clock: ProgressClock;
  sealedAt: number;
};

export type ProgressEpochMeta = {
  version: 1;
  epoch: string;
  state: "migrating" | "ready";
  source: "legacy" | "empty";
};

export type ProgressEpochBaseline = {
  version: typeof PROGRESS_EPOCH_BASELINE_VERSION;
  snapshot: ProgressSnapshot;
};

export type LegacyMasterySnapshot = {
  version: 1;
  mastered: string[];
  masteredPhrases: string[];
};

export type ProgressValidation = {
  allowedLetters: ReadonlySet<string>;
  allowedPhraseIds: ReadonlySet<string>;
};

export type LegacyProgressJson = {
  stats: string | null;
  mastered: string | null;
  masteredPhrases: string | null;
};

export type ProgressLedgerOperation =
  | { kind: "stats"; delta: ProgressStatsDelta }
  | { kind: "mastered"; key: string; value: boolean }
  | { kind: "masteredPhrase"; key: string; value: boolean };

export type MasteryWriteOrder = {
  clock: ProgressClock;
  ledgerId: string;
};

type UnknownRecord = Record<string, unknown>;

const ledgerIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
const progressEpochMetaFields = ["epoch", "source", "state", "version"];
const progressEpochBaselineFields = ["snapshot", "version"];
const progressSnapshotFields = ["mastered", "masteredPhrases", "stats"];
const ledgerFields = ["clock", "ledgerId", "mastered", "masteredPhrases", "stats", "version"];
const deltaFields = ["bestCombo", "games", "history", "mistakes", "phraseMistakes", "totalXp"];
const legacyStatsRequiredFields = ["bestCombo", "dailyXp", "date", "games", "mistakes", "totalXp"];
const legacyStatsFields = [...legacyStatsRequiredFields, "history", "phraseMistakes"];
const legacyStatsFieldSet = new Set(legacyStatsFields);
const masteryWriteFields = ["clock", "value"];
const checkpointFields = ["clock", "included", "mastered", "masteredPhrases", "stats", "version"];
const checkpointMasteryWriteFields = ["clock", "ledgerId", "value"];
const ledgerSealFields = ["clock", "ledgerId", "sealedAt", "version"];
const legacyMasterySnapshotFields = ["mastered", "masteredPhrases", "version"];

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactFields(value: UnknownRecord, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((field, index) => field === expected[index]);
}

function isSafeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseProgressClockValue(value: unknown): ProgressClock | null {
  if (isSafeCount(value)) return String(value);
  if (typeof value !== "string"
    || value.length > MAX_PROGRESS_CLOCK_DIGITS
    || !/^(?:0|[1-9]\d*)$/.test(value)) return null;
  return value;
}

function parsePositiveClock(value: unknown): ProgressClock | null {
  const clock = parseProgressClockValue(value);
  return clock !== null && clock !== "0" ? clock : null;
}

export function compareProgressClocks(left: ProgressClock, right: ProgressClock) {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  return left === right ? 0 : left < right ? -1 : 1;
}

function incrementProgressClock(clock: ProgressClock): ProgressClock {
  const digits = clock.split("");
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    if (digits[index] !== "9") {
      digits[index] = String(Number(digits[index]) + 1);
      return digits.join("");
    }
    digits[index] = "0";
  }
  const extended = `1${digits.join("")}`;
  if (extended.length > MAX_PROGRESS_CLOCK_DIGITS) throw new RangeError("Progress clock digit limit reached");
  return extended;
}

export function isProgressDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^([1-9]\d{3})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= lastDay;
}

export function isProgressLedgerId(value: unknown): value is string {
  return typeof value === "string" && ledgerIdPattern.test(value);
}

export function isProgressEpochId(value: unknown): value is string {
  return typeof value === "string" && ledgerIdPattern.test(value);
}

export function parseProgressEpochMeta(raw: string | null): ProgressEpochMeta | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isPlainRecord(value)
      || !hasExactFields(value, progressEpochMetaFields)
      || value.version !== 1
      || !isProgressEpochId(value.epoch)
      || (value.state !== "migrating" && value.state !== "ready")
      || (value.source !== "legacy" && value.source !== "empty")) return null;
    return { version: 1, epoch: value.epoch, state: value.state, source: value.source };
  } catch {
    return null;
  }
}

export function serializeProgressEpochMeta(meta: ProgressEpochMeta) {
  if (!isProgressEpochId(meta.epoch)
    || (meta.state !== "migrating" && meta.state !== "ready")
    || (meta.source !== "legacy" && meta.source !== "empty")) {
    throw new TypeError("Invalid progress epoch metadata");
  }
  return JSON.stringify({ version: 1, epoch: meta.epoch, state: meta.state, source: meta.source });
}

/**
 * An active document may only advance the metadata it has already accepted.
 * A different empty epoch is valid only after an explicit site-data clear has
 * authorised a reset; otherwise accepting it could resurrect an older scoped
 * progress snapshot.
 */
export function isProgressEpochMetaTransitionAllowed(
  accepted: ProgressEpochMeta | null,
  candidate: ProgressEpochMeta,
  freshEpochAuthorized = false,
) {
  if (!accepted) return true;
  if (accepted.epoch !== candidate.epoch) {
    return freshEpochAuthorized && candidate.source === "empty";
  }
  if (accepted.source !== candidate.source) return false;
  if (accepted.state === candidate.state) return true;
  return accepted.state === "migrating" && candidate.state === "ready";
}

export function parseProgressEpochBaseline(
  raw: string | null,
  validation: ProgressValidation,
): ProgressEpochBaseline | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isPlainRecord(value)
      || !hasExactFields(value, progressEpochBaselineFields)
      || value.version !== PROGRESS_EPOCH_BASELINE_VERSION
      || !isPlainRecord(value.snapshot)
      || !hasExactFields(value.snapshot, progressSnapshotFields)) return null;
    const statsRaw = JSON.stringify(value.snapshot.stats);
    const masteredRaw = JSON.stringify(value.snapshot.mastered);
    const masteredPhrasesRaw = JSON.stringify(value.snapshot.masteredPhrases);
    if (statsRaw === undefined || masteredRaw === undefined || masteredPhrasesRaw === undefined) return null;
    const stats = parseLegacyProgressStats(statsRaw, validation);
    const mastered = parseLegacyMasteryList(masteredRaw, validation.allowedLetters);
    const masteredPhrases = parseLegacyMasteryList(masteredPhrasesRaw, validation.allowedPhraseIds, true);
    if (!stats || !mastered || !masteredPhrases) return null;
    return {
      version: PROGRESS_EPOCH_BASELINE_VERSION,
      snapshot: { stats, mastered, masteredPhrases },
    };
  } catch {
    return null;
  }
}

export function serializeProgressEpochBaseline(baseline: ProgressEpochBaseline) {
  if (baseline.version !== PROGRESS_EPOCH_BASELINE_VERSION) {
    throw new TypeError("Invalid progress epoch baseline");
  }
  return JSON.stringify({ version: PROGRESS_EPOCH_BASELINE_VERSION, snapshot: baseline.snapshot });
}

function progressEpochNamespace(epoch: string) {
  if (!isProgressEpochId(epoch)) throw new TypeError("Invalid progress epoch id");
  return `${PROGRESS_EPOCH_NAMESPACE_PREFIX}${epoch}:`;
}

export function progressEpochLedgerKey(epoch: string, ledgerId: string) {
  if (!isProgressLedgerId(ledgerId)) throw new TypeError("Invalid progress ledger id");
  return `${progressEpochNamespace(epoch)}ledger:${ledgerId}`;
}

export function progressEpochLedgerIdFromKey(key: string, epoch: string) {
  const prefix = `${progressEpochNamespace(epoch)}ledger:`;
  if (!key.startsWith(prefix)) return null;
  const ledgerId = key.slice(prefix.length);
  return isProgressLedgerId(ledgerId) ? ledgerId : null;
}

export function progressEpochLedgerSealKey(epoch: string, ledgerId: string) {
  if (!isProgressLedgerId(ledgerId)) throw new TypeError("Invalid progress ledger id");
  return `${progressEpochNamespace(epoch)}seal:${ledgerId}`;
}

export function progressEpochLedgerIdFromSealKey(key: string, epoch: string) {
  const prefix = `${progressEpochNamespace(epoch)}seal:`;
  if (!key.startsWith(prefix)) return null;
  const ledgerId = key.slice(prefix.length);
  return isProgressLedgerId(ledgerId) ? ledgerId : null;
}

export function progressEpochCheckpointKey(epoch: string) {
  return `${progressEpochNamespace(epoch)}checkpoint`;
}

export function progressEpochCheckpointBackupKey(epoch: string) {
  return `${progressEpochNamespace(epoch)}checkpoint-backup`;
}

export function progressEpochRollbackGuardKey(epoch: string) {
  return `${progressEpochNamespace(epoch)}rollback-guard`;
}

export function progressEpochLegacyMasterySnapshotKey(epoch: string) {
  return `${progressEpochNamespace(epoch)}legacy-mastery-snapshot`;
}

export function progressEpochBaselineKey(epoch: string) {
  return `${progressEpochNamespace(epoch)}baseline`;
}

export function progressEpochBaselineBackupKey(epoch: string) {
  return `${progressEpochNamespace(epoch)}baseline-backup`;
}

export function progressLedgerKey(ledgerId: string) {
  if (!isProgressLedgerId(ledgerId)) throw new TypeError("Invalid progress ledger id");
  return `${PROGRESS_LEDGER_KEY_PREFIX}${ledgerId}`;
}

export function progressLedgerIdFromKey(key: string) {
  if (!key.startsWith(PROGRESS_LEDGER_KEY_PREFIX)) return null;
  const ledgerId = key.slice(PROGRESS_LEDGER_KEY_PREFIX.length);
  return isProgressLedgerId(ledgerId) ? ledgerId : null;
}

export function progressLedgerSealKey(ledgerId: string) {
  if (!isProgressLedgerId(ledgerId)) throw new TypeError("Invalid progress ledger id");
  return `${PROGRESS_LEDGER_SEAL_KEY_PREFIX}${ledgerId}`;
}

export function progressLedgerIdFromSealKey(key: string) {
  if (!key.startsWith(PROGRESS_LEDGER_SEAL_KEY_PREFIX)) return null;
  const ledgerId = key.slice(PROGRESS_LEDGER_SEAL_KEY_PREFIX.length);
  return isProgressLedgerId(ledgerId) ? ledgerId : null;
}

function parseCountMap(value: unknown, keyAllowed: (key: string) => boolean, filterUnknown = false) {
  if (!isPlainRecord(value)) return null;
  const parsed: ProgressCountMap = {};
  for (const [key, count] of Object.entries(value)) {
    if (!keyAllowed(key)) {
      if (filterUnknown) continue;
      return null;
    }
    if (!isSafeCount(count)) return null;
    parsed[key] = count;
  }
  return parsed;
}

function parseStatsDeltaValue(value: unknown, validation: ProgressValidation): ProgressStatsDelta | null {
  if (!isPlainRecord(value) || !hasExactFields(value, deltaFields)) return null;
  if (!isSafeCount(value.totalXp) || !isSafeCount(value.bestCombo) || !isSafeCount(value.games)) return null;
  const mistakes = parseCountMap(value.mistakes, (key) => validation.allowedLetters.has(key));
  const phraseMistakes = parseCountMap(value.phraseMistakes, (key) => validation.allowedPhraseIds.has(key), true);
  const history = parseCountMap(value.history, isProgressDateKey);
  if (!mistakes || !phraseMistakes || !history) return null;
  return {
    totalXp: value.totalXp,
    bestCombo: value.bestCombo,
    games: value.games,
    mistakes,
    phraseMistakes,
    history,
  };
}

function parseMasteryWrites(
  value: unknown,
  allowed: ReadonlySet<string>,
  ledgerClock: ProgressClock,
  filterUnknown = false,
) {
  if (!isPlainRecord(value)) return null;
  const parsed: Record<string, MasteryLedgerWrite> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!allowed.has(key)) {
      if (filterUnknown) continue;
      return null;
    }
    if (!isPlainRecord(candidate) || !hasExactFields(candidate, masteryWriteFields)) return null;
    const clock = parsePositiveClock(candidate.clock);
    if (typeof candidate.value !== "boolean" || clock === null || compareProgressClocks(clock, ledgerClock) > 0) return null;
    parsed[key] = { value: candidate.value, clock };
  }
  return parsed;
}

function parseProgressLedgerValue(
  value: unknown,
  validation: ProgressValidation,
  expectedLedgerId?: string,
): ProgressLedger | null {
  if (!isPlainRecord(value) || !hasExactFields(value, ledgerFields)) return null;
  const clock = parseProgressClockValue(value.clock);
  if (value.version !== PROGRESS_LEDGER_VERSION || !isProgressLedgerId(value.ledgerId) || clock === null) return null;
  if (expectedLedgerId !== undefined && value.ledgerId !== expectedLedgerId) return null;
  const stats = parseStatsDeltaValue(value.stats, validation);
  const mastered = parseMasteryWrites(value.mastered, validation.allowedLetters, clock);
  const masteredPhrases = parseMasteryWrites(value.masteredPhrases, validation.allowedPhraseIds, clock, true);
  if (!stats || !mastered || !masteredPhrases) return null;
  return {
    version: PROGRESS_LEDGER_VERSION,
    ledgerId: value.ledgerId,
    clock,
    stats,
    mastered,
    masteredPhrases,
  };
}

/** Strictly parses one ledger; obsolete phrase ids are filtered field-by-field. */
export function parseProgressLedger(
  raw: string | null,
  validation: ProgressValidation,
  expectedLedgerId?: string,
) {
  if (raw === null) return null;
  try {
    return parseProgressLedgerValue(JSON.parse(raw), validation, expectedLedgerId);
  } catch {
    return null;
  }
}

/** Parses a storage entry only when its key suffix matches the ledger payload. */
export function parseProgressLedgerEntry(
  key: string,
  raw: string | null,
  validation: ProgressValidation,
) {
  const ledgerId = progressLedgerIdFromKey(key);
  return ledgerId ? parseProgressLedger(raw, validation, ledgerId) : null;
}

export function parseProgressLedgerEntries(
  entries: Iterable<readonly [string, string | null]>,
  validation: ProgressValidation,
) {
  const ledgers: ProgressLedger[] = [];
  for (const [key, raw] of entries) {
    const ledger = parseProgressLedgerEntry(key, raw, validation);
    if (ledger) ledgers.push(ledger);
  }
  return ledgers;
}

export function emptyProgressStats(today: string): ProgressStats {
  if (!isProgressDateKey(today)) throw new TypeError("Invalid progress date");
  return { date: today, dailyXp: 0, totalXp: 0, bestCombo: 0, games: 0, mistakes: {}, phraseMistakes: {}, history: {} };
}

export function emptyProgressStatsDelta(): ProgressStatsDelta {
  return { totalXp: 0, bestCombo: 0, games: 0, mistakes: {}, phraseMistakes: {}, history: {} };
}

export function createProgressLedger(ledgerId: string): ProgressLedger {
  if (!isProgressLedgerId(ledgerId)) throw new TypeError("Invalid progress ledger id");
  return {
    version: PROGRESS_LEDGER_VERSION,
    ledgerId,
    clock: "0",
    stats: emptyProgressStatsDelta(),
    mastered: {},
    masteredPhrases: {},
  };
}

export function serializeProgressLedger(ledger: ProgressLedger) {
  return JSON.stringify(ledger);
}

function parseCheckpointMasteryWrites(
  value: unknown,
  allowed: ReadonlySet<string>,
  checkpointClock: ProgressClock,
  filterUnknown = false,
) {
  if (!isPlainRecord(value)) return null;
  const parsed: Record<string, CheckpointMasteryWrite> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!allowed.has(key)) {
      if (filterUnknown) continue;
      return null;
    }
    if (!isPlainRecord(candidate) || !hasExactFields(candidate, checkpointMasteryWriteFields)) return null;
    const clock = parsePositiveClock(candidate.clock);
    if (typeof candidate.value !== "boolean"
      || clock === null
      || compareProgressClocks(clock, checkpointClock) > 0
      || !isProgressLedgerId(candidate.ledgerId)) return null;
    parsed[key] = { value: candidate.value, clock, ledgerId: candidate.ledgerId };
  }
  return parsed;
}

function parseClockMap(value: unknown, keyAllowed: (key: string) => boolean) {
  if (!isPlainRecord(value)) return null;
  const parsed: Record<string, ProgressClock> = {};
  for (const [key, rawClock] of Object.entries(value)) {
    const clock = parseProgressClockValue(rawClock);
    if (!keyAllowed(key) || clock === null) return null;
    parsed[key] = clock;
  }
  return parsed;
}

function parseProgressCheckpointValue(value: unknown, validation: ProgressValidation): ProgressCheckpoint | null {
  if (!isPlainRecord(value) || !hasExactFields(value, checkpointFields)) return null;
  const checkpointClock = parseProgressClockValue(value.clock);
  if (value.version !== PROGRESS_CHECKPOINT_VERSION || checkpointClock === null) return null;
  const stats = parseStatsDeltaValue(value.stats, validation);
  const mastered = parseCheckpointMasteryWrites(value.mastered, validation.allowedLetters, checkpointClock);
  const masteredPhrases = parseCheckpointMasteryWrites(value.masteredPhrases, validation.allowedPhraseIds, checkpointClock, true);
  const included = parseClockMap(value.included, isProgressLedgerId);
  if (!stats || !mastered || !masteredPhrases || !included) return null;
  if (Object.values(included).some((clock) => compareProgressClocks(clock, checkpointClock) > 0)) return null;
  return {
    version: PROGRESS_CHECKPOINT_VERSION,
    clock: checkpointClock,
    stats,
    mastered,
    masteredPhrases,
    included,
  };
}

export function emptyProgressCheckpoint(): ProgressCheckpoint {
  return {
    version: PROGRESS_CHECKPOINT_VERSION,
    clock: "0",
    stats: emptyProgressStatsDelta(),
    mastered: {},
    masteredPhrases: {},
    included: {},
  };
}

export function parseProgressCheckpoint(raw: string | null, validation: ProgressValidation) {
  if (raw === null) return null;
  try {
    return parseProgressCheckpointValue(JSON.parse(raw), validation);
  } catch {
    return null;
  }
}

export function serializeProgressCheckpoint(checkpoint: ProgressCheckpoint) {
  return JSON.stringify(checkpoint);
}

export function createProgressLedgerSeal(ledger: ProgressLedger, sealedAt: number): ProgressLedgerSeal {
  if (!isSafeCount(sealedAt)) throw new TypeError("Invalid progress seal time");
  return { version: 1, ledgerId: ledger.ledgerId, clock: ledger.clock, sealedAt };
}

export function parseProgressLedgerSeal(raw: string | null, expectedLedgerId?: string) {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isPlainRecord(value) || !hasExactFields(value, ledgerSealFields)) return null;
    const clock = parseProgressClockValue(value.clock);
    if (value.version !== 1
      || !isProgressLedgerId(value.ledgerId)
      || clock === null
      || !isSafeCount(value.sealedAt)
      || (expectedLedgerId !== undefined && value.ledgerId !== expectedLedgerId)) return null;
    return { version: 1, ledgerId: value.ledgerId, clock, sealedAt: value.sealedAt } satisfies ProgressLedgerSeal;
  } catch {
    return null;
  }
}

export function serializeProgressLedgerSeal(seal: ProgressLedgerSeal) {
  return JSON.stringify(seal);
}

function parseFilteredLegacyMasteryList(value: unknown, allowed: ReadonlySet<string>, filterUnknown = false) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  const strings = value as string[];
  if (!filterUnknown && strings.some((item) => !allowed.has(item))) return null;
  return [...new Set(strings.filter((item) => allowed.has(item)))];
}

export function parseLegacyMasterySnapshot(raw: string | null, validation: ProgressValidation) {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isPlainRecord(value) || !hasExactFields(value, legacyMasterySnapshotFields) || value.version !== 1) return null;
    const mastered = parseFilteredLegacyMasteryList(value.mastered, validation.allowedLetters);
    const masteredPhrases = parseFilteredLegacyMasteryList(value.masteredPhrases, validation.allowedPhraseIds, true);
    if (!mastered || !masteredPhrases) return null;
    return { version: 1, mastered, masteredPhrases } satisfies LegacyMasterySnapshot;
  } catch {
    return null;
  }
}

export function serializeLegacyMasterySnapshot(snapshot: LegacyMasterySnapshot) {
  return JSON.stringify(snapshot);
}

export function createLegacyMasteryOperations(
  before: Pick<ProgressSnapshot, "mastered" | "masteredPhrases">,
  after: Pick<ProgressSnapshot, "mastered" | "masteredPhrases">,
  validation: ProgressValidation,
) {
  const operations: ProgressLedgerOperation[] = [];
  for (const key of validation.allowedLetters) {
    const previous = before.mastered.includes(key);
    const next = after.mastered.includes(key);
    if (previous !== next) operations.push({ kind: "mastered", key, value: next });
  }
  for (const key of validation.allowedPhraseIds) {
    const previous = before.masteredPhrases.includes(key);
    const next = after.masteredPhrases.includes(key);
    if (previous !== next) operations.push({ kind: "masteredPhrase", key, value: next });
  }
  return operations;
}

export function parseLegacyProgressStats(
  raw: string | null,
  validation: ProgressValidation,
): ProgressStats | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isPlainRecord(value)
      || Object.keys(value).some((field) => !legacyStatsFieldSet.has(field))
      || legacyStatsRequiredFields.some((field) => !Object.hasOwn(value, field))) return null;
    if (!isProgressDateKey(value.date)
      || !isSafeCount(value.dailyXp)
      || !isSafeCount(value.totalXp)
      || !isSafeCount(value.bestCombo)
      || !isSafeCount(value.games)) return null;
    const mistakes = parseCountMap(value.mistakes, (key) => validation.allowedLetters.has(key));
    const phraseMistakes = Object.hasOwn(value, "phraseMistakes")
      ? parseCountMap(value.phraseMistakes, (key) => validation.allowedPhraseIds.has(key), true)
      : {};
    const history = Object.hasOwn(value, "history") ? parseCountMap(value.history, isProgressDateKey) : {};
    if (!mistakes || !phraseMistakes || !history) return null;
    if (value.dailyXp > (history[value.date] ?? 0)) history[value.date] = value.dailyXp;
    return {
      date: value.date,
      dailyXp: value.dailyXp,
      totalXp: value.totalXp,
      bestCombo: value.bestCombo,
      games: value.games,
      mistakes,
      phraseMistakes,
      history,
    };
  } catch {
    return null;
  }
}

export function parseLegacyMasteryList(raw: string | null, allowed: ReadonlySet<string>, filterUnknown = false) {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
    const strings = value as string[];
    const parsed = filterUnknown ? strings.filter((item) => allowed.has(item)) : strings;
    if ((!filterUnknown && parsed.some((item) => !allowed.has(item))) || new Set(parsed).size !== parsed.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseLegacyProgress(
  input: LegacyProgressJson,
  today: string,
  validation: ProgressValidation,
): ProgressSnapshot {
  return {
    stats: parseLegacyProgressStats(input.stats, validation) ?? emptyProgressStats(today),
    mastered: parseLegacyMasteryList(input.mastered, validation.allowedLetters) ?? [],
    masteredPhrases: parseLegacyMasteryList(input.masteredPhrases, validation.allowedPhraseIds, true) ?? [],
  };
}

function addCounts(left: number, right: number) {
  return Math.min(Number.MAX_SAFE_INTEGER, left + right);
}

function addCountMaps(left: ProgressCountMap, right: ProgressCountMap) {
  const merged = { ...left };
  for (const [key, value] of Object.entries(right)) merged[key] = addCounts(merged[key] ?? 0, value);
  return merged;
}

function maxCountMaps(left: ProgressCountMap, right: ProgressCountMap) {
  const merged = { ...left };
  for (const [key, value] of Object.entries(right)) merged[key] = Math.max(merged[key] ?? 0, value);
  return merged;
}

/**
 * Legacy statistics are monotonic counters. Keeping their validated high-water
 * marks prevents a stale tab from replacing the last good baseline with an
 * older, but still structurally valid, snapshot.
 */
export function mergeLegacyProgressStatsHighWater(
  left: ProgressStats,
  right: ProgressStats,
  today: string,
): ProgressStats {
  const history = maxCountMaps(left.history, right.history);
  return {
    date: today,
    dailyXp: history[today] ?? 0,
    totalXp: Math.max(left.totalXp, right.totalXp),
    bestCombo: Math.max(left.bestCombo, right.bestCombo),
    games: Math.max(left.games, right.games),
    mistakes: maxCountMaps(left.mistakes, right.mistakes),
    phraseMistakes: maxCountMaps(left.phraseMistakes, right.phraseMistakes),
    history,
  };
}

/**
 * Rebuilds a legacy recovery copy from values reread at commit time. Mastery
 * arrays are replaceable state, so a valid current [] must win; a missing or
 * damaged field may only fall back to an already validated backup. Captured
 * statistics remain safe to merge because every statistics field is monotonic.
 */
export function resolveLegacyProgressBackupSnapshot(
  captured: ProgressSnapshot,
  existing: ProgressSnapshot | null,
  current: {
    stats: ProgressStats | null;
    mastered: string[] | null;
    masteredPhrases: string[] | null;
  },
  today: string,
): ProgressSnapshot | null {
  const currentOrExistingStats = current.stats ?? existing?.stats ?? null;
  const mastered = current.mastered ?? existing?.mastered ?? null;
  const masteredPhrases = current.masteredPhrases ?? existing?.masteredPhrases ?? null;
  if (!currentOrExistingStats || !mastered || !masteredPhrases) return null;
  const statsWithCapturedHighWater = mergeLegacyProgressStatsHighWater(currentOrExistingStats, captured.stats, today);
  const stats = existing
    ? mergeLegacyProgressStatsHighWater(statsWithCapturedHighWater, existing.stats, today)
    : statsWithCapturedHighWater;
  return { stats, mastered, masteredPhrases };
}

function diffCountMaps(before: ProgressCountMap, after: ProgressCountMap, label: string) {
  const delta: ProgressCountMap = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const previous = before[key] ?? 0;
    const next = after[key] ?? 0;
    if (next < previous) throw new RangeError(`${label}.${key} cannot decrease`);
    if (next > previous) delta[key] = next - previous;
  }
  return delta;
}

function assertProgressStats(stats: ProgressStats, validation: ProgressValidation) {
  if (!isProgressDateKey(stats.date)
    || !isSafeCount(stats.dailyXp)
    || !isSafeCount(stats.totalXp)
    || !isSafeCount(stats.bestCombo)
    || !isSafeCount(stats.games)
    || !parseCountMap(stats.mistakes, (key) => validation.allowedLetters.has(key))
    || !parseCountMap(stats.phraseMistakes, (key) => validation.allowedPhraseIds.has(key))
    || !parseCountMap(stats.history, isProgressDateKey)) throw new TypeError("Invalid progress stats");
}

/** Creates the monotonic ledger addition produced by one stats transition. */
export function createProgressStatsDelta(
  before: ProgressStats,
  after: ProgressStats,
  validation: ProgressValidation,
): ProgressStatsDelta {
  assertProgressStats(before, validation);
  assertProgressStats(after, validation);
  if (after.totalXp < before.totalXp) throw new RangeError("totalXp cannot decrease");
  if (after.games < before.games) throw new RangeError("games cannot decrease");
  if (after.bestCombo < before.bestCombo) throw new RangeError("bestCombo cannot decrease");
  return {
    totalXp: after.totalXp - before.totalXp,
    bestCombo: after.bestCombo > before.bestCombo ? after.bestCombo : 0,
    games: after.games - before.games,
    mistakes: diffCountMaps(before.mistakes, after.mistakes, "mistakes"),
    phraseMistakes: diffCountMaps(before.phraseMistakes, after.phraseMistakes, "phraseMistakes"),
    history: diffCountMaps(before.history, after.history, "history"),
  };
}

export function mergeProgressStatsDeltas(
  left: ProgressStatsDelta,
  right: ProgressStatsDelta,
): ProgressStatsDelta {
  return {
    totalXp: addCounts(left.totalXp, right.totalXp),
    bestCombo: Math.max(left.bestCombo, right.bestCombo),
    games: addCounts(left.games, right.games),
    mistakes: addCountMaps(left.mistakes, right.mistakes),
    phraseMistakes: addCountMaps(left.phraseMistakes, right.phraseMistakes),
    history: addCountMaps(left.history, right.history),
  };
}

/**
 * Returns a Lamport-style clock. Passing Date.now() as `floor` also makes
 * independently-created ledgers follow real user-action order in normal use.
 */
export function nextProgressLedgerClock(ledgers: readonly ProgressLedger[], ...floors: ProgressClockInput[]) {
  let greatest: ProgressClock = "0";
  for (const floor of floors) {
    const parsed = parseProgressClockValue(floor);
    if (parsed === null) throw new TypeError("Invalid progress clock floor");
    if (compareProgressClocks(parsed, greatest) > 0) greatest = parsed;
  }
  for (const ledger of ledgers) {
    if (compareProgressClocks(ledger.clock, greatest) > 0) greatest = ledger.clock;
  }
  return incrementProgressClock(greatest);
}

export function applyProgressLedgerOperation(
  ledger: ProgressLedger,
  operation: ProgressLedgerOperation,
  clockInput: ProgressClockInput,
  validation: ProgressValidation,
): ProgressLedger {
  const clock = parsePositiveClock(clockInput);
  if (clock === null || compareProgressClocks(clock, ledger.clock) <= 0) throw new RangeError("Progress ledger clock must increase");
  if (operation.kind === "stats") {
    const delta = parseStatsDeltaValue(operation.delta, validation);
    if (!delta) throw new TypeError("Invalid progress stats delta");
    return { ...ledger, clock, stats: mergeProgressStatsDeltas(ledger.stats, delta) };
  }
  if (operation.kind === "mastered") {
    if (!validation.allowedLetters.has(operation.key)) throw new TypeError("Invalid mastered letter");
    return {
      ...ledger,
      clock,
      mastered: { ...ledger.mastered, [operation.key]: { value: operation.value, clock } },
    };
  }
  if (!validation.allowedPhraseIds.has(operation.key)) throw new TypeError("Invalid mastered phrase");
  return {
    ...ledger,
    clock,
    masteredPhrases: { ...ledger.masteredPhrases, [operation.key]: { value: operation.value, clock } },
  };
}

export function compareMasteryWriteOrder(left: MasteryWriteOrder, right: MasteryWriteOrder) {
  const clockOrder = compareProgressClocks(left.clock, right.clock);
  if (clockOrder !== 0) return clockOrder;
  return left.ledgerId.localeCompare(right.ledgerId, "en");
}

function canonicalLedgers(ledgers: readonly ProgressLedger[]) {
  const byId = new Map<string, ProgressLedger>();
  for (const candidate of ledgers) {
    const current = byId.get(candidate.ledgerId);
    const clockOrder = current ? compareProgressClocks(candidate.clock, current.clock) : 1;
    if (!current || clockOrder > 0) {
      byId.set(candidate.ledgerId, candidate);
    } else if (clockOrder === 0 && JSON.stringify(candidate) > JSON.stringify(current)) {
      byId.set(candidate.ledgerId, candidate);
    }
  }
  return [...byId.values()].sort((left, right) => left.ledgerId.localeCompare(right.ledgerId, "en"));
}

function mergeCheckpointMasteryField(
  current: Record<string, CheckpointMasteryWrite>,
  ledger: ProgressLedger,
  field: "mastered" | "masteredPhrases",
) {
  const merged = { ...current };
  for (const [key, write] of Object.entries(ledger[field])) {
    const previous = merged[key];
    if (!previous || compareMasteryWriteOrder(previous, { clock: write.clock, ledgerId: ledger.ledgerId }) < 0) {
      merged[key] = { ...write, ledgerId: ledger.ledgerId };
    }
  }
  return merged;
}

/**
 * Adds immutable, terminally-sealed ledgers to a checkpoint. Callers must
 * publish this checkpoint before deleting any included ledger keys.
 */
export function compactProgressLedgers(
  checkpoint: ProgressCheckpoint | null,
  ledgers: readonly ProgressLedger[],
) {
  let compacted = checkpoint ?? emptyProgressCheckpoint();
  for (const ledger of canonicalLedgers(ledgers)) {
    if (Object.hasOwn(compacted.included, ledger.ledgerId)) continue;
    compacted = {
      version: PROGRESS_CHECKPOINT_VERSION,
      clock: compareProgressClocks(compacted.clock, ledger.clock) >= 0 ? compacted.clock : ledger.clock,
      stats: mergeProgressStatsDeltas(compacted.stats, ledger.stats),
      mastered: mergeCheckpointMasteryField(compacted.mastered, ledger, "mastered"),
      masteredPhrases: mergeCheckpointMasteryField(compacted.masteredPhrases, ledger, "masteredPhrases"),
      included: { ...compacted.included, [ledger.ledgerId]: ledger.clock },
    };
  }
  return compacted;
}

/** Removes crash-safety tombstones only after the corresponding key is absent. */
export function finalizeProgressCheckpoint(
  checkpoint: ProgressCheckpoint,
  physicallyPresentLedgerIds: ReadonlySet<string>,
) {
  return {
    ...checkpoint,
    included: Object.fromEntries(Object.entries(checkpoint.included)
      .filter(([ledgerId]) => physicallyPresentLedgerIds.has(ledgerId))),
  };
}

export function progressCheckpointClock(checkpoint: ProgressCheckpoint | null) {
  return checkpoint?.clock ?? "0";
}

function mergeMasteryState(
  baseline: readonly string[],
  ledgers: readonly ProgressLedger[],
  field: "mastered" | "masteredPhrases",
  allowed: ReadonlySet<string>,
  checkpointWrites: Readonly<Record<string, CheckpointMasteryWrite>> = {},
) {
  const baselineSet = new Set(baseline.filter((key) => allowed.has(key)));
  const winners = new Map<string, MasteryLedgerWrite & { ledgerId: string }>();
  for (const [key, write] of Object.entries(checkpointWrites)) {
    if (allowed.has(key)) winners.set(key, write);
  }
  for (const ledger of ledgers) {
    for (const [key, write] of Object.entries(ledger[field])) {
      if (!allowed.has(key)) continue;
      const current = winners.get(key);
      if (!current || compareMasteryWriteOrder(
        { clock: current.clock, ledgerId: current.ledgerId },
        { clock: write.clock, ledgerId: ledger.ledgerId },
      ) < 0) winners.set(key, { ...write, ledgerId: ledger.ledgerId });
    }
  }
  return [...allowed].filter((key) => winners.get(key)?.value ?? baselineSet.has(key));
}

/**
 * Merges the immutable v18 baseline with all valid v19 ledgers. Callers must
 * not save this merged snapshot back over the baseline unless the included
 * ledger keys are atomically retired, otherwise the deltas would be counted twice.
 */
export function mergeProgress(
  baseline: ProgressSnapshot,
  ledgers: readonly ProgressLedger[],
  today: string,
  validation: ProgressValidation,
  checkpoint: ProgressCheckpoint | null = null,
): ProgressSnapshot {
  if (!isProgressDateKey(today)) throw new TypeError("Invalid progress date");
  assertProgressStats(baseline.stats, validation);
  const included = checkpoint?.included ?? {};
  const uniqueLedgers = canonicalLedgers(ledgers).filter((ledger) => !Object.hasOwn(included, ledger.ledgerId));
  let totalXp = addCounts(baseline.stats.totalXp, checkpoint?.stats.totalXp ?? 0);
  let bestCombo = Math.max(baseline.stats.bestCombo, checkpoint?.stats.bestCombo ?? 0);
  let games = addCounts(baseline.stats.games, checkpoint?.stats.games ?? 0);
  let mistakes = addCountMaps(baseline.stats.mistakes, checkpoint?.stats.mistakes ?? {});
  let phraseMistakes = addCountMaps(baseline.stats.phraseMistakes, checkpoint?.stats.phraseMistakes ?? {});
  let history = addCountMaps(baseline.stats.history, checkpoint?.stats.history ?? {});
  if (isProgressDateKey(baseline.stats.date) && baseline.stats.dailyXp > (history[baseline.stats.date] ?? 0)) {
    history[baseline.stats.date] = baseline.stats.dailyXp;
  }
  for (const ledger of uniqueLedgers) {
    totalXp = addCounts(totalXp, ledger.stats.totalXp);
    bestCombo = Math.max(bestCombo, ledger.stats.bestCombo);
    games = addCounts(games, ledger.stats.games);
    mistakes = addCountMaps(mistakes, ledger.stats.mistakes);
    phraseMistakes = addCountMaps(phraseMistakes, ledger.stats.phraseMistakes);
    history = addCountMaps(history, ledger.stats.history);
  }
  return {
    stats: {
      date: today,
      dailyXp: history[today] ?? 0,
      totalXp,
      bestCombo,
      games,
      mistakes,
      phraseMistakes,
      history,
    },
    mastered: mergeMasteryState(baseline.mastered, uniqueLedgers, "mastered", validation.allowedLetters, checkpoint?.mastered),
    masteredPhrases: mergeMasteryState(baseline.masteredPhrases, uniqueLedgers, "masteredPhrases", validation.allowedPhraseIds, checkpoint?.masteredPhrases),
  };
}
