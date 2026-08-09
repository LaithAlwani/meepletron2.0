import { cn } from "@/lib/cn";

/** A rounded surface card. `interactive` adds a gentle hover-lift. */
export function Card({
  interactive,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface",
        interactive &&
          "transition-all duration-200 hover:-translate-y-1 hover:border-accent/40 hover:shadow-lg",
        className,
      )}
      {...props}
    />
  );
}

/** Uppercase eyebrow heading used above content sections. */
export function SectionHeading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "text-[11px] font-bold uppercase tracking-[0.16em] text-subtle",
        className,
      )}
    >
      {children}
    </h2>
  );
}

const catTone: Record<number, string> = {
  1: "border-cat-1/30 bg-cat-1/10 text-cat-1",
  2: "border-cat-2/30 bg-cat-2/10 text-cat-2",
  3: "border-cat-3/30 bg-cat-3/10 text-cat-3",
  4: "border-cat-4/30 bg-cat-4/10 text-cat-4",
  5: "border-cat-5/30 bg-cat-5/10 text-cat-5",
};

/** A small pill. `tone` 1–5 tints it with a category color; otherwise neutral. */
export function Chip({
  children,
  tone,
  className,
}: {
  children: React.ReactNode;
  tone?: 1 | 2 | 3 | 4 | 5;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tone ? catTone[tone] : "border-border bg-surface-2 text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-2", className)} />;
}
