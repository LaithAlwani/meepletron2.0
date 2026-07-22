"use client";

import { useEffect, useState } from "react";
import { Loader } from "@/components/ui/Loader";

// Rotating status phrases while the AI works (ported from the original).
const PHRASES = [
  "Searching the rulebook…",
  "Flipping through the manual…",
  "Looking it up…",
  "Scanning the pages…",
  "Checking the index…",
  "Cross-referencing…",
  "Reading the relevant section…",
  "Processing…",
  "Putting it together…",
];

function pick(exclude?: string) {
  const opts = exclude ? PHRASES.filter((p) => p !== exclude) : PHRASES;
  return opts[Math.floor(Math.random() * opts.length)];
}

export function ThinkingIndicator() {
  const [phrase, setPhrase] = useState(() => pick());

  useEffect(() => {
    const id = setInterval(() => setPhrase((prev) => pick(prev)), 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-3">
      <Loader size={40} />
      <span key={phrase} className="phrase-in text-sm text-muted">
        {phrase}
      </span>
    </div>
  );
}
