import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { OLD_USERS } from "./data/oldUsers";

/** Public-handle format, mirrors `setUsername` in convex/users.ts. */
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,20}$/;

/**
 * One-off: delete collection rows that are in none of the four lists (own /
 * wishlist / forTrade / prevOwned) — e.g. old want-to-play-only rows — so the
 * collection only holds real memberships. Self-draining.
 */
export const pruneEmptyCollectionRows = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }): Promise<void> => {
    const page = await ctx.db
      .query("bggCollection")
      .paginate({ numItems: 500, cursor: cursor ?? null });
    for (const r of page.page) {
      if (!r.own && !r.wishlist && !r.forTrade && !r.prevOwned) {
        await ctx.db.delete("bggCollection", r._id);
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.pruneEmptyCollectionRows,
        { cursor: page.continueCursor },
      );
    }
  },
});

/**
 * One-off: fold existing want/preordered collection rows into the wishlist
 * (heart) — the raw want/preordered flags stay on the row so a future "Want" tab
 * can split them back out. Self-draining. (Preordered only lands on rows once a
 * sync has run with the new parser.)
 */
export const foldWantIntoWishlist = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }): Promise<void> => {
    const page = await ctx.db
      .query("bggCollection")
      .paginate({ numItems: 500, cursor: cursor ?? null });
    for (const r of page.page) {
      if (!r.wishlist && (r.want || r.wantToBuy || r.preordered)) {
        await ctx.db.patch("bggCollection", r._id, { wishlist: true });
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.foldWantIntoWishlist,
        { cursor: page.continueCursor },
      );
    }
  },
});

/**
 * One-off: fold existing `favorites` (hearts) into the unified collection by
 * setting `wishlist: true` on the user's `bggCollection` row (creating one if
 * needed). Idempotent, self-draining. The `favorites` table is left in place as
 * a backstop; nothing reads it after this.
 */
export const migrateFavoritesToWishlist = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }): Promise<void> => {
    const page = await ctx.db
      .query("favorites")
      .paginate({ numItems: 200, cursor: cursor ?? null });
    for (const fav of page.page) {
      const existing = await ctx.db
        .query("bggCollection")
        .withIndex("by_user_and_game", (q) =>
          q.eq("userId", fav.userId).eq("gameId", fav.gameId),
        )
        .unique();
      if (existing) {
        if (!existing.wishlist) {
          await ctx.db.patch("bggCollection", existing._id, {
            wishlist: true,
          });
        }
        continue;
      }
      const game = await ctx.db.get("games", fav.gameId);
      if (!game) continue;
      await ctx.db.insert("bggCollection", {
        userId: fav.userId,
        gameId: game._id,
        bggId: game.bggId ?? `local:${game._id}`,
        title: game.title,
        sortTitle: game.title.toLowerCase(),
        year: game.year,
        isExpansion: game.isExpansion,
        own: false,
        wishlist: true,
        syncedAt: Date.now(),
      });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.migrateFavoritesToWishlist,
        { cursor: page.continueCursor },
      );
    }
  },
});

/**
 * One-off: strip the deprecated `chatReady` field from every game.
 *
 * Runs while `chatReady` is still (transiently) in the schema as optional, so
 * the field can then be removed from the schema without failing validation on
 * documents that still carry it. `patch({ chatReady: undefined })` deletes it.
 * Self-draining via the pagination cursor — kick it once with no args and it
 * reschedules until the whole table is done.
 */
export const clearChatReady = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }): Promise<void> => {
    const page = await ctx.db
      .query("games")
      .paginate({ numItems: 500, cursor: cursor ?? null });
    for (const g of page.page) {
      if (g.chatReady !== undefined) {
        await ctx.db.patch("games", g._id, { chatReady: undefined });
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.clearChatReady, {
        cursor: page.continueCursor,
      });
    }
  },
});

// One-off: set `hasExpansions` on base games from existing expansion links.
export const backfillHasExpansions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("games").take(2000);
    const parents = new Set<Id<"games">>();
    for (const g of all) if (g.isExpansion && g.parentId) parents.add(g.parentId);
    let updated = 0;
    for (const g of all) {
      const has = parents.has(g._id);
      if ((g.hasExpansions ?? false) !== has) {
        await ctx.db.patch("games", g._id, { hasExpansions: has });
        updated++;
      }
    }
    return { updated };
  },
});

/**
 * One-off: set `isStub: false` on every existing game.
 *
 * Required before the catalogue can read through `by_isStub_and_isExpansion` —
 * an index lookup on `isStub === false` does not match rows where the field is
 * absent, so without this backfill the library would come back empty.
 */
export const backfillIsStub = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("games").take(5000);
    let updated = 0;
    for (const g of all) {
      if (g.isStub === undefined) {
        await ctx.db.patch("games", g._id, { isStub: false });
        updated++;
      }
    }
    return { scanned: all.length, updated };
  },
});

/**
 * One-off: import users exported from the old Clerk/Mongo app (see
 * `convex/data/oldUsers.ts`). Match by email; **patch** an existing row's mapped
 * fields (never its `role`/auth/`emailVerificationTime`), or **insert** a reserved
 * row (`importedAt` + `emailVerificationTime` so Google sign-in auto-adopts it —
 * see `convex/auth.ts`). Usernames that are invalid or already taken are skipped.
 * Idempotent: re-running only patches. Run: `npx convex run migrations:importOldUsers`.
 */
export const importOldUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Dedupe input by email, keeping the most recently updated record.
    const byEmail = new Map<string, (typeof OLD_USERS)[number]>();
    for (const u of OLD_USERS) {
      const prev = byEmail.get(u.email);
      if (!prev || u.updatedAt > prev.updatedAt) byEmail.set(u.email, u);
    }

    let inserted = 0;
    let patched = 0;
    let usernamesSkipped = 0;
    const assignedLower = new Set<string>();

    for (const u of byEmail.values()) {
      const name =
        [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || undefined;

      // Resolve a usable username: valid format, and not already held by a
      // different account (or claimed earlier in this run).
      let username: string | undefined;
      let usernameLower: string | undefined;
      if (u.username && USERNAME_RE.test(u.username)) {
        const lower = u.username.toLowerCase();
        const clash = await ctx.db
          .query("users")
          .withIndex("by_username_lower", (q) => q.eq("usernameLower", lower))
          .first();
        if ((clash && clash.email !== u.email) || assignedLower.has(lower)) {
          usernamesSkipped++;
        } else {
          username = u.username;
          usernameLower = lower;
          assignedLower.add(lower);
        }
      } else if (u.username) {
        usernamesSkipped++;
      }

      const existing = (
        await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", u.email))
          .collect()
      )[0];

      const tokenFields = {
        ...(u.tokensUsedToday != null ? { tokensUsedToday: u.tokensUsedToday } : {}),
        ...(u.tokensResetAt != null ? { tokensResetAt: u.tokensResetAt } : {}),
      };

      if (existing) {
        // Override only the mapped fields; leave role/auth/avatar untouched.
        await ctx.db.patch("users", existing._id, {
          ...(name ? { name } : {}),
          ...(username ? { username, usernameLower } : {}),
          ...tokenFields,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        });
        patched++;
      } else {
        await ctx.db.insert("users", {
          email: u.email,
          ...(name ? { name } : {}),
          ...(username ? { username, usernameLower } : {}),
          role: "user",
          emailVerificationTime: u.createdAt,
          importedAt: Date.now(),
          ...tokenFields,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        });
        inserted++;
      }
    }

    return { total: byEmail.size, inserted, patched, usernamesSkipped };
  },
});
