"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { GameForm } from "@/components/admin/GameForm";
import { CoverUploader } from "@/components/admin/CoverUploader";
import { RulebookManager } from "@/components/admin/RulebookManager";
import { ComponentsEditor } from "@/components/admin/ComponentsEditor";
import { FaqEditor } from "@/components/admin/FaqEditor";
import { RemindersEditor } from "@/components/admin/RemindersEditor";
import { useToast } from "@/components/ui/Toast";

export default function EditGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const gameId = id as Id<"games">;
  const game = useQuery(api.games.getById, { gameId });
  const updateGame = useMutation(api.games.updateGame);
  const setCoverFromUrl = useAction(api.images.setGameCoverFromUrl);
  const toast = useToast();

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
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="min-w-0 truncate font-display text-lg font-bold">Edit “{game.title}”</h2>
        <Link
          href={`/boardgames/${gameId}`}
          className="shrink-0 text-sm text-muted hover:text-foreground"
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
          onBggImage={async (url) => {
            try {
              await setCoverFromUrl({ gameId, url });
              toast("Cover imported from BGG", "success");
            } catch {
              toast("Couldn't import the BGG cover", "error");
            }
          }}
        />
      </section>

      <section>
        <RulebookManager gameId={gameId} rulebooks={game.rulebooks} />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          In the box
        </h3>
        <ComponentsEditor gameId={gameId} />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Common questions (FAQ)
        </h3>
        <FaqEditor gameId={gameId} />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Rules refresher
        </h3>
        <RemindersEditor gameId={gameId} />
      </section>
    </div>
  );
}
