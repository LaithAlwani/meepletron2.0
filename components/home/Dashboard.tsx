"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, usePaginatedQuery } from "convex/react";
import {
  Dices,
  Trophy,
  MessageCircle,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/Surface";
import { Thumb } from "@/components/top-games/Thumb";
import { PlayCard } from "@/components/plays/PlayCard";
import { PlayPostCard } from "@/components/plays/PlayPostCard";
import { LogPlayWizard } from "@/components/plays/LogPlayWizard";
import { CreateListDrawer } from "@/components/top-games/CreateListDrawer";

export function Dashboard() {
  const me = useQuery(api.users.me);
  const monthStart = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }, []);
  const stats = useQuery(api.plays.myPlayStats, { monthStartDate: monthStart });
  const { results: recent, status: recentStatus } = usePaginatedQuery(
    api.plays.myPlays,
    {},
    { initialNumItems: 3 },
  );
  const friendsPlays = useQuery(api.plays.friendsRecentPlays, {});
  const chats = useQuery(api.chat.listMyChats);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [createListOpen, setCreateListOpen] = useState(false);

  const hello = me?.username ? `@${me.username}` : me?.name || "there";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">
          Welcome back, {hello}
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          Here&apos;s what&apos;s happening at your table.
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <ActionCard
          icon={Dices}
          label="Log a play"
          onClick={() => setWizardOpen(true)}
        />
        <ActionCard
          icon={Trophy}
          label="New list"
          onClick={() => setCreateListOpen(true)}
        />
      </div>

      {/* This month */}
      <section>
        <SectionHead title="Your stats" href="/profile" label="Full stats" />
        {!stats ? (
          <Skeleton className="h-24 w-full rounded-2xl" />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="This month" value={stats.thisMonth} />
            <StatTile label="Total plays" value={stats.total} />
            <StatTile
              label="Win rate"
              value={stats.winPct === null ? "—" : `${stats.winPct}%`}
            />
          </div>
        )}
      </section>

      {/* Recent plays */}
      <section>
        <SectionHead title="Recent plays" href="/plays" label="See all" />
        {recentStatus === "LoadingFirstPage" ? (
          <Skeleton className="h-20 w-full rounded-2xl" />
        ) : recent.length === 0 ? (
          <EmptyCard>
            No plays yet.{" "}
            <button
              onClick={() => setWizardOpen(true)}
              className="font-semibold text-accent hover:underline"
            >
              Log your first
            </button>
            .
          </EmptyCard>
        ) : (
          <ul className="divide-y divide-border-muted overflow-hidden rounded-2xl border border-border-muted bg-surface">
            {recent.slice(0, 3).map((p) => (
              <li key={p._id} className="px-1">
                <PlayCard play={p} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* From your friends — a light social peek, not a feed */}
      {friendsPlays && friendsPlays.length > 0 && (
        <section>
          <SectionHead title="From your friends" />
          <ul className="space-y-3">
            {friendsPlays.slice(0, 4).map((p) => (
              <li key={p._id}>
                <PlayPostCard play={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Jump back into a rules chat */}
      {chats && chats.length > 0 && (
        <section>
          <SectionHead title="Jump back in" href="/chats" label="All chats" />
          <ul className="divide-y divide-border-muted overflow-hidden rounded-2xl border border-border-muted bg-surface">
            {chats.slice(0, 3).map((c) => (
              <li key={c._id}>
                <Link
                  href={c.gameSlug ? `/boardgames/${c.gameSlug}/chat` : "/chats"}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                    {c.thumbnailUrl ? (
                      <Thumb url={c.thumbnailUrl} className="h-10 w-10" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-subtle">
                        <MessageCircle className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {c.gameTitle}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <LogPlayWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      <CreateListDrawer
        open={createListOpen}
        onClose={() => setCreateListOpen(false)}
      />
    </div>
  );
}

function ActionCard({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border-muted bg-surface px-2 py-4 text-center transition-colors hover:border-accent/40 hover:bg-surface-2"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/12 text-accent">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-xs font-semibold sm:text-sm">{label}</span>
    </button>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border-muted bg-surface p-4 text-center">
      <div className="text-2xl font-extrabold tabular-nums text-foreground">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-subtle">
        {label}
      </div>
    </div>
  );
}

function SectionHead({
  title,
  href,
  label,
}: {
  title: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="mb-2 flex items-center justify-between px-1">
      <p className="text-xs font-semibold uppercase tracking-widest text-subtle">
        {title}
      </p>
      {href && label && (
        <Link
          href={href}
          className="text-xs font-semibold text-accent hover:underline"
        >
          {label}
        </Link>
      )}
    </div>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
      {children}
    </p>
  );
}
