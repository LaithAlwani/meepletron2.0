import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { finite } from "./lib/num";

// Approximate USD pricing per 1M tokens. Update as provider pricing changes.
const PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-embedding-001": { input: 0.15, output: 0 },
};

const USAGE_SAMPLE = 20000;

function rowCost(model: string, promptTokens: number, completionTokens: number) {
  const p = PRICING[model];
  if (!p) return 0;
  return (finite(promptTokens) / 1e6) * p.input + (finite(completionTokens) / 1e6) * p.output;
}

const SCAN_CAP = 20000;

/**
 * Admin dashboard totals: users, games/expansions, messages (by role), and AI
 * token input/output for the current month + all time (+ est. cost). `monthStart`
 * is passed in (queries can't read wall-clock). Bounded scans — fine at this
 * scale; move to @convex-dev/aggregate if any table grows past ~16k rows.
 */
export const dashboardStats = query({
  args: { monthStart: v.number() },
  handler: async (ctx, { monthStart }) => {
    await requireAdmin(ctx);

    const [baseGames, expansions, users] = await Promise.all([
      ctx.db
        .query("games")
        .withIndex("by_isExpansion", (q) => q.eq("isExpansion", false))
        .take(SCAN_CAP),
      ctx.db
        .query("games")
        .withIndex("by_isExpansion", (q) => q.eq("isExpansion", true))
        .take(SCAN_CAP),
      ctx.db.query("users").take(SCAN_CAP),
    ]);

    let msgTotal = 0;
    let msgUser = 0;
    let msgAi = 0;
    for (const m of await ctx.db.query("messages").take(SCAN_CAP)) {
      msgTotal++;
      if (m.role === "user") msgUser++;
      else msgAi++;
    }

    let inTotal = 0;
    let outTotal = 0;
    let inMonth = 0;
    let outMonth = 0;
    let costTotal = 0;
    let costMonth = 0;
    for (const r of await ctx.db.query("usageLog").take(SCAN_CAP)) {
      const inp = finite(r.promptTokens);
      const out = finite(r.completionTokens);
      const c = rowCost(r.model, r.promptTokens, r.completionTokens);
      inTotal += inp;
      outTotal += out;
      costTotal += c;
      if (r._creationTime >= monthStart) {
        inMonth += inp;
        outMonth += out;
        costMonth += c;
      }
    }

    const guestUsers = users.filter((u) => u.isAnonymous === true).length;

    return {
      users: users.length,
      registeredUsers: users.length - guestUsers,
      guestUsers,
      baseGames: baseGames.length,
      expansions: expansions.length,
      messages: { total: msgTotal, byUser: msgUser, byAi: msgAi },
      tokensMonth: { input: inMonth, output: outMonth },
      tokensTotal: { input: inTotal, output: outTotal },
      costMonth,
      costTotal,
    };
  },
});

/**
 * Split anonymous guests into "active" (sent at least one message) vs "empty"
 * (never messaged — almost all bots/crawlers/link-unfurlers). Kept out of the
 * hot `dashboardStats` query because it joins users→chats. Bounded scan — fine
 * at this scale, and the 48h empty-guest purge keeps `empty` small; move to
 * @convex-dev/aggregate if guests ever pass ~16k rows.
 */
export const adminGuestStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
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
