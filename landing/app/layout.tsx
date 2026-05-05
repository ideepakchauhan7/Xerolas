import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://xerolas.vercel.app"),
  title: "Xerolas — See Anything. Understand Everything.",
  description:
    "Xerolas brings AI-powered screen intelligence to your entire desktop. Select any region from any app and get an instant answer using your own AI provider key.",
  keywords: [
    "desktop AI assistant",
    "screen capture AI",
    "desktop lens",
    "visual AI assistant",
    "screen intelligence",
    "OCR desktop tool",
    "cross platform desktop app",
    "desktop lens alternative",
  ],
  authors: [{ name: "Xerolas" }],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "1024x1024" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icon.png",
  },
  openGraph: {
    title: "Xerolas — See Anything. Understand Everything.",
    description:
      "Select any region on your screen and get instant AI analysis from anywhere on your desktop.",
    url: "https://xerolas.vercel.app",
    siteName: "Xerolas",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Xerolas desktop AI screen capture demo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Xerolas — See Anything. Understand Everything.",
    description:
      "Desktop-wide AI screen intelligence for Windows, macOS, and Linux.",
    images: ["/og-image.png"],
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
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
