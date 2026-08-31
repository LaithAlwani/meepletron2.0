"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  X,
  Search,
  ChevronLeft,
  Check,
  Plus,
  Trophy,
  ImagePlus,
  Loader2,
} from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Thumb } from "@/components/top-games/Thumb";
import { Input, Textarea } from "@/components/ui/Field";
import { SelectMenu } from "@/components/ui/SelectMenu";
import { Switch } from "@/components/ui/Switch";
import { buttonClasses } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useGameSearch } from "@/components/boardgames/useGameSearch";
import { useUsernameGate } from "@/components/feed/UsernameGate";
import { compressImage } from "@/lib/imageCompress";
import { cn } from "@/lib/cn";

type PlayFormat =
  | "competitive"
  | "cooperative"
  | "teams"
  | "rounds"
  | "onevsall";
type ScoreMode = "highest" | "lowest" | "placement";

export type WizardInitialGame = {
  gameId?: Id<"games">;
  bggId?: string;
  title: string;
  coverUrl?: string | null;
};

/**
 * A prior play used to seed the wizard. With `playId` set it's an **edit** (all
 * fields prefilled; saving updates that play); without it, it's a **rematch** —
 * same game/format/teams/roster but fresh scores.
 */
export type WizardInitialPlay = {
  playId?: Id<"plays">;
  game: WizardInitialGame;
  format: PlayFormat;
  scoreMode?: ScoreMode;
  coopOutcome?: "win" | "loss";
  coopScore?: number | null;
  teamNames?: string[];
  teamWinner?: number;
  date?: string;
  lengthMinutes?: number | null;
  location?: string | null;
  comments?: string | null;
  visibility?: "private" | "public";
  photoIds?: Id<"_storage">[];
  photoUrls?: string[];
  players: {
    name: string;
    userId?: Id<"users">;
    personId?: Id<"playPeople">;
    teamIndex?: number;
    isNew?: boolean;
    score?: number | null;
    placement?: number | null;
    roundsWon?: number | null;
  }[];
};

type PlayDetail = NonNullable<FunctionReturnType<typeof api.plays.getPlay>>;

/**
 * Build the wizard seed from a full play (`getPlay`) — all values for an **edit**
 * (`edit: true`, saving updates that play), or roster-only for a **rematch**.
 */
export function buildInitialPlay(
  play: PlayDetail,
  edit: boolean,
): WizardInitialPlay {
  const game = {
    gameId: play.gameId ?? undefined,
    bggId: play.bggId ?? undefined,
    title: play.title,
    coverUrl: play.coverUrl,
  };
  const teamNames = play.teams?.map((t) => t.name);
  const teamWinner = play.teams
    ? Math.max(0, play.teams.findIndex((t) => t.isWinner))
    : 0;
  const base = {
    game,
    format: play.format as WizardInitialPlay["format"],
    scoreMode: play.scoreMode as WizardInitialPlay["scoreMode"],
    teamNames,
    players: play.players.map((p) => ({
      name: p.name,
      userId: p.userId,
      personId: p.personId,
      teamIndex: p.teamIndex,
      isNew: p.isNew,
      score: p.score ?? null,
      placement: p.placement ?? null,
      roundsWon: p.roundsWon ?? null,
    })),
  };
  if (!edit) return base;
  return {
    ...base,
    playId: play._id,
    coopOutcome: play.coopOutcome as WizardInitialPlay["coopOutcome"],
    coopScore: play.coopScore ?? null,
    teamWinner,
    date: play.date,
    lengthMinutes: play.lengthMinutes ?? null,
    location: play.location ?? null,
    comments: play.comments ?? null,
    visibility: play.visibility,
    photoIds: play.photoIds,
    photoUrls: play.photoUrls,
  };
}

type PlayerForm = {
  key: string;
  name: string;
  userId?: Id<"users">;
  personId?: Id<"playPeople">;
  newPersonEmail?: string;
  score?: number;
  placement?: number;
  roundsWon?: number;
  teamIndex?: number;
  isNew?: boolean;
};

const FORMATS: { key: PlayFormat; label: string; hint: string }[] = [
  { key: "competitive", label: "Competitive", hint: "Everyone for themselves" },
  { key: "cooperative", label: "Co-op / solo", hint: "Win or lose together" },
  { key: "teams", label: "Teams", hint: "2–4 teams" },
  { key: "rounds", label: "Rounds", hint: "Most rounds won" },
  { key: "onevsall", label: "One vs all", hint: "One (or few) vs the rest" },
];
const SCORE_MODES: { value: ScoreMode; label: string }[] = [
  { value: "highest", label: "Highest score wins" },
  { value: "lowest", label: "Lowest score wins" },
  { value: "placement", label: "Placement only (1st, 2nd…)" },
];

const LABEL =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-subtle";
const fieldCls =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-shadow focus:border-accent/50 focus:ring-2 focus:ring-ring/40";

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

let KEY = 0;
const nextKey = () => `p${++KEY}`;

/**
 * The guided "log a play" wizard — a bottom-sheet on mobile / right-side drawer
 * on desktop. Steps: game → format → players/teams → scores → photos & share.
 */
export function LogPlayWizard({
  open,
  onClose,
  initialGame,
  initialPlay,
}: {
  open: boolean;
  onClose: () => void;
  initialGame?: WizardInitialGame;
  initialPlay?: WizardInitialPlay;
}) {
  const router = useRouter();
  const toast = useToast();
  const ensureUsername = useUsernameGate();
  const me = useQuery(api.users.me, open ? {} : "skip");
  const logPlay = useMutation(api.plays.logPlay);
  const updatePlay = useMutation(api.plays.updatePlay);
  const genUpload = useMutation(api.plays.generatePlayPhotoUploadUrl);

  const isEdit = !!initialPlay?.playId;
  const ip = initialPlay;
  const initTeamNames =
    ip?.teamNames && ip.teamNames.length >= 2 ? ip.teamNames : ["Team 1", "Team 2"];
  // Edit reviews from the top (step 1); rematch jumps to the roster (step 2).
  const initStep = ip ? (isEdit ? 1 : 2) : initialGame ? 1 : 0;
  const minStep = ip || initialGame ? 1 : 0;
  const makePlayers = (): PlayerForm[] =>
    ip
      ? ip.players.map((p) => ({
          key: nextKey(),
          name: p.name,
          userId: p.userId,
          personId: p.personId,
          teamIndex: p.teamIndex,
          isNew: p.isNew,
          // Scores carry over only when editing; a rematch starts fresh.
          score: isEdit ? (p.score ?? undefined) : undefined,
          placement: isEdit ? (p.placement ?? undefined) : undefined,
          roundsWon: isEdit ? (p.roundsWon ?? undefined) : undefined,
        }))
      : [];

  const [step, setStep] = useState(initStep);
  const [busy, setBusy] = useState(false);

  // form
  const [game, setGame] = useState<WizardInitialGame | null>(
    ip?.game ?? initialGame ?? null,
  );
  const [date, setDate] = useState((isEdit && ip?.date) || todayStr());
  const [length, setLength] = useState<string>(
    isEdit && ip?.lengthMinutes != null ? String(ip.lengthMinutes) : "",
  );
  const [location, setLocation] = useState(
    (isEdit && ip?.location) || "",
  );
  const [comments, setComments] = useState((isEdit && ip?.comments) || "");
  const [format, setFormat] = useState<PlayFormat>(ip?.format ?? "competitive");
  const [scoreMode, setScoreMode] = useState<ScoreMode>(
    ip?.scoreMode ?? "highest",
  );
  const [coopOutcome, setCoopOutcome] = useState<"win" | "loss">(
    ip?.coopOutcome ?? "win",
  );
  const [coopScore, setCoopScore] = useState<string>(
    isEdit && ip?.coopScore != null ? String(ip.coopScore) : "",
  );
  const [teamCount, setTeamCount] = useState(
    Math.min(4, Math.max(2, initTeamNames.length)),
  );
  const [teamNames, setTeamNames] = useState<string[]>(initTeamNames);
  const [teamWinner, setTeamWinner] = useState<number>(ip?.teamWinner ?? 0);
  const [players, setPlayers] = useState<PlayerForm[]>(makePlayers);
  const [photoIds, setPhotoIds] = useState<Id<"_storage">[]>(
    isEdit ? (ip?.photoIds ?? []) : [],
  );
  const [photoPreviews, setPhotoPreviews] = useState<string[]>(
    isEdit ? (ip?.photoUrls ?? []) : [],
  );
  const [visibility, setVisibility] = useState<"private" | "public">(
    ip?.visibility ?? "private",
  );
  const [uploading, setUploading] = useState(false);

  // Seed "You" as the first player once the profile loads. Deferred a frame so
  // we don't call setState synchronously inside the effect body.
  useEffect(() => {
    if (!open || !me || players.length > 0) return;
    const id = requestAnimationFrame(() =>
      setPlayers([
        {
          key: nextKey(),
          name: me.name || me.username || "You",
          userId: me._id,
        },
      ]),
    );
    return () => cancelAnimationFrame(id);
  }, [open, me, players.length]);


  const isTeams = format === "teams" || format === "onevsall";

  function reset() {
    setStep(initStep);
    setGame(ip?.game ?? initialGame ?? null);
    setDate((isEdit && ip?.date) || todayStr());
    setLength(
      isEdit && ip?.lengthMinutes != null ? String(ip.lengthMinutes) : "",
    );
    setLocation((isEdit && ip?.location) || "");
    setComments((isEdit && ip?.comments) || "");
    setFormat(ip?.format ?? "competitive");
    setScoreMode(ip?.scoreMode ?? "highest");
    setCoopOutcome(ip?.coopOutcome ?? "win");
    setCoopScore(isEdit && ip?.coopScore != null ? String(ip.coopScore) : "");
    setTeamCount(Math.min(4, Math.max(2, initTeamNames.length)));
    setTeamNames(initTeamNames);
    setTeamWinner(ip?.teamWinner ?? 0);
    setPlayers(makePlayers());
    setPhotoIds(isEdit ? (ip?.photoIds ?? []) : []);
    setPhotoPreviews(isEdit ? (ip?.photoUrls ?? []) : []);
    setVisibility(ip?.visibility ?? "private");
  }

  function close() {
    reset();
    onClose();
  }

  function removePhoto(index: number) {
    setPhotoIds((ids) => ids.filter((_, i) => i !== index));
    setPhotoPreviews((p) => p.filter((_, i) => i !== index));
  }

  async function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files.slice(0, 8)) {
        if (!file.type.startsWith("image/")) continue;
        const blob = await compressImage(file, 1600, 0.8);
        const url = await genUpload({});
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: blob,
        });
        if (!res.ok) throw new Error("upload failed");
        const { storageId } = await res.json();
        setPhotoIds((p) => [...p, storageId]);
        setPhotoPreviews((p) => [...p, URL.createObjectURL(blob)]);
      }
    } catch {
      toast("Couldn't upload a photo", "error");
    } finally {
      setUploading(false);
    }
  }

  async function onSave() {
    if (!game) return;
    // A public play appears in the feed — require a username before saving it.
    if (visibility === "public" && !(await ensureUsername())) return;
    setBusy(true);
    try {
      const teams = isTeams
        ? teamNames.slice(0, teamCount).map((name, i) => ({
            name: name.trim() || `Team ${i + 1}`,
            isWinner: i === teamWinner,
          }))
        : undefined;
      const body = {
        gameId: game.gameId,
        bggId: game.bggId,
        title: game.title,
        date,
        lengthMinutes: length ? Number(length) : undefined,
        location: location.trim() || undefined,
        comments: comments.trim() || undefined,
        format,
        scoreMode: format === "competitive" ? scoreMode : undefined,
        coopOutcome: format === "cooperative" ? coopOutcome : undefined,
        coopScore:
          format === "cooperative" && coopScore ? Number(coopScore) : undefined,
        teams,
        players: players.map((p) => ({
          name: p.name.trim() || "Player",
          userId: p.userId,
          personId: p.personId,
          newPersonEmail: p.newPersonEmail,
          score: p.score,
          placement: p.placement,
          roundsWon: p.roundsWon,
          teamIndex: isTeams ? (p.teamIndex ?? 0) : undefined,
          isNew: p.isNew,
        })),
        photoIds,
        visibility,
      };
      let id: Id<"plays">;
      if (isEdit && ip?.playId) {
        await updatePlay({ playId: ip.playId, ...body });
        id = ip.playId;
      } else {
        id = await logPlay(body);
      }
      toast(isEdit ? "Play updated" : "Play logged", "success");
      close();
      router.push(`/plays/${id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save the play", "error");
      setBusy(false);
    }
  }

  const canNext =
    (step === 0 && !!game) ||
    (step === 1 && !!game) ||
    step === 2 ||
    step === 3;

  return (
    <Sheet open={open} onClose={close} mobileMaxH="max-h-[92vh]">
        {/* Header + step dots */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            {step > minStep && (
              <button
                onClick={() => setStep((s) => s - 1)}
                aria-label="Back"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
              >
                <ChevronLeft className="h-4.5 w-4.5" />
              </button>
            )}
            <h2 className="font-display text-lg font-bold">
              {isEdit ? "Edit play" : "Log a play"}
            </h2>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="flex gap-1 px-4 pt-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full",
                i <= step ? "bg-accent" : "bg-surface-2",
              )}
            />
          ))}
        </div>

        <div className="themed-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {step === 0 && (
            <GamePicker
              onPick={(g) => {
                setGame(g);
                setStep(1);
              }}
            />
          )}

          {step === 1 && game && (
            <FormatStep
              game={game}
              date={date}
              setDate={setDate}
              length={length}
              setLength={setLength}
              location={location}
              setLocation={setLocation}
              comments={comments}
              setComments={setComments}
              format={format}
              setFormat={setFormat}
              scoreMode={scoreMode}
              setScoreMode={setScoreMode}
            />
          )}

          {step === 2 && (
            <PlayersStep
              players={players}
              setPlayers={setPlayers}
              isTeams={isTeams}
              teamCount={teamCount}
              setTeamCount={setTeamCount}
              teamNames={teamNames}
              setTeamNames={setTeamNames}
            />
          )}

          {step === 3 && (
            <ScoresStep
              format={format}
              scoreMode={scoreMode}
              coopOutcome={coopOutcome}
              setCoopOutcome={setCoopOutcome}
              coopScore={coopScore}
              setCoopScore={setCoopScore}
              players={players}
              setPlayers={setPlayers}
              isTeams={isTeams}
              teamNames={teamNames.slice(0, teamCount)}
              teamWinner={teamWinner}
              setTeamWinner={setTeamWinner}
            />
          )}

          {step === 4 && (
            <ShareStep
              previews={photoPreviews}
              uploading={uploading}
              onPickPhotos={onPickPhotos}
              onRemovePhoto={removePhoto}
              visibility={visibility}
              setVisibility={setVisibility}
            />
          )}
        </div>

        <div className="border-t border-border px-4 py-3">
          {step < 4 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext}
              className={buttonClasses("primary", "md", "w-full")}
            >
              Next
            </button>
          ) : (
            <button
              onClick={onSave}
              disabled={busy || !game}
              className={buttonClasses("primary", "md", "w-full")}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {isEdit ? "Save changes" : "Save play"}
            </button>
          )}
        </div>
    </Sheet>
  );
}

/* ---- Step 1: game picker ---- */
function GamePicker({ onPick }: { onPick: (g: WizardInitialGame) => void }) {
  const { term, setTerm, results, bggResults, bggPending } = useGameSearch(20);
  const importGame = useAction(api.images.importGame);
  const toast = useToast();
  const [importing, setImporting] = useState<string | null>(null);

  async function fromBgg(h: { bggId: string; name: string; thumbUrl?: string | null }) {
    setImporting(h.bggId);
    try {
      const { gameId } = await importGame({ bggId: h.bggId, title: h.name });
      onPick({ gameId, bggId: h.bggId, title: h.name, coverUrl: h.thumbUrl ?? null });
    } catch {
      toast("Couldn't add that game", "error");
    } finally {
      setImporting(null);
    }
  }

  return (
    <div>
      <label className={LABEL}>Which game did you play?</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search games…"
          className={cn(fieldCls, "pl-9")}
        />
      </div>
      <ul className="mt-3 max-h-[52vh] space-y-1 overflow-y-auto">
        {results.map((g) => (
          <li key={g._id}>
            <button
              onClick={() =>
                onPick({
                  gameId: g._id,
                  bggId: g.bggId ?? undefined,
                  title: g.title,
                  coverUrl: g.thumbnailUrl ?? g.imageUrl ?? null,
                })
              }
              className="flex w-full items-center gap-2 rounded-xl p-1.5 text-left transition-colors hover:bg-surface-2"
            >
              <Thumb url={g.thumbnailUrl ?? g.imageUrl} className="h-9 w-9" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {g.title}
                {g.year ? (
                  <span className="ml-1 text-xs text-subtle">{g.year}</span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
        {bggResults.map((h) => (
          <li key={h.bggId}>
            <button
              onClick={() => fromBgg(h)}
              disabled={importing != null}
              className="flex w-full items-center gap-2 rounded-xl p-1.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-50"
            >
              <Thumb url={h.thumbUrl} className="h-9 w-9" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {h.name}
                {h.year ? <span className="ml-1 text-xs text-subtle">{h.year}</span> : null}
              </span>
              {importing === h.bggId ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-subtle" />
              ) : (
                <Plus className="h-4 w-4 shrink-0 text-subtle" />
              )}
            </button>
          </li>
        ))}
        {bggPending && (
          <li className="px-2 py-3 text-center text-xs text-subtle">Searching…</li>
        )}
      </ul>
    </div>
  );
}

/* ---- Step 2: format + when ---- */
function FormatStep(props: {
  game: WizardInitialGame;
  date: string;
  setDate: (v: string) => void;
  length: string;
  setLength: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  comments: string;
  setComments: (v: string) => void;
  format: PlayFormat;
  setFormat: (v: PlayFormat) => void;
  scoreMode: ScoreMode;
  setScoreMode: (v: ScoreMode) => void;
}) {
  const g = props.game;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5">
        <Thumb url={g.coverUrl} className="h-11 w-11" />
        <span className="font-display truncate font-bold">{g.title}</span>
      </div>

      <div>
        <label className={LABEL}>How was it scored?</label>
        <div className="flex flex-wrap gap-1.5">
          {FORMATS.map((f) => (
            <button
              key={f.key}
              onClick={() => props.setFormat(f.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                props.format === f.key
                  ? "border-accent bg-accent text-accent-foreground shadow-sm"
                  : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-subtle">
          {FORMATS.find((f) => f.key === props.format)?.hint}
        </p>
      </div>

      {props.format === "competitive" && (
        <div>
          <label className={LABEL}>Winner is</label>
          <SelectMenu
            value={props.scoreMode}
            onChange={props.setScoreMode}
            aria-label="Score mode"
            options={SCORE_MODES}
          />
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex-1">
          <label className={LABEL}>Date</label>
          <input
            type="date"
            value={props.date}
            onChange={(e) => props.setDate(e.target.value)}
            className={fieldCls}
          />
        </div>
        <div className="w-28">
          <label className={LABEL}>Length (min)</label>
          <input
            type="number"
            min={0}
            value={props.length}
            onChange={(e) => props.setLength(e.target.value)}
            placeholder="—"
            className={fieldCls}
          />
        </div>
      </div>
      <div>
        <label className={LABEL}>Location (optional)</label>
        <Input
          value={props.location}
          onChange={(e) => props.setLocation(e.target.value)}
          placeholder="e.g. game night at Sam's"
          className="w-full"
        />
      </div>
      <div>
        <label className={LABEL}>Notes (optional)</label>
        <Textarea
          value={props.comments}
          onChange={(e) => props.setComments(e.target.value)}
          placeholder="Anything memorable about this game?"
          rows={2}
          className="w-full"
        />
      </div>
    </div>
  );
}

/* ---- Step 3: players + teams ---- */
function PlayersStep(props: {
  players: PlayerForm[];
  setPlayers: React.Dispatch<React.SetStateAction<PlayerForm[]>>;
  isTeams: boolean;
  teamCount: number;
  setTeamCount: (n: number) => void;
  teamNames: string[];
  setTeamNames: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const people = useQuery(api.plays.myPlayPeople, {}) ?? [];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // Live-search real members (users with a public @handle) as they type.
  const userHits =
    useQuery(
      api.users.searchUsers,
      name.trim().length >= 2 ? { term: name.trim() } : "skip",
    ) ?? [];
  const userMatches = userHits.filter(
    (u) => !props.players.some((p) => p.userId === u._id),
  );

  function addNew() {
    const n = name.trim();
    if (!n) return;
    props.setPlayers((p) => [
      ...p,
      { key: nextKey(), name: n, newPersonEmail: email.trim() || undefined },
    ]);
    setName("");
    setEmail("");
  }
  function addPerson(person: { _id: Id<"playPeople">; name: string }) {
    if (props.players.some((p) => p.personId === person._id)) return;
    props.setPlayers((p) => [
      ...p,
      { key: nextKey(), name: person.name, personId: person._id },
    ]);
  }
  function addUser(u: { _id: Id<"users">; name: string }) {
    if (props.players.some((p) => p.userId === u._id)) return;
    props.setPlayers((p) => [
      ...p,
      { key: nextKey(), name: u.name, userId: u._id },
    ]);
    setName("");
  }
  function remove(key: string) {
    props.setPlayers((p) => p.filter((x) => x.key !== key));
  }

  const suggestions = name.trim()
    ? people.filter(
        (p) =>
          p.name.toLowerCase().includes(name.trim().toLowerCase()) &&
          !props.players.some((pl) => pl.personId === p._id),
      )
    : [];

  return (
    <div className="space-y-4">
      {props.isTeams && (
        <div>
          <label className={LABEL}>How many teams?</label>
          <div className="flex gap-1.5">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => {
                  props.setTeamCount(n);
                  props.setTeamNames((names) => {
                    const next = [...names];
                    while (next.length < n) next.push(`Team ${next.length + 1}`);
                    return next.slice(0, n);
                  });
                }}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all",
                  props.teamCount === n
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-muted hover:bg-surface-2",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          {/* Rename teams — some games have dedicated team names — and show how
              many players are on each as you assign them. */}
          <div className="mt-2 space-y-1.5">
            {Array.from({ length: props.teamCount }).map((_, i) => {
              const count = props.players.filter(
                (p) => (p.teamIndex ?? 0) === i,
              ).length;
              return (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={props.teamNames[i] ?? ""}
                    onChange={(e) =>
                      props.setTeamNames((names) => {
                        const next = [...names];
                        while (next.length <= i)
                          next.push(`Team ${next.length + 1}`);
                        next[i] = e.target.value;
                        return next;
                      })
                    }
                    placeholder={`Team ${i + 1}`}
                    aria-label={`Team ${i + 1} name`}
                    className="flex-1"
                  />
                  <span className="shrink-0 text-xs tabular-nums text-subtle">
                    {count} player{count === 1 ? "" : "s"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label className={LABEL}>Players</label>
        <ul className="space-y-1.5">
          {props.players.map((p) => (
            <li
              key={p.key}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {p.name}
                {p.userId && (
                  <span className="ml-1.5 text-[11px] font-semibold text-accent">
                    you
                  </span>
                )}
                {p.newPersonEmail && (
                  <span className="ml-1.5 text-[11px] text-subtle">
                    {p.newPersonEmail}
                  </span>
                )}
              </span>
              {props.isTeams && (
                <select
                  value={p.teamIndex ?? 0}
                  onChange={(e) =>
                    props.setPlayers((list) =>
                      list.map((x) =>
                        x.key === p.key
                          ? { ...x, teamIndex: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                >
                  {props.teamNames.slice(0, props.teamCount).map((t, i) => (
                    <option key={i} value={i}>
                      {t.trim() || `Team ${i + 1}`}
                    </option>
                  ))}
                </select>
              )}
              {!p.userId && (
                <button
                  onClick={() => remove(p.key)}
                  aria-label={`Remove ${p.name}`}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-subtle hover:bg-red-500/10 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-surface p-3">
        <label className={LABEL}>Add a player</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name or @username"
          className="w-full"
        />
        {userMatches.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {userMatches.map((u) => (
              <li key={u._id}>
                <button
                  onClick={() => addUser(u)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
                >
                  {u.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.avatarUrl}
                      alt=""
                      className="h-6 w-6 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">
                      {u.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {u.name}
                  </span>
                  {u.username && (
                    <span className="shrink-0 text-[11px] font-semibold text-accent">
                      @{u.username}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {suggestions.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {suggestions.slice(0, 5).map((p) => (
              <li key={p._id}>
                <button
                  onClick={() => {
                    addPerson(p);
                    setName("");
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-surface-2"
                >
                  <span>{p.name}</span>
                  <span className="text-[11px] text-subtle">
                    {p.playCount} play{p.playCount === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email (optional — so they get this play if they join)"
          className={cn(fieldCls, "mt-2")}
        />
        <button
          onClick={addNew}
          disabled={!name.trim()}
          className={buttonClasses("subtle", "sm", "mt-2 w-full")}
        >
          <Plus className="h-4 w-4" />
          Add player
        </button>
      </div>
    </div>
  );
}

/* ---- Step 4: scores ---- */
function ScoresStep(props: {
  format: PlayFormat;
  scoreMode: ScoreMode;
  coopOutcome: "win" | "loss";
  setCoopOutcome: (v: "win" | "loss") => void;
  coopScore: string;
  setCoopScore: (v: string) => void;
  players: PlayerForm[];
  setPlayers: React.Dispatch<React.SetStateAction<PlayerForm[]>>;
  isTeams: boolean;
  teamNames: string[];
  teamWinner: number;
  setTeamWinner: (i: number) => void;
}) {
  function setField(key: string, patch: Partial<PlayerForm>) {
    props.setPlayers((list) =>
      list.map((p) => (p.key === key ? { ...p, ...patch } : p)),
    );
  }

  if (props.format === "cooperative") {
    return (
      <div className="space-y-4">
        <div>
          <label className={LABEL}>Did the table win?</label>
          <div className="flex gap-2">
            {(["win", "loss"] as const).map((o) => (
              <button
                key={o}
                onClick={() => props.setCoopOutcome(o)}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-3 text-sm font-bold transition-all",
                  props.coopOutcome === o
                    ? o === "win"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-red-300 bg-red-50 text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400"
                    : "border-border bg-surface text-muted hover:bg-surface-2",
                )}
              >
                {o === "win" ? "🏆 We won" : "We lost"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={LABEL}>Score (optional)</label>
          <input
            type="number"
            value={props.coopScore}
            onChange={(e) => props.setCoopScore(e.target.value)}
            placeholder="e.g. 87 — beat your best"
            className={fieldCls}
          />
        </div>
      </div>
    );
  }

  if (props.isTeams) {
    return (
      <div className="space-y-3">
        <label className={LABEL}>Which team won?</label>
        <div className="space-y-2">
          {props.teamNames.map((t, i) => {
            const count = props.players.filter(
              (p) => (p.teamIndex ?? 0) === i,
            ).length;
            return (
              <button
                key={i}
                onClick={() => props.setTeamWinner(i)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-sm font-semibold transition-all",
                  props.teamWinner === i
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-surface text-muted hover:bg-surface-2",
                )}
              >
                <span className="flex items-center gap-2">
                  {t.trim() || `Team ${i + 1}`}
                  <span className="text-xs font-normal text-subtle">
                    {count} player{count === 1 ? "" : "s"}
                  </span>
                </span>
                {props.teamWinner === i && <Trophy className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // competitive / rounds — per-player input
  const key =
    props.format === "rounds"
      ? "roundsWon"
      : props.scoreMode === "placement"
        ? "placement"
        : "score";
  const label =
    props.format === "rounds"
      ? "Rounds won"
      : props.scoreMode === "placement"
        ? "Placement"
        : "Score";

  return (
    <div className="space-y-2">
      <label className={LABEL}>{label} per player</label>
      {props.players.map((p) => (
        <div
          key={p.key}
          className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2 pl-3"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {p.name}
          </span>
          <input
            type="number"
            value={
              key === "score"
                ? (p.score ?? "")
                : key === "placement"
                  ? (p.placement ?? "")
                  : (p.roundsWon ?? "")
            }
            onChange={(e) => {
              const n = e.target.value === "" ? undefined : Number(e.target.value);
              setField(p.key, { [key]: n } as Partial<PlayerForm>);
            }}
            placeholder="—"
            className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-center text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
      ))}
      <p className="text-xs text-subtle">The winner is worked out automatically.</p>
    </div>
  );
}

/* ---- Step 5: photos + share ---- */
function ShareStep(props: {
  previews: string[];
  uploading: boolean;
  onPickPhotos: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: (index: number) => void;
  visibility: "private" | "public";
  setVisibility: (v: "private" | "public") => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className={LABEL}>Photos (optional)</label>
        <div className="flex flex-wrap gap-2">
          {props.previews.map((src, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                className="h-20 w-20 rounded-xl object-cover ring-1 ring-border"
              />
              <button
                type="button"
                onClick={() => props.onRemovePhoto(i)}
                aria-label="Remove photo"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background shadow"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-subtle transition-colors hover:border-accent/50 hover:text-foreground">
            {props.uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ImagePlus className="h-5 w-5" />
            )}
            <span className="text-[10px] font-medium">Add</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={props.onPickPhotos}
              className="hidden"
            />
          </label>
        </div>
        <p className="mt-1.5 text-xs text-subtle">
          Photos are shrunk on your device before uploading.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3.5 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Public play</p>
          <p className="text-xs text-muted">Show it on your profile & share it.</p>
        </div>
        <Switch
          checked={props.visibility === "public"}
          onChange={(v) => props.setVisibility(v ? "public" : "private")}
          label="Public play"
        />
      </div>
    </div>
  );
}
