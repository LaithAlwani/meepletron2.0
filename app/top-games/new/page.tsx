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
import { ChevronLeft, Plus, Minus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buttonClasses } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { topListTitle } from "@/lib/topGamesTitle";

const PRESETS = [10, 25, 50, 100];
const CURRENT_YEAR = new Date().getFullYear();

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
};

export default function NewListPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <Link
        href="/top-games"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Top Games
      </Link>
      <h1 className="font-display mb-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
        New list
      </h1>
      <p className="mb-6 text-sm text-muted">
        Name it, pick a size and year — you&apos;ll add the games next.
      </p>

      <AuthLoading>
        <Skeleton className="h-64 w-full" />
      </AuthLoading>
      <Unauthenticated>
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">Sign in to build your Top Games lists.</p>
          <Link href="/auth" className={`mt-4 ${buttonClasses("primary", "sm")}`}>
            Sign in
          </Link>
        </div>
      </Unauthenticated>
      <Authenticated>
        <NewListForm />
      </Authenticated>
    </div>
  );
}

function NewListForm() {
  const router = useRouter();
  const toast = useToast();
  const lists = useQuery(api.topGames.listMine);
  const create = useMutation(api.topGames.create);

  const [title, setTitle] = useState("");
  const [size, setSize] = useState(100);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [seed, setSeed] = useState(true);
  const [busy, setBusy] = useState(false);

  // Most recent finalized list of this size from a prior year — offer to seed.
  const seedCandidate = useMemo(
    () =>
      (lists ?? [])
        .filter(
          (l: ListRow) =>
            l.size === size && l.status === "finalized" && l.year < year,
        )
        .sort((a: ListRow, b: ListRow) => b.year - a.year)[0],
    [lists, size, year],
  );

  async function onCreate() {
    setBusy(true);
    try {
      const { listId, existed } = await create({
        size,
        year,
        title: title.trim() || undefined,
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
    <div className="space-y-5 rounded-2xl border border-border bg-surface p-5">
      <div>
        <label className={LABEL}>List name (optional)</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. 2-player games"
          className="h-11 w-full"
          aria-label="List name"
        />
        <p className="mt-1.5 text-xs text-muted">
          Shows as{" "}
          <span className="font-semibold text-foreground">
            {topListTitle(size, year, title)}
          </span>
        </p>
      </div>

      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1 sm:flex-none">
          <label className={LABEL}>List size</label>
          <Select
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            aria-label="List size"
            className="h-11 w-full font-semibold tabular-nums sm:w-auto"
          >
            {PRESETS.map((p) => (
              <option key={p} value={p}>
                Top {p}
              </option>
            ))}
          </Select>
        </div>
        <div className="shrink-0">
          <label className={LABEL}>Year</label>
          <div className={TRACK}>
            <button
              type="button"
              aria-label="Previous year"
              onClick={() => setYear((y) => Math.max(1970, (y || CURRENT_YEAR) - 1))}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground active:scale-95"
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              type="number"
              min={1970}
              max={2200}
              value={year || ""}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Year"
              className={cn(
                "h-9 w-14 bg-transparent text-center text-base font-bold tabular-nums text-foreground outline-none",
                NO_SPIN,
              )}
            />
            <button
              type="button"
              aria-label="Next year"
              onClick={() => setYear((y) => Math.min(2200, (y || CURRENT_YEAR) + 1))}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground active:scale-95"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {seedCandidate && (
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={seed}
            onChange={(e) => setSeed(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Start from my{" "}
          {topListTitle(seedCandidate.size, seedCandidate.year, seedCandidate.title)}
        </label>
      )}

      <button
        onClick={onCreate}
        disabled={busy}
        className={buttonClasses("primary", "md", "w-full")}
      >
        <Plus className="h-4 w-4" />
        Create list
      </button>
    </div>
  );
}
