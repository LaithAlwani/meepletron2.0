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

// Purge long-abandoned anonymous guests (off-peak).
crons.daily(
  "clean up abandoned guests",
  { hourUTC: 3, minuteUTC: 30 },
  internal.maintenance.cleanupAbandonedGuests,
  {},
);

export default crons;
