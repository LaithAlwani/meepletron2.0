"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The one floating action button — fixed bottom-right, above the mobile tab bar.
 * Each surface renders its own with the action that fits (log a play, new list,
 * ask the assistant, help…). Pass `className="sm:hidden"` for a mobile-only FAB.
 */
export function Fab({
  onClick,
  icon: Icon,
  label,
  className,
}: {
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "fixed bottom-[calc(3.75rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-13 w-13 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg ring-1 ring-black/10 transition-transform hover:scale-105 active:scale-95 sm:bottom-6",
        className,
      )}
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}
