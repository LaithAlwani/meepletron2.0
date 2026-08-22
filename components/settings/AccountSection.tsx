"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Camera, LogOut, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { AvatarImg } from "@/components/ui/Avatar";
import { Die } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { friendlyError } from "@/lib/friendlyError";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/** Resize + re-encode to a small JPEG in the browser, so storage only ever holds
 *  the compressed avatar (never the multi-MB original). */
async function compressImage(
  file: File,
  max = 400,
  quality = 0.82,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Compression failed");
  return blob;
}

/** The account block on the Settings page: avatar, name/username, email, sign
 *  out and account deletion. (The public-facing profile lives at /user/[handle].) */
export function AccountSection() {
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  const router = useRouter();

  if (me === undefined) {
    return (
      <div className="rounded-2xl border border-border-muted bg-surface p-6 text-center text-sm text-muted">
        Loading…
      </div>
    );
  }
  if (me === null) return null;

  const isGuest = me.isAnonymous === true;
  const memberSince = new Date(me._creationTime).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border-muted bg-surface">
      <div className="flex items-center gap-4 p-5">
        <ProfileAvatar
          avatarUrl={me.avatarUrl}
          canEdit={!isGuest}
          isGuest={isGuest}
          initial={(me.name || me.email || "?").charAt(0).toUpperCase()}
          hasUpload={!!me.avatarStorageId}
          recentAvatars={me.recentAvatars}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-extrabold">
            {me.name || me.email || "Guest"}
          </p>
          {me.username && (
            <p className="truncate text-sm font-semibold text-accent">
              @{me.username}
            </p>
          )}
          <p className="mt-0.5 text-xs text-subtle">Member since {memberSince}</p>
        </div>
      </div>

      {!isGuest && <PersonalInfo me={me} />}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-muted px-5 py-4">
        <p className="text-sm text-muted">{me.email ?? "—"}</p>
        {isGuest ? (
          <a href="/auth" className={buttonClasses("primary", "sm")}>
            Create an account
          </a>
        ) : (
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        )}
      </div>

      {!isGuest && <DangerZone />}
    </div>
  );
}

function ProfileAvatar({
  avatarUrl,
  canEdit,
  isGuest,
  initial,
  hasUpload,
  recentAvatars,
}: {
  avatarUrl: string | null;
  canEdit: boolean;
  isGuest: boolean;
  initial: string;
  hasUpload: boolean;
  recentAvatars: { storageId: Id<"_storage">; url: string }[];
}) {
  const genUrl = useMutation(api.users.generateAvatarUploadUrl);
  const setAvatar = useMutation(api.users.setAvatar);
  const applyRecentAvatar = useMutation(api.users.useRecentAvatar);
  const removeAvatar = useMutation(api.users.removeAvatar);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Please choose an image", "error");
      return;
    }
    setBusy(true);
    try {
      const blob = await compressImage(file);
      const url = await genUrl({});
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      });
      if (!res.ok) throw new Error("upload failed");
      const { storageId } = await res.json();
      await setAvatar({ storageId });
      toast("Photo updated", "success");
    } catch (err) {
      toast(friendlyError(err, "Couldn't upload that photo"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function pickRecent(storageId: Id<"_storage">) {
    setBusy(true);
    try {
      await applyRecentAvatar({ storageId });
    } catch {
      toast("Couldn't switch photo", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await removeAvatar({});
    } catch {
      toast("Couldn't remove photo", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-accent/15 text-3xl font-bold text-accent">
          <AvatarImg
            src={avatarUrl}
            initial={initial}
            icon={isGuest ? <Die className="h-8 w-8" /> : undefined}
          />
        </div>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              aria-label="Change photo"
              title="Change photo"
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-accent text-accent-foreground shadow-md transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onFile}
              className="hidden"
            />
          </>
        )}
      </div>

      {canEdit && recentAvatars.length > 0 && (
        <div className="flex items-center gap-1.5">
          {recentAvatars.map((r) => {
            const current = r.url === avatarUrl;
            return (
              <button
                key={r.storageId}
                type="button"
                onClick={() => !current && pickRecent(r.storageId)}
                disabled={busy || current}
                aria-label="Use this photo"
                className={cn(
                  "h-7 w-7 overflow-hidden rounded-full border-2 transition-colors",
                  current ? "border-accent" : "border-transparent hover:border-border",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.url} alt="" className="h-full w-full object-cover" />
              </button>
            );
          })}
        </div>
      )}

      {canEdit && hasUpload && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="text-[11px] font-medium text-subtle transition-colors hover:text-red-500 disabled:opacity-50"
        >
          Remove photo
        </button>
      )}
    </div>
  );
}

function PersonalInfo({ me }: { me: Doc<"users"> }) {
  const updateProfile = useMutation(api.users.updateProfile);
  const setUsername = useMutation(api.users.setUsername);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(me.name ?? "");
  const [username, setUsernameInput] = useState(me.username ?? "");

  // Re-sync from the server copy when it changes — deferred a frame so we don't
  // call setState synchronously inside the effect body.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setName(me.name ?? "");
      setUsernameInput(me.username ?? "");
    });
    return () => cancelAnimationFrame(id);
  }, [me.name, me.username]);

  const nameDirty = name !== (me.name ?? "");
  const usernameDirty = username !== (me.username ?? "");
  const dirty = nameDirty || usernameDirty;
  const inputCls =
    "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50";

  async function save() {
    if (!dirty) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      if (usernameDirty) await setUsername({ username });
      if (nameDirty) await updateProfile({ name });
      toast("Profile updated", "success");
      setEditing(false);
    } catch (err) {
      toast(friendlyError(err, "Couldn't update profile"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-border-muted px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-subtle">
          Name &amp; handle
        </p>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-semibold text-accent hover:underline"
          >
            Edit
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted">Name</label>
          {editing ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              placeholder="—"
              className={inputCls}
            />
          ) : (
            <p className="py-2 text-sm text-foreground">
              {me.name || <span className="text-subtle">—</span>}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted">Username</label>
          {editing ? (
            <>
              <div className="flex items-center gap-1">
                <span className="text-sm text-subtle">@</span>
                <input
                  value={username}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  disabled={saving}
                  placeholder="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={inputCls}
                />
              </div>
              <p className="text-[11px] text-subtle">
                3–20 characters — letters, numbers, underscore or dot.
              </p>
            </>
          ) : (
            <p className="py-2 text-sm text-foreground">
              {me.username ? (
                `@${me.username}`
              ) : (
                <span className="text-subtle">—</span>
              )}
            </p>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            onClick={() => {
              setName(me.name ?? "");
              setUsernameInput(me.username ?? "");
              setEditing(false);
            }}
            disabled={saving}
            className="rounded-xl px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

function DangerZone() {
  const deleteAccount = useMutation(api.users.deleteAccount);
  const confirm = useConfirm();
  const toast = useToast();
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete your account?",
      message:
        "This permanently deletes your account, all your chats, and your favorites. This can't be undone.",
      confirmText: "Delete account",
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteAccount({});
      await signOut();
      router.push("/");
    } catch {
      toast("Couldn't delete your account", "error");
      setDeleting(false);
    }
  }

  return (
    <div className="border-t border-border-muted px-5 py-4">
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="text-sm font-medium text-red-600 transition-colors hover:underline disabled:opacity-50 dark:text-red-400"
      >
        {deleting ? "Deleting…" : "Delete account"}
      </button>
    </div>
  );
}
