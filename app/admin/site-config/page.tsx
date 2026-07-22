"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

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
    key: "rerankTopN" as const,
    label: "Rerank top-N",
    help: "How many chunks the reranker keeps as the final context.",
    step: 1,
  },
  {
    key: "historyMessageLimit" as const,
    label: "History message limit",
    help: "How many past messages are included as chat context.",
    step: 1,
  },
];

type Config = Record<(typeof knobs)[number]["key"], number>;

export default function SiteConfigPage() {
  const config = useQuery(api.siteConfig.get);
  const update = useMutation(api.siteConfig.update);
  const [form, setForm] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config && !form) {
      setForm({
        v2TopK: config.v2TopK,
        v2ScoreThreshold: config.v2ScoreThreshold,
        rerankTopN: config.rerankTopN,
        historyMessageLimit: config.historyMessageLimit,
      });
    }
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
        Tune how the chat retrieves and reranks rulebook chunks. Changes apply to
        new messages immediately.
      </p>

      {knobs.map((k) => (
        <label key={k.key} className="block">
          <span className="mb-1 block text-sm font-medium">{k.label}</span>
          <input
            type="number"
            step={k.step}
            value={form[k.key]}
            onChange={(e) => {
              setSaved(false);
              setForm({ ...form, [k.key]: Number(e.target.value) });
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
