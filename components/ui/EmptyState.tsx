import { cn } from "@/lib/cn";

/**
 * The shared "nothing here" placeholder — a dashed-border card with a title, an
 * optional description line, and an optional action (button/link). Replaces the
 * many hand-rolled dashed-border empty cards across lists and sections.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-border p-10 text-center text-muted",
        className,
      )}
    >
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 text-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
