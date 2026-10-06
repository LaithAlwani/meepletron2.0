"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Rewrites inline `[n]` citation markers into markdown links (`[n](#cite-n)`)
 * so they render as interactive source pills.
 *
 * A bracketed number that matches a real source IS a citation → always link it
 * (including consecutive ones like `[2][3]`). Anything else — a mis-bracketed
 * quantity ("[10] gold") or a stray index with no source — is rendered as a
 * plain number. We trust the source set rather than guessing from the next
 * word: the prompt forbids bracketing quantities, and the old look-ahead guard
 * de-linked legitimate citations whenever an ordinary word followed them.
 */
export function linkifyCitations(content: string, validNs: Set<number>): string {
  return content.replace(/\[(\d+)\]/g, (_whole, digits: string) =>
    validNs.has(Number(digits)) ? `[${digits}](#cite-${digits})` : digits,
  );
}

/**
 * Iconography tokens are ALL-CAPS stand-ins the ingestion inserts for the
 * rulebook's symbols, e.g. `[WOOD]`, `[VP]`, `[GAME BOARD]`, `[3 VP]`. Drop the
 * brackets off ONLY those so they read naturally. Because the pattern requires
 * an uppercase letter and allows only caps/digits/spaces, it can never match a
 * numeric citation (`[1]`, `[1](#cite-1)`) or a normal/markdown link.
 */
export function stripIconBrackets(content: string): string {
  return content.replace(/\[([A-Z0-9][A-Z0-9 ]*)\]/g, (whole, inner: string) =>
    /[A-Z]/.test(inner) ? inner : whole,
  );
}

const PILL_BASE =
  "mx-0.5 inline-flex h-[1.4em] min-w-[1.4em] items-center justify-center rounded-full px-1 align-super text-[0.65em] font-bold leading-none";

/**
 * Renders grounded LLM markdown (chat answers, FAQ) with the shared `prose-chat`
 * styles: expands icon tokens and turns `[n]` citations into numbered source
 * pills. Pass `onOpenSource` for interactive pills (a button, with `activeSource`
 * highlighted) — omit it for static pills. Non-citation links open in a new tab.
 */
export function GroundedMarkdown({
  content,
  validNs,
  linkCitations = true,
  onOpenSource,
  activeSource = null,
  className = "",
}: {
  content: string;
  validNs: Set<number>;
  /** When false, leave `[n]` as plain text (no pills) — e.g. "show sources" off. */
  linkCitations?: boolean;
  onOpenSource?: (n: number) => void;
  activeSource?: number | null;
  className?: string;
}) {
  const md = stripIconBrackets(
    linkCitations ? linkifyCitations(content, validNs) : content,
  );
  return (
    <div className={`prose-chat text-sm leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // GFM tables — wrap in a horizontal scroller so a wide table can't
          // blow out the chat width on mobile.
          table({ children }) {
            return (
              <div className="my-2 overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  {children}
                </table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border border-border bg-surface-2 px-2 py-1 font-semibold">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border border-border px-2 py-1 align-top">
                {children}
              </td>
            );
          },
          a({ href, children }) {
            const m = /^#cite-(\d+)$/.exec(href ?? "");
            if (m) {
              const n = Number(m[1]);
              if (onOpenSource) {
                return (
                  <button
                    type="button"
                    onClick={() => onOpenSource(n)}
                    aria-label={`Show source ${n}`}
                    className={`${PILL_BASE} transition-colors ${
                      activeSource === n
                        ? "bg-accent text-accent-foreground"
                        : "bg-accent/15 text-accent hover:bg-accent/30"
                    }`}
                  >
                    {n}
                  </button>
                );
              }
              return <span className={`${PILL_BASE} bg-accent/15 text-accent`}>{n}</span>;
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {md}
      </ReactMarkdown>
    </div>
  );
}
