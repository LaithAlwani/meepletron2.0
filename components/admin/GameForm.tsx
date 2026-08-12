"use client";

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { Download } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { friendlyError } from "@/lib/friendlyError";

type BggStats = {
  rating?: number;
  ratingCount?: number;
  weight?: number;
  playerPoll?: {
    count: number;
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

export type GameFormInitial = Partial<GameFormValues> & { title?: string };

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
  submitLabel,
  onSubmit,
}: {
  initial?: GameFormInitial;
  submitLabel: string;
  onSubmit: (values: GameFormValues) => Promise<void>;
}) {
  const baseGames = useQuery(api.games.list);
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

  const fetchInfo = useAction(api.bgg.fetchGameInfo);

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
            {baseGames?.map((g) => (
              <option key={g._id} value={g._id}>
                {g.title}
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
