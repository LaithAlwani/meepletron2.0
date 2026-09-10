"use client";

import { Bot } from "lucide-react";

/**
 * Quick toolbar toggle for the "chat-ready" library filter (games with an
 * ingested rulebook you can chat with). The same filter lives in the full
 * FilterDrawer; this surfaces it inline next to the sort control for one-tap
 * access. The label collapses to just the icon on narrow screens.
 */
export function ChatReadyToggle({
  active,
  onToggle,
  className,
}: {
  active: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      title="Show only chat-ready games"
      className={`flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors ${
        active
          ? "border-accent bg-accent text-accent-foreground shadow-sm"
          : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-foreground"
      } ${className ?? ""}`}
    >
      <Bot className="h-4.5 w-4.5" />
      <span className="hidden sm:inline">Chat-ready</span>
    </button>
  );
}
