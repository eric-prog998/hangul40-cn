export const BATCHIM_RULE_SOURCE = "https://www.korean.go.kr/nkview/nklife/1993_1/3_1.html";
export const BATCHIM_SEVEN_SOURCE = "https://m.korean.go.kr/front/onlineQna/onlineQnaView.do?mn_id=216&pageIndex=1&qna_seq=313220";

export const BATCHIM_GROUPS = [
  { final: "ㄹ", title: "舌尖贴住", cue: "读到词尾时，舌尖贴住上齿龈，让气流从舌头两侧通过，不要再加一个元音。", note: "这里是词尾的 ㄹ，不是元音之间轻弹一下的 ㄹ。" },
  { final: "ㅁ", title: "双唇合拢", cue: "读到词尾时，双唇合拢，让气流从鼻腔通过，不要再张嘴补读一个音节。", note: "闭唇收住这个词，不要把字母名称 미음 加到词尾，也不要读成舌尖的 ㄴ。" },
  { final: "ㅇ", title: "舌后部收住", cue: "读到词尾时，舌后部接触软腭，让气流从鼻腔通过；这里的收音 ㅇ 有声音。", note: "ㅇ 在初声位置不发音，在收音位置则有声音 [ŋ]，不能混为一谈。" },
] as const;

export const BATCHIM_WORDS = [
  { id: "word-water", final: "ㄹ", last: "물", pronunciation: "물", source: "https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=17596" },
  { id: "word-subway", final: "ㄹ", last: "철", pronunciation: "지하철", source: "https://krdict.korean.go.kr/eng/dicMarinerSearch/search?mainSearchWord=%EC%A7%80%ED%95%98%EC%B2%A0&nation=eng" },
  { id: "word-person", final: "ㅁ", last: "람", pronunciation: "사ː람", source: "https://krdict.korean.go.kr/eng/dicSearch/wordLinkViewPopup?ParaWordNo=58161&nation=eng&nationCode=6" },
  { id: "word-now", final: "ㅁ", last: "금", pronunciation: "지금", source: "https://krdict.korean.go.kr/eng/dicMarinerSearch/search?mainSearchWord=%EC%A7%80%EA%B8%88&nation=eng" },
  { id: "word-receipt", final: "ㅇ", last: "증", pronunciation: "영수증", source: "https://krdict.korean.go.kr/eng/dicMarinerSearch/search?mainSearchWord=%EC%98%81%EC%88%98%EC%A6%9D&nation=eng" },
] as const;

export const STOP_BATCHIM_GROUPS = [
  { final: "ㅂ", title: "双唇闭紧不爆破", cue: "读到词尾时双唇闭紧立刻停住，绝对不要再松开吐气，不要把 집 读成“吉普”。", note: "韩语闭塞收音只做“成阻”不“除阻”，声音像突然刹住一样。" },
  { final: "ㄱ", title: "舌根堵住不爆破", cue: "读到词尾时舌根抬起堵住软腭即停，绝对不要喷出气音，不要把 가족 读成“卡卓克”。", note: "ㄲ、ㅋ 作词尾收音时，也同样归入 [ㄱ] 代表音收住不吐气。" },
] as const;

export const STOP_BATCHIM_WORDS = [
  { id: "word-home", final: "ㅂ", last: "집", pronunciation: "집", source: "https://krdict.korean.go.kr/eng/dicMarinerSearch/search?mainSearchWord=%EC%A7%91&nation=eng" },
  { id: "word-meal", final: "ㅂ", last: "밥", pronunciation: "밥", source: "https://krdict.korean.go.kr/eng/dicMarinerSearch/search?mainSearchWord=%EB%B0%A5&nation=eng" },
  { id: "word-family", final: "ㄱ", last: "족", pronunciation: "가족", source: "https://krdict.korean.go.kr/eng/dicMarinerSearch/search?mainSearchWord=%EA%B0%80%EC%A1%B1&nation=eng" },
  { id: "word-pharmacy", final: "ㄱ", last: "국", pronunciation: "약꾹", source: "https://krdict.korean.go.kr/eng/dicMarinerSearch/search?mainSearchWord=%EC%95%BD%EA%B5%AD&nation=eng" },
] as const;

export const LIAISON_GROUPS = [
  { final: "连音化", title: "收音滑向静音 ㅇ", cue: "前字底部有收音、后字以静音 ㅇ 开头时，收音直接滑过去充当后字的初声。", note: "例如 한국어를 读 [한구거를]，화장실이 读 [화장시리]。" },
  { final: "鼻音化", title: "塞音遇鼻音变鼻音", cue: "收音 ㅂ 遇到后面的 ㄴ/ㅁ 时，双唇不硬憋塞音，顺势同化读作鼻音 ㅁ。", note: "最典型高频词：감사합니다 实际读 [감사함니다]。" },
  { final: "紧音/脱落", title: "紧音化与 ㅎ 脱落", cue: "闭塞收音后接松音常触发紧音化（학교 → [학꾜]）；收音 ㅎ 遇元音则直接脱落（좋아요 → [조아요]）。", note: "写法保留词根是为了表意清晰，口耳交流一律按音变后的自然读法。" },
] as const;

export const LIAISON_WORDS = [
  { id: "sentence-toilet", final: "连音化", last: "실이", pronunciation: "화장시리 어디예요", source: "https://krdict.korean.go.kr/eng/dicMarinerSearch/search?mainSearchWord=%ED%99%94%EC%9E%A5%EC%8B%A4&nation=eng" },
  { id: "sentence-study", final: "连音化", last: "국어", pronunciation: "저는 한구거를 공부해요", source: "https://krdict.korean.go.kr/eng/dicMarinerSearch/search?mainSearchWord=%ED%95%9C%EA%B5%AD%EC%96%B4&nation=eng" },
  { id: "word-thanks", final: "鼻音化", last: "합니", pronunciation: "감사함니다", source: "https://krdict.korean.go.kr/eng/dicMarinerSearch/search?mainSearchWord=%EA%B0%90%EC%82%AC%ED%95%98%EB%8B%A4&nation=eng" },
  { id: "word-school", final: "紧音/脱落", last: "학교", pronunciation: "학꾜", source: "https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=73276" },
  { id: "word-good", final: "紧音/脱落", last: "좋아", pronunciation: "조아요", source: "https://krdict.korean.go.kr/eng/dicMarinerSearch/search?mainSearchWord=%EC%A2%8B%EB%8B%A4&nation=eng" },
] as const;

export type BatchimCourseKey = "sonorant" | "stop" | "liaison";

export function batchimExampleIndex(id?: string) {
  return Math.max(0, BATCHIM_WORDS.findIndex((item) => item.id === id));
}

export function isBatchimAnswerCorrect(index: number, answer: string) {
  return BATCHIM_WORDS[index]?.final === answer;
}

export function resolveBatchimTarget(id?: string): { course: BatchimCourseKey; index: number } {
  if (!id) return { course: "sonorant", index: 0 };
  const sonorantIdx = BATCHIM_WORDS.findIndex((item) => item.id === id);
  if (sonorantIdx >= 0) return { course: "sonorant", index: sonorantIdx };
  const stopIdx = STOP_BATCHIM_WORDS.findIndex((item) => item.id === id);
  if (stopIdx >= 0) return { course: "stop", index: stopIdx };
  const liaisonIdx = LIAISON_WORDS.findIndex((item) => item.id === id);
  if (liaisonIdx >= 0) return { course: "liaison", index: liaisonIdx };
  return { course: "sonorant", index: 0 };
}
