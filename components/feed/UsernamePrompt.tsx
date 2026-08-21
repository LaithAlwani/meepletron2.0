"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { buttonClasses } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { friendlyError } from "@/lib/friendlyError";

const DISMISS_KEY = "mp:username-prompt-dismissed";

/** Turn a display name into a valid username candidate (3–20, [a-z0-9_.]). */
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20);
}

/**
 * A dismissible banner nudging a signed-in user without a username to pick one
 * (prefilled from their name — "use my name"). The username is their public
 * identity everywhere; the real name is never shown publicly.
 */
export function UsernamePrompt() {
  const me = useQuery(api.users.me);
  const setUsername = useMutation(api.users.setUsername);
  const toast = useToast();
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1",
  );
  // null = untouched (show the name-derived suggestion); a string once edited.
  const [edited, setEdited] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!me || me.isAnonymous === true || me.username || dismissed) return null;

  const suggestion = me.name ? slugify(me.name) : "";
  const value = edited ?? suggestion;

  async function save() {
    const uname = value.trim();
    if (uname.length < 3) {
      toast("Usernames are at least 3 characters.", "error");
      return;
    }
    setBusy(true);
    try {
      await setUsername({ username: uname });
      toast("Username set!", "success");
    } catch (e) {
      toast(friendlyError(e, "Couldn't set that username."), "error");
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode — ignore */
    }
    setDismissed(true);
  }

  return (
    <div className="mb-5 rounded-2xl border border-accent/30 bg-accent/8 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm font-bold">Pick a username</p>
          <p className="mt-0.5 text-xs text-muted">
            It&apos;s how you show up on Meepletron — in the feed, on your
            profile, and on anything you share. Your real name stays private.
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={value}
          onChange={(e) => setEdited(slugify(e.target.value))}
          placeholder="username"
          className="w-full flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-2 focus:ring-ring/40"
        />
        <button
          onClick={save}
          disabled={busy || value.trim().length < 3}
          className={buttonClasses("primary", "md")}
        >
          Save
        </button>
      </div>
      {suggestion && suggestion.length >= 3 && suggestion !== value && (
        <p className="mt-2 text-xs text-subtle">
          Use your name:{" "}
          <button
            onClick={() => setEdited(suggestion)}
            className="font-semibold text-accent hover:underline"
          >
            {suggestion}
          </button>
        </p>
      )}
    </div>
  );
}
