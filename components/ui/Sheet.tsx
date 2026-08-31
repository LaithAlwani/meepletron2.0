"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "vaul";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/cn";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  /** Desktop shape: a right side-drawer (default) or a centered dialog. */
  desktop?: "right" | "center";
  /** Desktop width utility, e.g. "sm:w-104" (drawer) or "sm:max-w-2xl" (dialog). */
  desktopWidth?: string;
  /** Max height of the mobile sheet (default `max-h-[92vh]`). */
  mobileMaxH?: string;
  /** Fixed height of the mobile sheet, e.g. `h-[75vh]`. Overrides `mobileMaxH`
   *  so the sheet stays that tall even when its content is short. */
  mobileHeight?: string;
  /** The drawer's own header + scrollable body + footer, unchanged. */
  children: React.ReactNode;
};

/**
 * The one bottom-sheet / drawer shell. On mobile it's a vaul drawer you can
 * **swipe down to dismiss** — with a grab handle + a muted "pull down to
 * dismiss" hint, and vaul's scroll-gating so a drag only dismisses from the top
 * of the content. On desktop it's a right side-drawer or a centered dialog
 * (no drag — X / backdrop / Esc). Each caller supplies its own header/body/
 * footer as children (a `flex-col` with a `flex-1 overflow-y-auto` body); this
 * component only provides the shell, backdrop, scroll-lock, and Esc.
 */
export function Sheet({
  open,
  onClose,
  desktop = "right",
  desktopWidth = "sm:w-104",
  mobileMaxH = "max-h-[92vh]",
  mobileHeight,
  children,
}: SheetProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)");

  // Desktop scroll-lock + Esc (vaul owns these on mobile).
  useEffect(() => {
    if (!open || !isDesktop) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, isDesktop, onClose]);

  /* ---------- Desktop: side drawer or centered dialog ---------- */
  if (isDesktop) {
    if (!open) return null;
    const panel =
      desktop === "center"
        ? cn(
            "fixed inset-0 z-70 m-auto flex h-fit max-h-[88vh] w-[calc(100vw-2rem)] flex-col rounded-2xl border border-border bg-background shadow-2xl",
            desktopWidth,
          )
        : cn(
            "fixed inset-y-0 right-0 z-70 flex w-full flex-col rounded-l-2xl border-l border-border bg-background shadow-2xl",
            desktopWidth,
          );
    return createPortal(
      <>
        <div
          aria-hidden
          onClick={onClose}
          className="fixed inset-0 z-70 bg-foreground/30 backdrop-blur-[1px]"
        />
        <div role="dialog" aria-modal="true" className={cn("animate-in", panel)}>
          {children}
        </div>
      </>,
      document.body,
    );
  }

  /* ---------- Mobile: swipe-to-dismiss bottom sheet (vaul) ---------- */
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-70 bg-foreground/40 backdrop-blur-[1px]" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-70 flex flex-col rounded-t-2xl border border-border bg-background shadow-2xl outline-none",
            mobileHeight ?? mobileMaxH,
          )}
        >
          <div
            aria-hidden
            className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-border"
          />
          <p className="shrink-0 pb-1 pt-1.5 text-center text-[11px] text-subtle">
            Pull down to dismiss
          </p>
          <Drawer.Title className="sr-only">Sheet</Drawer.Title>
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
