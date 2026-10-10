/**
 * Default values + helpers for the runtime-tunable chat/RAG config (the
 * `siteConfig` singleton). Shared by the admin read/write (`siteConfig.ts`) and
 * the runtime reader (`chat.getActiveConfig`) so the two can never drift. Plain
 * data/logic — no server imports — so it's safe to import from anywhere.
 */
export type ChatProvider = "google" | "anthropic" | "openai";

/** One answer/aux model the admin can pick. `id` is the AI-SDK model id — also
 *  the value stored in siteConfig, the usageLog key, and the PRICING key.
 *  `input`/`output` are USD per 1M tokens. */
export type ChatModelEntry = {
  id: string;
  provider: ChatProvider;
  label: string;
  input: number;
  output: number;
  // Hidden from the in-chat picker for non-admins (e.g. a pricey model). Admins
  // still see it there, and it stays available in the admin site-config.
  adminOnly?: boolean;
};

// OpenAI "ChatGPT 6 Luna" — exact AI-SDK model id confirmed via the probe below.
export const OPENAI_LUNA_ID = "gpt-6-luna";

// The single source of truth for the answer/aux pickers, pricing, and the
// model→provider resolver (convex/lib/aiModels.ts derives from this). Adding a
// row here wires the model into the picker AND prices it (no silent $0). Prices
// marked TBD are placeholders until the provider's real rate is filled in.
// Order here is the order shown in the in-chat picker (top → bottom): admin-only
// Flash 3.6, then Flash-Lite, GPT-6 Luna, GPT-4o mini, and Haiku (the default)
// at the bottom. Non-admins don't see Flash 3.6, so for them it's Flash-Lite →
// Luna → 4o mini → Haiku.
export const CHAT_MODELS = [
  {
    id: "gemini-3.6-flash",
    provider: "google",
    label: "Flash 3.6 — Gemini",
    input: 0.75, // std $1.50/$7.50; currently a 50% launch promo
    output: 3.75,
    adminOnly: true, // pricey — hidden from the in-chat picker for non-admins
  },
  {
    id: "gemini-3.5-flash-lite",
    provider: "google",
    label: "Flash-Lite 3.5 — Gemini",
    input: 0.3,
    output: 2.5,
  },
  {
    // Pricing is the owner-provided ~$0.10 in / $0.75 out (confirm exact rates).
    id: OPENAI_LUNA_ID,
    provider: "openai",
    label: "ChatGPT 6 Luna — OpenAI",
    input: 0.1,
    output: 0.75,
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    label: "GPT-4o mini — OpenAI",
    input: 0.15,
    output: 0.6,
  },
  {
    // Base tier ($0.10/$0.50 up to 100K-token prompts; Anthropic charges 5×
    // beyond 100K — our rulebook prompts stay well under, and rowCost is flat,
    // so the base tier is what we bill).
    id: "claude-haiku-5-5",
    provider: "anthropic",
    label: "Claude Haiku 5.5 — Anthropic",
    input: 0.1,
    output: 0.5,
  },
] as const satisfies readonly ChatModelEntry[];

export type ChatModelId = (typeof CHAT_MODELS)[number]["id"];
export const CHAT_MODEL_IDS: readonly ChatModelId[] = CHAT_MODELS.map((m) => m.id);

const PROVIDER_BY_ID: Record<string, ChatProvider> = Object.fromEntries(
  CHAT_MODELS.map((m) => [m.id, m.provider]),
);

/** Which provider a model id belongs to. Falls back to an id-prefix guess for
 *  ids not in the registry (e.g. a value lingering in siteConfig). */
export function providerFor(id: string): ChatProvider {
  return (
    PROVIDER_BY_ID[id] ??
    (id.startsWith("gemini-")
      ? "google"
      : id.startsWith("claude-")
        ? "anthropic"
        : "openai")
  );
}

// The default answer+aux model for everyone when a user hasn't picked one in
// the chat. There is no global answer/aux config anymore — the in-chat picker
// is the only control. Must not be adminOnly (so non-admins can use it too).
export const DEFAULT_CHAT_MODEL: ChatModelId = "claude-haiku-5-5";

// Widened view (the `as const` tuple hides optional fields like adminOnly).
const CHAT_MODEL_ENTRIES: readonly ChatModelEntry[] = CHAT_MODELS;

/** Models to offer in the in-chat picker for this viewer (admins see all). */
export function chatModelsForRole(isAdmin: boolean): readonly ChatModelEntry[] {
  return isAdmin
    ? CHAT_MODEL_ENTRIES
    : CHAT_MODEL_ENTRIES.filter((m) => !m.adminOnly);
}

/**
 * Whether a viewer may use a given model id — the gate shared by the in-chat
 * picker (to enable/disable options) and the server (to reject a crafted
 * request). Admin-only models need an admin; guests (not signed in) can only use
 * the default model — every other model requires an account.
 */
export function isChatModelAllowed(
  id: string,
  { isAdmin, isGuest }: { isAdmin: boolean; isGuest: boolean },
): boolean {
  const entry = CHAT_MODEL_ENTRIES.find((m) => m.id === id);
  if (!entry) return false;
  if (entry.adminOnly && !isAdmin) return false;
  if (isGuest && id !== DEFAULT_CHAT_MODEL) return false;
  return true;
}

// Models for the cold, quality-critical path: rulebook PDF ingestion and the
// offline FAQ/glossary/reminder generators. These are low-volume (per manual /
// admin-triggered), so the full Flash models are the right pick — Lite's cost
// edge is irrelevant here and its quality is worse. 2.5-flash still works;
// 3.6-flash is the current-gen successor (3.5-flash was deprecated). Content
// stays Gemini-only (not part of the multi-provider answer/aux switch).
export type ContentModelId = "gemini-2.5-flash" | "gemini-3.6-flash";
export const CONTENT_MODEL_IDS: ContentModelId[] = [
  "gemini-2.5-flash",
  "gemini-3.6-flash",
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
  // Ingestion + offline generators (content path only). The chat answer/aux
  // model is per-user via the in-chat picker now, not a global knob — see
  // DEFAULT_CHAT_MODEL for the fallback.
  contentModel: "gemini-2.5-flash" as ContentModelId,
  // Thinking budget (tokens, billed as output) for the answer. 0 = off — the
  // default, since the answer is grounded on already-retrieved passages and
  // rarely needs chain-of-thought. -1 = dynamic/auto; a positive value caps it.
  answerThinkingBudget: 0,
};

/** Coercion for the ingestion/generator (content) model. */
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
  // Gemini-only concept. Non-Google ids never reach here (chatProviderOptions
  // only consults the budget for google), but guard anyway.
  if (providerFor(modelId) !== "google") return b;
  if (modelId.includes("flash-lite") && b >= 0 && b < 512) return 512;
  return b;
}
