import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Page title. On mobile it's a small, centered, uppercase accent label (keeps
 * the focus on content); on desktop it stays the big, bold, black h1 it always
 * was. `className` styles the wrapper — pass the bottom margin here.
 */
export function PageTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(className)}>
      {/* Mobile — centered accent eyebrow. */}
      <p className="text-center font-bold uppercase tracking-[0.18em] text-accent sm:hidden">
        {children}
      </p>
      {/* Desktop — big, bold, black. */}
      <h1 className="font-display hidden text-3xl font-extrabold tracking-tight text-foreground sm:block">
        {children}
      </h1>
    </div>
  );
}
