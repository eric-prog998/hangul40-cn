import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://hangul40-cn-eric0716.ericlll1.chatgpt.site"),
  title: "韩语 40 音｜中文闯关版",
  description: "为中文初学者设计的韩语 40 音学习页：10 分钟起步路线、真人辅音起音、完整音节跟读、生活词句与地铁打字闯关。",
  openGraph: {
    title: "韩语 40 音｜中文闯关版",
    description: "从核心元音和基础辅音开始，再用真人音频、生活词句和四条地铁打字线路练会韩语。",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "韩语 40 音中文闯关版" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "韩语 40 音｜中文闯关版",
    description: "从核心元音和基础辅音开始，再用真人音频、生活词句和四条地铁打字线路练会韩语。",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
