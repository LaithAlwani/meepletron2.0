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

/**
 * Streaming-safe transformer that removes bracketed icon tokens from a model
 * answer (e.g. "[WOOD]" → "wood") so the prose reads naturally, while keeping
 * numeric citation markers ("[1]", "[2]") intact so the chips still render. The
 * answer prompt already asks the model to expand these tokens; this guarantees
 * it even when the model slips. A bracket group split across streamed deltas is
 * held in a buffer until it can be resolved.
 */
export function createIconTokenStripper() {
  // Characters allowed inside an icon-token / citation bracket (see regex above).
  const INNER = /[A-Z0-9 _/-]/;
  const MAX = 48; // never buffer more than a token's worth before giving up
  let pending = ""; // an in-progress "[…" not yet resolved

  function resolve(group: string): string {
    const inner = group.slice(1, -1);
    // Pure-digit groups are citation markers — keep them verbatim (for chips).
    if (/^[0-9]+$/.test(inner)) return group;
    // Anything with a letter is an icon token — drop brackets, lowercase it.
    return inner.toLowerCase();
  }

  function push(delta: string): string {
    let out = "";
    for (const ch of delta) {
      if (pending) {
        if (ch === "]") {
          out += resolve(pending + "]");
          pending = "";
        } else if (ch === "[") {
          out += pending; // abandon the old run as literal, start fresh
          pending = "[";
        } else if (INNER.test(ch) && pending.length < MAX) {
          pending += ch;
        } else {
          out += pending + ch; // not a token/citation — flush literally
          pending = "";
        }
      } else if (ch === "[") {
        pending = "[";
      } else {
        out += ch;
      }
    }
    return out;
  }

  /** Emit any unresolved buffer (call once the stream ends). */
  function flush(): string {
    const rest = pending;
    pending = "";
    return rest;
  }

  return { push, flush };
}

/** One-shot version of {@link createIconTokenStripper} for non-streamed text. */
export function stripIconTokens(text: string): string {
  const s = createIconTokenStripper();
  return s.push(text) + s.flush();
}

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
  return `You are Meepletron, a friendly board game rules expert. The player is chatting with you about: ${sources}. The CONTEXT below is the relevant text from that rulebook, numbered so you can reference it — treat it as the rulebook itself, and answer only from it.

Voice — talk like someone who knows the game, not a search engine:
- Have a natural conversation. NEVER mention how you got the information: don't say "passage", "excerpt", "context", "the text provided", "the sources", "the retrieved", "based on the documents", and never refer to a passage by number in your sentences ("passage 2 says…"). The player should feel like they're asking a knowledgeable friend, not querying a database.
- When it helps to attribute a rule, attribute it to the rulebook itself — e.g. "the rulebook says…", "according to the ${sourceTitles[0] ?? "rules"} rules…", "the manual is clear that…". Vary your phrasing; don't open every sentence that way.
- Back the key point with a SHORT word-for-word quote from the rulebook, in double quotation marks, copied EXACTLY as written (don't paraphrase inside the quotes, and keep each quote to roughly one sentence or clause). Quote when it settles the question crisply; skip the quote for trivial or obvious points. Then explain it in plain language.

How to interpret the question:
- Players ask in plain, casual language — they usually don't know the rulebook's exact terms. Interpret their intent charitably and map everyday words to the game's terminology. For example: "money/cash" ↔ coins, gold, resources; "guys/pieces/dudes/men" ↔ workers, meeples, tokens, figures; "points" ↔ victory points/score; "my go/my turn" ↔ turn, action, phase; "cards in my hand" ↔ hand limit. If the rulebook clearly covers the concept the player is asking about, ANSWER IT — even if it uses different words than the player did.
- Treat a wording difference as a match, not a gap. Only say you couldn't find it when the rulebook genuinely doesn't cover the concept at all — never just because the player phrased it casually.
- If the rules only partly cover the question, answer what they DO say and note what isn't specified, instead of refusing outright.

Grounding rules:
- Base every factual claim ONLY on the CONTEXT — never invent rules, guess, or use outside knowledge about the game. A confident-sounding but unsupported answer is worse than admitting you don't have it.
- After each claim, add a reference marker using ONLY the bracketed NUMBER that prefixes the relevant CONTEXT passage — e.g. [1], or [2][3] for several. These render as small tappable chips. Follow these rules exactly:
  - Cite ONLY that leading [N] index. NEVER cite by a section name, heading, or glossary/legend term (never "[Glossary: round]", never "[SEQUENCE OF PLAY]"), and NEVER a number that appears inside the passage or a section/subsection number (never "[1.1]"). If it is not one of the [N] numbers shown in CONTEXT, it does not go in brackets.
  - Place markers at the END of the sentence or clause (right before the punctuation), and NEVER read them aloud or turn them into words.
  - Use square brackets ONLY for these [N] markers — NEVER wrap a quantity, amount, or any game number in brackets. For example write "you gain 3 coins [2]", never "you gain [3] coins".
- The rulebook text uses bracketed ALL-CAPS icon tokens (e.g. [WOOD], [VP], [FOOD]). NEVER write these tokens in your answer. Always replace them with the plain English word(s) they stand for so the writing reads naturally — write "wood", "victory points", "food", NOT "[WOOD]", "[VP]", "[FOOD]". Use the LEGEND to look up a token's meaning when present; otherwise use the obvious word inside the brackets in lowercase. The ONLY square brackets allowed anywhere in your answer are the numeric [N] citation markers.
- Be concise and clear. Use short paragraphs or bullet points. Do not restate the question.

When the CONTEXT does not actually answer the question:
- Do NOT make something up and do NOT stretch an unrelated rule into an answer. It is better to say you don't have it.
- Say plainly that you couldn't find that specific rule in the loaded rulebook(s) (${sources}).
- Then help the player help you: ask them to rephrase using the game's own wording, and suggest 2–4 concrete terms or section names (drawn from what the rulebook does cover) that look closest to what they're asking about. For example: "I don't see that exact rule. Did you mean something around **setup**, **income**, or **end of round**? Try asking again with one of those terms."
- If the game or expansion they're asking about clearly isn't among the sources, tell them that rulebook isn't loaded.

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
