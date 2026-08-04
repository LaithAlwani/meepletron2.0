import type { Metadata, Viewport } from "next";
import { Poppins, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PreferencesEffects } from "@/components/PreferencesEffects";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
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
};

export const viewport: Viewport = {
  // A single default; the script + ThemeToggle keep it in sync with the actual
  // (class-based) theme so the mobile status bar always matches the app.
  themeColor: "#0f172a",
};

// Runs before paint to set the theme class + status-bar colour, avoiding a flash
// of the wrong theme. Matches the app's chosen theme, not the OS preference.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content',d?'#0f172a':'#f7f7f7');}catch(e){}})();`;

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
      className={`${poppins.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: installCaptureScript }} />
        <Providers>
          <PreferencesEffects />
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
