"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import {
  ArrowUp,
  ArrowDown,
  Globe,
  Lock,
  Link2,
  RotateCcw,
  Star,
  Trophy,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Thumb } from "./Thumb";
import { buttonClasses } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { Chip } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";

type TopTag = "same" | "moved" | "new" | "back" | null;

type Item = {
  rank: number;
  gameId: Id<"games">;
  title: string;
  game: { slug: string; title: string; thumbUrl: string | null } | null;
  movement: number | null;
  tag: TopTag;
  history: { year: number; rank: number }[];
};

export type TopListData = {
  _id: Id<"topGamesLists">;
  size: number;
  year: number;
  title: string | null;
  status: "draft" | "finalized";
  visibility: "private" | "public";
  count: number;
  finalizedAt: number | null;
  isOwner: boolean;
  author: { username: string | null; name: string | null; avatarUrl: string | null } | null;
  items: Item[];
  droppedOff: {
    gameId: Id<"games">;
    title: string;
    lastRank: number;
    game: { slug: string; title: string; thumbUrl: string | null } | null;
  }[];
  hasPrior: boolean;
  prevYear: number | null;
};

function MovementBadge({ item }: { item: Item }) {
  if (item.tag === "new") {
    return (
      <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-foreground">
        New
      </span>
    );
  }
  if (item.tag === "back") {
    return (
      <span className="rounded-full bg-accent-2 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-2-foreground">
        Back
      </span>
    );
  }
  if (item.tag === "moved" && item.movement != null) {
    const up = item.movement > 0;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 text-xs font-bold tabular-nums",
          up ? "text-accent-2" : "text-muted",
        )}
        title={`${up ? "Up" : "Down"} ${Math.abs(item.movement)} from last year`}
      >
        {up ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
        {Math.abs(item.movement)}
      </span>
    );
  }
  if (item.tag === "same") {
    return <span className="text-xs font-bold text-subtle" title="No change">—</span>;
  }
  return null;
}

function RankRow({ item, hm = false }: { item: Item; hm?: boolean }) {
  const inner = (
    <>
      <span className="flex w-8 shrink-0 items-center justify-center text-lg font-extrabold tabular-nums text-muted">
        {hm ? <Star className="h-4 w-4 text-accent-2" /> : item.rank}
      </span>
      <Thumb url={item.game?.thumbUrl} className="h-12 w-12" />
      <div className="min-w-0 flex-1">
        <span className="font-display block truncate font-bold">
          {item.game?.title ?? item.title}
        </span>
        {item.history.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-subtle">
            {item.history.map((h) => `#${h.rank} in ${h.year}`).join(" · ")}
          </p>
        )}
      </div>
      <MovementBadge item={item} />
    </>
  );
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-2xl border p-2.5 pr-3",
        hm ? "border-border/70 bg-surface-2/50" : "border-border bg-surface",
      )}
    >
      {item.game?.slug ? (
        <Link
          href={`/boardgames/${item.game.slug}`}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{inner}</div>
      )}
    </li>
  );
}

export function TopGamesView({ data }: { data: TopListData }) {
  const toast = useToast();
  const confirm = useConfirm();
  const reopen = useMutation(api.topGames.reopen);
  const setVisibility = useMutation(api.topGames.setVisibility);

  const heading = data.title ?? `Top ${data.size} · ${data.year}`;
  const isPublic = data.visibility === "public";
  const mainItems = data.items.filter((i) => i.rank <= data.size);
  const honorable = data.items.filter((i) => i.rank > data.size);

  async function onReopen() {
    const ok = await confirm({
      title: "Reopen for editing?",
      message: "This turns the list back into a private draft until you finalize again.",
      confirmText: "Reopen",
    });
    if (ok) await reopen({ id: data._id });
  }

  async function togglePublic() {
    try {
      await setVisibility({ id: data._id, visibility: isPublic ? "private" : "public" });
      toast(isPublic ? "List is now private." : "List is public — share the link!", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update.", "error");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Link copied.", "success");
    } catch {
      toast("Couldn't copy the link.", "error");
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 text-accent">
          <Trophy className="h-5 w-5" />
          <span className="text-sm font-bold uppercase tracking-[0.14em]">
            Top {data.size} · {data.year}
          </span>
        </div>
        <h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight">
          {heading}
        </h1>

        {data.author && (
          <div className="mt-2 flex items-center gap-2 text-sm text-muted">
            {data.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.author.avatarUrl}
                alt=""
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : null}
            <span>
              by{" "}
              {data.author.username ? (
                <Link
                  href={`/u/${data.author.username}`}
                  className="font-semibold text-foreground hover:text-accent"
                >
                  {data.author.name ?? data.author.username}
                </Link>
              ) : (
                <span className="font-semibold text-foreground">
                  {data.author.name ?? "Someone"}
                </span>
              )}
            </span>
          </div>
        )}

        {data.isOwner && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={onReopen} className={buttonClasses("ghost", "sm")}>
              <RotateCcw className="h-4 w-4" />
              Reopen to edit
            </button>
            <button onClick={togglePublic} className={buttonClasses("ghost", "sm")}>
              {isPublic ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
              {isPublic ? "Make private" : "Make public"}
            </button>
            {isPublic && (
              <button onClick={copyLink} className={buttonClasses("subtle", "sm")}>
                <Link2 className="h-4 w-4" />
                Copy link
              </button>
            )}
          </div>
        )}
      </div>

      {/* Ranked list */}
      <ol className="space-y-2">
        {mainItems.map((item) => (
          <RankRow key={item.gameId} item={item} />
        ))}
      </ol>

      {/* Honorable mentions */}
      {honorable.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-accent-2">
            <Star className="h-3.5 w-3.5" />
            Honorable mentions
          </h2>
          <ul className="space-y-2">
            {honorable.map((item) => (
              <RankRow key={item.gameId} item={item} hm />
            ))}
          </ul>
        </div>
      )}

      {/* Fell off this year */}
      {data.droppedOff.length > 0 && (
        <div className="mt-8">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-subtle">
            Fell off this year
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.droppedOff.map((d) => (
              <li key={d.gameId}>
                <Chip className="gap-1.5">
                  {d.game?.slug ? (
                    <Link href={`/boardgames/${d.game.slug}`} className="hover:text-accent">
                      {d.game?.title ?? d.title}
                    </Link>
                  ) : (
                    (d.game?.title ?? d.title)
                  )}
                  <span className="text-subtle">was #{d.lastRank}</span>
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
