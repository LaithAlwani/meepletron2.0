/**
 * Default values + helpers for the runtime-tunable chat/RAG config (the
 * `siteConfig` singleton). Shared by the admin read/write (`siteConfig.ts`) and
 * the runtime reader (`chat.getActiveConfig`) so the two can never drift. Plain
 * data/logic — no server imports — so it's safe to import from anywhere.
 */
export type ChatModelId = "gemini-3.5-flash-lite" | "gemini-3.5-flash";

// Models for the cold, quality-critical path: rulebook PDF ingestion and the
// offline FAQ/glossary/reminder generators. These are low-volume (per manual /
// admin-triggered), so the full Flash models are the right pick — Lite's cost
// edge is irrelevant here and its quality is worse. 2.5-flash still works;
// 3.5-flash is the current-gen successor.
export type ContentModelId = "gemini-2.5-flash" | "gemini-3.5-flash";
export const CONTENT_MODEL_IDS: ContentModelId[] = [
  "gemini-2.5-flash",
  "gemini-3.5-flash",
];

// The models offered in the admin picker — the current (3.5) generation only.
// 3.5-flash-lite is the cheaper default ($0.30/$2.50 per 1M, same as the old
// 2.5-flash); 3.5-flash is the premium, several-times-pricier option. Note
// flash-lite can't fully disable thinking — its budget floors at 512 tokens.
export const CHAT_MODEL_IDS: ChatModelId[] = [
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
  // Default to 3.5-flash-lite: current-gen and the cheaper of the two options.
  answerModel: "gemini-3.5-flash-lite" as ChatModelId,
  auxModel: "gemini-3.5-flash-lite" as ChatModelId,
  // Ingestion + offline generators. Default to 2.5-flash (current behavior).
  contentModel: "gemini-2.5-flash" as ContentModelId,
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

/** Same coercion for the ingestion/generator (content) model. */
export function knownContentModel(id: string | undefined | null): ContentModelId {
  return id && (CONTENT_MODEL_IDS as readonly string[]).includes(id)
    ? (id as ContentModelId)
    : CHAT_CONFIG_DEFAULTS.contentModel;
}

/**
 * Normalize a thinking budget for the given model. The *-flash-lite models
 * reject a 0 budget ("invalid argument") — they can't fully disable thinking —
 * so clamp 0..511 up to the 512 minimum. -1 (dynamic) and valid values pass
 * through. Non-lite models accept 0 (thinking off) unchanged.
 */
export function thinkingBudgetFor(modelId: string, requested: number): number {
  // Must be an INT32 token count — a fractional value errors at the API, so
  // round defensively before anything else.
  const b = Math.round(requested);
  if (modelId.includes("flash-lite") && b >= 0 && b < 512) return 512;
  return b;
}
