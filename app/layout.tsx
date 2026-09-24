import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BottomNav } from "@/components/BottomNav";
import { NavigationTracker } from "@/components/NavigationTracker";
import {
  MobileTopBar,
  TopBarTitleProvider,
} from "@/components/topbar/MobileTopBar";
import { PreferencesEffects } from "@/components/PreferencesEffects";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { LenisProvider } from "@/components/motion/LenisProvider";
import { GsapLenisBridge } from "@/components/motion/GsapLenisBridge";
import { PageTransition } from "@/components/motion/PageTransition";
import { SITE_URL } from "@/lib/site";

// Display face — characterful, warm-modern (headings, wordmark).
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

// Body/UI face — clean humanist grotesk.
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Meepletron — Ask your board game rules",
    template: "%s · Meepletron",
  },
  description:
    "Chat with an AI that answers board game rules questions, grounded in the actual rulebook with citations.",
  applicationName: "Meepletron",
  appleWebApp: {
    capable: true,
    title: "Meepletron",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon-192x192.webp",
    apple: "/icons/icon-192x192.webp",
  },
  // Site-wide social-card defaults. Pages inherit these unless they set their
  // own; the default card image comes from app/opengraph-image.tsx.
  openGraph: {
    type: "website",
    siteName: "Meepletron",
    title: "Meepletron — Ask your board game rules",
    description:
      "An AI that answers board game rules questions from the actual rulebook, cited by page.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Meepletron — Ask your board game rules",
    description:
      "An AI that answers board game rules questions from the actual rulebook, cited by page.",
  },
};

// Site-level structured data: what Meepletron is (Organization + WebSite + the
// AI rules-assistant WebApplication). Emitted once, site-wide, so Google and
// LLMs get a clear "what is this product" signal on every page.
const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Meepletron",
      url: SITE_URL,
      logo: `${SITE_URL}/icons/icon-192x192.webp`,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Meepletron",
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/boardgames?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: "Meepletron",
      url: SITE_URL,
      applicationCategory: "GameApplication",
      operatingSystem: "Web",
      description:
        "An AI board game rules expert that answers rules questions from the game's actual rulebook, quoting the exact rule with the page it came from.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export const viewport: Viewport = {
  // A single default; the script + ThemeToggle keep it in sync with the actual
  // (class-based) theme so the mobile status bar always matches the app.
  themeColor: "#191512",
  // Resize the layout to the space above the on-screen keyboard (instead of the
  // keyboard overlaying content). Keeps bottom sheets / inputs sized correctly
  // while typing and restores cleanly on dismiss — no stuck-small drawer.
  interactiveWidget: "resizes-content",
};

// Runs before paint to set the theme class + status-bar colour, avoiding a flash
// of the wrong theme. Matches the app's chosen theme, not the OS preference.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content',d?'#191512':'#faf6ee');}catch(e){}})();`;

// Capture the PWA install prompt as early as possible — it can fire before any
// React component mounts. Stashed on window for the InstallPrompt card to use.
const installCaptureScript = `(function(){window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bip=e;window.dispatchEvent(new Event('bip-ready'));});window.addEventListener('appinstalled',function(){window.__bip=null;});})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bricolage.variable} ${hanken.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: installCaptureScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSON_LD) }}
        />
        <Providers>
          <PreferencesEffects />
          <NavigationTracker />
          <MotionProvider>
            <LenisProvider>
              <GsapLenisBridge />
              <TopBarTitleProvider>
                <SiteHeader />
                <MobileTopBar />
                <main className="relative z-10 flex-1">
                  <PageTransition>{children}</PageTransition>
                </main>
                <SiteFooter />
                <BottomNav />
              </TopBarTitleProvider>
            </LenisProvider>
          </MotionProvider>
        </Providers>
      </body>
      <GoogleAnalytics gaId="G-1BPTDRXTZG" />
    </html>
  );
}
