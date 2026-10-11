/**
 * Server-only resolver mapping a chat model id → the right AI-SDK provider
 * instance, plus the provider-correct `providerOptions` block. This is the ONE
 * place that imports the provider packages, so the client bundle (the admin
 * picker) never pulls them in — it imports only the pure registry data from
 * `chatConfig.ts`. Import direction is one-way (aiModels → chatConfig), so
 * there's no circular dependency.
 *
 * Provider API keys are read lazily by the SDK factories at request time
 * (GOOGLE_GENERATIVE_AI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY), so
 * importing this module without a key set is safe — only an actual call on that
 * provider fails.
 */
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { SharedV4ProviderOptions } from "@ai-sdk/provider";
import { providerFor, thinkingBudgetFor } from "./chatConfig";

/** Resolve a model id to its provider's AI-SDK model instance. */
export function resolveChatModel(id: string): LanguageModel {
  switch (providerFor(id)) {
    case "anthropic":
      return anthropic(id);
    case "openai":
      return openai(id);
    default:
      return google(id);
  }
}

/**
 * The provider-namespaced `providerOptions` for a chat call — never send one
 * provider's block to another's model. `temperature` stays a top-level
 * generate/stream arg, not a provider option (see `temperatureFor`).
 *
 * Gemini takes a `thinkingConfig` budget. Anthropic gets the same stance spelled
 * out its own way: thinking off, low effort. Without this, Claude models think
 * by default (Haiku 5.5 at `medium`), which bills as output at 5× the input
 * rate and makes the model audit the conversation before answering — it would
 * notice an earlier answer whose passages are no longer in CONTEXT and retract
 * it. `disabled` is only accepted at effort `high` or below, which `low`
 * satisfies. OpenAI keeps provider defaults.
 */
export function chatProviderOptions(
  id: string,
  opts: { thinkingBudget?: number } = {},
): SharedV4ProviderOptions | undefined {
  switch (providerFor(id)) {
    case "google":
      return {
        google: {
          thinkingConfig: {
            thinkingBudget: thinkingBudgetFor(id, opts.thinkingBudget ?? 0),
          },
        },
      };
    case "anthropic":
      return {
        anthropic: { thinking: { type: "disabled" }, effort: "low" },
      };
    default:
      return undefined;
  }
}

/**
 * The sampling temperature to send, or `undefined` to send none.
 *
 * Claude 4.6 and later removed the sampling parameters — a non-default
 * `temperature` is rejected — so Anthropic models get none and use the
 * provider default. Everyone else gets the configured value.
 */
export function temperatureFor(
  id: string,
  requested: number | undefined,
): number | undefined {
  return providerFor(id) === "anthropic" ? undefined : requested;
}
