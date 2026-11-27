export type OriginKind = "hanja" | "loan" | "native" | "mixed";

export type SentenceChunk = {
  ko: string;
  gloss: string;
  role?: string;
};

export type PhraseStudyNote = {
  /** Surface pronunciation when standard phonological rules change literal block reading. */
  actualReading?: string;
  /** Beginner-friendly explanation of sound changes or final-consonant articulation. */
  soundNote: string;
  originKind: OriginKind;
  originBadge: string;
  /** Verified etymology (NIKL dictionary Hanja / English source) — never Chinese homophones. */
  originNote: string;
  /** Word-by-word / particle breakdown for sentences. */
  chunks?: readonly SentenceChunk[];
  /** Word-order or reusable sentence frame note for Chinese speakers. */
  grammarNote?: string;
};

export const ORIGIN_LABELS: Readonly<Record<OriginKind, string>> = {
  hanja: "汉字词",
  loan: "外来词",
  native: "固有词",
  mixed: "混合构成",
};

export const PHRASE_STUDY_NOTES: Readonly<Record<string, PhraseStudyNote>> = {
  "word-hello": {
    soundNote: "안녕 的收音 ㄴ 与 ㅇ 都是鼻音；하세요 中的 ㅎ 在元音/鼻音后气流放轻，整句自然连贯。",
    originKind: "mixed",
    originBadge: "安寧 + 敬语",
    originNote: "안녕 源自汉字词「安寧」（平安无恙），하세요 是礼貌问候词尾；并非汉语谐音。",
  },
  "word-thanks": {
    actualReading: "감사함니다",
    soundNote: "鼻音化：합 的收音 ㅂ 遇到后面 니 的 ㄴ 时，双唇不爆破而同化读成鼻音 ㅁ，实际读 [감사함니다]。",
    originKind: "mixed",
    originBadge: "感謝 + 敬语",
    originNote: "감사 对应汉字词「感謝」，합니다 是正式敬语词尾。",
  },
  "word-yes": {
    soundNote: "单音节开音节，舌位自然放松，干脆读出即可。",
    originKind: "native",
    originBadge: "韩语固有词",
    originNote: "日常高频回应词，不对应汉字；句尾带升调可表反问“嗯？/什么？”，降调表答应“好的”。",
  },
  "word-no": {
    soundNote: "首字 아 初声 ㅇ 静音，直接从 ㅏ 起音；三拍均匀自然。",
    originKind: "native",
    originBadge: "韩语固有词",
    originNote: "礼貌否定回应（加了敬语尾 -요），用于礼貌说“不是/不用了”。",
  },
  "word-sorry": {
    soundNote: "미안 的收音 ㄴ 后接 해요 时，ㅎ 在有声鼻音后明显弱化，口语连读听感接近 [미아내요]。",
    originKind: "mixed",
    originBadge: "未安 + 해요",
    originNote: "미안 对应汉字词「未安」（心里过意不去），해요 为柔和礼貌体。",
  },
  "word-okay": {
    actualReading: "괜차나요",
    soundNote: "ㅎ 脱落 + 连音化：찮 底部的双收音 ㄶ 遇到后面元音开头的 아，ㅎ 不发音，ㄴ 滑过去读成 [괜차나요]。",
    originKind: "native",
    originBadge: "韩语固有词",
    originNote: "既能回应道歉“没关系”，也能礼貌婉拒“不用了，谢谢”。",
  },
  "word-person": {
    actualReading: "사ː람",
    soundNote: "词尾收音 ㅁ 必须把双唇闭拢收住（-m），不要读成舌尖抵齿龈的 ㄴ（-n），也不要多加元音。",
    originKind: "native",
    originBadge: "韩语固有词",
    originNote: "固有词，无对应汉字；常接在国名后，如 중국 사람（中国人）。",
  },
  "word-friend": {
    soundNote: "친 是强送气 ㅊ（高音起首），구 在鼻音 ㄴ 之后自然微浊化。",
    originKind: "hanja",
    originBadge: "親舊（汉字词）",
    originNote: "词典词源为汉字词「親舊」（亲近的旧交），现代韩语通常指同龄朋友。",
  },
  "word-family": {
    soundNote: "词尾收音 ㄱ 舌根贴住软腭立刻收住，不送气、不爆破，切忌在末尾多读出一个“克”。",
    originKind: "hanja",
    originBadge: "家族（汉字词）",
    originNote: "对应汉字词「家族」（가=家，족=族），含义是“家人、家庭”。",
  },
  "word-home": {
    soundNote: "词尾收音 ㅂ 双唇闭合即停，不松开爆破，切忌读成两个音节“吉普”。",
    originKind: "native",
    originBadge: "韩语固有词",
    originNote: "固有词，既指“家”也指“房子/店铺”（如 밥집 饭馆）。",
  },
  "word-school": {
    actualReading: "학꾜",
    soundNote: "紧音化：前字 학 有闭塞收音 ㄱ，使后字松音 ㄱ 紧音化，实际读作 [학꾜]。",
    originKind: "hanja",
    originBadge: "學校（汉字词）",
    originNote: "对应汉字词「學校」：학=學（如 학생 学生、대학 大学），교=校。",
  },
  "word-company": {
    soundNote: "회 中的 ㅚ 在现代首尔口语里常读得接近 ㅞ [훼사]；사 为松音。",
    originKind: "hanja",
    originBadge: "會社（汉字词）",
    originNote: "对应汉字词「會社」，即“公司”：회=會（如 회의 会议），사=社。",
  },
  "word-toilet": {
    soundNote: "장 的收音 ㅇ 读后鼻音 [ŋ]；词尾 실 的收音 ㄹ 舌尖轻贴上齿龈收住，不要像儿化音那样卷舌。",
    originKind: "hanja",
    originBadge: "化粧室（汉字词）",
    originNote: "对应汉字词「化粧室」：화장=化妆，실=室（如 교실 教室、사무실 办公室）。",
  },
  "word-water": {
    soundNote: "ㅜ 嘴唇收圆，词尾 ㄹ 舌尖贴住上齿龈两侧通气，不要加元音。",
    originKind: "native",
    originBadge: "韩语固有词",
    originNote: "固有词，餐馆要水可直接说 물 주세요（请给我水）。",
  },
  "word-meal": {
    soundNote: "词首 ㅂ 放松低音起首，词尾收音 ㅂ 双唇闭紧收住，不爆破。",
    originKind: "native",
    originBadge: "韩语固有词",
    originNote: "固有词，指米饭或一顿饭。",
  },
  "word-coffee": {
    soundNote: "커 与 피 都是强送气音（ㅋ、ㅍ），词首音调高平；커 的元音是 ㅓ（不圆唇），不要读成圆唇 ㅗ。",
    originKind: "loan",
    originBadge: "coffee（外来词）",
    originNote: "源自英语 coffee；韩语没有 f 音，通常借用送气双唇音 ㅍ 对应。",
  },
  "word-today": {
    soundNote: "오 圆唇起音；늘 的元音 ㅡ 嘴唇平展不圆，词尾 ㄹ 舌尖贴住上齿龈。",
    originKind: "native",
    originBadge: "韩语固有词",
    originNote: "固有词，指“今天”。",
  },
  "word-tomorrow": {
    soundNote: "내 的 ㅐ 现代口语接近 ㅔ；일 初声 ㅇ 静音，词尾 ㄹ 舌尖贴上齿龈。",
    originKind: "hanja",
    originBadge: "來日（汉字词）",
    originNote: "词典词源为汉字词「來日」（내=來，일=日，日即“天”）。",
  },
  "word-now": {
    soundNote: "금 的元音 ㅡ 不圆唇，收音 ㅁ 必须闭拢双唇（-m），不要读成舌尖音 ㄴ。",
    originKind: "native",
    originBadge: "韩语固有词",
    originNote: "现代标准词典归为固有词（虽历史上与汉字“只今”有关），日常指“现在”。",
  },
  "word-good": {
    actualReading: "조아요",
    soundNote: "ㅎ 脱落：좋 的收音 ㅎ 遇到后面元音开头的 아 时脱落不发音，连起来直接读 [조아요]。",
    originKind: "native",
    originBadge: "韩语固有词",
    originNote: "形容词 좋다（好）的礼貌口语形，常表“好呀／赞同／喜欢”。",
  },
  "word-please": {
    soundNote: "三个开音节无收音；주 词首松音 ㅈ 不卷舌、音调偏低。",
    originKind: "native",
    originBadge: "韩语固有词",
    originNote: "由动词 주다（给）+ 敬语尾 -세요 构成，接在名词后就是“请给我…”。",
  },
  "word-where": {
    soundNote: "어 初声静音、元音 ㅓ 不圆唇；不含收音，可直接按字面拼读。",
    originKind: "native",
    originBadge: "韩语固有词",
    originNote: "疑问代词“哪里”，后接 예요 就构成“在哪里？”。",
  },
  "word-what": {
    soundNote: "复合元音 ㅝ 由圆唇 ㅜ 快速滑向不圆唇的 ㅓ，不要直接读成汉语拼音“窝”。",
    originKind: "native",
    originBadge: "韩语固有词",
    originNote: "무엇（什么）的口语缩略形，后接 예요 即“是什么？”。",
  },
  "word-howmuch": {
    soundNote: "얼 的收音 ㄹ 先让舌尖贴住上齿龈，再双唇闭合发 마。",
    originKind: "native",
    originBadge: "韩语固有词",
    originNote: "固有词“多少”，问价格时常说 얼마예요?（多少钱？）。",
  },
  "word-sorry-formal": {
    actualReading: "죄송함니다",
    soundNote: "鼻音化：합 的收音 ㅂ 遇 니 的 ㄴ 同化为 ㅁ，实际读 [죄송함니다]；죄 口语接近 [줴]。",
    originKind: "mixed",
    originBadge: "罪悚 + 합니다",
    originNote: "죄송 对应汉字词「罪悚」（惶恐抱歉），对店员、陌生人、长辈致歉比 미안해요 更得体。",
  },
  "word-subway": {
    soundNote: "철 是送气音 ㅊ + 不圆唇 ㅓ + 舌尖收音 ㄹ，词尾舌尖抵住上齿龈收尾。",
    originKind: "hanja",
    originBadge: "地下鐵（汉字词）",
    originNote: "对应汉字词「地下鐵」：지=地，하=下，철=鐵；再加 역（驛）就是 지하철역（地铁站）。",
  },
  "word-bus": {
    soundNote: "버 的元音 ㅓ 不圆唇，스 的元音 ㅡ 平唇不圆，用来为外来词尾辅音垫音。",
    originKind: "loan",
    originBadge: "bus（外来词）",
    originNote: "源自英语 bus；韩语词尾 s 不能直接悬空，常借用 스 音节收尾。",
  },
  "word-menu": {
    soundNote: "뉴 带 i 滑音快速滑向圆唇 ㅜ（nyu）。",
    originKind: "loan",
    originBadge: "menu（外来词）",
    originNote: "源自英语 menu；“菜单本/菜牌”常加汉字词 판（板）说成 메뉴판。",
  },
  "word-card": {
    soundNote: "카 是强送气 ㅋ（高音起首），드 的元音 ㅡ 嘴唇平展轻短。",
    originKind: "loan",
    originBadge: "card（外来词）",
    originNote: "源自英语 card，结账时说 카드 默认指银行卡/信用卡，交通卡则是 교통카드。",
  },
  "word-cash": {
    soundNote: "현 是舌尖收音 ㄴ（-n），금 是双唇收音 ㅁ（-m），注意一前一闭的口型切换。",
    originKind: "hanja",
    originBadge: "現金（汉字词）",
    originNote: "对应汉字词「現金」：현=現（如 현재 现在），금=金（钱款）。",
  },
  "word-receipt": {
    soundNote: "영 和 증 底部的 ㅇ 都作收音，读后鼻音 [ŋ]；영 开头上面的 ㅇ 才是静音。",
    originKind: "hanja",
    originBadge: "領收證（汉字词）",
    originNote: "对应汉字词「領收證」（领取收款凭证，即收据/小票）：증=證（如 학생증 学生证）。",
  },
  "word-pharmacy": {
    actualReading: "약꾹",
    soundNote: "紧音化：前字 약 的收音 ㄱ 使后字 국 紧音化读作 [약꾹]；末尾 ㄱ 舌根收住不爆破。",
    originKind: "hanja",
    originBadge: "藥局（汉字词）",
    originNote: "对应汉字词「藥局」：약=藥，국=局（如 우체국 邮局）。",
  },

  "sentence-chinese": {
    actualReading: "저는 중국 사라미에요",
    soundNote: "连音化：사람 的收音 ㅁ 遇到后接系词 이에요 的静音初声 ㅇ，滑过去连读成 [사라미에요]。",
    originKind: "mixed",
    originBadge: "中國 + 固有词",
    originNote: "중국 对应汉字词「中國」；사람 为固有词“人”。",
    chunks: [
      { ko: "저는", gloss: "我", role: "-는 主题助词" },
      { ko: "중국 사람", gloss: "中国人", role: "名词" },
      { ko: "이에요.", gloss: "是", role: "礼貌判断词尾" },
    ],
    grammarNote: "句式骨架：「A는 B이에요/예요」（A 是 B）。有收音接 이에요，无收音接 예요。",
  },
  "sentence-study": {
    actualReading: "저는 한구거를 공부해요",
    soundNote: "连音化：한국 的收音 ㄱ 遇元音 어 连读成 [한구거]，所以 한국어를 读作 [한구거를]。",
    originKind: "mixed",
    originBadge: "韓國語 · 工夫",
    originNote: "한국어 =「韓國語」，공부 =「工夫」（韩语中专指学习、用功）。",
    chunks: [
      { ko: "저는", gloss: "我", role: "-는 主题" },
      { ko: "한국어를", gloss: "韩语", role: "-를 宾语（放动词前）" },
      { ko: "공부해요.", gloss: "学习", role: "动词礼貌体" },
    ],
    grammarNote: "中韩最大语序差异：中文说「我 学 韩语」，韩语把宾语提前说「我 韩语(를) 学习」。",
  },
  "sentence-name": {
    actualReading: "이르미 뭐예요",
    soundNote: "连音化：이름（名字）的收音 ㅁ 遇到主格助词 이，自然连读成 [이르미]。",
    originKind: "native",
    originBadge: "固有词日常句",
    originNote: "이름（名字）与 뭐（什么）均为固有词。",
    chunks: [
      { ko: "이름이", gloss: "名字", role: "-이 主格助词" },
      { ko: "뭐예요?", gloss: "是什么？", role: "뭐 + 예요" },
    ],
    grammarNote: "提问骨架：「名词 + 이/가 뭐예요?」（…是什么？）。有收音用 -이，无收音用 -가。",
  },
  "sentence-meet": {
    soundNote: "만나서 中前字收音 ㄴ 接后字初声 ㄴ，鼻音清晰连贯，不要吞掉前一个 ㄴ。",
    originKind: "native",
    originBadge: "固有词寒暄",
    originNote: "만나다（见面）与 반갑다（高兴）均为固有词。",
    chunks: [
      { ko: "만나서", gloss: "因为见到你", role: "-아서 先后/原因连接" },
      { ko: "반가워요.", gloss: "很高兴", role: "形容词礼貌体" },
    ],
    grammarNote: "初次见面固定寒暄，常跟在 안녕하세요 后面连说。",
  },
  "sentence-this": {
    soundNote: "全句均为无收音的开音节，按字面清晰连读即可；거 的元音是 ㅓ（不圆唇）。",
    originKind: "native",
    originBadge: "固有词高频句",
    originNote: "이거 是 이것（这个）的口语形，点餐购物指着商品就能直接用。",
    chunks: [
      { ko: "이거", gloss: "这个", role: "指代词" },
      { ko: "주세요.", gloss: "请给我", role: "请求句尾" },
    ],
    grammarNote: "生存第一句型：「东西 + 주세요」（请给我…），可替换成 물 주세요、커피 주세요。",
  },
  "sentence-price": {
    soundNote: "얼 的 ㄹ 舌尖贴住上齿龈后再发 마；句末升调表疑问。",
    originKind: "native",
    originBadge: "固有词高频句",
    originNote: "얼마 末尾的 마 无收音，后面直接接 예요 构成礼貌提问。",
    chunks: [
      { ko: "얼마", gloss: "多少钱", role: "疑问词" },
      { ko: "예요?", gloss: "是…吗？", role: "无收音接 예요" },
    ],
    grammarNote: "结账问价固定短句，也可在前面加 이거 说成「이거 얼마예요?」（这个多少钱？）。",
  },
  "sentence-toilet": {
    actualReading: "화장시리 어디예요",
    soundNote: "连音化：화장실 的词尾收音 ㄹ 遇到助词 이，变成弹音连读为 [화장시리]。",
    originKind: "mixed",
    originBadge: "化粧室 + 固有词",
    originNote: "화장실 为汉字词「化粧室」，어디 为固有词“哪里”。",
    chunks: [
      { ko: "화장실이", gloss: "卫生间", role: "-이 主格助词" },
      { ko: "어디예요?", gloss: "在哪里？", role: "方位提问" },
    ],
    grammarNote: "问路万能骨架：「地点 + 이/가 어디예요?」，把前面换成 지하철역、약국 就能问任何地方。",
  },
  "sentence-slow": {
    soundNote: "천천히 与 말해 中的 ㅎ 紧跟在 ㄴ、ㄹ 后面，自然语速下气流常弱化，听起来接近 [천처니 마래 주세요]。",
    originKind: "native",
    originBadge: "固有词求助句",
    originNote: "천천히（慢慢地）、말하다（说话）均为日常高频词。",
    chunks: [
      { ko: "천천히", gloss: "慢慢地", role: "副词" },
      { ko: "말해", gloss: "说", role: "动词连接形" },
      { ko: "주세요.", gloss: "请帮我…", role: "礼貌请求" },
    ],
    grammarNote: "动作请求骨架：「动词-아/어 주세요」（请帮我做某事）。",
  },
  "sentence-again": {
    soundNote: "다시 无收音清晰直读；말해 口语里 ㅎ 轻微弱化。",
    originKind: "native",
    originBadge: "固有词求助句",
    originNote: "다시 意为“再一次、重新”，与上一句共用 말해 주세요 句尾。",
    chunks: [
      { ko: "다시", gloss: "再一次", role: "副词" },
      { ko: "말해 주세요.", gloss: "请说一下", role: "礼貌请求" },
    ],
    grammarNote: "对比记忆：只把「천천히」（慢点）换成「다시」（再次），就得到另一句核心听不懂自救句。",
  },
  "sentence-dontknow": {
    actualReading: "잘 모르게써요",
    soundNote: "连音化：겠 底部的紧音收音 ㅆ 遇到后面 어 的静音初声 ㅇ，连读到后一字读作 [모르게써요]。",
    originKind: "native",
    originBadge: "固有词委婉句",
    originNote: "모르다 意为“不知道”，加 -겠- 让语气更委婉客气（“我不太清楚”）。",
    chunks: [
      { ko: "잘", gloss: "很好地/清楚地", role: "副词" },
      { ko: "모르겠어요.", gloss: "不太知道", role: "委婉礼貌体" },
    ],
    grammarNote: "韩国人被问路或不确定时最常说的委婉表达，比生硬说“不知道”更自然。",
  },
  "sentence-weather": {
    actualReading: "오늘 날씨가 조아요",
    soundNote: "날씨 中 씨 本身是紧音 ㅆ（高音紧促）；좋아요 的 ㅎ 脱落读作 [조아요]。",
    originKind: "native",
    originBadge: "固有词日常句",
    originNote: "오늘（今天）、날씨（天气）、좋아요（好）全部是韩语核心固有词。",
    chunks: [
      { ko: "오늘", gloss: "今天", role: "时间词" },
      { ko: "날씨가", gloss: "天气", role: "-가 主格助词（无收音）" },
      { ko: "좋아요.", gloss: "很好", role: "形容词礼貌体" },
    ],
    grammarNote: "描述状态骨架：「时间 + 主语(이/가) + 形容词」，注意 날씨 没有收音所以接 -가。",
  },
  "sentence-tomorrow": {
    soundNote: "내일 收音 ㄹ 贴齿龈；또 是紧音 ㄸ，喉部收紧、音调高脆。",
    originKind: "mixed",
    originBadge: "來日 + 固有词",
    originNote: "내일 为汉字词「來日」（明天），또（又/再）与 만나다（见面）为固有词。",
    chunks: [
      { ko: "내일", gloss: "明天", role: "时间词" },
      { ko: "또", gloss: "再/又", role: "副词" },
      { ko: "만나요.", gloss: "见吧", role: "礼貌道别" },
    ],
    grammarNote: "熟人、同学或同事分开时非常自然的道别句。",
  },
  "sentence-subway": {
    actualReading: "지하철려기 어디예요",
    soundNote: "流音化 + 连音化：复合词 지하철+역 中间添音并流音化读 [지하철력]，末尾 ㄱ 再与 이 连读成 [지하철려기]。",
    originKind: "mixed",
    originBadge: "地下鐵驛 + 固有词",
    originNote: "지하철역 对应汉字词「地下鐵驛」（역=驛，韩语中指火车站/地铁站）。",
    chunks: [
      { ko: "지하철역이", gloss: "地铁站", role: "-이 主格助词" },
      { ko: "어디예요?", gloss: "在哪里？", role: "方位提问" },
    ],
    grammarNote: "套用问路骨架「地点 + 이/가 어디예요?」；注意听音频里 철려기 的真实连读。",
  },
  "sentence-get-off": {
    soundNote: "全句无闭塞收音，내려 的 려 舌尖轻弹一下 [ɾjʌ] 即可，不要卷舌。",
    originKind: "native",
    originBadge: "固有词交通句",
    originNote: "여기（这里）+ 서（在…地点），내리다（下车）。",
    chunks: [
      { ko: "여기서", gloss: "在这里", role: "여기 + 서（地点）" },
      { ko: "내려", gloss: "放下/下车", role: "动词连接形" },
      { ko: "주세요.", gloss: "请让我…", role: "礼貌请求" },
    ],
    grammarNote: "乘出租车或巴士快到目的地时直接对司机说。",
  },
  "sentence-menu": {
    soundNote: "판 收音 ㄴ 舌尖贴齿龈，좀 收音 ㅁ 双唇闭合，两个鼻音口型不同。",
    originKind: "mixed",
    originBadge: "menu板 + 固有词",
    originNote: "메뉴（英语 menu）+ 판（汉字词「板」）= 菜单牌；좀 用于缓和请求语气（“稍微/劳烦”）。",
    chunks: [
      { ko: "메뉴판", gloss: "菜单", role: "名词" },
      { ko: "좀", gloss: "稍微/劳烦", role: "语气缓和词" },
      { ko: "보여 주세요.", gloss: "请给我看", role: "礼貌请求" },
    ],
    grammarNote: "在请求句里加一个「좀」，听起来会比直接命令柔和礼貌得多。",
  },
  "sentence-takeout": {
    soundNote: "포 是强送气 ㅍ（高音起首），장 的收音 ㅇ 读后鼻音 [ŋ]。",
    originKind: "mixed",
    originBadge: "包裝 + 해 주세요",
    originNote: "포장 对应汉字词「包裝」，餐厅点单里指“打包外带”。",
    chunks: [
      { ko: "포장해", gloss: "打包", role: "포장(包裝) + 해" },
      { ko: "주세요.", gloss: "请帮我…", role: "礼貌请求" },
    ],
    grammarNote: "「汉字词动作 + 해 주세요」是极好用的点单模板（如 포장해 주세요 打包、계산해 주세요 结账）。",
  },
  "sentence-bill": {
    soundNote: "계 标准读音带滑音，现代日常口语里辅音后的 ㅖ 常简化读得接近 ㅔ [게산해 주세요]。",
    originKind: "mixed",
    originBadge: "計算 + 해 주세요",
    originNote: "계산 对应汉字词「計算」，在餐厅商店里意为“算账、买单”。",
    chunks: [
      { ko: "계산해", gloss: "结账", role: "계산(計算) + 해" },
      { ko: "주세요.", gloss: "请帮我…", role: "礼貌请求" },
    ],
    grammarNote: "与「포장해 주세요」完全同构，记住一套句尾就能说两句。",
  },
  "sentence-card": {
    soundNote: "돼 是 되+어 的缩略形，现代首尔语读音与 왜/웨 接近；句尾升调提问。",
    originKind: "mixed",
    originBadge: "card + 固有词",
    originNote: "카드 源自英语 card，돼요 来自 되다（可以、行得通）。",
    chunks: [
      { ko: "카드", gloss: "刷卡", role: "省去助词的口语主题" },
      { ko: "돼요?", gloss: "可以吗？", role: "许可提问" },
    ],
    grammarNote: "超短实用骨架：「名词 + 돼요?」（可以用…吗？／…行吗？），如 현금 돼요?（能付现金吗？）。",
  },
  "sentence-time": {
    actualReading: "지금 몃 씨예요",
    soundNote: "代表音 + 紧音化：몇 的收音 ㅊ 在音节末归为代表音 [ㄷ]（舌尖堵住不爆破），并使后面 시 紧音化读成 [씨]。",
    originKind: "mixed",
    originBadge: "固有词 + 時",
    originNote: "지금（现在）、몇（几）为固有词；시 对应汉字词「時」（几点钟的“点”）。",
    chunks: [
      { ko: "지금", gloss: "现在", role: "时间词" },
      { ko: "몇 시", gloss: "几点", role: "疑问词 + 量词" },
      { ko: "예요?", gloss: "是…吗？", role: "礼貌疑问" },
    ],
    grammarNote: "听辨重点：不要在音频里找“몇 ch”的气音，真实连读听到的是紧促的 [몃 씨예요]。",
  },
  "sentence-help": {
    soundNote: "와 由圆唇 ㅗ 快速滑向 ㅏ；全句无收音，紧急时连贯读出即可。",
    originKind: "native",
    originBadge: "固有词求助句",
    originNote: "由动词 돕다（帮助）发生 ㅂ 不规则变化为 도와 + 주세요 构成。",
    chunks: [
      { ko: "도와", gloss: "帮助", role: "돕다 的连接形" },
      { ko: "주세요.", gloss: "请帮我", role: "礼貌请求" },
    ],
    grammarNote: "迷路、丢东西或突发状况时的核心求助短句。",
  },
};
