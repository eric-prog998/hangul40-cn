"use client";
import { useRef, useState, type ChangeEvent } from "react";
import { AUTO_ADVANCE_OPTIONS, type AutoAdvanceDelay } from "./learning-settings";
import { BACKUP_MAX_BYTES, backupFileName, type PortableBackup } from "./portable-backup";

type Props = {
  autoAdvanceMs: AutoAdvanceDelay;
  onAutoAdvance: (value: AutoAdvanceDelay) => void;
  onPrepare: () => void;
  onExport: () => Promise<PortableBackup>;
  onParse: (text: string) => PortableBackup;
  onImport: (backup: PortableBackup) => Promise<string>;
};

export default function LearningTools({ autoAdvanceMs, onAutoAdvance, onPrepare, onExport, onParse, onImport }: Props) {
  const [pending, setPending] = useState<PortableBackup | null>(null);
  const [message, setMessage] = useState("备份只下载到你的设备；导入文件只在浏览器读取，不会上传。");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const inFlight = useRef(false);

  async function exportBackup() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); onPrepare();
    try {
      const backup = await onExport();
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = backupFileName(backup.createdAt);
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("已发起备份下载，请检查浏览器下载列表。把 JSON 文件带到另一台设备即可导入。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "导出未完成，请重试；原记录未改变。"); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || inFlight.current) return;
    onPrepare(); const token = ++request.current; setPending(null); setBusy(true);
    try {
      if (file.size > BACKUP_MAX_BYTES) throw new Error("备份超过 2 MB，无法导入；原记录未改变。");
      const data = onParse(await file.text());
      if (token !== request.current) return;
      setPending(data); setMessage("文件检查通过。请核对下方摘要，确认后才会合并到本浏览器。");
    } catch (error) { if (token === request.current) setMessage(error instanceof Error ? error.message : "无法读取备份；原记录未改变。"); }
    finally { if (token === request.current) setBusy(false); }
  }

  async function importBackup() {
    if (!pending || inFlight.current) return;
    inFlight.current = true; setBusy(true); onPrepare();
    try { setMessage(await onImport(pending)); setPending(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : "未能完成恢复，请保留备份并重试。"); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <section id="learning-tools" className="learning-tools" aria-labelledby="learning-tools-title" data-keyboard-scope="settings" tabIndex={-1}>
    <div className="learning-tools-heading"><span className="section-kicker">按自己的节奏，安心接着学</span><h2 id="learning-tools-title">进度与练习设置</h2><p>不需要注册新账号。设置与学习记录保存在当前浏览器，备份由你自己保管。</p></div>
    <div className="learning-tools-grid">
      <article><h3>下一题，什么时候来？</h3><label htmlFor="auto-advance-setting">答题反馈后</label><select id="auto-advance-setting" value={autoAdvanceMs} onChange={event => onAutoAdvance(Number(event.target.value) as AutoAdvanceDelay)}>{AUTO_ADVANCE_OPTIONS.map(value => <option key={value} value={value}>{value === 0 ? "手动：按 Enter 或点下一题" : `${value / 1000} 秒后自动下一题`}</option>)}</select><p>适用于听音、拼读、词句闯关、元音盲听与收音练习。切换设置会先暂停当前练习，已答题可按 Enter 继续；后续题目使用新设置。</p><small>每日复习、跟读、配对、地铁打字与极速计时保持原规则。</small></article>
      <article><h3>把学习进度带走</h3><p>包括已学字母、背熟词句、经验与累计错题、打字最佳、每日复习、近 200 次盲听记录，以及播放／键盘偏好。</p><div className="backup-actions"><button type="button" onClick={() => void exportBackup()} disabled={busy}>下载进度备份</button><label className="backup-file-label">选择备份文件<input type="file" accept=".json,application/json" aria-label="选择 JSON 进度备份" disabled={busy} onChange={event => void selectFile(event)} /></label></div><small>不包含录音、音频资源和正在进行的题目。分享网页不会同时分享你的进度。</small></article>
    </div>
    {pending && <div className="backup-preview"><h3>准备合并的备份</h3><p>导出时间：{new Date(pending.createdAt).toLocaleString("zh-CN")}</p><ul><li>已学字母 {pending.progress.mastered.length} 个 · 背熟词句 {pending.progress.masteredPhrases.length} 条</li><li>累计经验 {pending.progress.stats.totalXp} XP · 每日复习记录 {Object.keys(pending.reviews).length} 条</li><li>盲听作答 {pending.vowelHistory.length} 次 · 打字线路记录 {Object.keys(pending.typing).length} 条</li></ul><p>不会清空现有进度；已学标记取并集，经验／累计次数取较高值，不重复累加；复习保留较新的记录。播放与键盘偏好采用备份值。请在其他标签页暂停学习后恢复。</p><div className="backup-actions"><button type="button" disabled={busy} onClick={() => void importBackup()}>确认合并恢复</button><button type="button" disabled={busy} onClick={() => { setPending(null); setMessage("已取消导入，原记录未改变。"); }}>取消</button></div></div>}
    <p className="backup-status" role="status" aria-live="polite">{busy ? "正在处理，请稍等…" : message}</p>
  </section>;
}
