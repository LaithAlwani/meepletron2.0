"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { RefreshCw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { buttonClasses } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { friendlyError } from "@/lib/friendlyError";
import { relativeTime } from "@/lib/format";

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50";

/**
 * Link + sync controls for a BoardGameGeek account.
 *
 * Progress comes from `myJobs`, which is a reactive Convex query — the bar
 * advances as batches land without any polling here.
 */
export function BggAccountCard() {
  const account = useQuery(api.bggSync.myAccount);
  const jobs = useQuery(api.bggSync.myJobs);
  const linkAccount = useAction(api.bggSync.linkAccount);
  const syncNow = useMutation(api.bggSync.syncNow);
  const unlink = useMutation(api.bggSync.unlinkAccount);
  const toast = useToast();
  const confirm = useConfirm();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const job = jobs?.find((j) => j.kind === "collection");
  const running =
    job && ["queued", "waiting", "running", "sweeping"].includes(job.status);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    try {
      await linkAccount({ username: username.trim(), password });
      // Drop the password from component state the moment it's been used.
      setPassword("");
      toast("BoardGameGeek account linked", "success");
    } catch (err) {
      toast(friendlyError(err, "Couldn't link that account"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function doSync() {
    try {
      await syncNow({});
      toast("Syncing your collection…", "success");
    } catch (err) {
      toast(friendlyError(err, "Couldn't start the sync"), "error");
    }
  }

  async function doUnlink() {
    const ok = await confirm({
      title: "Unlink BoardGameGeek?",
      message:
        "This removes your stored BoardGameGeek session and deletes the collection we synced. Your BGG account itself isn't touched.",
      confirmText: "Unlink",
      danger: true,
    });
    if (!ok) return;
    try {
      await unlink({});
      toast("BoardGameGeek account unlinked", "success");
    } catch (err) {
      toast(friendlyError(err, "Couldn't unlink"), "error");
    }
  }

  if (account === undefined) {
    return <p className="px-4 py-3.5 text-sm text-muted">Loading…</p>;
  }

  // --- Not linked, or the last attempt failed -------------------------------
  if (!account || account.status === "error") {
    return (
      <form onSubmit={submit} className="space-y-3 px-4 py-3.5">
        <div>
          <p className="text-sm font-medium text-foreground">
            Link your BoardGameGeek account
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Syncs the games you own so they show up here. We store a
            BoardGameGeek session token, never your password.
          </p>
        </div>
        {account?.status === "error" && (
          <p className="text-xs text-red-500">
            {account.lastError === "bad_credentials"
              ? "That username and password didn't work."
              : "BoardGameGeek couldn't be reached last time. Try again."}
          </p>
        )}
        <input
          className={inputCls}
          placeholder="BGG username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={busy}
        />
        <input
          className={inputCls}
          type="password"
          placeholder="BGG password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !username.trim() || !password}
          className={buttonClasses("primary", "sm")}
        >
          {busy ? "Linking…" : "Link account"}
        </button>
      </form>
    );
  }

  // --- Linked ---------------------------------------------------------------
  return (
    <div className="space-y-3 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {account.username}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {account.collectionSyncedAt
              ? `${account.collectionCount ?? 0} games · synced ${relativeTime(
                  account.collectionSyncedAt,
                )}`
              : "Not synced yet"}
          </p>
        </div>
        <Link
          href="/collection"
          className="shrink-0 text-xs font-semibold text-accent hover:underline"
        >
          View
        </Link>
      </div>

      {account.status === "needs_reauth" && (
        <p className="text-xs text-amber-500">
          Your BoardGameGeek session expired — link again to keep syncing.
        </p>
      )}

      {running && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          {job.status === "waiting"
            ? "BoardGameGeek is preparing your collection…"
            : `Syncing… ${job.processed} games`}
        </p>
      )}
      {job?.status === "error" && job.error && (
        <p className="text-xs text-red-500">{job.error}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={doSync}
          disabled={running}
          className={buttonClasses("ghost", "sm")}
        >
          Sync now
        </button>
        <button onClick={doUnlink} className={buttonClasses("ghost", "sm")}>
          Unlink
        </button>
      </div>
    </div>
  );
}
