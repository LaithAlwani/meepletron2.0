/**
 * Default values for the runtime-tunable chat/RAG config (the `siteConfig`
 * singleton). Shared by the admin read/write (`siteConfig.ts`) and the runtime
 * reader (`chat.getActiveConfig`) so the two can never drift. Plain data — no
 * server imports — so it's safe to import from anywhere.
 */
export type ChatModelId = "gemini-2.5-flash" | "gemini-2.5-flash-lite";

export const CHAT_MODEL_IDS: ChatModelId[] = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
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
  answerModel: "gemini-2.5-flash" as ChatModelId,
  auxModel: "gemini-2.5-flash" as ChatModelId,
  // Thinking budget (tokens, billed as output) for the answer. 0 = off — the
  // default, since the answer is grounded on already-retrieved passages and
  // rarely needs chain-of-thought. -1 = dynamic/auto; a positive value caps it.
  answerThinkingBudget: 0,
};
