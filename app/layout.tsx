import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://hangul40-cn-eric0716.ericlll1.chatgpt.site"),
  title: "韩语 40 音｜中文闯关版",
  description: "为中文母语者设计的韩语游戏化学习页：韩国真人辅音起音、完整音节与词句练习、键盘答题、错题返场与好友挑战。",
  openGraph: {
    title: "韩语 40 音｜中文闯关版",
    description: "40 音、常用单词和实用句子一起练，支持翻卡背诵、键盘闯关与错题返场。",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "韩语 40 音中文闯关版" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "韩语 40 音｜中文闯关版",
    description: "40 音、常用单词和实用句子一起练，支持翻卡背诵、键盘闯关与错题返场。",
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
