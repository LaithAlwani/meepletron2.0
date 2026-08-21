"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { ImagePlus, Trophy, Dices, X, Loader2, Check } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { compressImage } from "@/lib/imageCompress";
import { buttonClasses } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { LogPlayWizard } from "@/components/plays/LogPlayWizard";
import { useUsernameGate } from "@/components/feed/UsernameGate";
import { topListTitle } from "@/lib/topGamesTitle";
import { categoryLabel, DEFAULT_CATEGORY } from "@/convex/lib/topGamesCategories";
import { cn } from "@/lib/cn";

type Mode = null | "photo" | "list" | "play";

/** The top-of-feed composer: a bar with three ways to post (photo / list / play). */
export function PostComposer() {
  const me = useQuery(api.users.me);
  const ensureUsername = useUsernameGate();
  const [mode, setMode] = useState<Mode>(null);

  const avatar = me?.avatarUrl ?? null;
  const initial = (me?.name ?? me?.username ?? "?").charAt(0).toUpperCase();

  // Photo + Top-list posts are public — require a username first.
  async function openGated(next: "photo" | "list") {
    if (await ensureUsername()) setMode(next);
  }

  return (
    <div className="mb-5 rounded-2xl border border-border-muted bg-surface p-3">
      <div className="flex items-center gap-2.5">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/12 text-sm font-bold text-accent">
            {initial}
          </span>
        )}
        <button
          onClick={() => openGated("photo")}
          className="flex-1 rounded-full border border-border bg-surface-2 px-4 py-2 text-left text-sm text-subtle transition-colors hover:border-accent/40"
        >
          Share something…
        </button>
      </div>
      <div className="mt-2.5 flex items-center gap-1 border-t border-border-muted pt-2.5">
        <ComposerTab icon={<ImagePlus className="h-4 w-4" />} label="Photo" onClick={() => openGated("photo")} />
        <ComposerTab icon={<Trophy className="h-4 w-4" />} label="Top list" onClick={() => openGated("list")} />
        <ComposerTab icon={<Dices className="h-4 w-4" />} label="Log a play" onClick={() => setMode("play")} />
      </div>

      {mode === "photo" && <PhotoDrawer onClose={() => setMode(null)} />}
      {mode === "list" && <ListDrawer onClose={() => setMode(null)} />}
      <LogPlayWizard open={mode === "play"} onClose={() => setMode(null)} />
    </div>
  );
}

function ComposerTab({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/** A bottom-sheet / right-sidebar shell (matches CommentsDrawer). */
function Drawer({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return createPortal(
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-70 bg-foreground/30 backdrop-blur-[1px]"
      />
      <div className="animate-in fixed inset-x-0 bottom-0 z-70 flex max-h-[85vh] flex-col rounded-t-2xl border border-border bg-background shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-104 sm:rounded-none sm:rounded-l-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="themed-scroll flex-1 overflow-y-auto p-4">{children}</div>
        <div className="border-t border-border p-3">{footer}</div>
      </div>
    </>,
    document.body,
  );
}

function PhotoDrawer({ onClose }: { onClose: () => void }) {
  const genUpload = useMutation(api.plays.generatePlayPhotoUploadUrl);
  const createImagePost = useMutation(api.posts.createImagePost);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [photoIds, setPhotoIds] = useState<Id<"_storage">[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
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
        setPhotoIds((p) => [...p, storageId]);
        setPreviews((p) => [...p, URL.createObjectURL(blob)]);
      }
    } catch {
      toast("Couldn't upload a photo", "error");
    } finally {
      setUploading(false);
    }
  }

  function removeAt(i: number) {
    setPhotoIds((p) => p.filter((_, j) => j !== i));
    setPreviews((p) => p.filter((_, j) => j !== i));
  }

  async function share() {
    if (photoIds.length === 0) return;
    setBusy(true);
    try {
      await createImagePost({ photoIds, caption: caption.trim() || undefined });
      toast("Posted!", "success");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't post", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title="New photo post"
      onClose={onClose}
      footer={
        <button
          onClick={share}
          disabled={busy || photoIds.length === 0}
          className={cn(buttonClasses("primary", "md"), "w-full justify-center")}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Share"}
        </button>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={onPick}
      />
      {previews.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          {previews.map((url, i) => (
            <div key={i} className="relative aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="h-full w-full rounded-lg object-cover ring-1 ring-border"
              />
              <button
                onClick={() => removeAt(i)}
                aria-label="Remove photo"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-6 text-sm font-semibold text-muted transition-colors hover:border-accent/40 hover:text-foreground"
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <ImagePlus className="h-5 w-5" />
        )}
        {uploading ? "Uploading…" : "Add photos"}
      </button>
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Say something (optional)…"
        rows={3}
        className="mt-3 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-2 focus:ring-ring/40"
      />
    </Drawer>
  );
}

function ListDrawer({ onClose }: { onClose: () => void }) {
  const lists = useQuery(api.topGames.listMine);
  const createTopListPost = useMutation(api.posts.createTopListPost);
  const toast = useToast();

  const [selected, setSelected] = useState<Id<"topGamesLists"> | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  const finalized = (lists ?? []).filter((l) => l.status === "finalized");

  async function share() {
    if (!selected) return;
    setBusy(true);
    try {
      await createTopListPost({ topListId: selected, caption: caption.trim() || undefined });
      toast("Shared to the feed!", "success");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't share", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title="Share a Top Games list"
      onClose={onClose}
      footer={
        <button
          onClick={share}
          disabled={busy || !selected}
          className={cn(buttonClasses("primary", "md"), "w-full justify-center")}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Share"}
        </button>
      }
    >
      {lists === undefined ? (
        <p className="py-8 text-center text-sm text-subtle">Loading…</p>
      ) : finalized.length === 0 ? (
        <p className="py-8 text-center text-sm text-subtle">
          Finalize a Top Games list first, then you can share it here.
        </p>
      ) : (
        <ul className="space-y-2">
          {finalized.map((l) => {
            const active = selected === l._id;
            return (
              <li key={l._id}>
                <button
                  onClick={() => setSelected(l._id)}
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
                      {l.category !== DEFAULT_CATEGORY && `${categoryLabel(l.category)} · `}
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
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Say something (optional)…"
        rows={3}
        className="mt-3 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-2 focus:ring-ring/40"
      />
    </Drawer>
  );
}
