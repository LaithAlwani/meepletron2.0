import { finite } from "./num";

/**
 * Approximate USD pricing per 1M tokens by model (standard tier). Update as
 * provider pricing changes. Shared by the admin dashboard cost estimate and the
 * per-message admin readout so both price the model that was actually used.
 */
export const PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 }, // retired; kept for old usage rows
  "gemini-3.5-flash": { input: 1.5, output: 9.0 }, // deprecated; kept for old usage rows
  // Standard tier is $1.50 / $7.50 per 1M; a 50% launch promo currently halves
  // both. Reflect the promo so the admin readout matches real billing — restore
  // to { input: 1.5, output: 7.5 } when the discount ends.
  "gemini-3.6-flash": { input: 0.75, output: 3.75 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-embedding-001": { input: 0.15, output: 0 },
};

/** USD cost of one model call. Unknown models cost 0 (so a new id can't crash). */
export function rowCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (
    (finite(promptTokens) / 1e6) * p.input +
    (finite(completionTokens) / 1e6) * p.output
  );
}
