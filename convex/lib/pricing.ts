import { finite } from "./num";
import { CHAT_MODELS } from "./chatConfig";

/**
 * Approximate USD pricing per 1M tokens by model (standard tier). Update as
 * provider pricing changes. Shared by the admin dashboard cost estimate and the
 * per-message admin readout so both price the model that was actually used.
 *
 * The answer/aux models are seeded from the CHAT_MODELS registry so adding a
 * model there automatically prices it (no silent $0 for a newly-picked model).
 * The entries below are the non-registry ids: the Gemini-3.6 launch promo ($0.75
 * /$3.75 vs std $1.50/$7.50 — restore when it ends) is already the registry
 * price; the rest are retired/deprecated chat models kept for old usage rows,
 * plus the content/embedding models not in the chat picker.
 */
export const PRICING: Record<string, { input: number; output: number }> = {
  ...Object.fromEntries(
    CHAT_MODELS.map((m) => [m.id, { input: m.input, output: m.output }]),
  ),
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 }, // retired; kept for old usage rows
  "gemini-3.5-flash": { input: 1.5, output: 9.0 }, // deprecated; kept for old usage rows
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
