"use client";

import { useEffect, useState } from "react";
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
import type { Doc } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";

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
              className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-fg"
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
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 text-3xl font-bold text-primary">
          {isGuest ? "🎲" : initial}
        </div>
        <h1 className="text-xl font-bold text-foreground">{fullName}</h1>
        <p className="mt-0.5 text-sm text-subtle">{me.email ?? "—"}</p>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-subtle">
          {CalendarIcon}
          Member since {memberSince}
        </div>

        {isGuest ? (
          <Link
            href="/auth"
            className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg hover:opacity-90"
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

      {/* Personal info */}
      {!isGuest && <PersonalInfo me={me} />}

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
      </div>
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

function PersonalInfo({ me }: { me: Doc<"users"> }) {
  const updateProfile = useMutation(api.users.updateProfile);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(me.name ?? "");

  useEffect(() => {
    setName(me.name ?? "");
  }, [me.name]);

  const dirty = name !== (me.name ?? "");
  const inputCls =
    "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50";

  async function save() {
    if (!dirty) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ name });
      toast("Profile updated", "success");
      setEditing(false);
    } catch {
      toast("Couldn't update profile", "error");
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
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
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
              setEditing(false);
            }}
            disabled={saving}
            className="rounded-xl px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
