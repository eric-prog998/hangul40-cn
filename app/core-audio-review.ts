import { audioReviewChecklist, type AudioEntry } from "./audio-catalog.ts";

// One spelling reference and one fixed, repeatable review order. This prioritizes
// listening work; it never promotes an audio file to verified.
export const SPELLING_REFERENCE = "https://korean.go.kr/front/mcfaq/mcfaqView.do?mcfaq_seq=5573";
const contrastOrder = ["가", "카", "까", "다", "타", "따", "바", "파", "빠", "자", "차", "짜", "사", "싸", "나", "라", "마", "하"];

export function coreReviewChecklist(catalog: readonly AudioEntry[], version: string) {
  const ordered = [...catalog.filter(e => e.category === "vowel"), ...catalog.filter(e => e.category === "name")];
  for (const sound of contrastOrder) {
    const sample = catalog.find(e => e.category === "syllable" && e.label === sound);
    if (sample) ordered.push(sample);
  }
  return { ...audioReviewChecklist(ordered, version), scope: "核心 40 音", spellingReference: SPELLING_REFERENCE,
    listeningGuide: "先核对21个元音、19个名称，再比较同韵母的自然音节。아 既是元音示范也是 ㅇ + ㅏ，无需重复核听。每条独立记录标签是否相符、音头是否完整、清晰度和自然度；有疑问的录音须复核后才能标为通过。" };
}
