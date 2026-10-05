/**
 * Default values + helpers for the runtime-tunable chat/RAG config (the
 * `siteConfig` singleton). Shared by the admin read/write (`siteConfig.ts`) and
 * the runtime reader (`chat.getActiveConfig`) so the two can never drift. Plain
 * data/logic — no server imports — so it's safe to import from anywhere.
 */
export type ChatModelId =
  | "gemini-2.5-flash"
  | "gemini-3.5-flash-lite"
  | "gemini-3.5-flash";

// The models offered in the admin picker. 2.5-flash-lite was retired by Google
// ("no longer available to new users"); 3.5 is the current generation. Note the
// 3.5 pricing shift: 3.5-flash-lite costs the same as 2.5-flash, and 3.5-flash
// is several times pricier — so a model swap is a quality choice, not a saving.
export const CHAT_MODEL_IDS: ChatModelId[] = [
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
];

export const CHAT_CONFIG_DEFAULTS = {
  // Retrieve a generous candidate set — the reranker reads the text and picks
  // the best few, so more candidates improves recall for casual phrasing.
  v2TopK: 20,
  v2ScoreThreshold: 0.05,
  rerankTopN: 5,
  historyMessageLimit: 6,
  // How many of the top-scoring candidates actually reach the reranker.
  rerankCandidates: 18,
  // Sampling temperature for the final answer. Low by default so the same
  // question gives consistent replies; raise for more varied phrasing.
  answerTemperature: 0.2,
  // Which model answers vs. runs the cheap auxiliary steps (rewrite + rerank).
  // Default to 2.5-flash: still supported and the cheapest proven option.
  answerModel: "gemini-2.5-flash" as ChatModelId,
  auxModel: "gemini-2.5-flash" as ChatModelId,
  // Thinking budget (tokens, billed as output) for the answer. 0 = off — the
  // default, since the answer is grounded on already-retrieved passages and
  // rarely needs chain-of-thought. -1 = dynamic/auto; a positive value caps it.
  answerThinkingBudget: 0,
};

/** Coerce a stored/unknown model id to a supported one (falls back to the
 *  default), so a retired id lingering in the DB can't break the chat. */
export function knownModel(id: string | undefined | null): ChatModelId {
  return id && (CHAT_MODEL_IDS as readonly string[]).includes(id)
    ? (id as ChatModelId)
    : CHAT_CONFIG_DEFAULTS.answerModel;
}

/**
 * Normalize a thinking budget for the given model. The *-flash-lite models
 * reject a 0 budget ("invalid argument") — they can't fully disable thinking —
 * so clamp 0..511 up to the 512 minimum. -1 (dynamic) and valid values pass
 * through. Non-lite models accept 0 (thinking off) unchanged.
 */
export function thinkingBudgetFor(modelId: string, requested: number): number {
  if (modelId.includes("flash-lite") && requested >= 0 && requested < 512) {
    return 512;
  }
  return requested;
}
