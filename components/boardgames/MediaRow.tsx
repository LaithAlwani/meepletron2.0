import Link from "next/link";
import type { ReactNode } from "react";
import { Die } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/** Square game thumbnail with a Die fallback — shared by list rows. */
export function MediaThumb({
  url,
  className,
}: {
  url?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 text-subtle",
        className,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Die className="h-6 w-6" />
      )}
    </div>
  );
}

/**
 * A game list row (chats, favourites): thumbnail + title with optional subtitle
 * and meta. The main content links to `href` when given; `trailing` renders an
 * extra action to the right (chevron, Chat button, …).
 */
export function MediaRow({
  href,
  thumbUrl,
  title,
  subtitle,
  meta,
  trailing,
  dimmed = false,
}: {
  href?: string;
  thumbUrl?: string | null;
  title: string;
  subtitle?: string | null;
  meta?: string;
  trailing?: ReactNode;
  dimmed?: boolean;
}) {
  const inner = (
    <>
      <MediaThumb url={thumbUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display truncate font-bold">{title}</span>
          {meta && (
            <span className="shrink-0 text-xs text-subtle">{meta}</span>
          )}
        </div>
        {subtitle && (
          <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>
        )}
      </div>
    </>
  );

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition-colors",
        dimmed && "opacity-60",
        href && "hover:border-accent/40 hover:bg-surface-2",
      )}
    >
      {href ? (
        <Link
          href={href}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{inner}</div>
      )}
      {trailing}
    </li>
  );
}
