export const BATCHIM_RULE_SOURCE = "https://www.korean.go.kr/nkview/nklife/1993_1/3_1.html";
export const BATCHIM_GROUPS = [
  { final: "ㄹ", title: "舌尖贴住", cue: "读到词尾时，舌尖贴住上齿龈，让气流从舌头两侧通过，不要再加一个元音。", note: "这里是词尾的 ㄹ，不是元音之间轻弹一下的 ㄹ。" },
  { final: "ㅁ", title: "双唇合拢", cue: "读到词尾时，双唇合拢，让气流从鼻腔通过，不要再张嘴补读一个音节。", note: "闭唇收住这个词，不要把字母名称 미음 加到词尾。" },
  { final: "ㅇ", title: "舌后部收住", cue: "读到词尾时，舌后部接触软腭，让气流从鼻腔通过；这里的收音 ㅇ 有声音。", note: "ㅇ 在初声位置不发音，在收音位置则有声音，不能混为一谈。" },
] as const;

export const BATCHIM_WORDS = [
  { id: "word-water", final: "ㄹ", last: "물", pronunciation: "물", source: "https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=17596" },
  { id: "word-subway", final: "ㄹ", last: "철", pronunciation: "지하철", source: "https://krdict.korean.go.kr/eng/dicMarinerSearch/search?mainSearchWord=%EC%A7%80%ED%95%98%EC%B2%A0&nation=eng" },
  { id: "word-person", final: "ㅁ", last: "람", pronunciation: "사ː람", source: "https://krdict.korean.go.kr/eng/dicSearch/wordLinkViewPopup?ParaWordNo=58161&nation=eng&nationCode=6" },
  { id: "word-now", final: "ㅁ", last: "금", pronunciation: "지금", source: "https://krdict.korean.go.kr/eng/dicMarinerSearch/search?mainSearchWord=%EC%A7%80%EA%B8%88&nation=eng" },
  { id: "word-receipt", final: "ㅇ", last: "증", pronunciation: "영수증", source: "https://krdict.korean.go.kr/eng/dicMarinerSearch/search?mainSearchWord=%EC%98%81&nation=eng" },
] as const;

export function batchimExampleIndex(id?: string) {
  return Math.max(0, BATCHIM_WORDS.findIndex((item) => item.id === id));
}

export function isBatchimAnswerCorrect(index: number, answer: string) {
  return BATCHIM_WORDS[index]?.final === answer;
}
