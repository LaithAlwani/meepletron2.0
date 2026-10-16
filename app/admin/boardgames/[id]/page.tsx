"use client";

import { use, useState } from "react";
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
import { UnsavedGuardProvider } from "@/components/admin/UnsavedGuard";
import { cn } from "@/lib/cn";

const TABS = [
  { id: "details", label: "Details" },
  { id: "rulebooks", label: "Rulebooks" },
  { id: "box", label: "In the box" },
  { id: "faq", label: "FAQ" },
  { id: "reminders", label: "Reminders" },
] as const;
type TabId = (typeof TABS)[number]["id"];

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
  const [tab, setTab] = useState<TabId>("details");

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
    <UnsavedGuardProvider>
      <div className="max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="min-w-0 truncate font-display text-lg font-bold">
          Edit “{game.title}”
        </h2>
        <Link
          href={`/boardgames/${gameId}`}
          className="shrink-0 text-sm text-muted hover:text-foreground"
        >
          View public page →
        </Link>
      </div>

      {/* Tabs — keep the long editor sections off one giant scroll. */}
      <div
        role="tablist"
        aria-label="Edit sections"
        className="no-scrollbar mt-4 flex gap-1 overflow-x-auto border-b border-border"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-accent text-foreground"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panels stay mounted (just hidden) so switching tabs never drops
          unsaved edits in an editor. */}
      <div className="mt-6">
        <div
          role="tabpanel"
          className={cn("space-y-8", tab !== "details" && "hidden")}
        >
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
                  const r = await setCoverFromUrl({ gameId, url });
                  toast(
                    r.alreadyExists
                      ? "Cover already saved — kept the existing image"
                      : "Cover imported from BGG",
                    "success",
                  );
                } catch {
                  toast("Couldn't import the BGG cover", "error");
                }
              }}
            />
          </section>
        </div>

        <div role="tabpanel" className={cn(tab !== "rulebooks" && "hidden")}>
          <RulebookManager gameId={gameId} rulebooks={game.rulebooks} />
        </div>

        <div role="tabpanel" className={cn(tab !== "box" && "hidden")}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            In the box
          </h3>
          <ComponentsEditor gameId={gameId} />
        </div>

        <div role="tabpanel" className={cn(tab !== "faq" && "hidden")}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Common questions (FAQ)
          </h3>
          <FaqEditor gameId={gameId} />
        </div>

        <div role="tabpanel" className={cn(tab !== "reminders" && "hidden")}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Rules refresher
          </h3>
          <RemindersEditor gameId={gameId} />
        </div>
      </div>
    </div>
    </UnsavedGuardProvider>
  );
}
