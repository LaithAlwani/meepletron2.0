"use client";

import { useState } from "react";
import Link from "next/link";

export function GuestBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="mb-3 flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm">
      <span className="flex-1">
        You&apos;re chatting as a guest (20K tokens/day).{" "}
        <Link href="/auth" className="font-semibold text-accent hover:underline">
          Sign in
        </Link>{" "}
        to save your messages and get 50K/day.
      </span>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 text-muted transition-colors hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}
