import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Skip every cron on deployments where CRONS_DISABLED is set — e.g. dev, so it
// doesn't burn database bandwidth mirroring prod's background work. Set it on the
// dev deployment only: `npx convex env set CRONS_DISABLED 1`. Prod leaves it unset.
if (!process.env.CRONS_DISABLED) {
  // Reset every user's daily token budget at UTC midnight.
  crons.daily(
    "reset daily token budgets",
    { hourUTC: 0, minuteUTC: 0 },
    internal.maintenance.resetDailyBudgets,
    {},
  );

  // Purge abandoned ingestion drafts a few hours later (off-peak). Cheap (reads a
  // small table), so it stays daily.
  crons.daily(
    "clean up stale ingestion drafts",
    { hourUTC: 3, minuteUTC: 0 },
    internal.maintenance.cleanupStaleDrafts,
    {},
  );

  // Purge empty (never-messaged) anonymous guests — bots/crawlers. Each run scans
  // the whole users table, so it's weekly rather than daily; guests don't need
  // purging that often.
  crons.weekly(
    "clean up empty guests",
    { dayOfWeek: "monday", hourUTC: 3, minuteUTC: 15 },
    internal.maintenance.cleanupEmptyGuests,
    {},
  );

  // Purge long-abandoned anonymous guests (also a full users scan → weekly).
  crons.weekly(
    "clean up abandoned guests",
    { dayOfWeek: "monday", hourUTC: 3, minuteUTC: 30 },
    internal.maintenance.cleanupAbandonedGuests,
    {},
  );

  // Refresh the stalest games' BGG stats. BGG ratings barely move, so a slow
  // cadence is fine (every 3 days) — the index range scan in dueForRefresh keeps
  // each run cheap.
  crons.interval(
    "refresh stale bgg stats",
    { hours: 72 },
    internal.bgg.refreshStale,
    {},
  );

  // Backstop for stub enrichment: fill any BGG-synced stub games that a sync's own
  // self-draining sweep missed or that failed transiently (they back off via
  // bggCheckedAt and retry here). It's only a backstop and each run reads up to
  // 500 stub docs, so daily is plenty (was every 6h).
  crons.daily(
    "enrich bgg stub games",
    { hourUTC: 5, minuteUTC: 0 },
    internal.bggSync.enrichStubs,
    {},
  );

  // Drop rate-limit counters whose window has closed. Rows are keyed per user,
  // so this is what stops the table growing with every guest who imports a game.
  crons.daily(
    "prune rate limit counters",
    { hourUTC: 4, minuteUTC: 30 },
    internal.rateLimit.pruneExpired,
    {},
  );

  // Recompute the denormalized "similar games" ranking + reconcile the cached
  // catalogue count. Rankings barely change day to day, so every 3 days is plenty
  // (the count stays live between runs via the +1/-1 hooks in create/update/delete
  // Game). Each run reads the whole ~2,000-game catalogue.
  crons.interval(
    "recompute similar games",
    { hours: 72 },
    internal.games.recomputeSimilarGames,
    {},
  );
}

export default crons;
