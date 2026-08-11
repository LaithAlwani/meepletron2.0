"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Copy, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { usePreferences } from "@/lib/usePreferences";
import { timeOfDay } from "@/lib/format";

type Annotation = NonNullable<Doc<"messages">["annotations"]>[number];

function MessageActions({ message }: { message: Doc<"messages"> }) {
  const rate = useMutation(api.chat.rateMessage);
  const [copied, setCopied] = useState(false);
  const rating = message.rating;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  // Layout only — no text color here so an active rating's color isn't
  // overridden by an idle `hover:text-*` on hover.
  const base =
    "flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-surface-2";
  const idle = "text-muted hover:text-foreground";

  return (
    <div className="flex items-center gap-0.5 opacity-70 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
      <button onClick={copy} aria-label="Copy answer" className={`${base} ${idle}`}>
        {copied ? (
          <Check className="h-3.5 w-3.5 text-accent-2" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        onClick={() => rate({ messageId: message._id, rating: "down" })}
        aria-label="Not helpful"
        aria-pressed={rating === "down"}
        className={`${base} ${rating === "down" ? "text-red-500" : idle}`}
      >
        <ThumbsDown
          className="h-3.5 w-3.5"
          fill={rating === "down" ? "currentColor" : "none"}
        />
      </button>
      <button
        onClick={() => rate({ messageId: message._id, rating: "up" })}
        aria-label="Helpful"
        aria-pressed={rating === "up"}
        className={`${base} ${rating === "up" ? "text-accent-2" : idle}`}
      >
        <ThumbsUp
          className="h-3.5 w-3.5"
          fill={rating === "up" ? "currentColor" : "none"}
        />
      </button>
    </div>
  );
}

/* ---------- citations ---------- */

function sourceLabel(ann: Annotation) {
  return (
    [ann.breadcrumb, ann.page ? `p.${ann.page}` : null]
      .filter(Boolean)
      .join(" · ") || "Source"
  );
}

const STOPWORDS = new Set(
  "a an the and or but if then of to in on at for with without from by as is are was were be been being this that these those it its you your we our they their he she his her not no do does did can could should would will shall may might must have has had how what when where which who why into over under out up down off than so such each any all some more most other only also just about per each when while during after before".split(
    /\s+/,
  ),
);

/** Meaningful lowercase terms — drops stopwords/punctuation, keeps numbers. */
function significantTerms(text: string): Set<string> {
  const set = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || STOPWORDS.has(raw)) continue;
    if (raw.length >= 3 || /^\d+$/.test(raw)) set.add(raw);
  }
  return set;
}

/**
 * Highlights the passage sentence(s) that most overlap the answer's wording.
 * Heuristic (term overlap), not a guaranteed exact source span — it points the
 * eye at the part of the rulebook the answer most likely leaned on.
 */
function highlightPassage(passage: string, answer: string): React.ReactNode {
  const answerTerms = significantTerms(answer);
  if (answerTerms.size === 0) return passage;

  const segments = passage.match(/[^.!?\n]*(?:[.!?]+|\n|$)/g)?.filter(Boolean) ?? [
    passage,
  ];
  const scores = segments.map((seg) => {
    let score = 0;
    for (const t of significantTerms(seg)) if (answerTerms.has(t)) score++;
    return score;
  });
  const max = Math.max(0, ...scores);
  if (max === 0) return passage;
  // Highlight strongly-overlapping sentences; if overlap is weak, at least the
  // single best one.
  const threshold = max >= 2 ? 2 : max;

  return segments.map((seg, i) =>
    scores[i] >= threshold ? (
      <mark
        key={i}
        className="rounded-sm bg-accent/25 text-foreground"
      >
        {seg}
      </mark>
    ) : (
      <span key={i}>{seg}</span>
    ),
  );
}

/** The "Sources" block: chips that toggle an inline passage from the rulebook. */
function Sources({
  annotations,
  answer,
  openN,
  setOpenN,
}: {
  annotations: Annotation[];
  answer: string;
  openN: number | null;
  setOpenN: (n: number | null) => void;
}) {
  const open = annotations.find((a) => a.n === openN) ?? null;
  const cardRef = useRef<HTMLDivElement>(null);

  // Bring the passage into view when opened (e.g. from an inline [n] tap).
  useEffect(() => {
    if (open && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [open]);

  return (
    <div className="mt-3 border-t border-border pt-2">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          Sources
        </span>
        <span className="text-[11px] normal-case text-muted/80">
          Tap a reference to see that section of the rulebook.
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {annotations.map((ann) => {
          const active = ann.n === openN;
          return (
            <button
              key={ann.n}
              onClick={() => setOpenN(active ? null : ann.n)}
              aria-expanded={active}
              className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                active
                  ? "border-accent bg-accent/10 text-foreground"
                  : "border-border bg-surface-2 text-muted hover:border-accent/40 hover:text-foreground"
              }`}
            >
              <span
                className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ${
                  active ? "bg-accent text-accent-foreground" : "bg-accent/15 text-accent"
                }`}
              >
                {ann.n}
              </span>
              <span className="truncate">{sourceLabel(ann)}</span>
            </button>
          );
        })}
      </div>

      {open && (
        <div
          ref={cardRef}
          className="animate-in mt-2 rounded-lg border border-accent/30 bg-surface-2 p-3 text-sm"
        >
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent/15 px-1 text-[10px] font-bold leading-none text-accent">
              {open.n}
            </span>
            {open.breadcrumb && <span className="font-medium text-foreground">{open.breadcrumb}</span>}
            {open.page && <span>p.{open.page}</span>}
            {open.variantName && <span className="italic">· {open.variantName}</span>}
          </div>
          <blockquote className="max-h-52 overflow-y-auto whitespace-pre-wrap border-l-2 border-accent/40 pl-3 leading-relaxed text-foreground/90">
            {highlightPassage(open.text, answer)}
          </blockquote>
          <p className="mt-1.5 text-[11px] text-muted">from {open.bgTitle}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Rewrites inline `[n]` citation markers into markdown links (`[n](#cite-n)`)
 * so they can be rendered as interactive references — but only for markers that
 * actually have a matching source, so stray brackets are left untouched.
 */
export function linkifyCitations(content: string, validNs: Set<number>): string {
  return content.replace(/\[(\d+)\]/g, (whole, digits) =>
    validNs.has(Number(digits)) ? `[${digits}](#cite-${digits})` : whole,
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

/* ---------- bubble ---------- */

export function MessageBubble({ message }: { message: Doc<"messages"> }) {
  const [openN, setOpenN] = useState<number | null>(null);
  const { showSources } = usePreferences();

  if (message.role === "user") {
    return (
      <div className="msg-in flex flex-col items-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm leading-relaxed text-accent-foreground">
          {message.content}
        </div>
        <span className="mt-1 mr-1 text-[11px] text-subtle">
          {timeOfDay(message._creationTime)}
        </span>
      </div>
    );
  }

  const annotations = message.annotations ?? [];
  const validNs = new Set(annotations.map((a) => a.n));
  // Only surface passages the answer actually cited inline — the retrieval set
  // can include top-N chunks the model never used, which read as noise.
  const citedNs = new Set<number>();
  for (const m of message.content.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1]);
    if (validNs.has(n)) citedNs.add(n);
  }
  const citedAnnotations = annotations.filter((a) => citedNs.has(a.n));
  // When "Show source citations" is off, render plain text (no clickable [n]
  // buttons) and hide the passages block below.
  const markdown = stripIconBrackets(
    showSources && annotations.length > 0
      ? linkifyCitations(message.content, validNs)
      : message.content,
  );

  return (
    <div className="msg-in group flex justify-start">
      <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-border bg-surface px-4 py-3">
        <div className="prose-chat text-sm leading-relaxed">
          <ReactMarkdown
            components={{
              a({ href, children }) {
                const m = /^#cite-(\d+)$/.exec(href ?? "");
                if (m) {
                  const n = Number(m[1]);
                  return (
                    <button
                      type="button"
                      onClick={() => setOpenN(n)}
                      aria-label={`Show source ${n}`}
                      className={`mx-0.5 inline-flex h-[1.4em] min-w-[1.4em] items-center justify-center rounded-full px-1 align-super text-[0.65em] font-bold leading-none transition-colors ${
                        openN === n
                          ? "bg-accent text-accent-foreground"
                          : "bg-accent/15 text-accent hover:bg-accent/30"
                      }`}
                    >
                      {n}
                    </button>
                  );
                }
                return (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                );
              },
            }}
          >
            {markdown}
          </ReactMarkdown>
        </div>

        {showSources && citedAnnotations.length > 0 && (
          <Sources
            annotations={citedAnnotations}
            answer={message.content}
            openN={openN}
            setOpenN={setOpenN}
          />
        )}

        <div className="mt-2 flex items-center justify-between gap-2">
          <MessageActions message={message} />
          <span className="shrink-0 text-[11px] text-subtle">
            {timeOfDay(message._creationTime)}
          </span>
        </div>
      </div>
    </div>
  );
}
