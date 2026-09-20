"use client";

import ReactMarkdown from "react-markdown";

// Lowercase words that legitimately follow a citation ("[1] and [2]", "[3] or")
// — these don't signal a quantity, so a bracket before one is still a citation.
const CITATION_FOLLOWERS = new Set([
  "and",
  "or",
  "but",
  "so",
  "then",
  "as",
  "for",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "with",
  "the",
  "a",
  "an",
]);

/**
 * Rewrites inline `[n]` citation markers into markdown links (`[n](#cite-n)`)
 * so they can be rendered as interactive references — but only for markers that
 * actually have a matching source, so stray brackets are left untouched.
 *
 * Guard: a bracketed number that hugs a following content word is a quantity,
 * not a citation (e.g. the model wrote "[3] coins" for "3 coins"). Render it as
 * a plain number so it isn't confused with a source pill.
 */
export function linkifyCitations(content: string, validNs: Set<number>): string {
  return content.replace(/\[(\d+)\]/g, (whole, digits, offset: number, str: string) => {
    const next = str.slice(offset + whole.length).match(/^\s*([a-z]+)/);
    if (next && !CITATION_FOLLOWERS.has(next[1])) return digits;
    return validNs.has(Number(digits)) ? `[${digits}](#cite-${digits})` : whole;
  });
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
        components={{
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
