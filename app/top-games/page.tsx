"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useQuery,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { Plus, Minus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Surface";
import { Thumb } from "@/components/top-games/Thumb";
import { ListCard } from "@/components/top-games/ListCard";
import { CreateListDrawer } from "@/components/top-games/CreateListDrawer";
import { SelectMenu } from "@/components/ui/SelectMenu";
import { cn } from "@/lib/cn";
import { PageTitle } from "@/components/ui/PageTitle";
import {
  TOP_CATEGORIES,
  DEFAULT_CATEGORY,
  categoryLabel,
} from "@/convex/lib/topGamesCategories";

const CURRENT_YEAR = new Date().getFullYear();
const CATEGORY_OPTIONS = TOP_CATEGORIES.map((c) => ({
  value: c.key,
  label: c.label,
}));
const SIZE_OPTIONS = [
  { value: 0, label: "Any size" },
  { value: 10, label: "Top 10" },
  { value: 25, label: "Top 25" },
  { value: 50, label: "Top 50" },
  { value: 100, label: "Top 100" },
];

// The year stepper's chrome: a segmented "track" plus a spinner-stripping helper
// for the number input (we drive it with steppers, so native arrows are noise).
const TRACK = "inline-flex items-center rounded-xl border border-border bg-surface-2 p-1";
const NO_SPIN =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none";

export default function TopGamesPage() {
  const [tab, setTab] = useState<"mine" | "community">("mine");
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageTitle className="mb-5">Top Games</PageTitle>

      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex gap-5">
          {(["mine", "community"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-current={tab === t ? "page" : undefined}
              className={cn(
                "px-0.5 text-sm font-semibold transition-colors",
                tab === t ? "text-accent" : "text-muted hover:text-foreground",
              )}
            >
              {t === "mine" ? "My lists" : "Community"}
            </button>
          ))}
        </div>

        <button
          onClick={() => setCreateOpen(true)}
          aria-label="Create list"
          className={buttonClasses("primary", "md")}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Create list</span>
        </button>
      </div>

      <CreateListDrawer open={createOpen} onClose={() => setCreateOpen(false)} />

      {tab === "mine" ? (
        <>
          <AuthLoading>
            <Skeleton className="h-40 w-full" />
          </AuthLoading>
          <Unauthenticated>
            <div className="rounded-2xl border border-border bg-surface p-6 text-center">
              <p className="text-sm text-muted">
                Sign in to build your Top Games lists.
              </p>
              <Link href="/auth" className={`mt-4 ${buttonClasses("primary", "sm")}`}>
                Sign in
              </Link>
            </div>
          </Unauthenticated>
          <Authenticated>
            <MyLists />
          </Authenticated>
        </>
      ) : (
        <Community />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* My lists                                                                   */
/* -------------------------------------------------------------------------- */

function MyLists() {
  const lists = useQuery(api.topGames.listMine);

  return (
    <div className="space-y-6">
      {lists === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : lists.length === 0 ? (
        <p className="text-center text-sm text-muted">
          No lists yet — tap “Create list” to start.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {lists.map((l) => (
            <li key={l._id}>
              <ListCard list={l} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** −/+ stepper around the year (with a directly-editable number). */
function YearStepper({
  year,
  onChange,
}: {
  year: number;
  onChange: (n: number) => void;
}) {
  const step = (d: number) =>
    onChange(Math.max(1970, Math.min(2200, (year || CURRENT_YEAR) + d)));
  return (
    <div className={TRACK}>
      <button
        type="button"
        aria-label="Previous year"
        onClick={() => step(-1)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground active:scale-95"
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        min={1970}
        max={2200}
        value={year || ""}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Year"
        className={cn(
          "h-9 w-14 bg-transparent text-center text-base font-bold tabular-nums text-foreground outline-none",
          NO_SPIN,
        )}
      />
      <button
        type="button"
        aria-label="Next year"
        onClick={() => step(1)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground active:scale-95"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Community                                                                  */
/* -------------------------------------------------------------------------- */

function Community() {
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY);
  const [sizeFilter, setSizeFilter] = useState(0); // 0 = any size
  const [year, setYear] = useState(CURRENT_YEAR);
  const data = useQuery(api.topGames.community, {
    category,
    year,
    size: sizeFilter || undefined,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <SelectMenu
          value={category}
          onChange={setCategory}
          aria-label="Category"
          className="w-44"
          options={CATEGORY_OPTIONS}
        />
        <SelectMenu
          value={sizeFilter}
          onChange={setSizeFilter}
          aria-label="List size"
          className="w-32"
          options={SIZE_OPTIONS}
        />
        <YearStepper year={year} onChange={setYear} />
      </div>

      <p className="text-sm font-medium text-muted">
        The community&apos;s top {categoryLabel(category).toLowerCase()} games —
        combined from everyone&apos;s public lists.
      </p>

      {data === undefined ? (
        <Skeleton className="h-40 w-full" />
      ) : data.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <p className="font-medium">
            No public {sizeFilter ? `Top ${sizeFilter} ` : ""}
            {categoryLabel(category)} lists for {year} yet.
          </p>
          <p className="mt-1 text-sm">Be the first — finalize a list and make it public.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-subtle">
            Combined from {data.listsCounted} public list
            {data.listsCounted === 1 ? "" : "s"}
            {data.capped ? ` (first ${data.listsCounted})` : ""}.
          </p>
          <ol className="space-y-2">
            {data.items.map((item) => {
              const inner = (
                <>
                  <span className="w-8 shrink-0 text-center text-lg font-extrabold tabular-nums text-muted">
                    {item.rank}
                  </span>
                  <Thumb url={item.game?.thumbUrl} className="h-12 w-12" />
                  <div className="min-w-0 flex-1">
                    <span className="font-display block truncate font-bold">
                      {item.game?.title ?? item.title}
                    </span>
                    <p className="mt-0.5 text-xs text-subtle">
                      in {item.appearances} list{item.appearances === 1 ? "" : "s"} · avg #
                      {item.avgRank}
                    </p>
                  </div>
                </>
              );
              return (
                <li
                  key={item.gameId}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-2.5 pr-3"
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
            })}
          </ol>
        </>
      )}
    </div>
  );
}
