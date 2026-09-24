export const VOWEL_GUIDE_SOURCE = "https://www.korean.go.kr/front/page/pageView.do?page_id=P000098";

export const VOWEL_CONTRASTS = [
  {
    id: "eo-o", title: "ㅓ / ㅗ", subtitle: "先分清嘴唇是否收圆",
    caution: "先观察圆唇与否，再听声音差别。不要直接套用“饿、哦”等汉字谐音。",
    sides: [
      { letter: "ㅓ", cue: "嘴唇不收圆，舌头偏后。", isolated: "어", syllable: "거", lip: "unrounded" },
      { letter: "ㅗ", cue: "嘴唇收圆，舌头偏后。", isolated: "오", syllable: "고", lip: "rounded" },
    ],
  },
  {
    id: "eu-u", title: "ㅡ / ㅜ", subtitle: "舌后部抬高，嘴唇不一样",
    caution: "留意嘴唇是否不自觉地噘起来。不要把两者都读成汉语拼音 u。",
    sides: [
      { letter: "ㅡ", cue: "舌后部抬高，嘴唇不收圆。", isolated: "으", syllable: "그", lip: "unrounded" },
      { letter: "ㅜ", cue: "舌后部抬高，嘴唇收圆。", isolated: "우", syllable: "구", lip: "rounded" },
    ],
  },
] as const;

export type VowelPracticeMode = "isolated" | "syllable";
