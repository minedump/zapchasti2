import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PromptFlow - AI Telegram CRM",
  description: "AI-powered CRM for Telegram automation",
  // PWA: манифест + режим standalone на iOS — обязательны, чтобы после
  // «На экран Домой» приложение открывалось без Safari-обвязки и могло
  // запрашивать разрешение на Web Push (iOS 16.4+).
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "PromptFlow",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
