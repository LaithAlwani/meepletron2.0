"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * A "Back" button that returns to the previous page via real browser back — so
 * the list the user came from is restored with its scroll position and active
 * tab. Falls back to `fallbackHref` when there's no in-app history to go back to
 * (e.g. the page was opened directly or shared).
 */
export function BackButton({
  fallbackHref,
  label = "Back",
  className,
}: {
  fallbackHref: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className={className}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
