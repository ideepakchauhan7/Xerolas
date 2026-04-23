import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Xerolas — See Anything. Understand Everything.",
  description:
    "Xerolas brings AI-powered screen intelligence to your entire desktop. Select any region from any app and get an instant answer without uploads, accounts, or API keys.",
  keywords: [
    "desktop AI assistant",
    "screen capture AI",
    "desktop lens",
    "visual AI assistant",
    "screen intelligence",
    "OCR desktop tool",
    "cross platform desktop app",
    "Google Lens alternative",
  ],
  authors: [{ name: "Xerolas" }],
  openGraph: {
    title: "Xerolas — See Anything. Understand Everything.",
    description:
      "Select any region on your screen and get instant AI analysis from anywhere on your desktop.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Xerolas — See Anything. Understand Everything.",
    description:
      "Desktop-wide AI screen intelligence for Windows, macOS, and Linux.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${spaceGrotesk.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
