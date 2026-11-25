import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { finite } from "./num";

/** Per-model token totals, as stored on adminCounters / usageMonthly. */
export type TokensByModel = Record<string, { input: number; output: number }>;

/**
 * adminCounters / usageMonthly are written on every chat message, so each is
 * split into COUNTER_SHARDS rows: a writer bumps one shard picked at random and
 * readers sum them all (plus the legacy unsharded rows, which are left as-is —
 * no migration). Per-shard values may go negative (a delete can land on a
 * different shard than the insert); only the SUM is meaningful.
 */
export const COUNTER_SHARDS = 8;

function pickShard(): number {
  return Math.floor(Math.random() * COUNTER_SHARDS);
}

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

/** Sum several per-model token maps (e.g. every counter shard). */
export function mergeTokens(maps: (TokensByModel | undefined)[]): TokensByModel {
  let out: TokensByModel = {};
  for (const m of maps) {
    out = foldTokens(
      out,
      Object.entries(m ?? {}).map(([model, t]) => ({
        model,
        input: t.input,
        output: t.output,
      })),
    );
  }
  return out;
}

/** Sum adminCounters rows (legacy singleton + shards) into one total. */
export function sumCounterRows(rows: Doc<"adminCounters">[]) {
  let messagesTotal = 0;
  let messagesByUser = 0;
  let messagesByAi = 0;
  for (const r of rows) {
    messagesTotal += finite(r.messagesTotal);
    messagesByUser += finite(r.messagesByUser);
    messagesByAi += finite(r.messagesByAi);
  }
  return {
    messagesTotal: Math.max(0, messagesTotal),
    messagesByUser: Math.max(0, messagesByUser),
    messagesByAi: Math.max(0, messagesByAi),
    tokensByModel: mergeTokens(rows.map((r) => r.tokensByModel)),
  };
}

/** A random adminCounters shard row, created (zeroed) on first use. */
async function counterShard(ctx: MutationCtx) {
  const shard = pickShard();
  const row = await ctx.db
    .query("adminCounters")
    .withIndex("by_shard", (q) => q.eq("shard", shard))
    .first();
  if (row) return row;
  const id = await ctx.db.insert("adminCounters", {
    shard,
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
  const c = await counterShard(ctx);
  await ctx.db.patch("adminCounters", c._id, {
    messagesByUser: c.messagesByUser + user,
    messagesByAi: c.messagesByAi + ai,
    messagesTotal: c.messagesTotal + user + ai,
  });
}

/**
 * Add LLM usage to the all-time counters and the current month's bucket. Rows
 * are aggregated per model. Called from the same mutation that writes usageLog.
 * `messages` optionally folds message-count deltas into the SAME adminCounters
 * patch, so a saved answer costs one counter write instead of two.
 */
export async function recordUsage(
  ctx: MutationCtx,
  rows: { model: string; promptTokens: number; completionTokens: number }[],
  messages: { user?: number; ai?: number } = {},
): Promise<void> {
  const user = messages.user ?? 0;
  const ai = messages.ai ?? 0;
  if (rows.length === 0 && user === 0 && ai === 0) return;
  const folded = rows.map((r) => ({
    model: r.model,
    input: finite(r.promptTokens),
    output: finite(r.completionTokens),
  }));

  const c = await counterShard(ctx);
  await ctx.db.patch("adminCounters", c._id, {
    ...(folded.length > 0
      ? { tokensByModel: foldTokens(c.tokensByModel, folded) }
      : {}),
    ...(user !== 0 || ai !== 0
      ? {
          messagesByUser: c.messagesByUser + user,
          messagesByAi: c.messagesByAi + ai,
          messagesTotal: c.messagesTotal + user + ai,
        }
      : {}),
  });
  if (folded.length === 0) return;

  const mk = monthKey(Date.now());
  const shard = pickShard();
  const existing = await ctx.db
    .query("usageMonthly")
    .withIndex("by_month_and_shard", (q) => q.eq("month", mk).eq("shard", shard))
    .first();
  if (existing) {
    await ctx.db.patch("usageMonthly", existing._id, {
      tokensByModel: foldTokens(existing.tokensByModel, folded),
    });
  } else {
    await ctx.db.insert("usageMonthly", {
      month: mk,
      shard,
      tokensByModel: foldTokens({}, folded),
    });
  }
}
