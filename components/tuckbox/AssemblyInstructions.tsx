"use client";

import { useState } from "react";

const STEPS: { title: string; body: string }[] = [
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

export function AssemblyInstructions() {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="text-sm font-medium text-primary hover:underline flex items-center gap-2"
      >
        <span>{open ? "▾" : "▸"}</span>
        How to assemble the box
      </button>
      {open && (
        <ol className="mt-3 space-y-3 text-sm text-foreground list-decimal pl-5">
          {STEPS.map((step) => (
            <li key={step.title}>
              <span className="font-semibold">{step.title}.</span>{" "}
              <span className="text-muted">{step.body}</span>
            </li>
          ))}
          <li className="!list-none -ml-5 pt-1 text-xs text-subtle">
            Tip: a quick way to tell sides apart on the printed sheet — the
            thin <em>glue tab</em> is the narrowest panel on the far left of
            the strip; the <em>top tuck flap</em> is the panel that sticks up
            above the front.
          </li>
        </ol>
      )}
    </div>
  );
}
