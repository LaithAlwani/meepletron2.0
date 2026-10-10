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
 * The provider-namespaced `providerOptions` for a chat call. Only Gemini takes a
 * `thinkingConfig` budget; Anthropic/OpenAI use provider defaults (return
 * undefined — never send a `google` block to a non-Google model). `temperature`
 * stays a top-level generate/stream arg, not a provider option.
 */
export function chatProviderOptions(
  id: string,
  opts: { thinkingBudget?: number } = {},
) {
  if (providerFor(id) === "google") {
    return {
      google: {
        thinkingConfig: {
          thinkingBudget: thinkingBudgetFor(id, opts.thinkingBudget ?? 0),
        },
      },
    };
  }
  return undefined;
}
