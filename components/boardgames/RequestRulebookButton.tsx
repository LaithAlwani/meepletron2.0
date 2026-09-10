"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { BookPlus, Check, LogIn } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
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
  const confirm = useConfirm();
  const router = useRouter();
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

      // If product-update emails are off, we can't tell them when the manual
      // lands — nudge them to switch it on (and deep-link to that exact toggle).
      const updatesOff = !(me?.preferences?.emailUpdates ?? false);
      if (updatesOff) {
        const go = await confirm({
          title: "Want an email when it's ready?",
          message:
            "Your request is in! But “Product update emails” are turned off, so we can't email you when this rulebook is added and ready to chat. Turn them on to get notified.",
          confirmText: "Turn on in settings",
          cancelText: "Not now",
        });
        if (go) router.push("/settings#product-updates");
      } else {
        toast(
          res.alreadyRequested
            ? "You've already requested this — we'll add it soon."
            : "Requested! We'll email you when it's ready.",
          "success",
        );
      }
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
