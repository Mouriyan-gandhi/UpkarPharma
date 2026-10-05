import type { Metadata } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

// DM_Sans is a variable font — Next.js 16's Turbopack rejects an explicit
// weight array ("next/font/google queries have exactly one entry"). Omitting
// `weight` loads the variable font file; all 100-1000 weights remain usable
// via `font-weight` on the consumer side.
const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UPKEM LABS — Admin Command Center",
  description: "B2B wholesale pharmaceutical management dashboard. Manage orders, inventory, partners, and analytics for Upkem Labs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
