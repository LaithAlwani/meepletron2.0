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
  solidIdle = false,
}: {
  gameId: Id<"games">;
  className?: string;
  size?: "sm" | "md" | "lg";
  // When not in any list, render a solid (filled with currentColor) bookmark
  // instead of an outline — used on the card cover where a filled shape reads
  // better over artwork.
  solidIdle?: boolean;
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
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  // Hidden until measured + placed, so the pre-position frame never flashes.
  const [placed, setPlaced] = useState(false);

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

  // Once the menu is in the DOM, measure it and pick a corner that fits: below
  // the button by default, flipped above when there's more room; left-aligned to
  // the button unless that overflows, then right-aligned — always clamped.
  useEffect(() => {
    if (!open) {
      setPlaced(false);
      return;
    }
    const btn = btnRef.current?.getBoundingClientRect();
    const menu = menuRef.current?.getBoundingClientRect();
    if (!btn || !menu) return;
    const gap = 6;
    const m = 8; // viewport margin
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mw = menu.width;
    const mh = menu.height;

    let top = btn.bottom + gap;
    const fitsBelow = top + mh <= vh - m;
    const roomAbove = btn.top - gap - mh >= m;
    if (!fitsBelow && roomAbove) top = btn.top - gap - mh;
    top = Math.max(m, Math.min(top, vh - mh - m));

    let left = btn.left;
    if (left + mw > vw - m) left = btn.right - mw; // align right edges instead
    left = Math.max(m, Math.min(left, vw - mw - m));

    setCoords({ top, left });
    setPlaced(true);
  }, [open]);

  function openMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      toast("Sign in to build your collection", "info");
      return;
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
          className={`${
            size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-5 w-5"
          } ${
            inCollection
              ? "fill-accent text-accent"
              : solidIdle
                ? "fill-current"
                : ""
          }`}
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              zIndex: 60,
              visibility: placed ? "visible" : "hidden",
            }}
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
