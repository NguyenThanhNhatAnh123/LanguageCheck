import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Both fonts ship a Vietnamese subset, so UI text with diacritics renders in one font.
const fontSans = Inter({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext", "vietnamese"],
});

const fontMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin", "latin-ext", "vietnamese"],
});

export const metadata: Metadata = {
  title: "POD Text QA",
  description: "Kiểm tra chính tả và ngữ pháp chữ trên mockup",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${fontSans.variable} ${fontMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
