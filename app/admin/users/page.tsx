"use client";

import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useConfirm } from "@/components/ui/Confirm";
import { useToast } from "@/components/ui/Toast";

export default function AdminUsersPage() {
  const users = useQuery(api.users.adminListUsers);
  const me = useQuery(api.users.me);
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
      toast(e instanceof Error ? e.message : "Couldn't update role", "error");
    }
  }

  if (users === undefined) return <p className="text-muted">Loading…</p>;

  return (
    <div>
      <h2 className="mb-3 font-semibold">Users ({users.length})</h2>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Role</th>
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
                  <td className="px-3 py-2 text-right">
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
    </div>
  );
}
