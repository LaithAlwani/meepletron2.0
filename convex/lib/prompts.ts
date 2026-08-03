/**
 * Pure helpers for the RAG chat. No Convex ctx — safe to import anywhere.
 */

/** A retrieved chunk hydrated with its game title, ready for prompting/citation. */
export type RetrievedChunk = {
  gameId: string;
  rulebookId: string;
  bgTitle: string;
  breadcrumb?: string;
  page?: number;
  chunkType: string;
  scope: string;
  variantName?: string;
  text: string;
};

/** Bracketed ALL-CAPS iconography tokens, e.g. [WOOD], [VP]. */
export const ICON_TOKEN_REGEX = /\[[A-Z0-9][A-Z0-9 _/-]*\]/g;

/** Whether the answer likely needs the iconography legend as context. */
export function needsIconLegend(query: string, chunks: RetrievedChunk[]): boolean {
  if (ICON_TOKEN_REGEX.test(query)) return true;
  return chunks.some((c) => ICON_TOKEN_REGEX.test(c.text));
}

function chunkHeader(c: RetrievedChunk): string {
  return [
    c.bgTitle,
    c.breadcrumb,
    c.page ? `p.${c.page}` : null,
    c.scope === "variant" && c.variantName ? `Variant: ${c.variantName}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Number each chunk as [n] with a header + body, for the answer prompt. */
export function formatContext(
  chunks: RetrievedChunk[],
  legendChunks: RetrievedChunk[],
): string {
  const numbered = chunks
    .map((c, i) => `[${i + 1}] ${chunkHeader(c) || "(untitled)"}\n${c.text}`)
    .join("\n\n---\n\n");

  if (legendChunks.length === 0) return numbered;

  const legend = legendChunks
    .map((c) => `${chunkHeader(c) || "Iconography"}\n${c.text}`)
    .join("\n\n");

  return `${numbered}\n\n=== ICONOGRAPHY / LEGEND (reference — do not cite) ===\n${legend}`;
}

/** The system prompt: strictly grounded, cited, refuse-when-absent. */
export function buildSystemPrompt(sourceTitles: string[], context: string): string {
  const sources =
    sourceTitles.length > 0 ? sourceTitles.join(", ") : "the loaded rulebook(s)";
  return `You are Meepletron, a board game rules assistant. Answer the user's rules question using the numbered passages in CONTEXT below, which come from: ${sources}.

How to interpret the question:
- Players ask in plain, casual language — they usually don't know the rulebook's exact terms. Interpret their intent charitably and map everyday words to the game's terminology. For example: "money/cash" ↔ coins, gold, resources; "guys/pieces/dudes/men" ↔ workers, meeples, tokens, figures; "points" ↔ victory points/score; "my go/my turn" ↔ turn, action, phase; "cards in my hand" ↔ hand limit. If a passage clearly covers the concept the player is asking about, ANSWER IT — even if it uses different words than the player did.
- Treat a wording difference as a match, not a gap. Only say you couldn't find it when the CONTEXT genuinely doesn't cover the concept at all — never just because the player phrased it casually.
- If the passages only partly cover the question, answer what they DO say and note what isn't specified, instead of refusing outright.

Grounding rules:
- Base every factual claim on the CONTEXT — don't invent rules or use outside knowledge about the game.
- Cite the passage(s) supporting each claim inline with bracketed numbers like [1] or [2][3], matching the passage numbers in CONTEXT.
- If the concept truly isn't covered, say you couldn't find it in the loaded rulebook(s) and suggest rephrasing or which rulebook to load. If the game/expansion's rulebook isn't among the sources, say it isn't loaded.
- Expand any bracketed iconography tokens (e.g. [WOOD], [VP]) into their meaning using the LEGEND when present.
- Be concise and clear. Use short paragraphs or bullet points. Do not restate the question.

CONTEXT:
${context}`;
}

/**
 * Query-expansion prompt: turn a player's casual, possibly context-dependent
 * question into a keyword-rich search query in rulebook vocabulary, so vector
 * search matches even when the player doesn't use the manual's exact terms.
 */
export function buildRewritePrompt(
  history: { role: string; content: string }[],
  query: string,
): string {
  // Only needed to resolve pronouns/references in a follow-up — a couple of
  // recent turns is plenty, and past answers are truncated to keep it cheap.
  const convo = history
    .slice(-3)
    .map((m) => {
      const who = m.role === "user" ? "Player" : "Assistant";
      const text = m.content.length > 200 ? `${m.content.slice(0, 200)}…` : m.content;
      return `${who}: ${text}`;
    })
    .join("\n");
  return `Rewrite the player's latest question into a concise search query for looking it up in a board game rulebook.

- Resolve pronouns and implicit references using the conversation (make it self-contained).
- Replace casual words with the terms a rulebook would use, and add likely synonyms (e.g. "guys/pieces/dudes" → "workers meeples tokens pieces"; "points" → "victory points score"; "cash/money" → "coins gold resources"; "cards left" → "deck hand limit").
- Output keywords and key phrases, not a full sentence. No quotes, no explanation.
- Output ONLY the search query.

${convo ? `Conversation:\n${convo}\n\n` : ""}Player's latest question: ${query}

Search query:`;
}

/** The reranker prompt (structured index output). */
export function buildRerankPrompt(
  query: string,
  chunks: RetrievedChunk[],
  n: number,
): string {
  // A short preview is enough to judge topical relevance; the full passage is
  // only sent to the answer model for the few that survive reranking. Keeping
  // this tight is the biggest per-question token saving (20 candidates add up).
  const PREVIEW = 350;
  const numbered = chunks
    .map((c, i) => {
      const body = c.text.length > PREVIEW ? `${c.text.slice(0, PREVIEW)}…` : c.text;
      return `[${i + 1}] ${chunkHeader(c) || "(no header)"}\n${body}`;
    })
    .join("\n\n---\n\n");

  return `You are reranking passages from a board game rulebook for a user's question. Pick the ${n} passages MOST relevant to actually answering the user. Prefer passages that directly state the rule over passages that merely mention the topic. If the question spans multiple sub-topics, prefer DIVERSE passages covering different sub-topics over near-duplicates.

Return the chosen passage numbers (1-based) in order of relevance.

User question: ${query}

Candidate passages:
${numbered}`;
}
