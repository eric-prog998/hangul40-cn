export type JamoHint = {
  group: string;
  cue: string;
  shapeTip: string;
};

/** Verified articulatory & Hunminjeongeum stroke cues for zero-basis Chinese learners. */
export const JAMO_HINTS: Readonly<Record<string, JamoHint>> = {
  "ㄱ": { group: "牙音·松音", cue: "词首音调偏低、肌肉放松；不要按汉语拼音 g 硬压声带。", shapeTip: "象舌根抬起堵住软腭的侧面轮廓" },
  "ㅋ": { group: "牙音·送气", cue: "词首音调高平 + 强送气 k，嘴前纸片明显颤动。", shapeTip: "在 ㄱ 基础上加一横 = 气流增强" },
  "ㄲ": { group: "牙音·紧音", cue: "词首音调高平、喉部绷紧不送气，听感清脆像未送气的“嘎”。", shapeTip: "ㄱ 双写 = 声门收紧蓄力" },
  "ㄴ": { group: "舌音·鼻音", cue: "舌尖贴住上齿龈，气流从鼻腔出，接近汉语 n。", shapeTip: "象舌尖向上贴住上齿龈的形状" },
  "ㄷ": { group: "舌音·松音", cue: "词首音调偏低、舌尖放松轻触齿龈，与 ㄸ、ㅌ 听高低和气流区分。", shapeTip: "在 ㄴ 顶部加一横 = 堵住鼻腔成塞音" },
  "ㅌ": { group: "舌音·送气", cue: "词首音调高平 + 强送气 t，放开舌尖时喷出一股气。", shapeTip: "在 ㄷ 中间再加笔画 = 强送气" },
  "ㄸ": { group: "舌音·紧音", cue: "词首音调高平、喉部收紧，短促干脆几乎不吐气。", shapeTip: "ㄷ 双写 = 紧绷闭塞后爆发" },
  "ㄹ": { group: "舌音·流音", cue: "音节开头舌尖轻弹一下 [ɾ]（极短，别拉长成“拉”）；作词尾收音时舌尖贴住不弹 [l]。", shapeTip: "象舌尖轻巧翻动弯曲之形" },
  "ㅁ": { group: "唇音·鼻音", cue: "双唇自然闭拢再放开；作收音时必须闭紧双唇收住（-m）。", shapeTip: "象嘴巴闭合的方框（口形）" },
  "ㅂ": { group: "唇音·松音", cue: "词首双唇放松、音调偏低；作收音时双唇闭合不爆破。", shapeTip: "在 ㅁ 上方延伸 = 双唇闭合塞音" },
  "ㅍ": { group: "唇音·送气", cue: "词首音调高平 + 双唇强送气 p，明显吹动纸片。", shapeTip: "双唇向外撑开喷出强气流" },
  "ㅃ": { group: "唇音·紧音", cue: "词首音调高平、双唇先绷紧再干脆打开，不带送气。", shapeTip: "ㅂ 双写 = 双唇加倍绷紧" },
  "ㅅ": { group: "齿音·松音", cue: "词首音调偏低、齿缝自然漏气；遇 ㅣ/ㅑ/ㅕ/ㅛ/ㅠ 时舌面靠前接近“西”的起首。", shapeTip: "象牙齿分叉的轮廓" },
  "ㅆ": { group: "齿音·紧音", cue: "词首音调高平、齿缝气流高度集中紧促，比 ㅅ 更尖锐。", shapeTip: "ㅅ 双写 = 摩擦更紧促高亢" },
  "ㅈ": { group: "齿音·松音", cue: "舌尖不卷、发音靠前，词首音调偏低放松（不要卷舌读成拼音 zh）。", shapeTip: "在 ㅅ 顶上加一横 = 舌面先贴住再摩擦" },
  "ㅊ": { group: "齿音·送气", cue: "不卷舌，词首音调高平 + 强送气 ch。", shapeTip: "在 ㅈ 顶部加短笔 = 增加送气" },
  "ㅉ": { group: "齿音·紧音", cue: "不卷舌，词首音调高平、喉部绷紧不吐气。", shapeTip: "ㅈ 双写 = 紧音塞擦" },
  "ㅇ": { group: "喉音·位置音", cue: "放在左边/上面作初声时完全静音（只占位）；放在底部作收音才读后鼻音 [ŋ]。", shapeTip: "象喉咙畅通的圆圈" },
  "ㅎ": { group: "喉音·送气", cue: "气流从喉部轻柔擦出（高音起首）；夹在有声辅音与元音间常弱化。", shapeTip: "在 ㅇ 顶部加冠 = 喉部哈气" },

  "ㅏ": { group: "基本元音", cue: "嘴巴自然张大，干脆短促的 a。", shapeTip: "竖人 ㅣ 右侧一短横（朝外敞开）" },
  "ㅑ": { group: "y 滑音元音", cue: "先带极短的 i 再滑向 ㅏ（ya），一口气完成。", shapeTip: "ㅏ 多加一短横 = 前面多一个 y 滑音" },
  "ㅓ": { group: "易错元音", cue: "嘴唇不收圆、上下自然微张，舌位靠后（切勿直接读成汉语“饿”）。", shapeTip: "竖人 ㅣ 左侧一短横（朝内微收、不圆唇）" },
  "ㅕ": { group: "y 滑音元音", cue: "在 ㅓ 前加极短的 y 滑音（yeo），嘴唇依然不收圆。", shapeTip: "ㅓ 多加一短横 = 前面多一个 y 滑音" },
  "ㅗ": { group: "圆唇元音", cue: "嘴唇明显拢圆向前，舌位偏后；靠“圆唇”与 ㅓ 区分。", shapeTip: "平地 ㅡ 上方一短竖（向上聚拢圆唇）" },
  "ㅛ": { group: "y 滑音元音", cue: "短 y 快速滑入圆唇的 ㅗ（yo）。", shapeTip: "ㅗ 多加一短竖 = 前面多一个 y 滑音" },
  "ㅜ": { group: "圆唇元音", cue: "嘴唇收圆噘起，舌后部抬高（u）；靠“圆唇”与 ㅡ 区分。", shapeTip: "平地 ㅡ 下方一短竖（向下收拢圆唇）" },
  "ㅠ": { group: "y 滑音元音", cue: "短 y 快速滑入圆唇的 ㅜ（yu）。", shapeTip: "ㅜ 多加一短竖 = 前面多一个 y 滑音" },
  "ㅡ": { group: "易错元音", cue: "嘴角向两侧平展绝不噘嘴，舌后部抬高；没有对应汉字谐音。", shapeTip: "一条水平线 = 平展双唇（地）" },
  "ㅣ": { group: "基本元音", cue: "嘴角自然向两边拉开，接近汉语“衣”。", shapeTip: "一条垂直线 = 站立的人" },
  "ㅐ": { group: "组合字母", cue: "嘴张得比 ㅔ 略大，但现代首尔年轻人口语中与 ㅔ 几乎合流。", shapeTip: "ㅏ + ㅣ 合并而成" },
  "ㅒ": { group: "组合字母", cue: "短 y 加 ㅐ（yae），现代口语与 ㅖ 接近。", shapeTip: "ㅑ + ㅣ 合并（多一横 = 加 y）" },
  "ㅔ": { group: "组合字母", cue: "前中元音 e，现代首尔口语常与 ㅐ 读音十分接近。", shapeTip: "ㅓ + ㅣ 合并而成" },
  "ㅖ": { group: "组合字母", cue: "短 y 加 ㅔ（ye），辅音后常简化接近 ㅔ。", shapeTip: "ㅕ + ㅣ 合并（多一横 = 加 y）" },
  "ㅘ": { group: "圆唇滑音", cue: "先圆唇 ㅗ 再快速滑向张口 ㅏ（wa），连成一个音节。", shapeTip: "ㅗ + ㅏ 拼合，符合左圆右张顺序" },
  "ㅙ": { group: "圆唇滑音", cue: "圆唇起首滑向 ㅐ（wae），口语与 ㅚ、ㅞ 极接近。", shapeTip: "ㅗ + ㅐ 拼合" },
  "ㅚ": { group: "圆唇组合", cue: "现代首尔口语通常直接读作双元音 [we]，与 ㅙ、ㅞ 接近。", shapeTip: "ㅗ + ㅣ 拼合" },
  "ㅝ": { group: "圆唇滑音", cue: "从圆唇 ㅜ 快速滑向不圆唇的 ㅓ（wo，注意末尾不圆唇，不同于汉语“窝”）。", shapeTip: "ㅜ + ㅓ 拼合（左/下 ㅜ 接右 ㅓ）" },
  "ㅞ": { group: "圆唇滑音", cue: "从 ㅜ 快速滑向 ㅔ（we），与 ㅙ、ㅚ 口语常合流。", shapeTip: "ㅜ + ㅔ 拼合" },
  "ㅟ": { group: "圆唇滑音", cue: "先圆唇 ㅜ 再迅速展唇滑向 ㅣ（wi）。", shapeTip: "ㅜ + ㅣ 拼合" },
  "ㅢ": { group: "特殊组合", cue: "词首无辅音时先平唇 ㅡ 再滑向 ㅣ；带辅音或作助词“的”时常简读为 [ㅣ] 或 [ㅔ]。", shapeTip: "平地 ㅡ + 竖人 ㅣ 拼合" },
};

export const CONSONANT_FAMILIES = [
  {
    organ: "牙音 · 舌根堵软腭",
    origin: "ㄱ 象舌根抬起贴软腭",
    members: [
      { char: "ㄱ", sample: "가", role: "基本松音（低音）" },
      { char: "ㅋ", sample: "카", role: "加横 → 送气（高音）" },
      { char: "ㄲ", sample: "까", role: "双写 → 紧音（高音）" },
    ],
  },
  {
    organ: "舌音 · 舌尖贴上齿龈",
    origin: "ㄴ 象舌尖上翘贴齿龈",
    members: [
      { char: "ㄴ", sample: "나", role: "鼻音基准" },
      { char: "ㄷ", sample: "다", role: "加顶 → 松音（低音）" },
      { char: "ㅌ", sample: "타", role: "加横 → 送气（高音）" },
      { char: "ㄸ", sample: "따", role: "双写 → 紧音（高音）" },
      { char: "ㄹ", sample: "라", role: "弯曲 → 弹舌流音" },
    ],
  },
  {
    organ: "唇音 · 双唇开合",
    origin: "ㅁ 象双唇闭合的口形",
    members: [
      { char: "ㅁ", sample: "마", role: "闭唇鼻音" },
      { char: "ㅂ", sample: "바", role: "出头 → 松音（低音）" },
      { char: "ㅍ", sample: "파", role: "撑开 → 送气（高音）" },
      { char: "ㅃ", sample: "빠", role: "双写 → 紧音（高音）" },
    ],
  },
  {
    organ: "齿音 · 齿间气流",
    origin: "ㅅ 象牙齿分叉之形",
    members: [
      { char: "ㅅ", sample: "사", role: "擦音松音（低音）" },
      { char: "ㅆ", sample: "싸", role: "双写 → 紧音（高音）" },
      { char: "ㅈ", sample: "자", role: "加顶 → 塞擦松音" },
      { char: "ㅊ", sample: "차", role: "加点 → 送气（高音）" },
      { char: "ㅉ", sample: "짜", role: "双写 → 紧音（高音）" },
    ],
  },
  {
    organ: "喉音 · 咽喉通道",
    origin: "ㅇ 象喉部圆畅之形",
    members: [
      { char: "ㅇ", sample: "아", role: "初声静音／收音 [ŋ]" },
      { char: "ㅎ", sample: "하", role: "加冠 → 喉部送气" },
    ],
  },
] as const;

export const VOWEL_RULES = [
  {
    title: "朝外／朝上（明亮张开或聚圆）",
    rule: "多一笔短线 = 前面多一个 y 滑音",
    pairs: [
      { base: "ㅏ", baseSample: "아", yChar: "ㅑ", ySample: "야", tip: "短横朝右：自然张嘴" },
      { base: "ㅗ", baseSample: "오", yChar: "ㅛ", ySample: "요", tip: "短竖朝上：拢圆双唇" },
    ],
  },
  {
    title: "朝内／朝下（舌位后收或圆唇）",
    rule: "先看短线方向，再看嘴唇圆不圆",
    pairs: [
      { base: "ㅓ", baseSample: "어", yChar: "ㅕ", ySample: "여", tip: "短横朝左：微张不圆唇" },
      { base: "ㅜ", baseSample: "우", yChar: "ㅠ", ySample: "유", tip: "短竖朝下：噘嘴圆唇" },
    ],
  },
] as const;

export type ConsonantContrastGroup = {
  id: string;
  title: string;
  cue: string;
  items: readonly {
    text: string;
    jamo: string;
    kind: "plain" | "tense" | "aspirated";
    label: string;
    acousticTip: string;
  }[];
};

export const CONSONANT_CONTRAST_FAMILIES: readonly ConsonantContrastGroup[] = [
  {
    id: "g-family",
    title: "가 · 까 · 카",
    cue: "舌根组：先听音高低平还是高平，再听有没有强送气",
    items: [
      { text: "가", jamo: "ㄱ", kind: "plain", label: "ㄱ 松音", acousticTip: "词首音调明显偏低、喉部放松，带极轻气流。" },
      { text: "까", jamo: "ㄲ", kind: "tense", label: "ㄲ 紧音", acousticTip: "词首音调高平、声门收紧，干脆利落不吐气。" },
      { text: "카", jamo: "ㅋ", kind: "aspirated", label: "ㅋ 送气", acousticTip: "词首音调高平 + 强气流喷出，能吹动纸片。" },
    ],
  },
  {
    id: "d-family",
    title: "다 · 따 · 타",
    cue: "舌尖组：다 低柔，따 高紧，타 高且送气",
    items: [
      { text: "다", jamo: "ㄷ", kind: "plain", label: "ㄷ 松音", acousticTip: "词首音调偏低、舌尖放松轻弹。" },
      { text: "따", jamo: "ㄸ", kind: "tense", label: "ㄸ 紧音", acousticTip: "词首音调高平、舌尖紧绷后闭塞爆发，无送气。" },
      { text: "타", jamo: "ㅌ", kind: "aspirated", label: "ㅌ 送气", acousticTip: "词首音调高平 + 舌尖放开时喷出明显气流。" },
    ],
  },
  {
    id: "b-family",
    title: "바 · 빠 · 파",
    cue: "双唇组：不要按拼音 b/p 套清浊，听高低与气流",
    items: [
      { text: "바", jamo: "ㅂ", kind: "plain", label: "ㅂ 松音", acousticTip: "词首双唇放松、音调偏低。" },
      { text: "빠", jamo: "ㅃ", kind: "tense", label: "ㅃ 紧音", acousticTip: "词首双唇绷紧、音调高平，短促不送气。" },
      { text: "파", jamo: "ㅍ", kind: "aspirated", label: "ㅍ 送气", acousticTip: "词首音调高平 + 双唇冲开强送气。" },
    ],
  },
  {
    id: "j-family",
    title: "자 · 짜 · 차",
    cue: "舌面组：都不卷舌，靠低音放松 / 高音紧绷 / 强送气区分",
    items: [
      { text: "자", jamo: "ㅈ", kind: "plain", label: "ㅈ 松音", acousticTip: "不卷舌，词首音调偏低且自然放松。" },
      { text: "짜", jamo: "ㅉ", kind: "tense", label: "ㅉ 紧音", acousticTip: "不卷舌，词首音调高平、喉部收紧。" },
      { text: "차", jamo: "ㅊ", kind: "aspirated", label: "ㅊ 送气", acousticTip: "不卷舌，词首音调高平 + 明显送气摩擦。" },
    ],
  },
  {
    id: "s-family",
    title: "사 · 싸",
    cue: "齿间擦音组：没有独立送气档，靠「低缓漏气 vs 高紧集中」区分",
    items: [
      { text: "사", jamo: "ㅅ", kind: "plain", label: "ㅅ 松音（低缓）", acousticTip: "词首音调偏低，齿缝气流松散柔和。" },
      { text: "싸", jamo: "ㅆ", kind: "tense", label: "ㅆ 紧音（高紧）", acousticTip: "词首音调高平，齿缝摩擦紧促尖锐。" },
    ],
  },
] as const;

export type ChallengeQuestion = {
  familyIndex: number;
  targetIndex: number;
};

export function buildConsonantContrastQuestions(random: () => number = Math.random): ChallengeQuestion[] {
  const pool: ChallengeQuestion[] = [];
  CONSONANT_CONTRAST_FAMILIES.forEach((family, familyIndex) => {
    family.items.forEach((_, targetIndex) => {
      pool.push({ familyIndex, targetIndex });
    });
  });
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const swap = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[swap]] = [shuffled[swap], shuffled[i]];
  }
  return shuffled.slice(0, 8);
}
