import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "TechSiege — Operations",
    template: "%s · TechSiege Ops",
  },
  description: "Internal operations platform for TechSiege.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0c10",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
