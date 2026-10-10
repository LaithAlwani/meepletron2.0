"use client";

import { useEffect, useState } from "react";
import { Send, BookOpenCheck } from "lucide-react";
import { GroundedMarkdown } from "@/components/chat/GroundedMarkdown";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { Sources, type SourceRef } from "@/components/chat/MessageBubble";
import { useReducedMotionPref } from "@/components/lib/useReducedMotionPref";

type Demo = {
  game: string;
  question: string;
  answer: string;
  sources: SourceRef[];
};

/**
 * Worked examples, shown in the real chat's own components so the landing can't
 * drift from what the app actually looks like. Real rules and real rulebook
 * sections — the passages are shortened for the page, which is why the frame is
 * labelled as an example rather than passed off as a live session.
 */
const DEMOS: Demo[] = [
  {
    game: "CATAN",
    question: "Can I build a settlement right next to my friend's?",
    answer:
      "No. The **distance rule** covers every building on the board, not just your own.\n\nA new settlement has to go on an intersection at least two roads away from any other settlement or city — yours or an opponent's. That leaves the three intersections touching an existing building unavailable for the rest of the game [1].",
    sources: [
      {
        n: 1,
        bgTitle: "CATAN",
        breadcrumb: "Building · Settlements · The Distance Rule",
        text: "You must observe the distance rule: you may build a settlement only at an intersection where none of the 3 adjacent intersections is occupied by a settlement or city — regardless of whose settlement or city it is.",
      },
    ],
  },
  {
    game: "Wingspan",
    question: "The birdfeeder is empty — do I skip gaining food?",
    answer:
      "No, you refill it. Any time the birdfeeder is empty, roll all five food dice back into it and carry on with your action [1].\n\nThere's a second reroll worth remembering: if every die left in the birdfeeder shows the **same face**, you may reroll them all before you choose [2].",
    sources: [
      {
        n: 1,
        bgTitle: "Wingspan",
        breadcrumb: "Gain Food · Using the Birdfeeder",
        text: "If the birdfeeder is empty, refill it by rolling all 5 dice into it.",
      },
      {
        n: 2,
        bgTitle: "Wingspan",
        breadcrumb: "Gain Food · Rerolling the Dice",
        text: "If all of the dice in the birdfeeder show the same face, you may reroll all of them.",
      },
    ],
  },
  {
    game: "Ticket to Ride",
    question: "Can I take a face-up locomotive and still draw a second card?",
    answer:
      "No — a face-up locomotive costs you the whole turn. You take that one card and your turn ends, instead of the usual two draws [1].\n\nA locomotive you draw blind off the top of the deck is different: that one counts as an ordinary card, so you still take your second card [2].",
    sources: [
      {
        n: 1,
        bgTitle: "Ticket to Ride",
        breadcrumb: "Drawing Train Car Cards · Locomotives",
        text: "If you take a face-up Locomotive card, it counts as your entire turn: you may not draw any other cards.",
      },
      {
        n: 2,
        bgTitle: "Ticket to Ride",
        breadcrumb: "Drawing Train Car Cards · Locomotives",
        text: "A Locomotive drawn from the top of the deck counts as a normal Train Car card; you may then draw a second card as usual.",
      },
    ],
  },
];

/** What the frame shows at a given moment in the scripted sequence. */
type Frame = {
  typed: string;
  thinking: boolean;
  answer: string;
  showSources: boolean;
};

const settled = (d: Demo): Frame => ({
  typed: d.question,
  thinking: false,
  answer: d.answer,
  showSources: true,
});

/**
 * The landing's proof: a question being typed, then answered from the rulebook
 * with the passage attached.
 *
 * Built out of the chat's own `GroundedMarkdown`, `ThinkingIndicator` and
 * `Sources`, so the citation pills and source chips here are the same
 * components players tap in a real chat, not a mock-up that has to be kept in
 * sync by hand.
 *
 * First render is the finished conversation. That's what the server sends, so
 * the questions and answers are in the initial HTML for crawlers and for
 * anything reading the page without running JS — and it's also where the
 * sequence stops for anyone who asked for reduced motion.
 */
export function AnswerDemo() {
  const reduced = useReducedMotionPref();
  const [i, setI] = useState(0);
  const [frame, setFrame] = useState<Frame>(() => settled(DEMOS[0]));
  const demo = DEMOS[i];

  useEffect(() => {
    if (reduced) return; // the settled frame is the whole experience
    const d = DEMOS[i];
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          timers.delete(t);
          resolve();
        }, ms);
        timers.add(t);
      });

    void (async () => {
      // Holding the previous answer for a beat reads as a pause between
      // questions rather than a flash of empty chat.
      await wait(i === 0 ? 900 : 3600);
      if (cancelled) return;
      setFrame({ typed: "", thinking: false, answer: "", showSources: false });

      for (let c = 1; c <= d.question.length; c++) {
        await wait(26);
        if (cancelled) return;
        setFrame((f) => ({ ...f, typed: d.question.slice(0, c) }));
      }

      await wait(420);
      if (cancelled) return;
      setFrame((f) => ({ ...f, thinking: true }));

      // Long enough for the pipeline stages to read as steps, not a flicker.
      await wait(2700);
      if (cancelled) return;
      setFrame((f) => ({ ...f, thinking: false }));

      // Word-at-a-time, the way a streamed answer actually arrives.
      const words = d.answer.split(" ");
      for (let w = 1; w <= words.length; w++) {
        await wait(34);
        if (cancelled) return;
        setFrame((f) => ({ ...f, answer: words.slice(0, w).join(" ") }));
      }

      await wait(500);
      if (cancelled) return;
      setFrame((f) => ({ ...f, showSources: true }));

      await wait(5200);
      if (cancelled) return;
      setI((n) => (n + 1) % DEMOS.length);
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [i, reduced]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface/70 shadow-sm backdrop-blur">
        {/* Header — stands in for the chat's game bar. */}
        <div className="flex items-center gap-2.5 border-b border-border bg-surface-2/60 px-4 py-2.5">
          <span className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-xs font-bold text-accent">
            {demo.game.charAt(0)}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold">{demo.game}</p>
            <p className="flex items-center gap-1 text-[11px] text-muted">
              <BookOpenCheck className="h-3 w-3" />
              Rulebook indexed
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
            Example
          </span>
        </div>

        {/* Transcript — the chat's own bubble geometry. */}
        <div className="min-h-[22rem] space-y-4 px-4 py-4 sm:min-h-[20rem]">
          {frame.typed && (
            <div className="flex flex-col items-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm leading-relaxed text-accent-foreground">
                {frame.typed}
                {!frame.thinking && !frame.answer && (
                  <span className="demo-caret ml-0.5 inline-block w-[2px] align-[-0.1em] text-accent-foreground">
                    &nbsp;
                  </span>
                )}
              </div>
            </div>
          )}

          {frame.thinking && (
            <div className="msg-in">
              <ThinkingIndicator />
            </div>
          )}

          {frame.answer && (
            <Answer
              answer={frame.answer}
              sources={demo.sources}
              showSources={frame.showSources}
            />
          )}
        </div>

        {/* Input — matches the chat composer, deliberately inert. */}
        <div className="border-t border-border px-3 pb-3 pt-2.5">
          <div
            aria-hidden
            className="flex items-center gap-1.5 rounded-2xl bg-surface px-2 py-1.5 ring-1 ring-border"
          >
            <span className="flex-1 px-2 py-1.5 text-sm text-subtle">
              Ask a rules question…
            </span>
            <span className="flex shrink-0 items-center justify-center rounded-xl bg-accent p-2.5 text-accent-foreground shadow-sm">
              <Send className="h-[18px] w-[18px]" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The assistant bubble: grounded markdown plus the tappable source passages. */
function Answer({
  answer,
  sources,
  showSources,
}: {
  answer: string;
  sources: SourceRef[];
  showSources: boolean;
}) {
  const [openN, setOpenN] = useState<number | null>(null);
  const validNs = new Set(sources.map((s) => s.n));

  return (
    <div className="msg-in flex flex-col items-start">
      <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-border bg-surface px-4 py-3">
        <GroundedMarkdown
          content={answer}
          validNs={validNs}
          onOpenSource={setOpenN}
          activeSource={openN}
        />
        {showSources && (
          <Sources
            annotations={sources}
            answer={answer}
            openN={openN}
            setOpenN={setOpenN}
          />
        )}
      </div>
    </div>
  );
}
