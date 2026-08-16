import { Die } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * Game thumbnail with a Die fallback, sized entirely by `className` (no built-in
 * dimensions to conflict — the app's `cn` only joins, it doesn't merge Tailwind
 * utilities). Pass e.g. `h-12 w-12`.
 */
export function Thumb({
  url,
  className,
}: {
  url?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 text-subtle",
        className,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Die className="h-1/2 w-1/2" />
      )}
    </div>
  );
}
