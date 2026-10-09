"use client";

import { useMemo, useState } from "react";
import { useQuery, useAction } from "convex/react";
import { Download } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { friendlyError } from "@/lib/friendlyError";

type BggStats = {
  rating?: number;
  ratingCount?: number;
  weight?: number;
  pollVotes?: number;
  playerPoll?: {
    count: number;
    plus?: boolean;
    best: number;
    recommended: number;
    notRecommended: number;
  }[];
  fetchedAt?: number;
};

export type GameFormValues = {
  title: string;
  isExpansion: boolean;
  parentId?: Id<"games">;
  year?: string;
  minPlayers?: number;
  maxPlayers?: number;
  minAge?: string;
  minPlayTime?: number;
  maxPlayTime?: number;
  description?: string;
  designers: string[];
  artists: string[];
  publishers: string[];
  categories: string[];
  gameMechanics: string[];
  bggId?: string;
  bgg?: BggStats;
};

export type GameFormInitial = Partial<GameFormValues> & {
  title?: string;
  /** The resolved parent `games.getById` returns, used to label the picker's
   *  current selection even before the option list has loaded. */
  parent?: { _id: Id<"games">; title: string } | null;
};

const csv = (arr?: string[]) => (arr ?? []).join(", ");
// Accept comma- OR newline-separated values.
const parseCsv = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-ring";

export function GameForm({
  initial,
  gameId,
  submitLabel,
  onSubmit,
  onBggImage,
}: {
  initial?: GameFormInitial;
  /** Set when editing a saved game — enables recording its BGG expansions. */
  gameId?: Id<"games">;
  submitLabel: string;
  onSubmit: (values: GameFormValues) => Promise<void>;
  // Called with BGG's cover URL when filling — the page compresses + stores it.
  onBggImage?: (url: string) => void | Promise<void>;
}) {
  const baseGames = useQuery(api.games.baseGameOptions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [isExpansion, setIsExpansion] = useState(initial?.isExpansion ?? false);
  const [parentId, setParentId] = useState<string>(initial?.parentId ?? "");
  const [year, setYear] = useState(initial?.year ?? "");
  const [minPlayers, setMinPlayers] = useState(
    initial?.minPlayers?.toString() ?? "",
  );
  const [maxPlayers, setMaxPlayers] = useState(
    initial?.maxPlayers?.toString() ?? "",
  );
  const [minAge, setMinAge] = useState(initial?.minAge ?? "");
  const [minPlayTime, setMinPlayTime] = useState(
    initial?.minPlayTime?.toString() ?? "",
  );
  const [maxPlayTime, setMaxPlayTime] = useState(
    initial?.maxPlayTime?.toString() ?? "",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [designers, setDesigners] = useState(csv(initial?.designers));
  const [artists, setArtists] = useState(csv(initial?.artists));
  const [publishers, setPublishers] = useState(csv(initial?.publishers));
  const [categories, setCategories] = useState(csv(initial?.categories));
  const [gameMechanics, setGameMechanics] = useState(
    csv(initial?.gameMechanics),
  );
  const [bggId, setBggId] = useState(initial?.bggId ?? "");
  const [bggStats, setBggStats] = useState<BggStats | undefined>(initial?.bgg);

  const [filling, setFilling] = useState(false);

  /**
   * The base games the picker offers, always including the one currently set.
   * A `<select>` whose value matches no `<option>` renders as if nothing were
   * chosen, which is what made an expansion's base game look unset: the old
   * option list was the first 200 base games by creation date, so most parents
   * simply weren't in it. The fallback also covers the list still loading, and
   * a parent that's an unenriched stub.
   */
  const parentOptions = useMemo(() => {
    const opts = (baseGames ?? []).map((g) => ({
      id: g._id as string,
      label: g.year ? `${g.title} (${g.year})` : g.title,
    }));
    if (parentId && !opts.some((o) => o.id === parentId)) {
      opts.unshift({
        id: parentId,
        label: initial?.parent?.title ?? "Current base game",
      });
    }
    return opts;
  }, [baseGames, parentId, initial?.parent?.title]);

  // What BGG lists as expansions of this game, newest fill first. Ticking is
  // the whole point: BGG's list mixes real expansions with promos, so the admin
  // picks rather than a threshold guessing.
  type ExpansionOption = {
    bggId: string;
    name: string;
    inLibrary: boolean;
    ratingCount: number;
    year: string | null;
    suggested: boolean;
  };
  const [expansions, setExpansions] = useState<ExpansionOption[] | null>(null);
  const [expansionsHash, setExpansionsHash] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const fetchInfo = useAction(api.bgg.fetchGameInfo);
  const recordExpansions = useAction(api.bgg.recordExpansions);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<string | null>(null);

  async function handleRecordExpansions() {
    if (!gameId || !expansions) return;
    setError(null);
    setRecording(true);
    try {
      const chosen = expansions
        .filter((e) => picked.has(e.bggId))
        .map((e) => ({ bggId: e.bggId, title: e.name }));
      const r = await recordExpansions({
        gameId,
        expansions: chosen,
        hash: expansionsHash,
      });
      setRecorded(
        `Added ${r.created}, linked ${r.linked} of ${chosen.length} selected.`,
      );
    } catch (err) {
      setError(friendlyError(err, "Couldn't record expansions."));
    } finally {
      setRecording(false);
    }
  }

  function togglePicked(bggId: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(bggId)) next.delete(bggId);
      else next.add(bggId);
      return next;
    });
  }

  async function handleFill() {
    setError(null);
    setFilling(true);
    try {
      const d = await fetchInfo({ bggId });
      if (d.title) setTitle(d.title);
      if (d.year) setYear(d.year);
      if (d.minPlayers != null) setMinPlayers(String(d.minPlayers));
      if (d.maxPlayers != null) setMaxPlayers(String(d.maxPlayers));
      if (d.minPlayTime != null) setMinPlayTime(String(d.minPlayTime));
      if (d.maxPlayTime != null) setMaxPlayTime(String(d.maxPlayTime));
      if (d.minAge) setMinAge(d.minAge);
      if (d.description) setDescription(d.description);
      if (d.designers?.length) setDesigners(csv(d.designers));
      if (d.artists?.length) setArtists(csv(d.artists));
      if (d.publishers?.length) setPublishers(csv(d.publishers));
      if (d.categories?.length) setCategories(csv(d.categories));
      if (d.gameMechanics?.length) setGameMechanics(csv(d.gameMechanics));
      if (d.bggId) setBggId(d.bggId);
      if (d.bgg) setBggStats(d.bgg);
      if (d.imageUrl && onBggImage) await onBggImage(d.imageUrl);
      const found = d.expansions ?? [];
      setExpansions(found);
      setExpansionsHash(d.expansionsHash ?? "");
      // Pre-tick what the nightly pass would have taken; the admin adjusts.
      setPicked(
        new Set(
          found.filter((e) => e.suggested && !e.inLibrary).map((e) => e.bggId),
        ),
      );
      setRecorded(null);
    } catch (err) {
      setError(friendlyError(err, "Couldn't fetch from BGG."));
    } finally {
      setFilling(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        isExpansion,
        parentId:
          isExpansion && parentId ? (parentId as Id<"games">) : undefined,
        year: year.trim() || undefined,
        minPlayers: num(minPlayers),
        maxPlayers: num(maxPlayers),
        minAge: minAge.trim() || undefined,
        minPlayTime: num(minPlayTime),
        maxPlayTime: num(maxPlayTime),
        description: description.trim() || undefined,
        designers: parseCsv(designers),
        artists: parseCsv(artists),
        publishers: parseCsv(publishers),
        categories: parseCsv(categories),
        gameMechanics: parseCsv(gameMechanics),
        bggId: bggId.trim() || undefined,
        bgg: bggStats,
      });
    } catch (err) {
      setError(friendlyError(err, "Something went wrong. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-border bg-surface-2 p-3">
        <span className="mb-1 block text-sm font-medium">BoardGameGeek</span>
        <div className="flex gap-2">
          <input
            value={bggId}
            onChange={(e) => setBggId(e.target.value)}
            placeholder="BGG id (e.g. 13)"
            inputMode="numeric"
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleFill}
            disabled={filling || !bggId.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {filling ? "Fetching…" : "Fill from BGG"}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          Fills the fields below plus rating, weight, and the player-count poll.
        </p>

        {expansions && (
          <div className="mt-3 rounded-lg border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold">
                {expansions.length === 0
                  ? "BGG lists no expansions for this game."
                  : `BGG lists ${expansions.length} expansion${
                      expansions.length === 1 ? "" : "s"
                    } — ${
                      expansions.filter((e) => e.inLibrary).length
                    } already here.`}
              </p>
              {expansions.length > 0 && (
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() =>
                      setPicked(
                        new Set(
                          expansions
                            .filter((e) => !e.inLibrary)
                            .map((e) => e.bggId),
                        ),
                      )
                    }
                    className="font-semibold text-accent hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-subtle">·</span>
                  <button
                    type="button"
                    onClick={() => setPicked(new Set())}
                    className="font-semibold text-accent hover:underline"
                  >
                    None
                  </button>
                </div>
              )}
            </div>

            {expansions.length > 0 && (
              <>
                <ul className="mt-2 flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                  {expansions.map((e) => (
                    <li key={e.bggId}>
                      <label
                        className={`flex items-center gap-2 rounded px-1 py-1 text-xs ${
                          e.inLibrary
                            ? "opacity-60"
                            : "cursor-pointer hover:bg-surface-2"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={e.inLibrary || picked.has(e.bggId)}
                          disabled={e.inLibrary}
                          onChange={() => togglePicked(e.bggId)}
                          className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {e.name}
                          {e.year ? (
                            <span className="text-subtle"> ({e.year})</span>
                          ) : null}
                        </span>
                        {e.inLibrary ? (
                          <span className="shrink-0 rounded bg-accent-2/15 px-1.5 py-px text-[10px] font-bold uppercase text-accent-2">
                            in library
                          </span>
                        ) : (
                          <span
                            className="shrink-0 tabular-nums text-[11px] text-subtle"
                            title="BGG ratings — promos have very few"
                          >
                            {e.ratingCount.toLocaleString()}
                          </span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>

                {gameId ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRecordExpansions}
                      disabled={recording || picked.size === 0}
                      className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-surface-2 disabled:opacity-50"
                    >
                      {recording
                        ? "Adding…"
                        : `Add ${picked.size} selected`}
                    </button>
                    <span className="text-[11px] text-subtle">
                      {recorded ??
                        "Ticked by default: the ones with enough ratings to be real expansions rather than promos."}
                    </span>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-subtle">
                    Save the game first to add its expansions.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <Field label="Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
          required
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isExpansion}
          onChange={(e) => setIsExpansion(e.target.checked)}
          className="accent-[var(--accent)]"
        />
        This is an expansion
      </label>

      {isExpansion && (
        <Field label="Base game">
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className={inputClass}
          >
            <option value="">— Select base game —</option>
            {parentOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Year">
          <input value={year} onChange={(e) => setYear(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Min players">
          <input type="number" value={minPlayers} onChange={(e) => setMinPlayers(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Max players">
          <input type="number" value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Min time (min)">
          <input type="number" value={minPlayTime} onChange={(e) => setMinPlayTime(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Max time (min)">
          <input type="number" value={maxPlayTime} onChange={(e) => setMaxPlayTime(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <Field label="Min age">
        <input value={minAge} onChange={(e) => setMinAge(e.target.value)} className={inputClass} />
      </Field>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={inputClass}
        />
      </Field>

      <p className="text-xs text-muted">
        For the fields below, separate multiple values with commas or new lines.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Designers">
          <textarea rows={2} value={designers} onChange={(e) => setDesigners(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Artists">
          <textarea rows={2} value={artists} onChange={(e) => setArtists(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Publishers">
          <textarea rows={2} value={publishers} onChange={(e) => setPublishers(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Categories">
          <textarea rows={2} value={categories} onChange={(e) => setCategories(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <Field label="Mechanics">
        <textarea rows={2} value={gameMechanics} onChange={(e) => setGameMechanics(e.target.value)} className={inputClass} />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
