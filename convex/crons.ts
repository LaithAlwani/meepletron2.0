import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Reset every user's daily token budget at UTC midnight.
crons.daily(
  "reset daily token budgets",
  { hourUTC: 0, minuteUTC: 0 },
  internal.maintenance.resetDailyBudgets,
  {},
);

// Purge abandoned ingestion drafts a few hours later (off-peak).
crons.daily(
  "clean up stale ingestion drafts",
  { hourUTC: 3, minuteUTC: 0 },
  internal.maintenance.cleanupStaleDrafts,
  {},
);

// Purge empty (never-messaged) anonymous guests — bots/crawlers (off-peak,
// just before the abandoned-guest sweep).
crons.daily(
  "clean up empty guests",
  { hourUTC: 3, minuteUTC: 15 },
  internal.maintenance.cleanupEmptyGuests,
  {},
);

// Purge long-abandoned anonymous guests (off-peak).
crons.daily(
  "clean up abandoned guests",
  { hourUTC: 3, minuteUTC: 30 },
  internal.maintenance.cleanupAbandonedGuests,
  {},
);

// Fail BGG sync jobs whose action died, so the UI stops showing a spinner that
// will never resolve. (`crons.cron` rather than the `crons.daily` above — the
// Convex guidelines allow only `interval`/`cron`; the existing four predate it.)
crons.cron(
  "fail stalled bgg sync jobs",
  "*/15 * * * *",
  internal.bggSync.failStalledJobs,
  {},
);

export default crons;
