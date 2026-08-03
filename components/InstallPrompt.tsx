"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function getStashedPrompt(): BeforeInstallPromptEvent | null {
  return (
    (window as unknown as { __bip?: BeforeInstallPromptEvent }).__bip ?? null
  );
}

const DownloadIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" />
    <path d="M12 15V3" />
  </svg>
);
const ShareIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline h-4 w-4 align-text-bottom">
    <path d="M12 3v13" />
    <path d="m8 7 4-4 4 4" />
    <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7" />
  </svg>
);

/** Encourages installing the PWA. Hides itself if already installed. */
export function InstallPrompt() {
  const [mounted, setMounted] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setMounted(true);
    const nav = window.navigator as Navigator & { standalone?: boolean };
    setInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        nav.standalone === true,
    );
    setIsIOS(/iphone|ipad|ipod/.test(nav.userAgent.toLowerCase()));

    setDeferred(getStashedPrompt());
    const onReady = () => setDeferred(getStashedPrompt());
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("bip-ready", onReady);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("bip-ready", onReady);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Don't render until we know the state, and never when already installed.
  if (!mounted || installed) return null;

  async function install() {
    const prompt = deferred ?? getStashedPrompt();
    if (!prompt) return;
    setInstalling(true);
    try {
      await prompt.prompt();
      await prompt.userChoice;
      (window as unknown as { __bip?: unknown }).__bip = null;
      setDeferred(null);
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <Image
          src="/logo.webp"
          alt=""
          width={48}
          height={60}
          className="h-12 w-auto shrink-0 drop-shadow"
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-foreground">Install Meepletron</h2>
          <p className="mt-1 text-sm text-muted">
            Add it to your home screen for one-tap access and a full-screen,
            app-like feel — no app store needed.
          </p>

          {deferred ? (
            <button
              onClick={install}
              disabled={installing}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {DownloadIcon}
              {installing ? "Installing…" : "Install app"}
            </button>
          ) : isIOS ? (
            <ol className="mt-4 space-y-1.5 text-sm text-muted">
              <li>
                1. Tap the Share {ShareIcon} button in Safari&apos;s toolbar.
              </li>
              <li>
                2. Scroll down and choose{" "}
                <span className="font-medium text-foreground">
                  Add to Home Screen
                </span>
                .
              </li>
              <li>
                3. Tap <span className="font-medium text-foreground">Add</span>.
              </li>
            </ol>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Open your browser menu and choose{" "}
              <span className="font-medium text-foreground">Install app</span> or{" "}
              <span className="font-medium text-foreground">
                Add to Home Screen
              </span>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
