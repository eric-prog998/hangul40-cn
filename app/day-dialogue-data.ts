/** One reply opens a conversation; these are examples, not an answer key. */
export type DialogueLine = {
  ko: string;
  zh: string;
  /** Present only when the packaged clip says the entire line verbatim. */
  clip?: string;
};
type Reply = DialogueLine & { intent: string };
type DialogueScene = {
  title: string; role: string; setting: string; firstCue: string; returnCue: string;
  prompt: DialogueLine; replies: readonly [Reply, Reply];
  bridge: string;
};

export const DAY_DIALOGUES: readonly DialogueScene[] = [
  {
    title: "便利店结账", role: "店员", setting: "收银台前，店员指了指购物袋。",
    firstCue: "你想要一个袋子。听完店员的话，用韩语接一句。",
    returnCue: "今天你自己带了袋子。店员问要不要袋子，你怎么婉拒？",
    prompt: { ko: "봉투 필요하세요?", zh: "需要袋子吗？" },
    replies: [
      { intent: "需要一个", ko: "네, 하나 주세요.", zh: "好的，请给我一个。" },
      { intent: "自己带了，不需要", ko: "아니요, 괜찮아요.", zh: "不用了，谢谢。" },
    ],
    bridge: "从字母到开口：하 由 ㅎ 和 ㅏ 拼成。在 하나（一个）里找到它，再读整句。",
  },
  {
    title: "餐厅点餐", role: "餐厅店员", setting: "小餐馆里，你看着菜单，准备点餐。",
    firstCue: "你已经选好了，指着菜单上的菜。用一句韩语来点它。",
    returnCue: "你刚坐下还没拿到菜单。服务员来点餐时，你想先看看菜单，怎么说？",
    prompt: { ko: "뭐 드릴까요?", zh: "想要点什么？" },
    replies: [
      { intent: "点眼前这道菜", ko: "이거 주세요.", zh: "请给我这个。", clip: "/audio/phrases/sentence-this.mp3" },
      { intent: "想先看看菜单", ko: "메뉴판 좀 보여 주세요.", zh: "请给我看一下菜单。", clip: "/audio/phrases/sentence-menu.mp3" },
    ],
    bridge: "从字母到开口：거 由 ㄱ 和 ㅓ 拼成。把 이、거 连起来，就能说 이거（这个）。",
  },
  {
    title: "没听懂，请再说一遍", role: "问路的人", setting: "街上有人向你问路，你没听清对方的话。",
    firstCue: "不用猜地点。先开口，请对方把刚才的话再说一遍。",
    returnCue: "对方重复了，但速度仍太快。你想请对方说慢一点，怎么说？",
    prompt: { ko: "지하철역이 어디예요?", zh: "地铁站在哪里？", clip: "/audio/phrases/sentence-subway.mp3" },
    replies: [
      { intent: "请再说一遍", ko: "다시 말해 주세요.", zh: "请再说一遍。", clip: "/audio/phrases/sentence-again.mp3" },
      { intent: "请说慢一些", ko: "천천히 말해 주세요.", zh: "请慢慢说。", clip: "/audio/phrases/sentence-slow.mp3" },
    ],
    bridge: "从字母到开口：다 由 ㄷ 和 ㅏ 拼成。读 다시（再次），再接上 말해 주세요。",
  },
];
export const SCENE_TITLES: readonly string[] = DAY_DIALOGUES.map(scene => scene.title);
export const SCENE_LINES: readonly string[] = DAY_DIALOGUES.map(scene => scene.replies[0].ko);

export function chooseLocalKoreanVoice<V extends {lang: string; localService: boolean}>(voices: readonly V[]): V | undefined {
  const lang = (v: V) => v.lang.toLowerCase().replaceAll("_", "-");
  const local = voices.filter(v => v.localService && /^ko(?:-|$)/.test(lang(v)));
  return local.find(v => lang(v) === "ko-kr") ?? local[0];
}
