"use client";

import ReactMarkdown from "react-markdown";

/**
 * Render Markdown as styled prose (bold, bullet/numbered lists, headings) using
 * the shared `prose-chat` rules. For LLM-generated copy — FAQ answers, rules
 * refreshers — that would otherwise show raw `**` / `*` markup as plain text.
 */
export function Markdown({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={`prose-chat ${className}`}>
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
