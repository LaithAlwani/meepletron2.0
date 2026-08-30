import { v, ConvexError, type Infer } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  query,
  mutation,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getCurrentUser, requireUser } from "./lib/auth";
import { canViewProfile } from "./friends";
import {
  playFormatValidator,
  playScoreModeValidator,
  coopOutcomeValidator,
  playVisibilityValidator,
  playTeamValidator,
} from "./lib/playTypes";
import { syncPlayPost, deletePlayPost } from "./lib/feed";
import { thumbUrl } from "./lib/gameCover";

/**
 * Plays — one recorded game session. Entered by hand (the log-play wizard) or
 * imported from BoardGameGeek (`source: "bgg"`, see convex/bggSync.ts). Players
 * are an embedded array on the row (bounded, ~≤20); identifiable participants
 * (system users + emailed people) are also written to `playParticipants` so
 * "plays I was in" and email-claim are index scans.
 *
 * Conventions mirror the rest of convex/: reads use getCurrentUser, writes use
 * requireUser + an ownership check, ids come from the authed user, two-arg
 * `ctx.db.get("plays", id)`, bounded reads, no wall-clock in queries.
 */

const PLAYERS_MAX = 30;
const STATS_SCAN = 1000; // bounded rows a stats query reads
const SWEEP_BATCH = 200; // rows a purge pass deletes before rescheduling
const PEOPLE_SCAN = 1000; // bounded plays scanned when editing a saved person

type PlayDoc = Doc<"plays">;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function normEmail(email?: string): string | undefined {
  const e = email?.trim().toLowerCase();
  return e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : undefined;
}

/** A compact cover for a play's game (stored cover → thumb → null). */
async function gameCover(ctx: QueryCtx, gameId?: Id<"games">) {
  if (!gameId) return null;
  const g = await ctx.db.get("games", gameId);
  if (!g) return null;
  return { slug: g.slug, title: g.title, coverUrl: await thumbUrl(ctx, g) };
}

/**
 * Resolve each player for display: swap a linked member's stored name for their
 * current `@username`, and attach their avatar URL (null for people/guests). So a
 * play always shows the member's up-to-date handle + avatar, never a stale one.
 */
async function withHandles<T extends { name: string; userId?: Id<"users"> }>(
  ctx: QueryCtx,
  players: T[],
): Promise<(T & { username: string | null; avatarUrl: string | null })[]> {
  return await Promise.all(
    players.map(async (p) => {
      if (!p.userId) return { ...p, username: null, avatarUrl: null };
      const u = await ctx.db.get("users", p.userId);
      const avatarUrl = u?.avatarStorageId
        ? await ctx.storage.getUrl(u.avatarStorageId)
        : (u?.image ?? null);
      // A linked member is shown by their username, never their real name.
      return {
        ...p,
        name: u?.username ?? p.name,
        username: u?.username ?? null,
        avatarUrl,
      };
    }),
  );
}

/** Winner names from a resolved (handle-swapped) player list. */
function winnerNamesOf(players: { name: string; isWinner?: boolean }[]): string[] {
  return players.filter((p) => p.isWinner).map((p) => p.name);
}

/** A lightweight play card for lists/feeds. */
export async function playCard(ctx: QueryCtx, play: PlayDoc) {
  const cover = await gameCover(ctx, play.gameId);
  const firstPhoto =
    play.photoIds && play.photoIds.length > 0
      ? await ctx.storage.getUrl(play.photoIds[0])
      : null;
  const resolved = await withHandles(ctx, play.players);
  return {
    _id: play._id,
    userId: play.userId,
    gameId: play.gameId ?? null,
    gameSlug: cover?.slug ?? null,
    title: play.title,
    coverUrl: cover?.coverUrl ?? null,
    photoUrl: firstPhoto,
    photoCount: play.photoIds?.length ?? 0,
    date: play.date,
    lengthMinutes: play.lengthMinutes ?? null,
    location: play.location ?? null,
    format: play.format,
    visibility: play.visibility,
    source: play.source,
    playerCount: play.players.length,
    players: resolved.map((p) => ({
      name: p.name,
      username: p.username,
      avatarUrl: p.avatarUrl,
      isWinner: !!p.isWinner,
      score: p.score ?? null,
      placement: p.placement ?? null,
    })),
    winners: winnerNamesOf(resolved),
    reactionCount: play.reactionCount ?? 0,
    commentCount: play.commentCount ?? 0,
    createdAt: play.createdAt,
  };
}

/**
 * Derive each player's win flag from the format, so the winner is authoritative
 * server-side rather than trusted from the client.
 */
function withDerivedWinners(
  format: PlayDoc["format"],
  scoreMode: PlayDoc["scoreMode"],
  coopOutcome: PlayDoc["coopOutcome"],
  teams: PlayDoc["teams"],
  players: PlayDoc["players"],
): { players: PlayDoc["players"]; teams: PlayDoc["teams"] } {
  const won = (v: boolean) => v;
  if (format === "cooperative") {
    const win = coopOutcome === "win";
    return { players: players.map((p) => ({ ...p, isWinner: won(win) })), teams };
  }
  if (format === "teams" || format === "onevsall") {
    const winners = new Set(
      (teams ?? [])
        .map((t, i) => (t.isWinner ? i : -1))
        .filter((i) => i >= 0),
    );
    return {
      players: players.map((p) => ({
        ...p,
        isWinner: p.teamIndex != null && winners.has(p.teamIndex),
      })),
      teams,
    };
  }
  // competitive / rounds: derive from the relevant metric.
  const metric = (p: PlayDoc["players"][number]): number | null =>
    format === "rounds"
      ? (p.roundsWon ?? null)
      : scoreMode === "placement"
        ? (p.placement != null ? -p.placement : null) // lower placement = better
        : (p.score ?? null);
  const vals = players.map(metric).filter((n): n is number => n != null);
  if (vals.length === 0) {
    return { players: players.map((p) => ({ ...p, isWinner: !!p.isWinner })), teams };
  }
  const best =
    format !== "rounds" && scoreMode === "lowest"
      ? Math.min(...players.map((p) => (p.score ?? Infinity)))
      : Math.max(...vals);
  return {
    players: players.map((p) => {
      const m =
        format !== "rounds" && scoreMode === "lowest" ? (p.score ?? null) : metric(p);
      return { ...p, isWinner: m != null && m === best };
    }),
    teams,
  };
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                  */
/* -------------------------------------------------------------------------- */

const playerInputValidator = v.object({
  name: v.string(),
  userId: v.optional(v.id("users")),
  personId: v.optional(v.id("playPeople")),
  newPersonEmail: v.optional(v.string()), // for a brand-new person
  score: v.optional(v.number()),
  placement: v.optional(v.number()),
  roundsWon: v.optional(v.number()),
  teamIndex: v.optional(v.number()),
  color: v.optional(v.string()),
  isNew: v.optional(v.boolean()),
});

const playBodyValidator = {
  gameId: v.optional(v.id("games")),
  bggId: v.optional(v.string()),
  title: v.string(),
  date: v.string(),
  lengthMinutes: v.optional(v.number()),
  location: v.optional(v.string()),
  comments: v.optional(v.string()),
  format: playFormatValidator,
  scoreMode: v.optional(playScoreModeValidator),
  coopOutcome: v.optional(coopOutcomeValidator),
  coopScore: v.optional(v.number()),
  teams: v.optional(v.array(playTeamValidator)),
  players: v.array(playerInputValidator),
  photoIds: v.optional(v.array(v.id("_storage"))),
  visibility: playVisibilityValidator,
};

/** Only keep storage ids that point at an image blob. */
export async function keepImages(
  ctx: MutationCtx,
  ids?: Id<"_storage">[],
): Promise<Id<"_storage">[] | undefined> {
  if (!ids || ids.length === 0) return undefined;
  const kept: Id<"_storage">[] = [];
  for (const id of ids.slice(0, 12)) {
    const meta = await ctx.db.system.get("_storage", id);
    if (meta && (meta.contentType ?? "").startsWith("image/")) kept.push(id);
    else if (meta) await ctx.storage.delete(id);
  }
  return kept.length ? kept : undefined;
}

/**
 * Resolve each wizard player to a stored subrecord + a participant key,
 * upserting a `playPeople` row for brand-new people and bumping play counts.
 */
async function resolvePlayers(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  input: Infer<typeof playerInputValidator>[],
): Promise<{
  players: PlayDoc["players"];
  participants: { userId?: Id<"users">; emailLower?: string }[];
  // Emailed people who aren't linked to an account — candidates for a "you were
  // added to a play" email. `personId` lets callers email only newly-added ones.
  notify: { email: string; name: string; personId: Id<"playPeople"> }[];
}> {
  const players: PlayDoc["players"] = [];
  const participants: { userId?: Id<"users">; emailLower?: string }[] = [];
  const notify: { email: string; name: string; personId: Id<"playPeople"> }[] = [];

  for (const p of input.slice(0, PLAYERS_MAX)) {
    const name = p.name.trim() || "Player";
    let personId = p.personId;
    let emailLower: string | undefined;
    let linked = false; // person already maps to a user account

    if (p.userId) {
      participants.push({ userId: p.userId });
    } else if (personId) {
      const person = await ctx.db.get("playPeople", personId);
      if (person && person.ownerId === ownerId) {
        emailLower = person.emailLower;
        linked = !!person.linkedUserId;
        await ctx.db.patch("playPeople", personId, {
          playCount: (person.playCount ?? 0) + 1,
        });
      } else {
        personId = undefined; // stale/foreign — treat as a bare name
      }
    } else {
      // Brand-new person: upsert by email (preferred) or name for this owner.
      emailLower = normEmail(p.newPersonEmail);
      const existing = emailLower
        ? await ctx.db
            .query("playPeople")
            .withIndex("by_owner_and_email", (q) =>
              q.eq("ownerId", ownerId).eq("emailLower", emailLower),
            )
            .first()
        : await ctx.db
            .query("playPeople")
            .withIndex("by_owner_and_name", (q) =>
              q.eq("ownerId", ownerId).eq("name", name),
            )
            .first();
      if (existing) {
        personId = existing._id;
        emailLower = existing.emailLower ?? emailLower;
        linked = !!existing.linkedUserId;
        await ctx.db.patch("playPeople", existing._id, {
          playCount: (existing.playCount ?? 0) + 1,
          ...(emailLower && !existing.emailLower ? { emailLower } : {}),
        });
      } else {
        personId = await ctx.db.insert("playPeople", {
          ownerId,
          name,
          emailLower,
          playCount: 1,
          createdAt: Date.now(),
        });
      }
    }

    if (emailLower) participants.push({ emailLower });
    // Notify emailed people who aren't already a Meepletron account (accounts get
    // in-app notifications instead).
    if (emailLower && !linked && !p.userId && personId) {
      notify.push({ email: emailLower, name, personId });
    }
    players.push({
      name,
      userId: p.userId,
      personId,
      score: p.score,
      placement: p.placement,
      roundsWon: p.roundsWon,
      teamIndex: p.teamIndex,
      color: p.color,
      isNew: p.isNew,
    });
  }
  return { players, participants, notify };
}

/** Schedule "you were added to a play" emails for a set of tagged people. */
async function scheduleTagEmails(
  ctx: MutationCtx,
  opts: {
    ownerName: string;
    playId: Id<"plays">;
    playTitle: string;
    notify: { email: string; name: string; personId: Id<"playPeople"> }[];
  },
) {
  const siteUrl = process.env.SITE_URL || "https://www.meepletron.com";
  const playUrl = `${siteUrl}/plays/${opts.playId}`;
  for (const person of opts.notify) {
    await ctx.scheduler.runAfter(0, internal.email.sendPlayTagEmail, {
      to: person.email,
      recipientName: person.name,
      ownerName: opts.ownerName,
      playTitle: opts.playTitle,
      playUrl,
    });
  }
}

/** In-app "you were added to a play" notifications for tagged account players. */
async function notifyTaggedPlayers(
  ctx: MutationCtx,
  opts: { playId: Id<"plays">; ownerId: Id<"users">; userIds: Id<"users">[] },
) {
  const now = Date.now();
  const seen = new Set<string>();
  for (const uid of opts.userIds) {
    if (uid === opts.ownerId || seen.has(uid)) continue;
    seen.add(uid);
    await ctx.db.insert("notifications", {
      userId: uid,
      type: "play_tagged",
      actorId: opts.ownerId,
      playId: opts.playId,
      read: false,
      createdAt: now,
    });
  }
}

/** Write the indexed participant links for a play. */
async function writeParticipants(
  ctx: MutationCtx,
  play: {
    _id: Id<"plays">;
    userId: Id<"users">;
    gameId?: Id<"games">;
    date: string;
    visibility: PlayDoc["visibility"];
  },
  participants: { userId?: Id<"users">; emailLower?: string }[],
) {
  const seen = new Set<string>();
  for (const part of participants) {
    const key = part.userId ? `u:${part.userId}` : `e:${part.emailLower}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await ctx.db.insert("playParticipants", {
      playId: play._id,
      ownerId: play.userId,
      gameId: play.gameId,
      date: play.date,
      visibility: play.visibility,
      userId: part.userId,
      emailLower: part.emailLower,
    });
  }
}

async function clearParticipants(ctx: MutationCtx, playId: Id<"plays">) {
  const rows = await ctx.db
    .query("playParticipants")
    .withIndex("by_play", (q) => q.eq("playId", playId))
    .collect();
  for (const r of rows) await ctx.db.delete("playParticipants", r._id);
}

export const logPlay = mutation({
  args: playBodyValidator,
  handler: async (ctx, args): Promise<Id<"plays">> => {
    const user = await requireUser(ctx);
    const { players, participants, notify } = await resolvePlayers(
      ctx,
      user._id,
      args.players,
    );
    const derived = withDerivedWinners(
      args.format,
      args.scoreMode,
      args.coopOutcome,
      args.teams,
      players,
    );
    const photoIds = await keepImages(ctx, args.photoIds);
    const now = Date.now();

    const playId = await ctx.db.insert("plays", {
      userId: user._id,
      gameId: args.gameId,
      bggId: args.bggId,
      title: args.title.trim() || "Untitled game",
      date: args.date,
      lengthMinutes: args.lengthMinutes,
      location: args.location?.trim() || undefined,
      comments: args.comments?.trim() || undefined,
      format: args.format,
      scoreMode: args.scoreMode,
      coopOutcome: args.coopOutcome,
      coopScore: args.format === "cooperative" ? args.coopScore : undefined,
      teams: derived.teams,
      players: derived.players,
      photoIds,
      visibility: args.visibility,
      source: "manual",
      createdAt: now,
      updatedAt: now,
    });

    // The owner is always a participant of a play they logged.
    await writeParticipants(
      ctx,
      { _id: playId, userId: user._id, gameId: args.gameId, date: args.date, visibility: args.visibility },
      [{ userId: user._id }, ...participants],
    );
    // A public play appears in the feed as a post.
    await syncPlayPost(ctx, {
      _id: playId,
      userId: user._id,
      visibility: args.visibility,
    });
    // Email every tagged non-account player so they can come see the play.
    await scheduleTagEmails(ctx, {
      ownerName: user.name ?? user.username ?? "Someone",
      playId,
      playTitle: args.title.trim() || "a game",
      notify,
    });
    // In-app notification for tagged account players.
    await notifyTaggedPlayers(ctx, {
      playId,
      ownerId: user._id,
      userIds: participants
        .filter((p) => p.userId)
        .map((p) => p.userId as Id<"users">),
    });
    return playId;
  },
});

export const updatePlay = mutation({
  args: { playId: v.id("plays"), ...playBodyValidator },
  handler: async (ctx, { playId, ...args }) => {
    const user = await requireUser(ctx);
    const play = await ctx.db.get("plays", playId);
    if (!play || play.userId !== user._id) throw new Error("Play not found");

    const { players, participants, notify } = await resolvePlayers(
      ctx,
      user._id,
      args.players,
    );
    const derived = withDerivedWinners(
      args.format,
      args.scoreMode,
      args.coopOutcome,
      args.teams,
      players,
    );
    const photoIds = await keepImages(ctx, args.photoIds);
    // Delete photos that were removed in the edit.
    const removed = (play.photoIds ?? []).filter(
      (id) => !(photoIds ?? []).includes(id),
    );
    for (const id of removed) await ctx.storage.delete(id);

    await ctx.db.patch("plays", playId, {
      gameId: args.gameId,
      bggId: args.bggId,
      title: args.title.trim() || play.title,
      date: args.date,
      lengthMinutes: args.lengthMinutes,
      location: args.location?.trim() || undefined,
      comments: args.comments?.trim() || undefined,
      format: args.format,
      scoreMode: args.scoreMode,
      coopOutcome: args.coopOutcome,
      coopScore: args.format === "cooperative" ? args.coopScore : undefined,
      teams: derived.teams,
      players: derived.players,
      photoIds,
      visibility: args.visibility,
      // Editing confirms an imported play's guessed format.
      needsReview: false,
      updatedAt: Date.now(),
    });

    await clearParticipants(ctx, playId);
    await writeParticipants(
      ctx,
      { _id: playId, userId: user._id, gameId: args.gameId, date: args.date, visibility: args.visibility },
      [{ userId: user._id }, ...participants],
    );
    // Add/remove the feed post to match the (possibly changed) visibility.
    await syncPlayPost(ctx, {
      _id: playId,
      userId: user._id,
      visibility: args.visibility,
    });
    // Email tagged non-account players (anyone still without an account).
    await scheduleTagEmails(ctx, {
      ownerName: user.name ?? user.username ?? "Someone",
      playId,
      playTitle: args.title.trim() || play.title,
      notify,
    });
    // Notify only account players added in this edit (not the ones already on it).
    const oldUserIds = new Set(
      play.players.filter((p) => p.userId).map((p) => String(p.userId)),
    );
    await notifyTaggedPlayers(ctx, {
      playId,
      ownerId: user._id,
      userIds: participants
        .filter((p) => p.userId && !oldUserIds.has(String(p.userId)))
        .map((p) => p.userId as Id<"users">),
    });
  },
});

export const deletePlay = mutation({
  args: { playId: v.id("plays") },
  handler: async (ctx, { playId }) => {
    const user = await requireUser(ctx);
    const play = await ctx.db.get("plays", playId);
    if (!play || play.userId !== user._id) return;
    for (const id of play.photoIds ?? []) await ctx.storage.delete(id);
    await clearParticipants(ctx, playId);
    await deletePlayPost(ctx, playId);
    await ctx.db.delete("plays", playId);
  },
});

/**
 * Set a play's visibility on the play row + its denormalized participant links,
 * WITHOUT touching its feed post. The caller manages the post (via syncPlayPost,
 * or by re-pointing an existing post when editing which play a post shows).
 */
export async function writePlayVisibility(
  ctx: MutationCtx,
  playId: Id<"plays">,
  visibility: PlayDoc["visibility"],
) {
  await ctx.db.patch("plays", playId, { visibility, updatedAt: Date.now() });
  const parts = await ctx.db
    .query("playParticipants")
    .withIndex("by_play", (q) => q.eq("playId", playId))
    .collect();
  for (const p of parts) await ctx.db.patch("playParticipants", p._id, { visibility });
}

export const setPlayVisibility = mutation({
  args: { playId: v.id("plays"), visibility: playVisibilityValidator },
  handler: async (ctx, { playId, visibility }) => {
    const user = await requireUser(ctx);
    const play = await ctx.db.get("plays", playId);
    if (!play || play.userId !== user._id) throw new Error("Play not found");
    await writePlayVisibility(ctx, playId, visibility);
    // Add/remove the feed post.
    await syncPlayPost(ctx, { _id: playId, userId: user._id, visibility });
  },
});

/** A short-lived upload URL for a live-game photo (compressed client-side). */
export const generatePlayPhotoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Claim any plays a friend tagged the caller in by their email — stamps their
 * userId on the participant links + embedded players. Runs on sign-up too, but
 * this lets an existing account (or later-added plays) get claimed on demand.
 * Idempotent + batched.
 */
export const claimMyPlays = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.email) {
      await ctx.scheduler.runAfter(0, internal.plays.claimPlaysByEmail, {
        userId: user._id,
        email: user.email,
      });
    }
  },
});

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The caller's plays, newest first — every play they took part in, whether they
 * logged it or a friend tagged them (by account **or** by their email, so a play
 * shows up the moment they sign in, even before the email-claim has run).
 */
export const myPlays = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return { page: [], isDone: true, continueCursor: "" };
    const email = user.email?.toLowerCase();

    const byUser = await ctx.db
      .query("playParticipants")
      .withIndex("by_user_and_date", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(1000);
    const byEmail = email
      ? await ctx.db
          .query("playParticipants")
          .withIndex("by_email", (q) => q.eq("emailLower", email))
          .take(1000)
      : [];

    const seen = new Set<string>();
    const playIds: Id<"plays">[] = [];
    for (const link of [...byUser, ...byEmail]) {
      if (seen.has(link.playId)) continue;
      seen.add(link.playId);
      playIds.push(link.playId);
    }
    const plays = (
      await Promise.all(playIds.map((id) => ctx.db.get("plays", id)))
    ).filter((p): p is PlayDoc => p !== null);
    plays.sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt,
    );

    const offset = Number(paginationOpts.cursor ?? "0") || 0;
    const end = offset + paginationOpts.numItems;
    const slice = plays.slice(offset, end);
    return {
      page: await Promise.all(slice.map((p) => playCard(ctx, p))),
      isDone: end >= plays.length,
      continueCursor: String(end),
    };
  },
});

/** Plays for a game — the owner's own (any visibility) + everyone's public. */
export const gamePlays = query({
  args: { gameId: v.id("games"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { gameId, paginationOpts }) => {
    const viewer = await getCurrentUser(ctx);
    const result = await ctx.db
      .query("plays")
      .withIndex("by_game_and_date", (q) => q.eq("gameId", gameId))
      .order("desc")
      .filter((q) =>
        viewer
          ? q.or(
              q.eq(q.field("visibility"), "public"),
              q.eq(q.field("userId"), viewer._id),
            )
          : q.eq(q.field("visibility"), "public"),
      )
      .paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(result.page.map((p) => playCard(ctx, p))),
    };
  },
});

/** A single play — owner (any) or anyone (public). Null otherwise. */
export const getPlay = query({
  args: { playId: v.id("plays") },
  handler: async (ctx, { playId }) => {
    const viewer = await getCurrentUser(ctx);
    const play = await ctx.db.get("plays", playId);
    if (!play) return null;
    const isOwner = viewer != null && viewer._id === play.userId;

    // Owner, anyone on a public play, or a tagged participant (by account/email).
    let canView = isOwner || play.visibility === "public";
    if (!canView && viewer) {
      if (play.players.some((p) => p.userId === viewer._id)) {
        canView = true;
      } else {
        const em = viewer.email?.toLowerCase();
        const parts = await ctx.db
          .query("playParticipants")
          .withIndex("by_play", (q) => q.eq("playId", playId))
          .collect();
        canView = parts.some(
          (pt) => pt.userId === viewer._id || (!!em && pt.emailLower === em),
        );
      }
    }
    if (!canView) return null;

    const cover = await gameCover(ctx, play.gameId);
    const photoUrls = await Promise.all(
      (play.photoIds ?? []).map((id) => ctx.storage.getUrl(id)),
    );
    const owner = await ctx.db.get("users", play.userId);
    const players = await withHandles(ctx, play.players);
    // Likes + comments live on the play's feed post (public plays only).
    const post =
      play.visibility === "public"
        ? await ctx.db
            .query("posts")
            .withIndex("by_play", (q) => q.eq("playId", playId))
            .unique()
        : null;
    const myReaction =
      post != null &&
      viewer != null &&
      (await ctx.db
        .query("postReactions")
        .withIndex("by_user_and_post", (q) =>
          q.eq("userId", viewer._id).eq("postId", post._id),
        )
        .unique()) != null;
    return {
      ...play,
      players,
      isOwner,
      gameSlug: cover?.slug ?? null,
      coverUrl: cover?.coverUrl ?? null,
      photoUrls: photoUrls.filter((u): u is string => !!u),
      winners: winnerNamesOf(players),
      ownerName: owner?.username ?? null,
      ownerUsername: owner?.username ?? null,
      postId: post?._id ?? null,
      reactionCount: post?.reactionCount ?? 0,
      commentCount: post?.commentCount ?? 0,
      myReaction,
    };
  },
});

/** The owner's saved people, for the wizard's add-player autocomplete. */
export const myPlayPeople = query({
  args: { term: v.optional(v.string()) },
  handler: async (ctx, { term }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query("playPeople")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .take(500);
    const t = term?.trim().toLowerCase();
    const filtered = t
      ? rows.filter((r) => r.name.toLowerCase().includes(t))
      : rows;
    return filtered
      .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
      .slice(0, 20)
      .map((r) => ({
        _id: r._id,
        name: r.name,
        hasEmail: !!r.emailLower,
        linked: !!r.linkedUserId,
        playCount: r.playCount ?? 0,
      }));
  },
});

/**
 * Deduped play ids (newest first) for every PUBLIC play a user takes part in —
 * whether they logged it or a friend tagged them (by account or by their email).
 * Reads the denormalized `visibility` on the participant links (kept in sync by
 * the play mutations), so it covers plays owned by *other* users too. Powers the
 * profile Plays tab + its count.
 */
export async function publicParticipantPlayIds(
  ctx: QueryCtx,
  user: { _id: Id<"users">; email?: string | null },
): Promise<Id<"plays">[]> {
  const email = user.email?.toLowerCase();
  const byUser = await ctx.db
    .query("playParticipants")
    .withIndex("by_user_and_date", (q) => q.eq("userId", user._id))
    .filter((q) => q.eq(q.field("visibility"), "public"))
    .collect();
  const byEmail = email
    ? await ctx.db
        .query("playParticipants")
        .withIndex("by_email", (q) => q.eq("emailLower", email))
        .filter((q) => q.eq(q.field("visibility"), "public"))
        .collect()
    : [];
  const links = [...byUser, ...byEmail].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
  const seen = new Set<string>();
  const ids: Id<"plays">[] = [];
  for (const link of links) {
    if (seen.has(link.playId)) continue;
    seen.add(link.playId);
    ids.push(link.playId);
  }
  return ids;
}

/** Recent public plays for a user (by username) — for their public profile.
 *  Includes plays a friend logged and tagged them into, not just their own. */
export const userPublicPlays = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const lower = username.trim().toLowerCase();
    if (!lower) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_username_lower", (q) => q.eq("usernameLower", lower))
      .unique();
    if (!user) return [];
    const viewer = await getCurrentUser(ctx);
    if (!(await canViewProfile(ctx, user, viewer?._id ?? null))) return [];
    const ids = await publicParticipantPlayIds(ctx, user);
    const plays = (
      await Promise.all(ids.slice(0, 30).map((id) => ctx.db.get("plays", id)))
    ).filter((p): p is PlayDoc => p !== null && p.visibility === "public");
    return await Promise.all(plays.map((p) => playCard(ctx, p)));
  },
});

/**
 * Play stats for the caller (or a public user). `monthStartDate` ("YYYY-MM-DD",
 * first of the current month) is passed from the client — queries can't read
 * wall-clock. Based on plays the user participated in (via playParticipants).
 */
export const myPlayStats = query({
  args: { userId: v.optional(v.id("users")), monthStartDate: v.string() },
  handler: async (ctx, { userId, monthStartDate }) => {
    const viewer = await getCurrentUser(ctx);
    const targetId = userId ?? viewer?._id;
    if (!targetId) return null;
    const isSelf = viewer != null && viewer._id === targetId;

    const links = await ctx.db
      .query("playParticipants")
      .withIndex("by_user_and_date", (q) => q.eq("userId", targetId))
      .order("desc")
      .take(STATS_SCAN);

    let total = 0;
    let thisMonth = 0;
    let wins = 0;
    let decided = 0;
    const byGame = new Map<
      string,
      {
        title: string;
        count: number;
        gameId: Id<"games"> | null;
        wins: number;
        decided: number;
        bestScore: number | null;
      }
    >();
    const months = new Map<string, number>(); // "YYYY-MM" → count
    const recent: {
      playId: Id<"plays">;
      title: string;
      date: string;
      winners: string[];
      youWon: boolean | null;
    }[] = [];

    for (const link of links) {
      const play = await ctx.db.get("plays", link.playId);
      if (!play) continue;
      if (!isSelf && play.visibility !== "public") continue;
      total++;
      if (play.date >= monthStartDate) thisMonth++;
      const month = play.date.slice(0, 7);
      months.set(month, (months.get(month) ?? 0) + 1);
      const me = play.players.find((p) => p.userId === targetId);
      if (me && me.isWinner !== undefined) {
        decided++;
        if (me.isWinner) wins++;
      }
      if (recent.length < 6) {
        recent.push({
          playId: play._id,
          title: play.title,
          date: play.date,
          winners: winnerNamesOf(await withHandles(ctx, play.players)),
          youWon: me?.isWinner ?? null,
        });
      }
      // Per-game aggregate (same scan): plays, wins, decided, best personal score.
      const key = play.gameId ?? play.title;
      let g = byGame.get(key);
      if (!g) {
        g = {
          title: play.title,
          count: 0,
          gameId: play.gameId ?? null,
          wins: 0,
          decided: 0,
          bestScore: null,
        };
        byGame.set(key, g);
      }
      g.count++;
      if (me && me.isWinner !== undefined) {
        g.decided++;
        if (me.isWinner) g.wins++;
      }
      // Best personal score: the player's own score, or the table score for co-ops.
      const score =
        me?.score ??
        (play.format === "cooperative" ? (play.coopScore ?? null) : null);
      if (typeof score === "number") {
        g.bestScore = g.bestScore === null ? score : Math.max(g.bestScore, score);
      }
    }

    let top: { title: string; count: number; gameId: Id<"games"> | null } | null =
      null;
    for (const g of byGame.values()) if (!top || g.count > top.count) top = g;

    let mostPlayed: { title: string; count: number; slug: string | null } | null =
      null;
    if (top) {
      const g = top.gameId ? await ctx.db.get("games", top.gameId) : null;
      mostPlayed = { title: top.title, count: top.count, slug: g?.slug ?? null };
    }

    // Per-game record (most-played first), covers resolved once.
    const games = await Promise.all(
      [...byGame.values()]
        .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
        .map(async (g) => {
          const cover = g.gameId ? await gameCover(ctx, g.gameId) : null;
          return {
            gameId: g.gameId,
            title: g.title,
            slug: cover?.slug ?? null,
            coverUrl: cover?.coverUrl ?? null,
            plays: g.count,
            wins: g.wins,
            decided: g.decided,
            winPct: g.decided > 0 ? Math.round((g.wins / g.decided) * 100) : null,
            bestScore: g.bestScore,
          };
        }),
    );

    // Last 6 months (ending at the client-supplied current month) for a bar chart.
    const [yy, mm] = monthStartDate.split("-").map(Number);
    const byMonth: { month: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      let y = yy;
      let m = mm - i;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      const key = `${y}-${String(m).padStart(2, "0")}`;
      byMonth.push({ month: key, count: months.get(key) ?? 0 });
    }

    return {
      total,
      thisMonth,
      uniqueGames: byGame.size,
      winPct: decided > 0 ? Math.round((wins / decided) * 100) : null,
      wins,
      decided,
      mostPlayed,
      recent,
      byMonth,
      games,
      capped: links.length >= STATS_SCAN,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Engagement                                                                 */
/* -------------------------------------------------------------------------- */
/* The feed + reactions + comments moved to convex/posts.ts (keyed on postId). */

/**
 * Engagement a player has received: total likes on their posts + on their
 * comments, and total comments on their posts. `username` targets a public
 * profile; omitted = the caller. Bounded scan of their own rows.
 */
export const playEngagement = query({
  args: { username: v.optional(v.string()) },
  handler: async (ctx, { username }) => {
    const viewer = await getCurrentUser(ctx);
    let targetId = viewer?._id;
    if (username) {
      const lower = username.trim().toLowerCase();
      const u = await ctx.db
        .query("users")
        .withIndex("by_username_lower", (q) => q.eq("usernameLower", lower))
        .unique();
      targetId = u?._id;
    }
    if (!targetId) return { likesReceived: 0, commentsReceived: 0 };

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_user_and_created", (q) => q.eq("userId", targetId))
      .take(3000);
    let likesReceived = 0;
    let commentsReceived = 0;
    for (const p of posts) {
      likesReceived += p.reactionCount ?? 0;
      commentsReceived += p.commentCount ?? 0;
    }
    const comments = await ctx.db
      .query("postComments")
      .withIndex("by_user", (q) => q.eq("userId", targetId))
      .take(3000);
    for (const c of comments) likesReceived += c.likeCount ?? 0;

    return { likesReceived, commentsReceived };
  },
});

/* -------------------------------------------------------------------------- */
/* Saved people — manage the non-account players you've added                 */
/* -------------------------------------------------------------------------- */

/** The caller's saved people, for the manage-people page. Linked people show
 *  their account's current @username (they manage their own identity). */
export const myPeople = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query("playPeople")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .take(500);
    const people = await Promise.all(
      rows.map(async (r) => {
        let displayName = r.name;
        let username: string | null = null;
        let avatarUrl: string | null = null;
        if (r.linkedUserId) {
          const u = await ctx.db.get("users", r.linkedUserId);
          username = u?.username ?? null;
          // A joined person is shown by their username, not the name you typed.
          displayName = u?.username ? `@${u.username}` : r.name;
          avatarUrl = u?.avatarStorageId
            ? await ctx.storage.getUrl(u.avatarStorageId)
            : (u?.image ?? null);
        }
        return {
          _id: r._id,
          name: displayName,
          rawName: r.name,
          email: r.emailLower ?? null,
          playCount: r.playCount ?? 0,
          linked: !!r.linkedUserId,
          username,
          avatarUrl,
        };
      }),
    );
    return people.sort((a, b) => b.playCount - a.playCount);
  },
});

/**
 * Edit a saved (non-account) person's name and/or email. Fixes the name across
 * all of the owner's past plays, and moves the email-claim links to the new
 * email. Rejects a duplicate email; joined people are read-only.
 */
export const updatePlayPerson = mutation({
  args: {
    personId: v.id("playPeople"),
    name: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, { personId, name, email }) => {
    const user = await requireUser(ctx);
    const person = await ctx.db.get("playPeople", personId);
    if (!person || person.ownerId !== user._id) {
      throw new ConvexError("Person not found.");
    }
    if (person.linkedUserId) {
      throw new ConvexError(
        "This person has a Meepletron account — they manage their own name and email.",
      );
    }
    const newName = name.trim();
    if (!newName) throw new ConvexError("Name can't be empty.");

    // Empty string clears the email; a non-empty invalid one is an error.
    const raw = email?.trim() ?? "";
    let newEmail: string | undefined;
    if (raw) {
      newEmail = normEmail(raw);
      if (!newEmail) throw new ConvexError("Enter a valid email address.");
    }

    const oldEmail = person.emailLower;
    if (newEmail && newEmail !== oldEmail) {
      const clash = await ctx.db
        .query("playPeople")
        .withIndex("by_owner_and_email", (q) =>
          q.eq("ownerId", user._id).eq("emailLower", newEmail),
        )
        .first();
      if (clash && clash._id !== personId) {
        throw new ConvexError("Another person already uses that email.");
      }
    }

    await ctx.db.patch("playPeople", personId, {
      name: newName,
      emailLower: newEmail,
    });

    // Propagate the name to this person's embedded rows in past plays.
    const plays = await ctx.db
      .query("plays")
      .withIndex("by_user_and_date", (q) => q.eq("userId", user._id))
      .take(PEOPLE_SCAN);
    const touched: {
      playId: Id<"plays">;
      gameId?: Id<"games">;
      date: string;
      visibility: PlayDoc["visibility"];
    }[] = [];
    for (const play of plays) {
      let changed = false;
      const players = play.players.map((p) => {
        if (p.personId === personId) {
          changed = true;
          return { ...p, name: newName };
        }
        return p;
      });
      if (changed) {
        await ctx.db.patch("plays", play._id, { players });
        touched.push({
          playId: play._id,
          gameId: play.gameId,
          date: play.date,
          visibility: play.visibility,
        });
      }
    }

    // Keep the email-claim links in step with the new email.
    if (oldEmail !== newEmail) {
      if (oldEmail) {
        const rows = await ctx.db
          .query("playParticipants")
          .withIndex("by_email", (q) => q.eq("emailLower", oldEmail))
          .collect();
        for (const r of rows) {
          if (r.ownerId !== user._id) continue;
          if (newEmail) await ctx.db.patch("playParticipants", r._id, { emailLower: newEmail });
          else await ctx.db.delete("playParticipants", r._id);
        }
      } else if (newEmail) {
        // No prior email: add a link for each play this person is in.
        for (const tp of touched) {
          const existing = await ctx.db
            .query("playParticipants")
            .withIndex("by_play", (q) => q.eq("playId", tp.playId))
            .collect();
          if (!existing.some((e) => e.emailLower === newEmail)) {
            await ctx.db.insert("playParticipants", {
              playId: tp.playId,
              ownerId: user._id,
              gameId: tp.gameId,
              date: tp.date,
              visibility: tp.visibility,
              emailLower: newEmail,
            });
          }
        }
      }
    }
  },
});

/** Remove a saved person from the owner's list. Past plays keep their name
 *  (history isn't rewritten). Joined people can't be removed here. */
export const deletePlayPerson = mutation({
  args: { personId: v.id("playPeople") },
  handler: async (ctx, { personId }) => {
    const user = await requireUser(ctx);
    const person = await ctx.db.get("playPeople", personId);
    if (!person || person.ownerId !== user._id) return;
    if (person.linkedUserId) {
      throw new ConvexError(
        "This person has a Meepletron account and can't be removed from your list.",
      );
    }
    await ctx.db.delete("playPeople", personId);
  },
});

/* -------------------------------------------------------------------------- */
/* Internal: purge + claim-on-signup                                          */
/* -------------------------------------------------------------------------- */

/** Delete all of a user's plays + participant links + saved people (batched). */
export const purgeUserPlays = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const plays = await ctx.db
      .query("plays")
      .withIndex("by_user_and_date", (q) => q.eq("userId", userId))
      .take(SWEEP_BATCH);
    for (const p of plays) {
      const parts = await ctx.db
        .query("playParticipants")
        .withIndex("by_play", (q) => q.eq("playId", p._id))
        .collect();
      for (const pt of parts) await ctx.db.delete("playParticipants", pt._id);
      for (const id of p.photoIds ?? []) await ctx.storage.delete(id);
      await deletePlayPost(ctx, p._id);
      await ctx.db.delete("plays", p._id);
    }
    if (plays.length > 0) {
      await ctx.scheduler.runAfter(0, internal.plays.purgeUserPlays, { userId });
      return;
    }
    const people = await ctx.db
      .query("playPeople")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .take(SWEEP_BATCH);
    for (const person of people) await ctx.db.delete("playPeople", person._id);
    if (people.length > 0) {
      await ctx.scheduler.runAfter(0, internal.plays.purgeUserPlays, { userId });
    }
  },
});

/**
 * When a user signs up / verifies an email, link the plays they were recorded in
 * by that email: set `playParticipants.userId` and `playPeople.linkedUserId`.
 * Batched + idempotent (mirrors relinkGameToBggRows).
 */
export const claimPlaysByEmail = internalMutation({
  args: { userId: v.id("users"), email: v.string() },
  handler: async (ctx, { userId, email }) => {
    const emailLower = normEmail(email);
    if (!emailLower) return { claimed: 0 };

    // Link the saved-people rows first, so we know which embedded personIds to
    // stamp with the new userId.
    const people = await ctx.db
      .query("playPeople")
      .withIndex("by_email", (q) => q.eq("emailLower", emailLower))
      .take(SWEEP_BATCH);
    const personIds = new Set<string>();
    for (const person of people) {
      personIds.add(person._id);
      if (person.linkedUserId !== userId) {
        await ctx.db.patch("playPeople", person._id, { linkedUserId: userId });
      }
    }

    const parts = await ctx.db
      .query("playParticipants")
      .withIndex("by_email", (q) => q.eq("emailLower", emailLower))
      .take(SWEEP_BATCH);
    let claimed = 0;
    for (const part of parts) {
      if (part.userId !== userId) {
        await ctx.db.patch("playParticipants", part._id, { userId });
      }
      // Stamp the matching embedded player so win-% stats find the user.
      const play = await ctx.db.get("plays", part.playId);
      if (play) {
        let changed = false;
        const players = play.players.map((p) => {
          if (!p.userId && p.personId && personIds.has(p.personId)) {
            changed = true;
            return { ...p, userId };
          }
          return p;
        });
        if (changed) await ctx.db.patch("plays", play._id, { players });
      }
      claimed++;
    }

    if (parts.length >= SWEEP_BATCH || people.length >= SWEEP_BATCH) {
      await ctx.scheduler.runAfter(0, internal.plays.claimPlaysByEmail, {
        userId,
        email,
      });
    }
    return { claimed };
  },
});
