"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { BookPlus, Check, LogIn } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";
import { friendlyError } from "@/lib/friendlyError";

/**
 * Shown on a game with no ingested rulebook: lets a signed-in user request that
 * we add + ingest it. Each request is deduped per user and surfaces in the admin
 * Requests tab ranked by demand. Signed-out visitors get a sign-in prompt.
 */
export function RequestRulebookButton({
  gameId,
  className,
}: {
  gameId: Id<"games">;
  className?: string;
}) {
  const me = useQuery(api.users.me);
  const request = useMutation(api.rulebookRequests.requestRulebook);
  const toast = useToast();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  // Signed out → send them to auth to request (keeps requests deduped per user).
  if (me === null) {
    return (
      <Link href="/auth" className={className}>
        <LogIn className="h-4 w-4" />
        Sign in to request the rulebook
      </Link>
    );
  }

  async function onClick() {
    setBusy(true);
    try {
      const res = await request({ gameId });
      setDone(true);
      toast(
        res.alreadyRequested
          ? "You've already requested this — we'll add it soon."
          : "Requested! We'll add this rulebook soon.",
        "success",
      );
    } catch (e) {
      toast(friendlyError(e, "Couldn't send your request"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={busy || done || me === undefined}
      className={className}
    >
      {done ? (
        <>
          <Check className="h-4 w-4" />
          Requested
        </>
      ) : (
        <>
          <BookPlus className="h-4 w-4" />
          Request the rulebook
        </>
      )}
    </button>
  );
}
