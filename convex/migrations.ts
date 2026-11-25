import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Stage 1 of dropping deprecated fields/tables: clear the data so a later
 * deploy can remove them from the schema. One self-rescheduling mutation walks
 * each table in turn, ~200 docs per transaction, writing only docs that still
 * carry deprecated data. Idempotent — safe to re-run. Run once per deployment:
 *   npx convex run migrations:clearDeprecated '{}'
 *
 *   users        tokensUsedToday, tokensResetAt (budget moved to userBudgets)
 *   games        description (copied into gameContent first if it lacks one)
 *   bggAccounts  playsSyncedAt, playsCount, playsSyncedThrough (plays removed)
 *   bggSyncJobs  enrichQueue (moved to bggEnrichQueue); kind "plays" rows deleted
 *   gameFaqs     helpful, notHelpful (vote tallies; voting removed)
 *   faqVotes     every row deleted (voting removed)
 */
const PHASES = [
  "users",
  "games",
  "bggAccounts",
  "bggSyncJobs",
  "gameFaqs",
  "faqVotes",
] as const;
type Phase = (typeof PHASES)[number];

const BATCH = 200;

export const clearDeprecated = internalMutation({
  args: {
    phase: v.optional(
      v.union(
        v.literal("users"),
        v.literal("games"),
        v.literal("bggAccounts"),
        v.literal("bggSyncJobs"),
        v.literal("gameFaqs"),
        v.literal("faqVotes"),
      ),
    ),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const phase: Phase = args.phase ?? "users";
    const opts = { numItems: BATCH, cursor: args.cursor ?? null };
    let changed = 0;
    let res: { isDone: boolean; continueCursor: string };

    switch (phase) {
      case "users": {
        const page = await ctx.db.query("users").paginate(opts);
        for (const u of page.page) {
          if (u.tokensUsedToday === undefined && u.tokensResetAt === undefined) {
            continue;
          }
          await ctx.db.patch("users", u._id, {
            tokensUsedToday: undefined,
            tokensResetAt: undefined,
          });
          changed++;
        }
        res = page;
        break;
      }
      case "games": {
        const page = await ctx.db.query("games").paginate(opts);
        for (const g of page.page) {
          if (g.description === undefined) continue;
          const content = await ctx.db
            .query("gameContent")
            .withIndex("by_game", (q) => q.eq("gameId", g._id))
            .first();
          if (!content) {
            await ctx.db.insert("gameContent", {
              gameId: g._id,
              description: g.description,
            });
          } else if (content.description === undefined) {
            await ctx.db.patch("gameContent", content._id, {
              description: g.description,
            });
          }
          await ctx.db.patch("games", g._id, { description: undefined });
          changed++;
        }
        res = page;
        break;
      }
      case "bggAccounts": {
        const page = await ctx.db.query("bggAccounts").paginate(opts);
        for (const a of page.page) {
          if (
            a.playsSyncedAt === undefined &&
            a.playsCount === undefined &&
            a.playsSyncedThrough === undefined
          ) {
            continue;
          }
          await ctx.db.patch("bggAccounts", a._id, {
            playsSyncedAt: undefined,
            playsCount: undefined,
            playsSyncedThrough: undefined,
          });
          changed++;
        }
        res = page;
        break;
      }
      case "bggSyncJobs": {
        const page = await ctx.db.query("bggSyncJobs").paginate(opts);
        for (const j of page.page) {
          if (j.kind === "plays") {
            await ctx.db.delete("bggSyncJobs", j._id);
            changed++;
          } else if (j.enrichQueue !== undefined) {
            await ctx.db.patch("bggSyncJobs", j._id, { enrichQueue: undefined });
            changed++;
          }
        }
        res = page;
        break;
      }
      case "gameFaqs": {
        const page = await ctx.db.query("gameFaqs").paginate(opts);
        for (const f of page.page) {
          if (f.helpful === undefined && f.notHelpful === undefined) continue;
          await ctx.db.patch("gameFaqs", f._id, {
            helpful: undefined,
            notHelpful: undefined,
          });
          changed++;
        }
        res = page;
        break;
      }
      case "faqVotes": {
        const page = await ctx.db.query("faqVotes").paginate(opts);
        for (const vote of page.page) {
          await ctx.db.delete("faqVotes", vote._id);
          changed++;
        }
        res = page;
        break;
      }
    }

    if (!res.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.clearDeprecated, {
        phase,
        cursor: res.continueCursor,
      });
    } else {
      const next = PHASES[PHASES.indexOf(phase) + 1];
      if (next) {
        await ctx.scheduler.runAfter(0, internal.migrations.clearDeprecated, {
          phase: next,
          cursor: null,
        });
      }
    }
    return { phase, changed, isDone: res.isDone };
  },
});
