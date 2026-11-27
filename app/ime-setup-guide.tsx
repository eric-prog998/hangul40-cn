"use client";

import { memo } from "react";

export default memo(function ImeSetupGuide() {
  return (
    <details className="ime-setup-guide">
      <summary>还没开启系统韩语输入法？30 秒设置指南（Windows / Mac / 手机）</summary>
      <div className="ime-setup-grid">
        <div>
          <strong>macOS</strong>
          <p>系统设置 → 键盘 → 输入法编辑 → 点「+」添加「韩文 → 2-Set Korean（두벌식）」。用 <kbd>Ctrl + 空格</kbd> 或地球键切换。</p>
        </div>
        <div>
          <strong>Windows 10 / 11</strong>
          <p>设置 → 时间和语言 → 语言和区域 → 添加语言「朝鲜语/한국어」。切换到韩语后按右 <kbd>Alt</kbd> 在「가/A」（韩/英）间切换。</p>
        </div>
        <div>
          <strong>iPhone / Android</strong>
          <p>系统设置 → 通用/系统 → 键盘 → 添加新键盘「韩语（标准双拼 두벌식）」。打字时点键盘左下角地球图标切换。</p>
        </div>
      </div>
    </details>
  );
});
