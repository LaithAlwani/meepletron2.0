"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ThumbsUp, ThumbsDown, ChevronDown } from "lucide-react";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";
import {
  stripIconBrackets,
  linkifyCitations,
} from "@/components/chat/MessageBubble";

type Faq = {
  _id: Id<"gameFaqs">;
  question: string;
  answer: string;
  annotations: {
    n: number;
    breadcrumb?: string;
    page?: number;
    bgTitle: string;
  }[];
  helpful: number;
  notHelpful: number;
  myVote: "up" | "down" | null;
};

/** Per-game FAQ accordion with grounded answers, source chips, and votes. */
export function FaqAccordion({ gameId }: { gameId: Id<"games"> }) {
  const faqs = useQuery(api.faqs.listForGame, { gameId }) as
    | Faq[]
    | undefined;
  if (!faqs || faqs.length === 0) return null;

  return (
    <section className="animate-in mb-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Common questions
      </h2>
      <ul className="space-y-2">
        {faqs.map((f) => (
          <FaqItem key={f._id} faq={f} />
        ))}
      </ul>
    </section>
  );
}

function FaqItem({ faq }: { faq: Faq }) {
  const [open, setOpen] = useState(false);
  const vote = useMutation(api.faqs.voteFaq);
  const { isAuthenticated } = useConvexAuth();
  const toast = useToast();

  async function doVote(v: "up" | "down") {
    if (!isAuthenticated) {
      toast("Sign in to vote", "info");
      return;
    }
    try {
      await vote({ faqId: faq._id, vote: v });
    } catch {
      toast("Couldn't record your vote", "error");
    }
  }

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-semibold transition-colors hover:bg-surface-2"
      >
        <span>{faq.question}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-subtle transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3">
          <div className="prose-chat text-sm leading-relaxed">
            <ReactMarkdown
              components={{
                a({ href, children }) {
                  const m = /^#cite-(\d+)$/.exec(href ?? "");
                  if (m) {
                    // Inline citation → numbered accent pill, matching the
                    // Sources chips below.
                    return (
                      <span className="mx-0.5 inline-flex h-[1.4em] min-w-[1.4em] items-center justify-center rounded-full bg-accent/15 px-1 align-super text-[0.65em] font-bold leading-none text-accent">
                        {m[1]}
                      </span>
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
              {stripIconBrackets(
                linkifyCitations(
                  faq.answer,
                  new Set(faq.annotations.map((a) => a.n)),
                ),
              )}
            </ReactMarkdown>
          </div>

          {faq.annotations.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Sources
              </span>
              {faq.annotations.map((a) => (
                <span
                  key={a.n}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted"
                >
                  <span className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent/15 px-1 text-[9px] font-bold text-accent">
                    {a.n}
                  </span>
                  <span className="max-w-[180px] truncate">
                    {[a.breadcrumb, a.page ? `p.${a.page}` : null]
                      .filter(Boolean)
                      .join(" · ") || a.bgTitle}
                  </span>
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <span>Was this helpful?</span>
            <button
              onClick={() => doVote("up")}
              aria-pressed={faq.myVote === "up"}
              aria-label="Helpful"
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-surface-2 ${
                faq.myVote === "up" ? "text-accent-2" : ""
              }`}
            >
              <ThumbsUp className="h-4 w-4" />
              <span>{faq.helpful}</span>
            </button>
            <button
              onClick={() => doVote("down")}
              aria-pressed={faq.myVote === "down"}
              aria-label="Not helpful"
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-surface-2 ${
                faq.myVote === "down" ? "text-red-500" : ""
              }`}
            >
              <ThumbsDown className="h-4 w-4" />
              <span>{faq.notHelpful}</span>
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
