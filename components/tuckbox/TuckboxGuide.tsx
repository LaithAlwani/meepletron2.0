"use client";

import { useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Fab } from "@/components/ui/Fab";

const USING: { title: string; body: string }[] = [
  {
    title: "Start from a game (optional)",
    body:
      "Open the generator from a board game's page to prefill the title and artwork, or start blank and set your own.",
  },
  {
    title: "Set the artwork & title",
    body:
      "Upload or pick cover art, add a title, and adjust colors so the box matches your game.",
  },
  {
    title: "Dial in paper & fit",
    body:
      "Enter your card size and stack thickness, then nudge the tolerance until the cards fit snugly. Preview flat or as a 3D box.",
  },
  {
    title: "Download & print",
    body:
      "Export the PDF and print at 100% scale on cardstock — then follow the assembly steps below.",
  },
];

const ASSEMBLY: { title: string; body: string }[] = [
  {
    title: "Print at 100% scale",
    body:
      "Open the downloaded PDF and print at actual size — do not use 'Fit to page' or 'Shrink to printable area'. Cardstock (180–250 gsm / 65–110 lb) holds its shape best.",
  },
  {
    title: "Cut along the solid lines",
    body:
      "Use a craft knife and a metal ruler against the solid black outline. Don't cut the dashed lines — those are folds.",
  },
  {
    title: "Score the dashed fold lines",
    body:
      "With the back of the knife (or a bone folder), gently score along each dashed line without cutting through. This makes clean, sharp folds.",
  },
  {
    title: "Fold every scored line",
    body:
      "Fold each panel along its scored line, then unfold flat again. Pre-folding everything before gluing makes assembly much easier.",
  },
  {
    title: "Glue the side tab",
    body:
      "Apply glue (PVA / craft glue or double-sided tape) to the thin glue tab on the far edge. Wrap the box around and press the back panel onto the glue tab to form a rectangular tube.",
  },
  {
    title: "Close the bottom",
    body:
      "Fold in the two small dust flaps on the closed end first, then fold the main bottom panel over them and glue it down. Hold for ~30 seconds so it sets.",
  },
  {
    title: "Load your cards",
    body:
      "Slide your card stack into the open end of the box. The cards should fit snugly — if they're too tight, your tolerance is set too small; too loose, set it larger and re-print.",
  },
  {
    title: "Close the top tuck",
    body:
      "Fold the side dust flaps inward, then tuck the top flap down inside the box opening. The dust flaps keep the cards from sliding out.",
  },
];

/** The tuckbox floating help button + its guide sheet (how to use + assemble). */
export function TuckboxGuide() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Fab
        icon={HelpCircle}
        label="How to use the tuckbox generator"
        onClick={() => setOpen(true)}
      />
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        desktop="center"
        desktopWidth="sm:max-w-lg"
        mobileHeight="h-[85vh]"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-lg font-bold">Tuckbox guide</h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="themed-scroll flex-1 overflow-y-auto px-4 py-4">
          <Guide title="Using the generator" steps={USING} />
          <div className="mt-6">
            <Guide title="Assembling the box" steps={ASSEMBLY} />
          </div>
          <p className="mt-5 rounded-xl bg-surface-2 px-3.5 py-3 text-xs text-subtle">
            Tip: on the printed sheet, the thin <em>glue tab</em> is the
            narrowest panel on the far left of the strip; the{" "}
            <em>top tuck flap</em> is the panel that sticks up above the front.
          </p>
        </div>
      </Sheet>
    </>
  );
}

function Guide({
  title,
  steps,
}: {
  title: string;
  steps: { title: string; body: string }[];
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-subtle">
        {title}
      </p>
      <ol className="list-decimal space-y-3 pl-5 text-sm">
        {steps.map((s) => (
          <li key={s.title}>
            <span className="font-semibold text-foreground">{s.title}.</span>{" "}
            <span className="text-muted">{s.body}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
