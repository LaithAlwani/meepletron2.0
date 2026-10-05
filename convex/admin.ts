import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { finite } from "./lib/num";
import { monthKey, foldTokens, type TokensByModel } from "./lib/stats";

// Approximate USD pricing per 1M tokens. Update as provider pricing changes.
const PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-embedding-001": { input: 0.15, output: 0 },
};

const USAGE_SAMPLE = 20000;

function rowCost(model: string, promptTokens: number, completionTokens: number) {
  const p = PRICING[model];
  if (!p) return 0;
  return (finite(promptTokens) / 1e6) * p.input + (finite(completionTokens) / 1e6) * p.output;
}

const SCAN_CAP = 20000;

/** Sum a per-model token map into totals + estimated cost at current pricing. */
function sumTokens(m: TokensByModel | undefined) {
  let input = 0;
  let output = 0;
  let cost = 0;
  for (const [model, t] of Object.entries(m ?? {})) {
    input += finite(t.input);
    output += finite(t.output);
    cost += rowCost(model, t.input, t.output);
  }
  return { input, output, cost };
}

/**
 * Admin dashboard totals: users, games/expansions, messages (by role), and AI
 * token input/output for the current month + all time (+ est. cost).
 *
 * Reads denormalized counters — the running `adminCounters`/`usageMonthly` rows
 * (maintained on message/usage writes; backfill via `admin.backfillStats`), the
 * catalogue totals stamped by the daily recompute cron, and the `userStats`
 * singleton stamped by the daily `recomputeUserCounters` cron — so it touches a
 * handful of small docs instead of scanning messages/usageLog/games/users (and
 * no longer re-runs when those high-write tables change). Falls back to a live
 * users scan only until that cron has stamped `userStats` once (e.g. right after
 * this ships). `monthStart` is passed in since queries can't read wall-clock.
 */
export const dashboardStats = query({
  args: { monthStart: v.number() },
  handler: async (ctx, { monthStart }) => {
    await requireAdmin(ctx);

    const [catalogue, counters, monthly, userStats] = await Promise.all([
      ctx.db.query("catalogueStats").first(),
      ctx.db.query("adminCounters").first(),
      ctx.db
        .query("usageMonthly")
        .withIndex("by_month", (q) => q.eq("month", monthKey(monthStart)))
        .first(),
      ctx.db.query("userStats").first(),
    ]);

    // Prefer the daily-stamped counter; bridge with a live scan until it exists.
    let users: number;
    let registeredUsers: number;
    let guestUsers: number;
    if (userStats) {
      users = userStats.users;
      registeredUsers = userStats.registered;
      guestUsers = userStats.guests;
    } else {
      const rows = await ctx.db.query("users").take(SCAN_CAP);
      guestUsers = rows.filter((u) => u.isAnonymous === true).length;
      users = rows.length;
      registeredUsers = users - guestUsers;
    }

    const total = sumTokens(counters?.tokensByModel);
    const month = sumTokens(monthly?.tokensByModel);

    return {
      users,
      registeredUsers,
      guestUsers,
      baseGames: catalogue?.baseGameCount ?? 0,
      expansions: catalogue?.expansionCount ?? 0,
      messages: {
        total: counters?.messagesTotal ?? 0,
        byUser: counters?.messagesByUser ?? 0,
        byAi: counters?.messagesByAi ?? 0,
      },
      tokensMonth: { input: month.input, output: month.output },
      tokensTotal: { input: total.input, output: total.output },
      costMonth: month.cost,
      costTotal: total.cost,
    };
  },
});

/**
 * One-time (idempotent) backfill of the denormalized dashboard counters from the
 * existing messages + usageLog rows. Run after deploying the counter code:
 *
 *   npx convex run admin:backfillStats            (dev)
 *   npx convex run admin:backfillStats --prod      (prod)
 *
 * Re-runnable: it resets the counters and rebuilds from scratch each call. The
 * catalogue counts (base/expansion) are stamped separately by the daily
 * recomputeSimilarGames cron — run `games:recomputeSimilarGames` if needed.
 */
export const backfillStats = internalMutation({
  args: {},
  handler: async (ctx) => {
    let msgUser = 0;
    let msgAi = 0;
    for (const m of await ctx.db.query("messages").take(SCAN_CAP)) {
      if (m.role === "user") msgUser++;
      else msgAi++;
    }

    let allTime: TokensByModel = {};
    const byMonth = new Map<string, TokensByModel>();
    for (const r of await ctx.db.query("usageLog").take(SCAN_CAP)) {
      const row = [
        { model: r.model, input: r.promptTokens, output: r.completionTokens },
      ];
      allTime = foldTokens(allTime, row);
      const mk = monthKey(r._creationTime);
      byMonth.set(mk, foldTokens(byMonth.get(mk) ?? {}, row));
    }

    // Reset + write the counters singleton.
    const existing = await ctx.db.query("adminCounters").first();
    const counterDoc = {
      messagesTotal: msgUser + msgAi,
      messagesByUser: msgUser,
      messagesByAi: msgAi,
      tokensByModel: allTime,
    };
    if (existing) await ctx.db.patch("adminCounters", existing._id, counterDoc);
    else await ctx.db.insert("adminCounters", counterDoc);

    // Reset + rewrite the monthly buckets.
    for (const old of await ctx.db.query("usageMonthly").take(SCAN_CAP)) {
      await ctx.db.delete("usageMonthly", old._id);
    }
    for (const [month, tokensByModel] of byMonth) {
      await ctx.db.insert("usageMonthly", { month, tokensByModel });
    }

    return {
      messages: { byUser: msgUser, byAi: msgAi },
      months: byMonth.size,
    };
  },
});

/**
 * Guest active/empty split for the dashboard. Reads the daily-stamped
 * `userStats` singleton (see `recomputeUserCounters`) so it no longer scans
 * users + a chats query per guest on every load. Falls back to the live scan
 * only until that cron has stamped `userStats` once.
 */
export const adminGuestStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const stats = await ctx.db.query("userStats").first();
    if (stats) return { active: stats.activeGuests, empty: stats.emptyGuests };

    // Bridge until the daily recompute has run once.
    const guests = (await ctx.db.query("users").take(SCAN_CAP)).filter(
      (u) => u.isAnonymous === true,
    );
    let active = 0;
    let empty = 0;
    for (const g of guests) {
      const chats = await ctx.db
        .query("chats")
        .withIndex("by_user", (q) => q.eq("userId", g._id))
        .take(50);
      if (chats.some((c) => (c.lastMessageAt ?? 0) > 0)) active++;
      else empty++;
    }
    return { active, empty };
  },
});

/**
 * Aggregate recent LLM usage by purpose and model, with estimated cost.
 * Bounded to the latest {USAGE_SAMPLE} rows — move to @convex-dev/aggregate if
 * the log grows very large and you need all-time totals.
 */
export const usageSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("usageLog").order("desc").take(USAGE_SAMPLE);

    const byPurpose = new Map<string, { calls: number; tokens: number; cost: number }>();
    const byModel = new Map<string, { calls: number; tokens: number; cost: number }>();
    let totalTokens = 0;
    let totalCost = 0;

    for (const r of rows) {
      const rowTokens = finite(r.totalTokens);
      const cost = rowCost(r.model, r.promptTokens, r.completionTokens);
      totalTokens += rowTokens;
      totalCost += cost;

      const pp = byPurpose.get(r.purpose) ?? { calls: 0, tokens: 0, cost: 0 };
      pp.calls += 1;
      pp.tokens += rowTokens;
      pp.cost += cost;
      byPurpose.set(r.purpose, pp);

      const mm = byModel.get(r.model) ?? { calls: 0, tokens: 0, cost: 0 };
      mm.calls += 1;
      mm.tokens += rowTokens;
      mm.cost += cost;
      byModel.set(r.model, mm);
    }

    return {
      sampled: rows.length,
      capped: rows.length >= USAGE_SAMPLE,
      totalTokens,
      totalCost,
      byPurpose: [...byPurpose.entries()].map(([purpose, v]) => ({ purpose, ...v })),
      byModel: [...byModel.entries()].map(([model, v]) => ({ model, ...v })),
    };
  },
});

/**
 * Per-rulebook ingestion cost. Each ingestion draft stores the total Gemini
 * parse usage for that PDF (`geminiUsage`); embedding is negligible and the API
 * reports 0 tokens for it, so this is effectively the full ingestion cost.
 */
export const ingestionCosts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const drafts = await ctx.db.query("migrationDrafts").order("desc").take(200);

    let totalTokens = 0;
    let totalCost = 0;
    const rows = [];
    for (const d of drafts) {
      const u = d.geminiUsage;
      const promptTokens = finite(u?.promptTokens);
      const completionTokens = finite(u?.completionTokens);
      const tokens = finite(u?.totalTokens) || promptTokens + completionTokens;
      const cost = rowCost("gemini-2.5-flash", promptTokens, completionTokens);
      const rb = await ctx.db.get("rulebooks", d.rulebookId);
      rows.push({
        id: d._id as string,
        gameTitle: d.gameTitle,
        rulebook: rb?.label ?? "—",
        pages: d.totalPages ?? null,
        status: d.status,
        tokens,
        cost,
      });
      totalTokens += tokens;
      totalCost += cost;
    }
    return { rows, totalTokens, totalCost };
  },
});
