/**
 * Server-only resolver mapping a chat model id → the right AI-SDK provider
 * instance, plus the provider-correct `providerOptions` block. This is the ONE
 * place that imports the provider packages, so the client bundle (the admin
 * picker) never pulls them in — it imports only the pure registry data from
 * `chatConfig.ts`. Import direction is one-way (aiModels → chatConfig), so
 * there's no circular dependency.
 *
 * Provider API keys are read lazily by the SDK factories at request time
 * (GOOGLE_GENERATIVE_AI_API_KEY / OPENAI_API_KEY), so importing this module
 * without a key set is safe — only an actual call on that provider fails.
 */
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { SharedV4ProviderOptions } from "@ai-sdk/provider";
import { providerFor, thinkingBudgetFor } from "./chatConfig";

/** Resolve a model id to its provider's AI-SDK model instance. */
export function resolveChatModel(id: string): LanguageModel {
  return providerFor(id) === "openai" ? openai(id) : google(id);
}

/**
 * The provider-namespaced `providerOptions` for a chat call — never send one
 * provider's block to another's model. `temperature` stays a top-level
 * generate/stream arg, not a provider option (see `temperatureFor`).
 *
 * Gemini takes a `thinkingConfig` budget (thinking off by default, since the
 * answer is grounded on already-retrieved passages). OpenAI models keep the
 * provider defaults, so they need no provider block.
 */
export function chatProviderOptions(
  id: string,
  opts: { thinkingBudget?: number } = {},
): SharedV4ProviderOptions | undefined {
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

/**
 * The sampling temperature to send. Gemini and OpenAI both accept it, so the
 * configured value (low by default, for consistent answers) passes through.
 */
export function temperatureFor(
  _id: string,
  requested: number | undefined,
): number | undefined {
  return requested;
}
