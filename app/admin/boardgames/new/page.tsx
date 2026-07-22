"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GameForm, type GameFormValues } from "@/components/admin/GameForm";
import { useUploadFile } from "@/components/admin/useUploadFile";

type PendingPdf = { file: File; label: string };

export default function NewGamePage() {
  const createGame = useMutation(api.games.createGame);
  const setCoverFromUrl = useAction(api.images.setGameCoverFromUrl);
  const addRulebook = useMutation(api.rulebooks.addRulebook);
  const upload = useUploadFile();
  const router = useRouter();

  const [coverUrl, setCoverUrl] = useState("");
  const [pdfs, setPdfs] = useState<PendingPdf[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).map((file) => ({
      file,
      label: file.name.replace(/\.pdf$/i, ""),
    }));
    setPdfs((prev) => [...prev, ...next]);
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  }

  async function handleSubmit(values: GameFormValues) {
    const gameId = await createGame(values);

    if (coverUrl.trim()) {
      try {
        await setCoverFromUrl({ gameId, url: coverUrl.trim() });
      } catch {
        setNotice(
          "Game created, but the cover URL couldn't be fetched — add it on the next screen.",
        );
      }
    }

    for (const { file, label } of pdfs) {
      const storageId = await upload(file);
      await addRulebook({
        gameId,
        label: label.trim() || file.name.replace(/\.pdf$/i, ""),
        filename: file.name,
        storageId,
      });
    }

    router.push(`/admin/boardgames/${gameId}`);
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="font-semibold">Add a game</h2>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <div>
          <label htmlFor="cover-url" className="mb-1 block text-sm font-medium">
            Cover image URL (optional)
          </label>
          <input
            id="cover-url"
            type="url"
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
            placeholder="https://…/cover.jpg"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-muted">
            Downloaded, compressed, and stored when you create the game.
          </p>
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium">
            Rulebook PDFs (optional)
          </span>
          {pdfs.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {pdfs.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input
                    value={p.label}
                    onChange={(e) =>
                      setPdfs((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, label: e.target.value } : x,
                        ),
                      )
                    }
                    className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="max-w-[40%] truncate text-xs text-muted">
                    {p.file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPdfs((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="text-xs text-red-600 hover:underline dark:text-red-400"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
          >
            Add PDF{pdfs.length > 0 ? " (another)" : ""}
          </button>
        </div>

        {notice && (
          <p className="text-sm text-amber-600 dark:text-amber-400">{notice}</p>
        )}
      </section>

      <GameForm submitLabel="Create game" onSubmit={handleSubmit} />
    </div>
  );
}
