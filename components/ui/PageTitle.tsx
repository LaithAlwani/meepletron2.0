import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Page title. Left-aligned, bold, black — matching the admin/settings pages.
 * `text-2xl` on mobile (same as those pages), stepping up to the big `text-3xl`
 * on desktop. `className` styles the wrapper — pass the bottom margin here.
 */
export function PageTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl",
        className,
      )}
    >
      {children}
    </h1>
  );
}
