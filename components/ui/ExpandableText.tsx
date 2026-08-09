"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Clamps text to a few lines with a "Read more" / "Show less" toggle.
 * `tone="accent"` styles the toggle for use on an accent-colored background. */
export function ExpandableText({
  text,
  className = "",
  tone = "default",
}: {
  text: string;
  className?: string;
  tone?: "default" | "accent";
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setOverflows(el.scrollHeight > el.clientHeight + 2);
  }, [text]);

  return (
    <div>
      <p
        ref={ref}
        className={`whitespace-pre-line text-sm leading-relaxed ${className} ${
          expanded ? "" : "line-clamp-3"
        }`}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`mt-1 text-sm font-medium hover:underline ${
            tone === "accent" ? "text-accent-foreground/90 underline" : "text-accent"
          }`}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
