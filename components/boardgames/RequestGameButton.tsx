"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { BookPlus, Check, LogIn } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { friendlyError } from "@/lib/friendlyError";

/**
 * The call-to-action on the "request this game" page — a game we don't have
 * locally yet, previewed from BoardGameGeek. For a signed-in user, one click
 * fetches + saves the game from BGG (so an admin can add its manual later) and
 * records a rulebook request, which surfaces in the admin Requests tab ranked
 * by demand. Signed-out visitors get a sign-in prompt. Mirrors
 * `RequestRulebookButton`, but keyed on a BGG id instead of a local game id.
 */
export function RequestGameButton({
  bggId,
  title,
  className,
}: {
  bggId: string;
  title: string;
  className?: string;
}) {
  const me = useQuery(api.users.me);
  const importGame = useAction(api.images.importGame);
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
        Sign in to request this game
      </Link>
    );
  }

  async function onClick() {
    setBusy(true);
    try {
      // Save the game from BGG first so there's a local id to attach the request
      // (and the manual, later) to. Re-requesting an already-saved game is free.
      const { gameId } = await importGame({ bggId, title });
      const res = await request({ gameId });
      setDone(true);

      // If product-update emails are off, we can't tell them when the manual
      // lands — nudge them to switch it on (and deep-link to that exact toggle).
      const updatesOff = !(me?.preferences?.emailUpdates ?? false);
      if (updatesOff) {
        const go = await confirm({
          title: "Want an email when it's ready?",
          message:
            "Your request is in! But “Product update emails” are turned off, so we can't email you when this game's rulebook is added and ready to chat. Turn them on to get notified.",
          confirmText: "Turn on in settings",
          cancelText: "Not now",
        });
        if (go) router.push("/profile#product-updates");
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
          {busy ? "Sending…" : "Request this game to be added"}
        </>
      )}
    </button>
  );
}
