"use client";

import { useEffect, useRef } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/components/ui/Toast";

export const GUEST_UPGRADE_KEY = "guestUpgradeToken";

/**
 * Redeems a pending guest-upgrade token once the session belongs to a real
 * account. Mounted globally so it fires no matter where the user lands after
 * signing up (including after a Google OAuth redirect). No-op without a token.
 */
export function GuestUpgradeClaimer() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me);
  const complete = useMutation(api.guest.completeUpgrade);
  const toast = useToast();
  const claimed = useRef(false);

  useEffect(() => {
    if (claimed.current) return;
    if (!isAuthenticated || !me || me.isAnonymous) return;
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem(GUEST_UPGRADE_KEY)
        : null;
    if (!token) return;

    claimed.current = true;
    localStorage.removeItem(GUEST_UPGRADE_KEY);
    void complete({ token })
      .then((r) => {
        if (r?.migrated && (r.chats > 0 || r.favorites > 0)) {
          toast("Your guest chats were saved to your account", "success");
        }
      })
      .catch(() => {
        /* best-effort — nothing to show if the migration didn't apply */
      });
  }, [isAuthenticated, me, complete, toast]);

  return null;
}
