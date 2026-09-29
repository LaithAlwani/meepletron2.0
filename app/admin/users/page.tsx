"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useConfirm } from "@/components/ui/Confirm";
import { useToast } from "@/components/ui/Toast";
import { relativeTime } from "@/lib/format";
import { friendlyError } from "@/lib/friendlyError";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function AdminUsersPage() {
  const data = useQuery(api.users.adminListUsers);
  const me = useQuery(api.users.me);
  // Snapshot the clock once per mount (calling Date.now() during render is impure).
  const [now] = useState(() => Date.now());
  const setRole = useMutation(api.users.setUserRole);
  const confirm = useConfirm();
  const toast = useToast();

  async function toggleAdmin(userId: Id<"users">, makeAdmin: boolean) {
    const ok = await confirm({
      title: makeAdmin ? "Grant admin access?" : "Revoke admin access?",
      message: makeAdmin
        ? "This user will be able to manage games, rulebooks, and other users."
        : "This user will lose access to the admin area.",
      confirmText: makeAdmin ? "Grant admin" : "Revoke",
      danger: !makeAdmin,
    });
    if (!ok) return;
    try {
      await setRole({ userId, role: makeAdmin ? "admin" : "user" });
      toast("Role updated", "success");
    } catch (e) {
      toast(friendlyError(e, "Couldn't update role"), "error");
    }
  }

  if (data === undefined) return <p className="text-muted">Loading…</p>;

  // Most-recently-active first (guests / never-chatted fall to the bottom by
  // join date) — surfaces live traffic at the top of the table.
  const users = [...data.users].sort(
    (a, b) => (b.lastActiveAt || b.joinedAt) - (a.lastActiveAt || a.joinedAt),
  );

  const activeThisWeek = users.filter(
    (u) => u.lastActiveAt && now - u.lastActiveAt < WEEK_MS,
  ).length;
  const newThisWeek = users.filter((u) => now - u.joinedAt < WEEK_MS).length;
  const guests = users.filter((u) => u.isAnonymous).length;
  const totalChats = users.reduce((n, u) => n + u.chats, 0);

  return (
    <div>
      <h2 className="mb-3 font-display text-lg font-bold">
        Users ({users.length})
      </h2>

      {/* Traffic at a glance. */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Active this week" value={activeThisWeek} />
        <SummaryStat label="New this week" value={newThisWeek} />
        <SummaryStat label="Chats started" value={totalChats} />
        <SummaryStat label="Guests" value={guests} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2 font-medium">Last active</th>
              <th className="px-3 py-2 text-right font-medium">Chats</th>
              <th className="px-3 py-2 text-right font-medium">Tokens today</th>
              <th className="px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = me?._id === u._id;
              return (
                <tr key={u._id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/users/${u._id}`}
                      className="group inline-block"
                    >
                      <div className="font-medium group-hover:text-accent group-hover:underline">
                        {u.name || u.email || "Unnamed"}
                        {isSelf && (
                          <span className="ml-1 text-xs text-muted">(you)</span>
                        )}
                      </div>
                      {u.email && (
                        <div className="text-xs text-muted">{u.email}</div>
                      )}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {u.isAnonymous ? (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                        guest
                      </span>
                    ) : (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          u.role === "admin"
                            ? "bg-accent/15 text-accent"
                            : "bg-surface-2 text-muted"
                        }`}
                      >
                        {u.role}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted">
                    {relativeTime(u.joinedAt)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted">
                    {u.lastActiveAt ? relativeTime(u.lastActiveAt) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {u.chats}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {u.tokensUsedToday.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!u.isAnonymous && !isSelf && (
                      <button
                        onClick={() => toggleAdmin(u._id, u.role !== "admin")}
                        className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-2"
                      >
                        {u.role === "admin" ? "Revoke admin" : "Make admin"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.hitLimit && (
        <p className="mt-2 text-xs text-muted">
          Chat counts are a floor — the activity scan was capped.
        </p>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="font-display mt-0.5 text-xl font-extrabold tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
