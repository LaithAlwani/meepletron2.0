"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  CHAT_MODEL_IDS,
  CONTENT_MODEL_IDS,
  type ChatModelId,
  type ContentModelId,
} from "@/convex/lib/chatConfig";

const knobs = [
  {
    key: "v2TopK" as const,
    label: "Vector search top-K",
    help: "How many chunks the vector search retrieves before reranking.",
    step: 1,
  },
  {
    key: "v2ScoreThreshold" as const,
    label: "Score threshold",
    help: "Minimum similarity score to keep a retrieved chunk (0–1).",
    step: 0.01,
  },
  {
    key: "rerankCandidates" as const,
    label: "Rerank candidates",
    help: "How many top-scoring chunks are sent to the reranker (of the top-K retrieved). Higher = better recall but more tokens.",
    step: 1,
  },
  {
    key: "rerankTopN" as const,
    label: "Rerank top-N",
    help: "How many chunks the reranker keeps as the final context.",
    step: 1,
  },
  {
    key: "historyMessageLimit" as const,
    label: "History message limit",
    help: "How many recent messages are included as chat context (minimum 1 — the current question).",
    step: 1,
  },
  {
    key: "answerTemperature" as const,
    label: "Answer temperature",
    help: "Randomness of the final answer (0–2). Lower = the same question gives more consistent replies; higher = more varied wording.",
    step: 0.1,
  },
  {
    key: "answerThinkingBudget" as const,
    label: "Answer thinking budget",
    help: "Gemini reasoning tokens for the answer (billed as output). 0 = off (cheapest, recommended — answers are grounded on retrieved passages), -1 = dynamic/auto, or a token cap up to 24576. Note: Flash-Lite can't be 0 — it's auto-raised to 512.",
    step: 1,
  },
];

const MODEL_LABELS: Record<ChatModelId, string> = {
  "gemini-3.5-flash-lite": "Flash-Lite 3.5 — default ($0.30/$2.50 per 1M)",
  "gemini-3.5-flash": "Flash 3.5 — premium, ~5× cost ($1.50/$9.00)",
};

const CONTENT_MODEL_LABELS: Record<ContentModelId, string> = {
  "gemini-2.5-flash": "Flash 2.5 — default ($0.30/$2.50 per 1M)",
  "gemini-3.5-flash": "Flash 3.5 — current-gen ($1.50/$9.00 per 1M)",
};

const modelKnobs = [
  {
    key: "answerModel" as const,
    label: "Answer model",
    help: "Model that writes the final answer. The quality-sensitive one — test Flash-Lite before committing.",
  },
  {
    key: "auxModel" as const,
    label: "Auxiliary model (rewrite + rerank)",
    help: "Model for the cheap mechanical steps. Flash-Lite here is low-risk.",
  },
];

type NumberKey = (typeof knobs)[number]["key"];
type Config = Record<NumberKey, number> & {
  answerModel: ChatModelId;
  auxModel: ChatModelId;
  contentModel: ContentModelId;
};

export default function SiteConfigPage() {
  const config = useQuery(api.siteConfig.get);
  const update = useMutation(api.siteConfig.update);
  const [form, setForm] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Seed the form once the config loads. Deferred a frame so we don't call
  // setState synchronously inside the effect body.
  useEffect(() => {
    if (!config || form) return;
    const id = requestAnimationFrame(() =>
      setForm({
        v2TopK: config.v2TopK,
        v2ScoreThreshold: config.v2ScoreThreshold,
        rerankCandidates: config.rerankCandidates,
        rerankTopN: config.rerankTopN,
        historyMessageLimit: config.historyMessageLimit,
        answerTemperature: config.answerTemperature,
        answerThinkingBudget: config.answerThinkingBudget,
        answerModel: config.answerModel,
        auxModel: config.auxModel,
        contentModel: config.contentModel,
      }),
    );
    return () => cancelAnimationFrame(id);
  }, [config, form]);

  if (!form) return <p className="text-muted">Loading…</p>;

  async function save() {
    if (!form) return;
    setSaving(true);
    setSaved(false);
    try {
      await update(form);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <p className="text-sm text-muted">
        Tune how the chat retrieves, reranks, and answers. Changes apply to new
        messages immediately.
      </p>

      {modelKnobs.map((k) => (
        <label key={k.key} className="block">
          <span className="mb-1 block text-sm font-medium">{k.label}</span>
          <select
            value={form[k.key]}
            onChange={(e) => {
              setSaved(false);
              setForm({ ...form, [k.key]: e.target.value as ChatModelId });
            }}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
          >
            {CHAT_MODEL_IDS.map((id) => (
              <option key={id} value={id}>
                {MODEL_LABELS[id]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">{k.help}</span>
        </label>
      ))}

      <label className="block">
        <span className="mb-1 block text-sm font-medium">
          Ingestion &amp; content model
        </span>
        <select
          value={form.contentModel}
          onChange={(e) => {
            setSaved(false);
            setForm({
              ...form,
              contentModel: e.target.value as ContentModelId,
            });
          }}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
        >
          {CONTENT_MODEL_IDS.map((id) => (
            <option key={id} value={id}>
              {CONTENT_MODEL_LABELS[id]}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-muted">
          Rulebook PDF parsing + FAQ/glossary/reminder generation. Low-volume and
          quality-critical — use a full Flash model (not Lite). Only affects
          future ingestions/regenerations.
        </span>
      </label>

      {knobs.map((k) => (
        <label key={k.key} className="block">
          <span className="mb-1 block text-sm font-medium">{k.label}</span>
          <input
            type="number"
            step={k.step}
            value={form[k.key]}
            onChange={(e) => {
              setSaved(false);
              // Integer-stepped knobs (step 1) must stay whole numbers — a
              // fractional thinking budget errors at the Gemini API.
              const raw = Number(e.target.value);
              const val = k.step === 1 ? Math.round(raw) : raw;
              setForm({ ...form, [k.key]: val });
            }}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="mt-1 block text-xs text-muted">{k.help}</span>
        </label>
      ))}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save config"}
        </button>
        {saved && <span className="text-sm text-green-600 dark:text-green-400">Saved</span>}
      </div>
    </div>
  );
}
