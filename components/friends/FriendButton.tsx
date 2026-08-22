"use client";

import { useState } from "react";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { UserPlus, UserCheck, Clock, Check } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { buttonClasses } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { friendlyError } from "@/lib/friendlyError";

/** Add / accept / requested / friends button for a user's profile. Hidden for
 *  your own profile and when signed out. */
export function FriendButton({ username }: { username: string }) {
  const { isAuthenticated } = useConvexAuth();
  const status = useQuery(
    api.friends.friendStatus,
    isAuthenticated ? { username } : "skip",
  );
  const send = useMutation(api.friends.sendFriendRequest);
  const accept = useMutation(api.friends.acceptFriendRequest);
  const remove = useMutation(api.friends.removeFriend);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (!isAuthenticated || !status || status.status === "self") return null;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(friendlyError(e, "Something went wrong."), "error");
    } finally {
      setBusy(false);
    }
  }

  switch (status.status) {
    case "friends":
      return (
        <button
          disabled={busy}
          onClick={() => run(() => remove({ username }))}
          title="Remove friend"
          className={buttonClasses("subtle", "sm")}
        >
          <UserCheck className="h-4 w-4" />
          Friends
        </button>
      );
    case "incoming":
      return (
        <button
          disabled={busy}
          onClick={() => run(() => accept({ username }))}
          className={buttonClasses("primary", "sm")}
        >
          <Check className="h-4 w-4" />
          Accept request
        </button>
      );
    case "outgoing":
      return (
        <button
          disabled={busy}
          onClick={() => run(() => remove({ username }))}
          title="Cancel request"
          className={buttonClasses("subtle", "sm")}
        >
          <Clock className="h-4 w-4" />
          Requested
        </button>
      );
    default:
      return (
        <button
          disabled={busy}
          onClick={() => run(() => send({ username }))}
          className={buttonClasses("primary", "sm")}
        >
          <UserPlus className="h-4 w-4" />
          Add friend
        </button>
      );
  }
}
