"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RulebookWithMeta } from "@/convex/games";
import { useUploadFile } from "./useUploadFile";
import { useConfirm } from "@/components/ui/Confirm";
import { useToast } from "@/components/ui/Toast";

type FileKind = "rulebook" | "download";

function RulebookRow({
  gameId,
  rulebook,
  onDelete,
}: {
  gameId: Id<"games">;
  rulebook: RulebookWithMeta;
  onDelete: (id: Id<"rulebooks">, label: string) => void;
}) {
  const startIngestion = useAction(api.ingestion.startIngestion);
  const updateLabel = useMutation(api.rulebooks.updateRulebookLabel);
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rulebook.label);
  const [savingLabel, setSavingLabel] = useState(false);

  function cancelEdit() {
    setEditing(false);
    setDraft(rulebook.label);
  }

  async function saveLabel() {
    const next = draft.trim();
    if (!next || next === rulebook.label) {
      cancelEdit();
      return;
    }
    setSavingLabel(true);
    try {
      await updateLabel({ rulebookId: rulebook._id, label: next });
      toast("Label updated", "success");
      setEditing(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update label", "error");
    } finally {
      setSavingLabel(false);
    }
  }

  async function handleIngest() {
    setPending(true);
    try {
      await startIngestion({ rulebookId: rulebook._id });
      toast("Ingestion started — parsing in the background", "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Ingestion failed to start", "error");
    } finally {
      setPending(false);
    }
  }

  const isDownload = rulebook.kind === "download";

  const state = rulebook.ingestState;
  const badge =
    state === "committed"
      ? { text: "Ingested", cls: "bg-green-500/15 text-green-600 dark:text-green-400" }
      : state === "parsing"
        ? { text: "Parsing…", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" }
        : state === "parsed"
          ? { text: "Ready to review", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" }
          : { text: "Not ingested", cls: "bg-surface-2 text-muted" };

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveLabel();
                } else if (e.key === "Escape") {
                  cancelEdit();
                }
              }}
              className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => void saveLabel()}
              disabled={savingLabel}
              className="shrink-0 text-xs font-semibold text-accent disabled:opacity-50"
            >
              {savingLabel ? "Saving…" : "Save"}
            </button>
            <button
              onClick={cancelEdit}
              className="shrink-0 text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{rulebook.label}</span>
            <button
              onClick={() => {
                setDraft(rulebook.label);
                setEditing(true);
              }}
              aria-label="Edit label"
              title="Edit label"
              className="shrink-0 text-muted transition-colors hover:text-foreground"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          </div>
        )}
        <div className="truncate text-xs text-muted">{rulebook.filename}</div>
      </div>

      {isDownload ? (
        <>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
            Add-on
          </span>
          {rulebook.downloadUrl && (
            <a
              href={rulebook.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-2"
            >
              Download
            </a>
          )}
        </>
      ) : (
        <>
          <span className={`rounded-full px-2 py-0.5 text-xs ${badge.cls}`}>
            {badge.text}
          </span>
          {state === "none" ? (
            <button
              onClick={handleIngest}
              disabled={pending}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
            >
              {pending ? "Starting…" : "Ingest"}
            </button>
          ) : (
            <Link
              href={`/admin/boardgames/${gameId}/ingest/${rulebook._id}`}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-2"
            >
              Review
            </Link>
          )}
        </>
      )}

      <button
        onClick={() => onDelete(rulebook._id, rulebook.label)}
        className="text-xs text-red-600 hover:underline dark:text-red-400"
      >
        Delete
      </button>
    </li>
  );
}

export function RulebookManager({
  gameId,
  rulebooks,
}: {
  gameId: Id<"games">;
  rulebooks: RulebookWithMeta[];
}) {
  const upload = useUploadFile();
  const addRulebook = useMutation(api.rulebooks.addRulebook);
  const deleteRulebook = useMutation(api.rulebooks.deleteRulebook);
  const confirm = useConfirm();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<FileKind>("rulebook");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: Id<"rulebooks">, rbLabel: string) {
    const ok = await confirm({
      title: `Delete “${rbLabel}”?`,
      message:
        "This removes the file and any chunks ingested from it. This can't be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRulebook({ rulebookId: id });
      toast("File deleted", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete", "error");
    }
  }

  async function handleAdd(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const storageId = await upload(file);
      await addRulebook({
        gameId,
        label: label.trim() || file.name.replace(/\.[^.]+$/, ""),
        filename: file.name,
        storageId,
        kind,
      });
      setLabel("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Upload failed. Rulebooks must be PDFs.",
      );
    } finally {
      setBusy(false);
    }
  }

  const rules = rulebooks.filter((r) => r.kind !== "download");
  const downloads = rulebooks.filter((r) => r.kind === "download");

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        Files
      </h2>

      {rules.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {rules.map((rb) => (
            <RulebookRow
              key={rb._id}
              gameId={gameId}
              rulebook={rb}
              onDelete={(id, lbl) => void handleDelete(id, lbl)}
            />
          ))}
        </ul>
      )}

      {downloads.length > 0 && (
        <>
          <p className="mb-1.5 text-xs font-medium text-muted">
            Add-ons (download-only)
          </p>
          <ul className="mb-4 space-y-1.5">
            {downloads.map((rb) => (
              <RulebookRow
                key={rb._id}
                gameId={gameId}
                rulebook={rb}
                onDelete={(id, lbl) => void handleDelete(id, lbl)}
              />
            ))}
          </ul>
        </>
      )}

      <div className="rounded-lg border border-dashed border-border p-3">
        {/* Kind toggle */}
        <div className="mb-3 inline-flex rounded-lg border border-border p-0.5 text-xs">
          {(["rulebook", "download"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                kind === k
                  ? "bg-accent text-accent-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {k === "rulebook" ? "Rulebook" : "Add-on"}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="mb-1 block text-sm font-medium">
              Label{" "}
              <span className="text-muted">
                {kind === "rulebook" ? "(e.g. “Base Rules”)" : "(e.g. “Score sheet”)"}
              </span>
            </span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={kind === "rulebook" ? "Base Rules" : "Score sheet"}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <input
            ref={fileRef}
            type="file"
            accept={kind === "rulebook" ? "application/pdf" : undefined}
            className="hidden"
            onChange={(e) => handleAdd(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy
              ? "Uploading…"
              : kind === "rulebook"
                ? "Add rulebook PDF"
                : "Add add-on file"}
          </button>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <p className="mt-2 text-xs text-muted">
          {kind === "rulebook"
            ? "Rulebooks (PDF) are ingested into the chat. After uploading, ingest to turn it into searchable chunks."
            : "Add-ons (scoring sheets, diagrams — any file type) are download-only and never used in chat."}
        </p>
      </div>
    </div>
  );
}
