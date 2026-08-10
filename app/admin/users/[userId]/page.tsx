"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function AdminChatMessages({ chatId }: { chatId: Id<"chats"> }) {
  const messages = useQuery(api.chat.adminChatMessages, { chatId });
  if (messages === undefined)
    return <p className="px-3 py-2 text-sm text-muted">Loading…</p>;
  if (messages.length === 0)
    return <p className="px-3 py-2 text-sm text-muted">No messages.</p>;
  return (
    <div className="space-y-2 border-t border-border bg-surface-2 p-3">
      {messages.map((m) => (
        <div
          key={m._id}
          className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
        >
          <div
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
              m.role === "user"
                ? "bg-accent text-accent-foreground"
                : "border border-border bg-surface"
            }`}
          >
            {m.content}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);
  const uid = userId as Id<"users">;
  const user = useQuery(api.users.adminGetUser, { userId: uid });
  const chats = useQuery(api.chat.adminUserChats, { userId: uid });
  const [openChatId, setOpenChatId] = useState<Id<"chats"> | null>(null);

  if (user === undefined) return <p className="text-muted">Loading…</p>;
  if (user === null)
    return (
      <div>
        <p className="text-muted">User not found.</p>
        <Link href="/admin/users" className="text-accent hover:underline">
          Back to users
        </Link>
      </div>
    );

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="text-sm text-muted hover:text-foreground">
        ← Users
      </Link>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-display text-lg font-bold">
          {user.name || user.email || "Unnamed user"}
        </h2>
        {user.email && <p className="text-sm text-muted">{user.email}</p>}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-surface-2 px-2 py-0.5">
            {user.isAnonymous ? "guest" : user.role}
          </span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5">
            {user.tokensUsedToday.toLocaleString()} tokens today
          </span>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Chats ({chats?.length ?? 0})
        </h3>
        {chats === undefined ? (
          <p className="text-muted">Loading…</p>
        ) : chats.length === 0 ? (
          <p className="text-muted">This user has no chats.</p>
        ) : (
          <ul className="space-y-2">
            {chats.map((c) => (
              <li
                key={c._id}
                className="overflow-hidden rounded-xl border border-border bg-surface"
              >
                <button
                  onClick={() =>
                    setOpenChatId(openChatId === c._id ? null : c._id)
                  }
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{c.gameTitle}</div>
                    {c.lastMessage && (
                      <div className="truncate text-sm text-muted">
                        {c.lastMessage}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted">
                    {openChatId === c._id ? "Hide" : "View"}
                  </span>
                </button>
                {openChatId === c._id && <AdminChatMessages chatId={c._id} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
