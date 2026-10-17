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
import { EditableCard } from "@/components/admin/EditableCard";
import {
  DetailsView,
  CoverView,
  RulebooksView,
  ComponentsView,
  FaqView,
  RemindersView,
} from "@/components/admin/ReadViews";
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

      {/* Each section is a read-only card with an Edit button that reveals its
          editor. Panels stay mounted (hidden) so switching tabs keeps an
          in-progress edit and its unsaved-changes state. */}
      <div className="mt-6">
        <div
          role="tabpanel"
          className={cn("space-y-4", tab !== "details" && "hidden")}
        >
          <EditableCard
            title="Cover"
            view={<CoverView imageUrl={game.imageUrl} />}
            renderEdit={(done) => (
              <div className="space-y-3">
                <CoverUploader gameId={gameId} imageUrl={game.imageUrl} />
                <DoneButton onClick={done} />
              </div>
            )}
          />
          <EditableCard
            title="Details"
            view={<DetailsView game={game} />}
            renderEdit={(done) => (
              <GameForm
                initial={game}
                submitLabel="Save changes"
                onDone={done}
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
            )}
          />
        </div>

        <div role="tabpanel" className={cn(tab !== "rulebooks" && "hidden")}>
          <EditableCard
            title="Rulebooks"
            view={<RulebooksView rulebooks={game.rulebooks} />}
            renderEdit={(done) => (
              <div className="space-y-3">
                <RulebookManager gameId={gameId} rulebooks={game.rulebooks} />
                <DoneButton onClick={done} />
              </div>
            )}
          />
        </div>

        <div role="tabpanel" className={cn(tab !== "box" && "hidden")}>
          <EditableCard
            title="In the box"
            view={<ComponentsView gameId={gameId} />}
            renderEdit={(done) => (
              <ComponentsEditor gameId={gameId} onDone={done} />
            )}
          />
        </div>

        <div role="tabpanel" className={cn(tab !== "faq" && "hidden")}>
          <EditableCard
            title="Common questions (FAQ)"
            view={<FaqView gameId={gameId} />}
            renderEdit={(done) => <FaqEditor gameId={gameId} onDone={done} />}
          />
        </div>

        <div role="tabpanel" className={cn(tab !== "reminders" && "hidden")}>
          <EditableCard
            title="Rules refresher"
            view={<RemindersView gameId={gameId} />}
            renderEdit={(done) => (
              <RemindersEditor gameId={gameId} onDone={done} />
            )}
          />
        </div>
      </div>
    </div>
    </UnsavedGuardProvider>
  );
}

function DoneButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      Done
    </button>
  );
}
