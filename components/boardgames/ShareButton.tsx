"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

/**
 * Share the current page: the native share sheet where available (mobile/PWA),
 * otherwise copy the link to the clipboard. `className` supplies the button
 * styling so it can match the surrounding action row.
 */
export function ShareButton({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function onClick() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const data = { title, text: `${title} — rules & reference on Meepletron`, url };

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch (err) {
        // User dismissed the share sheet — do nothing.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else: fall through to the copy fallback.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast("Link copied", "success");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("Couldn't share this page", "error");
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Share this game"
      title="Share"
      className={className}
    >
      {copied ? (
        <Check className="h-4.5 w-4.5 text-accent-2" />
      ) : (
        <Share2 className="h-4.5 w-4.5" />
      )}
    </button>
  );
}
