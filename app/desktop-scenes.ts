export const workspaces = [
  { key: "today", title: "今天", start: "top" },
  { key: "letters", title: "40 音", start: "learn" },
  { key: "practice", title: "练习", start: "games" },
  { key: "review", title: "复习", start: "daily-review" },
] as const;

export const scenes = {
  top: ["today", "学习首页"],
  "my-day": ["today", "我的韩语日课"],
  "today-plan": ["today", "今日路线"],
  learn: ["letters", "40 音点读"],
  starter: ["letters", "新手路线"],
  builder: ["letters", "音节拼读"],
  compare: ["letters", "辅音对比"],
  "pronunciation-practice": ["letters", "元音对比"],
  "batchim-lesson": ["letters", "收音入门"],
  games: ["practice", "闯关训练"],
  phrases: ["practice", "词句背诵"],
  "daily-review": ["review", "词句回忆"],
  "learning-tools": ["settings", "设置与备份"],
  "audio-guide": ["settings", "音源与反馈"],
} as const;
export type Scene = keyof typeof scenes;
export function isScene(value: unknown): value is Scene {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(scenes, value);
}

export const RESUME_KEY = "hangul-last-study-v48";
export type StudyPlace = { scene: Scene; detail: string; subset: string; filter?: "all" | "learning" };
export function studyScene(scene: Scene) {
  return scene !== "top" && scene !== "my-day" && scene !== "today-plan" && scenes[scene][0] !== "settings";
}
export function savedPlace(raw: string | null): StudyPlace | null {
  try {
    const item = JSON.parse(raw || "null");
    if (!item || !isScene(item.scene) || !studyScene(item.scene)) return null;
    return { scene: item.scene, detail: typeof item.detail === "string" ? item.detail : "", subset: typeof item.subset === "string" ? item.subset : "", filter: item.filter === "learning" ? "learning" : "all" };
  } catch { return null; }
}

/** Old bookmarks may address a control inside a section instead of the section itself. */
export function sceneForTarget(id: string): Scene | null {
  if (!id) return "top";
  if (isScene(id)) return id;
  const element = document.getElementById(id);
  const enclosing = element?.closest("[data-scene]")?.getAttribute("data-scene");
  return isScene(enclosing) ? enclosing : null;
}
