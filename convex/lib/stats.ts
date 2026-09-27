import type { MutationCtx } from "../_generated/server";
import { finite } from "./num";

/** Per-model token totals, as stored on adminCounters / usageMonthly. */
export type TokensByModel = Record<string, { input: number; output: number }>;

/** "YYYY-MM" (UTC) for a timestamp — the usageMonthly key. */
export function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Fold a set of {model, input, output} rows into a TokensByModel map. */
export function foldTokens(
  base: TokensByModel,
  rows: { model: string; input: number; output: number }[],
): TokensByModel {
  const out: TokensByModel = { ...base };
  for (const r of rows) {
    const cur = out[r.model] ?? { input: 0, output: 0 };
    out[r.model] = {
      input: cur.input + finite(r.input),
      output: cur.output + finite(r.output),
    };
  }
  return out;
}

/** The admin counters singleton, created (zeroed) on first use. */
async function counterRow(ctx: MutationCtx) {
  const row = await ctx.db.query("adminCounters").first();
  if (row) return row;
  const id = await ctx.db.insert("adminCounters", {
    messagesTotal: 0,
    messagesByUser: 0,
    messagesByAi: 0,
    tokensByModel: {},
  });
  const created = await ctx.db.get("adminCounters", id);
  if (!created) throw new Error("adminCounters row vanished after insert");
  return created;
}

/**
 * Adjust the message counters by the given deltas (negative to subtract on
 * delete). No-ops when both are zero so bulk deletes of empty chats stay cheap.
 */
export async function recordMessages(
  ctx: MutationCtx,
  d: { user?: number; ai?: number },
): Promise<void> {
  const user = d.user ?? 0;
  const ai = d.ai ?? 0;
  if (user === 0 && ai === 0) return;
  const c = await counterRow(ctx);
  await ctx.db.patch("adminCounters", c._id, {
    messagesByUser: Math.max(0, c.messagesByUser + user),
    messagesByAi: Math.max(0, c.messagesByAi + ai),
    messagesTotal: Math.max(0, c.messagesTotal + user + ai),
  });
}

/**
 * Add LLM usage to the all-time counters and the current month's bucket. Rows
 * are aggregated per model. Called from the same mutation that writes usageLog.
 */
export async function recordUsage(
  ctx: MutationCtx,
  rows: { model: string; promptTokens: number; completionTokens: number }[],
): Promise<void> {
  if (rows.length === 0) return;
  const folded = rows.map((r) => ({
    model: r.model,
    input: finite(r.promptTokens),
    output: finite(r.completionTokens),
  }));

  const c = await counterRow(ctx);
  await ctx.db.patch("adminCounters", c._id, {
    tokensByModel: foldTokens(c.tokensByModel, folded),
  });

  const mk = monthKey(Date.now());
  const existing = await ctx.db
    .query("usageMonthly")
    .withIndex("by_month", (q) => q.eq("month", mk))
    .first();
  if (existing) {
    await ctx.db.patch("usageMonthly", existing._id, {
      tokensByModel: foldTokens(existing.tokensByModel, folded),
    });
  } else {
    await ctx.db.insert("usageMonthly", {
      month: mk,
      tokensByModel: foldTokens({}, folded),
    });
  }
}
