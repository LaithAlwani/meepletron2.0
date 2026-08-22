"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { X, Loader2, ImagePlus, Check, Dices } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Thumb } from "@/components/top-games/Thumb";
import { FORMAT_LABEL, playDate } from "@/components/plays/PlayCard";
import { buttonClasses } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { friendlyError } from "@/lib/friendlyError";
import { compressImage } from "@/lib/imageCompress";
import { topListTitle } from "@/lib/topGamesTitle";
import { categoryLabel, DEFAULT_CATEGORY } from "@/convex/lib/topGamesCategories";
import { cn } from "@/lib/cn";

type Kind = "image" | "toplist" | "play";
type EditPhoto = { id: Id<"_storage">; url: string | null };

const CAPTION_CLS =
  "mt-4 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-2 focus:ring-ring/40";

/**
 * The owner's "Edit post" modal. Lets them fix the caption and — in case they
 * shared the wrong thing — swap which play / image set / Top Games list the post
 * shows. Seeds from `getPostForEdit`; switches its editor on the post kind.
 */
export function EditPostModal({
  postId,
  kind,
  onClose,
}: {
  postId: Id<"posts">;
  kind: Kind;
  onClose: () => void;
}) {
  const data = useQuery(api.posts.getPostForEdit, { postId });
  const editPost = useMutation(api.posts.editPost);
  const genUpload = useMutation(api.plays.generatePlayPhotoUploadUrl);
  const toast = useToast();

  const [caption, setCaption] = useState("");
  const [photos, setPhotos] = useState<EditPhoto[]>([]);
  const [topListId, setTopListId] = useState<Id<"topGamesLists"> | null>(null);
  const [playId, setPlayId] = useState<Id<"plays"> | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Seed the form once, when the post's current content loads. Deferred a frame
  // so we don't call setState synchronously inside the effect body.
  useEffect(() => {
    if (!data || seeded) return;
    const id = requestAnimationFrame(() => {
      setCaption(data.caption);
      setPhotos(data.photos);
      setTopListId(data.topListId);
      setPlayId(data.playId);
      setSeeded(true);
    });
    return () => cancelAnimationFrame(id);
  }, [data, seeded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files.slice(0, 8)) {
        if (!file.type.startsWith("image/")) continue;
        const blob = await compressImage(file, 1600, 0.8);
        const url = await genUpload({});
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: blob,
        });
        if (!res.ok) throw new Error("upload failed");
        const { storageId } = await res.json();
        setPhotos((p) => [...p, { id: storageId, url: URL.createObjectURL(blob) }]);
      }
    } catch {
      toast("Couldn't upload a photo", "error");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (kind === "image" && photos.length === 0) {
      toast("Add at least one photo.", "error");
      return;
    }
    setBusy(true);
    try {
      await editPost({
        postId,
        caption: caption.trim() || undefined,
        photoIds: kind === "image" ? photos.map((p) => p.id) : undefined,
        topListId: kind === "toplist" ? (topListId ?? undefined) : undefined,
        playId: kind === "play" ? (playId ?? undefined) : undefined,
      });
      toast("Post updated.", "success");
      onClose();
    } catch (e) {
      toast(friendlyError(e, "Couldn't update the post."), "error");
      setBusy(false);
    }
  }

  return createPortal(
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-70 bg-foreground/30 backdrop-blur-[1px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="animate-in fixed left-1/2 top-1/2 z-70 flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-background shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-lg font-bold">Edit post</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="themed-scroll flex-1 overflow-y-auto p-4">
          {!seeded ? (
            <p className="py-8 text-center text-sm text-subtle">Loading…</p>
          ) : (
            <>
              {kind === "image" && (
                <ImageEditor
                  photos={photos}
                  setPhotos={setPhotos}
                  uploading={uploading}
                  onPickPhotos={onPickPhotos}
                />
              )}
              {kind === "toplist" && (
                <TopListEditor selected={topListId} onSelect={setTopListId} />
              )}
              {kind === "play" && (
                <PlayEditor selected={playId} onSelect={setPlayId} />
              )}
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Say something (optional)…"
                rows={3}
                className={CAPTION_CLS}
              />
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className={buttonClasses("ghost", "md")}>
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || !seeded}
            className={buttonClasses("primary", "md")}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

/* ---- Image: manage photos ---- */
function ImageEditor({
  photos,
  setPhotos,
  uploading,
  onPickPhotos,
}: {
  photos: EditPhoto[];
  setPhotos: React.Dispatch<React.SetStateAction<EditPhoto[]>>;
  uploading: boolean;
  onPickPhotos: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  function removeAt(i: number) {
    setPhotos((p) => p.filter((_, j) => j !== i));
  }
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">
        Photos
      </label>
      <div className="flex flex-wrap gap-2">
        {photos.map((ph, i) => (
          <div key={ph.id} className="relative">
            {ph.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ph.url}
                alt=""
                className="h-20 w-20 rounded-xl object-cover ring-1 ring-border"
              />
            )}
            <button
              type="button"
              onClick={() => removeAt(i)}
              aria-label="Remove photo"
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background shadow"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-subtle transition-colors hover:border-accent/50 hover:text-foreground">
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ImagePlus className="h-5 w-5" />
          )}
          <span className="text-[10px] font-medium">Add</span>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={onPickPhotos}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
}

/* ---- Top list: pick a different finalized list ---- */
function TopListEditor({
  selected,
  onSelect,
}: {
  selected: Id<"topGamesLists"> | null;
  onSelect: (id: Id<"topGamesLists">) => void;
}) {
  const lists = useQuery(api.topGames.listMine);
  const finalized = (lists ?? []).filter((l) => l.status === "finalized");

  return (
    <div>
      <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">
        Which list?
      </label>
      {lists === undefined ? (
        <p className="py-6 text-center text-sm text-subtle">Loading…</p>
      ) : finalized.length === 0 ? (
        <p className="py-6 text-center text-sm text-subtle">
          You have no finalized lists to share.
        </p>
      ) : (
        <ul className="space-y-2">
          {finalized.map((l) => {
            const active = selected === l._id;
            return (
              <li key={l._id}>
                <button
                  onClick={() => onSelect(l._id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    active
                      ? "border-accent bg-accent/10"
                      : "border-border hover:bg-surface-2",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display truncate font-bold">
                      {topListTitle(l.size, l.year, l.title)}
                    </p>
                    <p className="text-xs text-subtle">
                      {l.category !== DEFAULT_CATEGORY &&
                        `${categoryLabel(l.category)} · `}
                      {l.count} {l.count === 1 ? "game" : "games"}
                    </p>
                  </div>
                  {active && <Check className="h-4 w-4 shrink-0 text-accent" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---- Play: pick a different play ---- */
function PlayEditor({
  selected,
  onSelect,
}: {
  selected: Id<"plays"> | null;
  onSelect: (id: Id<"plays">) => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.plays.myPlays,
    {},
    { initialNumItems: 20 },
  );
  const loading = status === "LoadingFirstPage";

  return (
    <div>
      <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">
        Which play?
      </label>
      {loading ? (
        <p className="py-6 text-center text-sm text-subtle">Loading…</p>
      ) : results.length === 0 ? (
        <p className="py-6 text-center text-sm text-subtle">
          You haven&apos;t logged any plays yet.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {results.map((p) => {
              const active = selected === p._id;
              return (
                <li key={p._id}>
                  <button
                    onClick={() => onSelect(p._id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
                      active
                        ? "border-accent bg-accent/10"
                        : "border-border hover:bg-surface-2",
                    )}
                  >
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                      {p.coverUrl ? (
                        <Thumb url={p.coverUrl} className="h-11 w-11" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-subtle">
                          <Dices className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-display truncate font-bold">{p.title}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-subtle">
                        <span>{playDate(p.date)}</span>
                        <span className="rounded-full bg-surface-2 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide">
                          {FORMAT_LABEL[p.format] ?? p.format}
                        </span>
                        <span>
                          {p.playerCount} player{p.playerCount === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                    {active && <Check className="h-4 w-4 shrink-0 text-accent" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {status === "CanLoadMore" && (
            <button
              onClick={() => loadMore(20)}
              className={buttonClasses("ghost", "sm", "mt-3 w-full justify-center")}
            >
              Load more
            </button>
          )}
        </>
      )}
    </div>
  );
}
