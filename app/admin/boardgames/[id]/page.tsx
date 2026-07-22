"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { GameForm } from "@/components/admin/GameForm";
import { CoverUploader } from "@/components/admin/CoverUploader";
import { RulebookManager } from "@/components/admin/RulebookManager";

export default function EditGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const gameId = id as Id<"games">;
  const game = useQuery(api.games.getById, { gameId });
  const updateGame = useMutation(api.games.updateGame);

  if (game === undefined) {
    return <p className="text-muted">Loading…</p>;
  }
  if (game === null) {
    return (
      <div>
        <p className="text-muted">Game not found.</p>
        <Link href="/admin/boardgames" className="text-accent hover:underline">
          Back to games
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Edit “{game.title}”</h2>
        <Link
          href={`/boardgames/${gameId}`}
          className="text-sm text-muted hover:text-foreground"
        >
          View public page →
        </Link>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Cover
        </h3>
        <CoverUploader gameId={gameId} imageUrl={game.imageUrl} />
      </section>

      <section>
        <GameForm
          initial={game}
          submitLabel="Save changes"
          onSubmit={async (values) => {
            await updateGame({ gameId, ...values });
          }}
        />
      </section>

      <section>
        <RulebookManager gameId={gameId} rulebooks={game.rulebooks} />
      </section>
    </div>
  );
}
