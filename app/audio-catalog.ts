import { INITIAL_ORDER, VOWEL_ORDER, makeSyllable } from "./learning-logic.ts";

export const AUDIO_CATEGORIES = { name: "辅音名称", onset: "真人起音 · 单次", clarity: "真人起音 · 重复两次", vowel: "元音", syllable: "完整音节", phrase: "词句" } as const;
export type AudioCategory = keyof typeof AUDIO_CATEGORIES;
type Name = { char: string; name: string; id: string; audioFile: string | null; sourceWord?: string; sourcePage?: string };
type Phrase = { id: string; korean: string; chinese: string };
export type AudioFingerprint = { sha256: string; bytes: number };
export type AudioEntry = { id: string; label: string; category: AudioCategory; path: string; source: string; sourceUrl: string | null; explanation: string; reviewStatus: "pending"; fingerprint?: AudioFingerprint };
const clarity = new Set(["ㄹ", "ㄲ", "ㄸ", "ㅃ"]);

/** Inventory of existing files, not a claim that the recordings have been listened to by a teacher. */
export function createAudioCatalog(names: readonly Name[], phrases: readonly Phrase[], fingerprints: Record<string, AudioFingerprint> = {}): AudioEntry[] {
  const entries: AudioEntry[] = [];
  const add = (entry: Omit<AudioEntry, "reviewStatus" | "fingerprint">) => entries.push({ ...entry, reviewStatus: "pending", fingerprint: fingerprints[entry.path] });
  const synthetic = { source: "项目内置 AI 合成示范；现有资料未记录具体生成模型和日期。", sourceUrl: null };
  for (const name of names) {
    add({ id: `name-${name.id}`, label: `${name.char} · ${name.name}`, category: "name", path: `/audio/consonant-names/${name.id}.mp3`, ...synthetic, explanation: "这是字母的正式名称，不是它在单词中的辅音起音。" });
    if (!name.audioFile) continue; // Initial ㅇ is silent; do not fabricate an onset file.
    const origin = { source: `韩国母语者 호로조（Jeebeen）的原词「${name.sourceWord}」录音，经裁剪；原始许可 CC0 1.0。`, sourceUrl: name.sourcePage ?? null };
    add({ id: `onset-${name.id}`, label: name.char, category: "onset", path: `/audio/consonant-human-onset/${name.audioFile}`, ...origin, explanation: "只保留短促起音，已去掉完整元音和词尾。适合对照，不是完整跟读示范；真人来源不等于裁剪后的片段已获教师复核。" });
    if (clarity.has(name.char)) add({ id: `clarity-${name.id}`, label: name.char, category: "clarity", path: `/audio/consonant-human-clarity/${name.audioFile}`, ...origin, explanation: "同一短促片段重复两次，中间 120ms 静音；不是两个不同读音，也没有补入 ㅏ。" });
  }
  for (const initial of INITIAL_ORDER) for (const vowel of VOWEL_ORDER) {
    const syllable = makeSyllable(initial, vowel);
    add({ id: `syllable-${syllable.codePointAt(0)!.toString(16)}`, label: initial === "ㅇ" ? `${vowel} · ${syllable}` : syllable, category: initial === "ㅇ" ? "vowel" : "syllable", path: `/audio/hangul-natural/s-${syllable.codePointAt(0)!.toString(16)}.mp3`, ...synthetic, explanation: initial === "ㅇ" ? "这里的 ㅇ 是不发声的初声占位，整条音频用来示范元音。" : "这是辅音与元音组成的完整音节，适合跟读；不是独立辅音。" });
  }
  for (const phrase of phrases) add({ id: phrase.id, label: `${phrase.korean} · ${phrase.chinese}`, category: "phrase", path: `/audio/phrases/${phrase.id}.mp3`, ...synthetic, explanation: "完整词句合成音频。句中实际读音、自然度与礼貌语境仍需母语教师逐条复核。" });
  return entries;
}

export function filterAudioCatalog(entries: readonly AudioEntry[], category: AudioCategory | "all", query: string) {
  const terms = query.normalize("NFKC").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter(entry => (category === "all" || entry.category === category) && terms.every(term => `${entry.label} ${entry.id} ${AUDIO_CATEGORIES[entry.category]}`.normalize("NFKC").toLocaleLowerCase().includes(term)));
}

export const AUDIO_ISSUES = ["听不清／音量问题", "怀疑读音不准确", "没有声音／播放中断", "内容与标签不一致", "其他"] as const;
export function audioFeedback(entry: AudioEntry, issue: string, note: string, version: string) {
  const kind = AUDIO_ISSUES.includes(issue as typeof AUDIO_ISSUES[number]) ? issue : "其他";
  const clean = note.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, 500);
  return [`韩语学习网站 · 音频问题反馈（未发送）`, `应用版本：v${version}`, `条目：${entry.label}`, `音频编号：${entry.id}`, `类型：${AUDIO_CATEGORIES[entry.category]}`, `文件：${entry.path}`, `SHA-256：${entry.fingerprint?.sha256 ?? "未记录"}`, `音源：${entry.source}`, "人工复核：待逐条听审；用户反馈不等于审核结论。", `问题：${kind}`, `补充：${clean || "无"}`, "不包含学习进度、账号资料或录音。请自行把这段文字发给维护者。"].join("\n");
}

export function audioReviewChecklist(entries: readonly AudioEntry[], version: string) {
  return { format: "hangul40-audio-review-checklist", version: 1, appVersion: version, instruction: "这是待听审清单，不是审核证书。请母语教师逐条听原文件，并记录审核人、日期、具体问题与替换建议。网站不会自动导入或把这份清单视为已通过。", items: entries.map(entry => ({ id: entry.id, label: entry.label, category: AUDIO_CATEGORIES[entry.category], path: entry.path, sha256: entry.fingerprint?.sha256 ?? null, source: entry.source, sourceUrl: entry.sourceUrl, reviewStatus: "pending", reviewer: "", reviewedAt: null, notes: "" })) };
}
