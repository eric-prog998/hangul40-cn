import type { Metadata } from "next";
import "./globals.css";

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://hangul40-cn-eric0716.ericlll1.chatgpt.site";
const ogImageUrl = `${basePath}/og.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: "韩语 40 音｜中文闯关版",
  description: "为中文初学者设计的韩语 40 音学习页：10 分钟起步路线、真人辅音起音、完整音节跟读、生活词句与地铁打字闯关。",
  icons: {
    icon: `${basePath}/favicon.svg`,
  },
  openGraph: {
    title: "韩语 40 音｜中文闯关版",
    description: "从核心元音和基础辅音开始，再用真人音频、生活词句和四条地铁打字线路练会韩语。",
    type: "website",
    images: [{ url: ogImageUrl, width: 1200, height: 630, alt: "韩语 40 音中文闯关版" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "韩语 40 音｜中文闯关版",
    description: "从核心元音和基础辅音开始，再用真人音频、生活词句和四条地铁打字线路练会韩语。",
    images: [ogImageUrl],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
