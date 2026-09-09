"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { canGoBack } from "@/components/lib/navHistory";

/**
 * Returns a handler that goes back to the previous in-app page (restoring its
 * scroll + state) when there's in-app history to return to, and otherwise
 * navigates to `fallbackHref` — so a directly-opened / shared / new-tab page
 * still has a sensible destination instead of leaving the app.
 */
export function useBackNav(fallbackHref: string) {
  const router = useRouter();
  return () => {
    if (canGoBack()) router.back();
    else router.push(fallbackHref);
  };
}

/**
 * A consistent "Back" button used across detail pages. Real in-app back with a
 * parent-page fallback (see {@link useBackNav}).
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
  const onBack = useBackNav(fallbackHref);
  return (
    <button type="button" onClick={onBack} className={className}>
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
