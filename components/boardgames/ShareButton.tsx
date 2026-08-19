"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

/**
 * Share a page: the native share sheet where available (mobile/PWA), otherwise
 * copy the link to the clipboard. Defaults to the current page, but `url`/`text`
 * let it share any target. Pass `label` to show text beside the icon; omit it for
 * an icon-only button. `className` supplies the styling so it matches its row.
 */
export function ShareButton({
  title,
  url,
  text,
  label,
  labelClassName,
  className,
}: {
  title: string;
  url?: string;
  text?: string;
  label?: string;
  labelClassName?: string;
  className?: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function onClick() {
    const href =
      url ?? (typeof window !== "undefined" ? window.location.href : "");
    const data = {
      title,
      text: text ?? `${title} — rules & reference on Meepletron`,
      url: href,
    };

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
      await navigator.clipboard.writeText(href);
      setCopied(true);
      toast("Link copied", "success");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("Couldn't share", "error");
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ? undefined : "Share"}
      title="Share"
      className={className}
    >
      {copied ? (
        <Check className="h-4.5 w-4.5 text-accent-2" />
      ) : (
        <Share2 className="h-4.5 w-4.5" />
      )}
      {label && <span className={labelClassName}>{label}</span>}
    </button>
  );
}
