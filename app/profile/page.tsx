"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useQuery,
  useMutation,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { friendlyError } from "@/lib/friendlyError";
import { InstallPrompt } from "@/components/InstallPrompt";
import { Die } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

const CameraIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-4 w-4"
  >
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

const icon = "h-4 w-4";
const CalendarIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px]">
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);
const LogoutIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={icon}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
  </svg>
);
const EditIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[14px] w-[14px]">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

const statIcon = "h-5 w-5";
const StatCollectionIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={statIcon}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);
const StatChatsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={statIcon}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const StatMessageIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={statIcon}>
    <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" />
    <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
  </svg>
);
const StatRobotIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={statIcon}>
    <rect x="4" y="8" width="16" height="12" rx="2" /><path d="M12 8V4M8 2h8" />
    <circle cx="9" cy="14" r="1" /><circle cx="15" cy="14" r="1" />
  </svg>
);
const StatThumbIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={statIcon}>
    <path d="M7 10v12" />
    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
  </svg>
);

export default function ProfilePage() {
  return (
    <div className="min-h-screen px-4 pb-16 pt-10">
      <div className="mx-auto max-w-xl">
        <AuthLoading>
          <p className="text-center text-muted">Loading…</p>
        </AuthLoading>
        <Unauthenticated>
          <div className="rounded-2xl border border-border-muted bg-surface p-8 text-center">
            <p className="text-sm text-muted">You&apos;re not signed in.</p>
            <Link
              href="/auth"
              className="mt-3 inline-block rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
            >
              Sign in
            </Link>
          </div>
        </Unauthenticated>
        <Authenticated>
          <ProfileBody />
        </Authenticated>
      </div>
    </div>
  );
}

function ProfileBody() {
  const me = useQuery(api.users.me);
  const stats = useQuery(api.users.myStats);
  // null when no BGG account is linked — the card is simply omitted then.
  const bgg = useQuery(api.bggSync.myAccount);
  const { signOut } = useAuthActions();
  const router = useRouter();

  if (me === undefined || me === null) {
    return <p className="text-center text-muted">Loading…</p>;
  }

  const isGuest = me.isAnonymous === true;
  const fullName = me.name || me.email || "Guest";
  const initial = (me.name || me.email || "?").charAt(0).toUpperCase();
  const memberSince = new Date(me._creationTime).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const ratingPct =
    stats && stats.correctRatings + stats.wrongRatings > 0
      ? Math.round(
          (stats.correctRatings /
            (stats.correctRatings + stats.wrongRatings)) *
            100,
        )
      : null;

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  return (
    <div>
      {/* Avatar card */}
      <div className="mb-6 flex flex-col items-center rounded-2xl border border-border-muted bg-surface p-8 text-center shadow-sm">
        <ProfileAvatar
          avatarUrl={me.avatarUrl}
          canEdit={!isGuest}
          isGuest={isGuest}
          initial={initial}
          hasUpload={!!me.avatarStorageId}
          recentAvatars={me.recentAvatars}
        />
        <h1 className="font-display text-xl font-extrabold text-foreground">{fullName}</h1>
        {me.username && (
          <p className="text-sm font-semibold text-accent">@{me.username}</p>
        )}
        <p className="mt-0.5 text-sm text-subtle">{me.email ?? "—"}</p>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-subtle">
          {CalendarIcon}
          Member since {memberSince}
        </div>

        {isGuest ? (
          <Link
            href="/auth"
            className="mt-6 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground hover:opacity-90"
          >
            Create an account
          </Link>
        ) : (
          <button
            onClick={handleSignOut}
            className="mt-6 flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-muted transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          >
            {LogoutIcon}
            Sign out
          </button>
        )}
      </div>

      {/* Install the PWA */}
      <InstallPrompt />

      {/* Personal info */}
      {!isGuest && <PersonalInfo me={me} />}

      {/* Public profile sharing */}
      {!isGuest && <PublicProfileCard me={me} />}

      {/* Activity */}
      <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-subtle">
        Activity
      </p>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Chats" value={stats?.totalChats} color="blue" icon={StatChatsIcon} />
        <StatCard label="Messages Sent" value={stats?.userMessages} color="violet" icon={StatMessageIcon} />
        <StatCard label="AI Responses" value={stats?.aiMessages} color="slate" icon={StatRobotIcon} />
        <StatCard
          label="Rating Score"
          value={ratingPct !== null ? `${ratingPct}%` : stats ? "No ratings" : undefined}
          sub={
            stats && ratingPct !== null
              ? `${stats.correctRatings} up · ${stats.wrongRatings} down`
              : undefined
          }
          color="green"
          icon={StatThumbIcon}
        />
        {bgg && (
          <StatCard
            label="Games Owned"
            value={bgg.collectionCount ?? 0}
            sub={bgg.username}
            color="blue"
            icon={StatCollectionIcon}
          />
        )}
      </div>

      {/* Danger zone — permanent account deletion (real accounts only) */}
      {!isGuest && <DangerZone />}
    </div>
  );
}

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
  const useRecent = useMutation(api.users.useRecentAvatar);
  const removeAvatar = useMutation(api.users.removeAvatar);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
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
      await useRecent({ storageId });
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
    <div className="mb-4 flex flex-col items-center">
      <div className="relative">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-accent/15 text-3xl font-bold text-accent">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : isGuest ? (
            <Die className="h-8 w-8" />
          ) : (
            initial
          )}
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
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                CameraIcon
              )}
            </button>
            {/* accept=image/* lets mobile offer Camera / Photo Library / Files */}
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

      {/* Recent avatars — reuse without re-uploading */}
      {canEdit && recentAvatars.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          {recentAvatars.map((r) => {
            const current = r.url === avatarUrl;
            return (
              <button
                key={r.storageId}
                type="button"
                onClick={() => !current && pickRecent(r.storageId)}
                disabled={busy || current}
                aria-label="Use this photo"
                className={`h-9 w-9 overflow-hidden rounded-full border-2 transition-colors ${
                  current
                    ? "border-accent"
                    : "border-transparent hover:border-border"
                }`}
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
          className="mt-2 text-xs font-medium text-subtle transition-colors hover:text-red-500 disabled:opacity-50"
        >
          Remove photo
        </button>
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
    <div className="mt-6 rounded-2xl border border-red-200 bg-surface p-6 shadow-sm dark:border-red-500/30">
      <p className="text-xs font-semibold uppercase tracking-widest text-red-600 dark:text-red-400">
        Danger Zone
      </p>
      <p className="mt-2 text-sm text-muted">
        Permanently delete your account and all associated data. This can&apos;t
        be undone.
      </p>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {deleting ? "Deleting…" : "Delete account"}
      </button>
    </div>
  );
}

const colorMap: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  green: "bg-green-500/10 text-green-600 dark:text-green-400",
};

function StatCard({
  label,
  value,
  sub,
  color,
  icon,
}: {
  label: string;
  value?: number | string;
  sub?: string;
  color: keyof typeof colorMap | string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border-muted bg-surface p-4 shadow-sm">
      <div
        className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${colorMap[color] ?? colorMap.slate}`}
      >
        {icon}
      </div>
      <div className="text-2xl font-bold text-foreground">
        {value === undefined ? "—" : value}
      </div>
      <div className="text-xs text-subtle">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-subtle">{sub}</div>}
    </div>
  );
}

type PrefKey =
  | "showName"
  | "showAvatar"
  | "showTopLists"
  | "showOwned"
  | "showForTrade"
  | "showWishlist";

const SHARE_TOGGLES: { key: PrefKey; label: string; def: boolean }[] = [
  { key: "showName", label: "Name", def: true },
  { key: "showAvatar", label: "Profile photo", def: true },
  { key: "showTopLists", label: "Top Games lists", def: true },
  { key: "showOwned", label: "Owned games", def: false },
  { key: "showForTrade", label: "Games for trade", def: false },
  { key: "showWishlist", label: "Wishlist", def: false },
];

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-accent" : "bg-surface-2 ring-1 ring-inset ring-border",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function PublicProfileCard({ me }: { me: Doc<"users"> }) {
  const setPublicProfile = useMutation(api.users.setPublicProfile);
  const toast = useToast();
  const prefs = me.publicProfile ?? {};
  const username = me.username;

  async function set(key: PrefKey, value: boolean) {
    try {
      await setPublicProfile({ [key]: value } as Partial<Record<PrefKey, boolean>>);
    } catch {
      toast("Couldn't update sharing", "error");
    }
  }

  async function copyLink() {
    if (!username) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/user/${username}`,
      );
      toast("Link copied", "success");
    } catch {
      toast("Couldn't copy link", "error");
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-border-muted bg-surface p-6 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-subtle">
        Public profile
      </p>

      {username ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Shareable at</span>
          <Link
            href={`/user/${username}`}
            className="font-semibold text-accent hover:underline"
          >
            /user/{username}
          </Link>
          <button
            onClick={copyLink}
            className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2"
          >
            Copy link
          </button>
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted">
          Set a username above to get a shareable profile page.
        </p>
      )}

      <p className="mb-1 text-xs text-subtle">Choose what visitors can see:</p>
      <div className="divide-y divide-border">
        {SHARE_TOGGLES.map((t) => {
          const checked = prefs[t.key] ?? t.def;
          return (
            <div key={t.key} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-foreground">{t.label}</span>
              <Switch
                checked={checked}
                onChange={(v) => set(t.key, v)}
                label={t.label}
              />
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-subtle">
        Top Games lists only appear if you&apos;ve made them public. Collections
        come from your linked BoardGameGeek account.
      </p>
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

  useEffect(() => {
    setName(me.name ?? "");
    setUsernameInput(me.username ?? "");
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
      // Username first so a taken/invalid one blocks before the name is saved.
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
    <div className="mb-6 rounded-2xl border border-border-muted bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-subtle">
          Personal Info
        </p>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            {EditIcon}
            Edit
          </button>
        )}
      </div>

      <div className="space-y-3">
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
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted">Email</label>
          <p className="py-2 text-sm text-foreground">
            {me.email || <span className="text-subtle">—</span>}
          </p>
        </div>
      </div>

      {editing && (
        <div className="mt-4 flex items-center justify-end gap-2">
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
