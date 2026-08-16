"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Tag, Check } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";

type SubKey = "wantToPlay" | "forTrade" | "prevOwned";

const OWNED_OPTS: { key: SubKey; label: string }[] = [
  { key: "wantToPlay", label: "Want to play" },
  { key: "forTrade", label: "For trade" },
];
const NOT_OWNED_OPTS: { key: SubKey; label: string }[] = [
  { key: "prevOwned", label: "Previously owned" },
];

/**
 * Editable BGG sub-status control. The trigger shows the game's current
 * sub-status (or a subtle tag when none); tapping opens a small checkbox menu
 * whose options depend on owned/not-owned. Rendered via a portal so the card's
 * `overflow-hidden` can't clip it. `variant` picks card-badge vs action-button.
 */
export function StatusMenu({
  gameId,
  variant = "badge",
  className,
}: {
  gameId: Id<"games">;
  variant?: "badge" | "button";
  className?: string;
}) {
  const { isAuthenticated } = useConvexAuth();
  const state = useQuery(
    api.collection.state,
    isAuthenticated ? { gameId } : "skip",
  );
  const setStatus = useMutation(api.collection.setStatus);
  const toast = useToast();
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const owned = !!state?.owned;
  const options = owned ? OWNED_OPTS : NOT_OWNED_OPTS;
  const activeLabel = state?.wantToPlay
    ? "Want to play"
    : state?.forTrade
      ? "For trade"
      : state?.prevOwned
        ? "Prev. owned"
        : null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function openMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      toast("Sign in to build your collection", "info");
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      // Keep the 176px-wide menu inside the viewport.
      const left = Math.min(r.left, window.innerWidth - 184);
      setPos({ top: r.bottom + 6, left: Math.max(8, left) });
    }
    setOpen((o) => !o);
  }

  async function toggle(key: SubKey, current: boolean) {
    try {
      await setStatus({ gameId, key, value: !current });
    } catch {
      toast("Couldn't update status", "error");
    }
  }

  const trigger =
    variant === "button" ? (
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        aria-label="Set status"
        title="Set status"
        className={className}
      >
        <Tag className="h-4.5 w-4.5" />
      </button>
    ) : (
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        aria-label="Set status"
        title={activeLabel ?? "Set status"}
        className={
          activeLabel
            ? "inline-flex items-center gap-1 rounded-lg bg-accent-2 px-1.5 py-0.5 text-[11px] font-bold text-white shadow-sm"
            : "inline-flex items-center rounded-lg bg-background/80 p-1 text-subtle shadow-sm backdrop-blur transition-colors hover:text-accent"
        }
      >
        <Tag className="h-3 w-3" />
        {activeLabel && <span>{activeLabel}</span>}
      </button>
    );

  return (
    <>
      {trigger}
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 60 }}
            className="w-44 rounded-xl border border-border bg-surface p-1 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {options.map((o) => {
              const active = !!state?.[o.key];
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => toggle(o.key, active)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-surface-2"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      active
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border"
                    }`}
                  >
                    {active && <Check className="h-3 w-3" />}
                  </span>
                  {o.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
