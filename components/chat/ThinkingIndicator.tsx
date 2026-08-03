"use client";

import { useEffect, useState } from "react";
import { Loader } from "@/components/ui/Loader";

// Ordered to mirror the real pipeline: understand the question → vector search →
// rerank the hits → read the chosen passages → generate the grounded answer.
// It advances in order and holds on the last (generation is the long tail).
const STAGES = [
  "Reading your question…",
  "Flipping through the rulebook…",
  "Finding the relevant rules…",
  "Double-checking the wording…",
  "Writing your answer…",
];

export function ThinkingIndicator() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStage((s) => Math.min(s + 1, STAGES.length - 1));
    }, 900);
    return () => clearInterval(id);
  }, []);

  const phrase = STAGES[stage];

  return (
    <div className="flex items-center gap-3">
      <Loader size={40} />
      <span key={phrase} className="phrase-in text-sm text-muted">
        {phrase}
      </span>
    </div>
  );
}
