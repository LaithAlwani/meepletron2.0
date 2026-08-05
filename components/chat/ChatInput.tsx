"use client";

import { useRef, useState } from "react";
import { usePreferences } from "@/lib/usePreferences";

const SendIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
  </svg>
);

export function ChatInput({
  onSend,
  disabled,
  onFocus,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  onFocus?: () => void;
}) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { enterToSend } = usePreferences();

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    const ta = taRef.current;
    if (ta) ta.style.height = "auto";
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-1.5 rounded-2xl bg-surface px-2 py-1.5 ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-ring"
    >
      <textarea
        ref={taRef}
        value={text}
        onFocus={onFocus}
        onChange={(e) => setText(e.target.value)}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          // "Enter to send": Enter submits, Shift+Enter = newline.
          // Otherwise Enter = newline, Cmd/Ctrl+Enter submits.
          const shouldSend = enterToSend
            ? !e.shiftKey
            : e.metaKey || e.ctrlKey;
          if (shouldSend) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder={
          enterToSend ? "Ask a rules question…" : "Ask a rules question… (⌘↵ to send)"
        }
        className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-subtle"
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        aria-label="Send"
        className="flex shrink-0 items-center justify-center rounded-xl bg-accent p-2.5 text-accent-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {SendIcon}
      </button>
    </form>
  );
}
