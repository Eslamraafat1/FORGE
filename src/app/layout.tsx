import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Manrope } from "next/font/google";
import { PREFS_BOOT_SCRIPT } from "@/lib/boot-script";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"], variable: "--font-plex-arabic", display: "swap" });
const display = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display-latin", display: "swap" });

const description =
  "FORGE is a demonstration industrial operations platform: production, work orders, planning, inventory, quality, maintenance and analytics on a simulated manufacturing network. All data is fictional.";

export const metadata: Metadata = {
  title: { default: "FORGE® — Industrial Intelligence Platform", template: "%s · FORGE®" },
  description,
  applicationName: "FORGE",
  openGraph: {
    title: "FORGE® — Industrial Intelligence Platform",
    description,
    type: "website",
    siteName: "FORGE",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0A0E13" },
    { media: "(prefers-color-scheme: light)", color: "#EFECE6" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" data-theme="dark" suppressHydrationWarning className={`${manrope.variable} ${plexMono.variable} ${plexArabic.variable} ${display.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
