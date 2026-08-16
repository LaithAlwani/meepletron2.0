"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Bookmark, Check } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";

type SetKey = "own" | "wishlist" | "forTrade" | "prevOwned";
type StateKey = "owned" | "wishlist" | "forTrade" | "prevOwned";

const OPTS: { set: SetKey; state: StateKey; label: string }[] = [
  { set: "own", state: "owned", label: "Owned" },
  { set: "wishlist", state: "wishlist", label: "Wishlist" },
  { set: "forTrade", state: "forTrade", label: "For trade" },
  { set: "prevOwned", state: "prevOwned", label: "Previously owned" },
];

/**
 * The one "Add to collection" control. A bookmark button (filled when the game is
 * in any of the four lists) that opens a checkbox menu — Owned / Wishlist / For
 * trade / Previously owned — writing straight to the collection row. Rendered via
 * a portal so a card's `overflow-hidden` can't clip the menu.
 */
export function CollectionButton({
  gameId,
  className,
  size = "sm",
}: {
  gameId: Id<"games">;
  className?: string;
  size?: "sm" | "md";
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

  const inCollection = !!(
    state &&
    (state.owned || state.wishlist || state.forTrade || state.prevOwned)
  );

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
      const left = Math.min(r.left, window.innerWidth - 208);
      setPos({ top: r.bottom + 6, left: Math.max(8, left) });
    }
    setOpen((o) => !o);
  }

  async function toggle(key: SetKey, current: boolean) {
    try {
      await setStatus({ gameId, key, value: !current });
    } catch {
      toast("Couldn't update your collection", "error");
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        aria-label={inCollection ? "Edit collection status" : "Add to collection"}
        title={inCollection ? "In your collection" : "Add to collection"}
        className={
          className ??
          "flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:text-accent"
        }
      >
        <Bookmark
          className={`${size === "sm" ? "h-4 w-4" : "h-5 w-5"} ${
            inCollection ? "fill-accent text-accent" : ""
          }`}
        />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 60 }}
            className="w-52 rounded-xl border border-border bg-surface p-1 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-subtle">
              Add to collection
            </p>
            {OPTS.map((o) => {
              const active = !!state?.[o.state];
              return (
                <button
                  key={o.set}
                  type="button"
                  onClick={() => toggle(o.set, active)}
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
