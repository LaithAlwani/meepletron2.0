"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { buttonClasses } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { friendlyError } from "@/lib/friendlyError";

/** Turn a display name into a valid username candidate (3–20, [a-z0-9_.]). */
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20);
}

const GateContext = createContext<(() => Promise<boolean>) | null>(null);

/**
 * Hard gate for public actions. `ensureUsername()` resolves true immediately if
 * the caller already has a username; otherwise it opens a modal to set one (from
 * their name, or a new one) and resolves true once set, false if they cancel.
 * Mirrors the ConfirmProvider promise pattern.
 */
export function UsernameGateProvider({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.me);
  const setUsername = useMutation(api.users.setUsername);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [edited, setEdited] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const ensureUsername = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      if (me && me.username) {
        resolve(true);
        return;
      }
      resolver.current = resolve;
      setEdited(null);
      setOpen(true);
    });
  }, [me]);

  const finish = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpen(false);
  }, []);

  const isGuest = me?.isAnonymous === true;
  const suggestion = me?.name ? slugify(me.name) : "";
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
      finish(true);
    } catch (e) {
      toast(friendlyError(e, "Couldn't set that username."), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GateContext.Provider value={ensureUsername}>
      {children}
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => finish(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-lg font-bold">
                {isGuest ? "Sign in to share" : "Choose a username"}
              </h2>
              <button
                onClick={() => finish(false)}
                aria-label="Close"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isGuest ? (
              <>
                <p className="mt-2 text-sm text-muted">
                  Create an account to post on Meepletron.
                </p>
                <Link
                  href="/auth"
                  onClick={() => finish(false)}
                  className={`mt-4 w-full ${buttonClasses("primary", "md")}`}
                >
                  Sign in
                </Link>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted">
                  Before you post, pick a username — it&apos;s your public name in
                  the feed, on your profile, and on anything you share. Your real
                  name stays private. We&apos;ve suggested one from your name;
                  keep it or type your own.
                </p>
                <input
                  value={value}
                  onChange={(e) => setEdited(slugify(e.target.value))}
                  placeholder="username"
                  autoFocus
                  className="mt-4 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-2 focus:ring-ring/40"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={() => finish(false)}
                    className={buttonClasses("ghost", "md")}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={busy || value.trim().length < 3}
                    className={buttonClasses("primary", "md")}
                  >
                    Save &amp; continue
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </GateContext.Provider>
  );
}

export function useUsernameGate() {
  const ctx = useContext(GateContext);
  if (!ctx) {
    throw new Error("useUsernameGate must be used within UsernameGateProvider");
  }
  return ctx;
}
