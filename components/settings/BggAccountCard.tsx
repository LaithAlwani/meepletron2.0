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
  const importing =
    job && ["queued", "waiting", "running", "sweeping"].includes(job.status);
  const enriching = job?.status === "enriching";
  const running = importing || enriching;

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

      {importing && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            <span className="flex min-w-0 items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
              {job.status === "waiting"
                ? "Preparing your collection…"
                : job.status === "sweeping"
                  ? "Tidying up…"
                  : "Copying your collection…"}
            </span>
            <span className="shrink-0 tabular-nums">
              {job.total != null
                ? `${job.processed} / ${job.total}`
                : `${job.processed}`}
            </span>
          </div>

          {job.total ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{
                  width: `${Math.min(100, Math.round((job.processed / job.total) * 100))}%`,
                }}
              />
            </div>
          ) : null}

          {(job.created != null || job.recentTitles?.length) && (
            <p className="truncate text-[11px] text-subtle">
              {job.created != null && (
                <span>
                  {job.created} new · {Math.max(0, job.processed - job.created)}{" "}
                  already in library
                </span>
              )}
              {job.recentTitles?.length ? (
                <span>
                  {job.created != null ? " · " : ""}
                  {job.recentTitles.slice(-3).reverse().join(", ")}
                </span>
              ) : null}
            </p>
          )}
        </div>
      )}

      {enriching && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            <span className="flex min-w-0 items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
              Adding games to your library…
            </span>
            <span className="shrink-0 tabular-nums">
              {job.enrichProcessed ?? 0}
              {job.enrichTotal != null ? ` / ${job.enrichTotal}` : ""}
            </span>
          </div>

          {job.enrichTotal ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{
                  width: `${Math.min(100, Math.round(((job.enrichProcessed ?? 0) / job.enrichTotal) * 100))}%`,
                }}
              />
            </div>
          ) : null}

          {job.currentTitle && (
            <p className="truncate text-[11px] text-subtle">
              Now importing: {job.currentTitle}
            </p>
          )}
        </div>
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
