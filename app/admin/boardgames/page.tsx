"use client";

import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useConfirm } from "@/components/ui/Confirm";
import { useToast } from "@/components/ui/Toast";

export default function AdminGamesPage() {
  const games = useQuery(api.games.adminList);
  const deleteGame = useMutation(api.games.deleteGame);
  const confirm = useConfirm();
  const toast = useToast();

  async function handleDelete(id: Id<"games">, title: string) {
    const ok = await confirm({
      title: `Delete “${title}”?`,
      message:
        "This permanently removes the game and all its rulebooks, chunks, and chats. This can't be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteGame({ gameId: id });
      toast(`Deleted “${title}”`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete the game", "error");
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">All games</h2>
        <Link
          href="/admin/boardgames/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          Add game
        </Link>
      </div>

      {games === undefined ? (
        <p className="text-muted">Loading…</p>
      ) : games.length === 0 ? (
        <p className="text-muted">No games yet.</p>
      ) : (
        <ul className="space-y-2">
          {games.map((g) => (
            <li
              key={g._id}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
            >
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-2">
                {g.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={g.thumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center opacity-40">
                    🎲
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="font-medium">
                  {g.title}
                  {g.isExpansion && (
                    <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                      Expansion
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted">{g.slug}</div>
              </div>
              <Link
                href={`/admin/boardgames/${g._id}`}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                Edit
              </Link>
              <button
                onClick={() => handleDelete(g._id, g.title)}
                className="text-sm text-red-600 hover:underline dark:text-red-400"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
