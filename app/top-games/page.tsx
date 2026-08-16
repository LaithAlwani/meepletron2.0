"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useQuery,
  useMutation,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { Trophy, Globe, Plus, Minus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buttonClasses } from "@/components/ui/Button";
import { Chip, Skeleton } from "@/components/ui/Surface";
import { Thumb } from "@/components/top-games/Thumb";
import { useToast } from "@/components/ui/Toast";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";

const PRESETS = [10, 25, 50, 100];
const CURRENT_YEAR = new Date().getFullYear();

// Shared field chrome: a small uppercase label, a segmented "track" the controls
// sit in, and a spinner-stripping helper for the number inputs (we drive them
// with our own presets/steppers, so the native arrows are just noise).
const LABEL = "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-subtle";
const TRACK = "inline-flex items-center rounded-xl border border-border bg-surface-2 p-1";
const NO_SPIN =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none";

type ListRow = {
  _id: Id<"topGamesLists">;
  size: number;
  year: number;
  title: string | null;
  status: "draft" | "finalized";
  visibility: "private" | "public";
  count: number;
  updatedAt: number;
};

export default function TopGamesPage() {
  const [tab, setTab] = useState<"mine" | "community">("mine");
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-1 flex items-center gap-2 text-accent">
        <Trophy className="h-6 w-6" />
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
          Top Games
        </h1>
      </div>
      <p className="mb-5 text-sm text-muted">
        Rank your favourite games each year, then watch how they move over time.
      </p>

      <div className="mb-6 flex gap-1.5">
        {(["mine", "community"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              tab === t
                ? buttonClasses("primary", "sm")
                : buttonClasses("ghost", "sm")
            }
          >
            {t === "mine" ? "My lists" : "Community"}
          </button>
        ))}
      </div>

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
      <CreateForm lists={lists ?? []} />

      {lists === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : lists.length === 0 ? (
        <p className="text-center text-sm text-muted">
          No lists yet — create one above.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {lists.map((l) => (
            <li key={l._id}>
              <Link
                href={`/top-games/${l._id}`}
                className="block rounded-2xl border border-border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display truncate font-bold">
                    {l.title ?? `Top ${l.size} · ${l.year}`}
                  </span>
                  <StatusChip list={l} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  Top {l.size} · {l.year} · {l.count} game{l.count === 1 ? "" : "s"}
                </p>
                <p className="mt-2 text-xs text-subtle">
                  Updated {relativeTime(l.updatedAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusChip({ list }: { list: ListRow }) {
  if (list.status === "draft") return <Chip>Draft</Chip>;
  if (list.visibility === "public")
    return (
      <Chip tone={2}>
        <Globe className="h-3 w-3" />
        Public
      </Chip>
    );
  return <Chip tone={1}>Finalized</Chip>;
}

function CreateForm({ lists }: { lists: ListRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const create = useMutation(api.topGames.create);

  const [size, setSize] = useState(100);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [seed, setSeed] = useState(true);
  const [busy, setBusy] = useState(false);

  // Most recent finalized list of this size from a prior year — offer to seed.
  const seedCandidate = useMemo(
    () =>
      lists
        .filter((l) => l.size === size && l.status === "finalized" && l.year < year)
        .sort((a, b) => b.year - a.year)[0],
    [lists, size, year],
  );

  async function onCreate() {
    setBusy(true);
    try {
      const { listId, existed } = await create({
        size,
        year,
        seedFromListId: seedCandidate && seed ? seedCandidate._id : undefined,
      });
      if (existed) toast("Opened your existing list for that year.", "info");
      router.push(`/top-games/${listId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't create the list.", "error");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-display mb-3 font-bold">Start a new list</h2>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
        <div>
          <label className={LABEL}>List size</label>
          <SizeControl size={size} onChange={setSize} />
        </div>
        <div>
          <label className={LABEL}>Year</label>
          <YearStepper year={year} onChange={setYear} />
        </div>
        <button
          onClick={onCreate}
          disabled={busy}
          className={buttonClasses("primary", "md")}
        >
          <Plus className="h-4 w-4" />
          Create
        </button>
      </div>
      {seedCandidate && (
        <label className="mt-3 flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={seed}
            onChange={(e) => setSeed(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Start from my {seedCandidate.title ?? `Top ${seedCandidate.size} · ${seedCandidate.year}`}
        </label>
      )}
    </div>
  );
}

/** Segmented preset picker + an inline custom "number of games" field. */
function SizeControl({
  size,
  onChange,
}: {
  size: number;
  onChange: (n: number) => void;
}) {
  const isPreset = PRESETS.includes(size);
  const customActive = !isPreset && size > 0;
  return (
    <div className={cn(TRACK, "gap-0.5")}>
      {PRESETS.map((p) => {
        const active = size === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-pressed={active}
            className={cn(
              "h-9 min-w-11 rounded-lg px-2.5 text-sm font-bold tabular-nums transition-all",
              active
                ? "bg-accent text-accent-foreground shadow-sm"
                : "text-muted hover:bg-surface hover:text-foreground",
            )}
          >
            {p}
          </button>
        );
      })}
      <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
      <input
        type="number"
        inputMode="numeric"
        min={3}
        max={250}
        value={isPreset ? "" : size || ""}
        placeholder="##"
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Custom number of games"
        className={cn(
          "h-9 w-14 rounded-lg text-center text-sm font-bold tabular-nums outline-none transition-colors placeholder:font-semibold placeholder:text-subtle focus:ring-2 focus:ring-ring/40",
          NO_SPIN,
          customActive
            ? "bg-accent/12 text-accent"
            : "bg-transparent text-foreground hover:bg-surface focus:bg-surface",
        )}
      />
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
  const [size, setSize] = useState(100);
  const [year, setYear] = useState(CURRENT_YEAR);
  const data = useQuery(api.topGames.community, { size, year });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-4 rounded-2xl border border-border bg-surface p-4">
        <div>
          <label className={LABEL}>List size</label>
          <SizeControl size={size} onChange={setSize} />
        </div>
        <div>
          <label className={LABEL}>Year</label>
          <YearStepper year={year} onChange={setYear} />
        </div>
      </div>

      {data === undefined ? (
        <Skeleton className="h-40 w-full" />
      ) : data.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <p className="font-medium">No public Top {size} lists for {year} yet.</p>
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
