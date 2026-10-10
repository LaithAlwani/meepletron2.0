"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import {
  Lock,
  Globe,
  Loader2,
  MessageCircle,
  Sparkles,
  Settings,
  Shield,
  ChevronRight,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/Surface";
import { buttonClasses } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Sheet } from "@/components/ui/Sheet";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { AccountSection, ProfileAvatar } from "@/components/settings/AccountSection";

export default function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const data = useQuery(api.topGames.publicProfile, { username });
  const me = useQuery(api.users.me);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (data === undefined) {
    return (
      <div className="mx-auto max-w-site px-4 pb-8 pt-3 nav:pt-8">
        <div className="flex items-center gap-6">
          <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="mx-auto max-w-site px-4 pb-8 pt-3 nav:pt-8">
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <p className="font-medium">No such user.</p>
          <Link
            href="/boardgames"
            className={`mt-4 ${buttonClasses("ghost", "sm")}`}
          >
            Back to the Library
          </Link>
        </div>
      </div>
    );
  }

  const { author } = data;
  const isSelf = data.isSelf;
  const name = author?.realName ?? me?.name ?? author?.username ?? "Player";
  const initial = (author?.username ?? "?").charAt(0).toUpperCase();
  const avatarUrl = author?.avatarUrl ?? (isSelf ? me?.avatarUrl : null);

  return (
    <div className="mx-auto max-w-site px-4 pb-8 pt-3 nav:pt-8">
      {/* Header */}
      <div className="flex items-center gap-5 sm:gap-8">
        {isSelf && me ? (
          // Own profile: the editable avatar (camera + recent photos) lives here.
          <ProfileAvatar
            avatarUrl={me.avatarUrl ?? null}
            canEdit={me.isAnonymous !== true}
            isGuest={me.isAnonymous === true}
            initial={initial}
            hasUpload={!!(me.avatarKey || me.avatarStorageId)}
            recentAvatars={me.recentAvatars}
          />
        ) : avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="h-20 w-20 shrink-0 rounded-full object-cover sm:h-24 sm:w-24"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-accent/12 text-2xl font-bold text-accent sm:h-24 sm:w-24">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-display truncate text-xl font-extrabold tracking-tight sm:text-2xl">
              {name}
            </h1>
            {isSelf && (
              <OwnerControls
                isPublic={me?.publicProfile?.isPublic ?? true}
                onSettings={() => setSettingsOpen(true)}
              />
            )}
          </div>
          {author?.username && (
            <p className="mt-0.5 text-sm font-semibold text-accent">
              @{author.username}
            </p>
          )}
        </div>
      </div>

      {isSelf ? (
        <div className="mt-6 space-y-6">
          <AccountSection />
          <UsageCard />
          {me?.role === "admin" && (
            <Link
              href="/admin"
              className="flex items-center gap-3 rounded-2xl border border-border-muted bg-surface px-4 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
            >
              <Shield className="h-4.5 w-4.5 shrink-0 text-muted" />
              <span className="flex-1">Admin console</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
            </Link>
          )}
        </div>
      ) : data.private ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <Lock className="mx-auto h-7 w-7 text-subtle" />
          <p className="mt-3 font-medium">This profile is private.</p>
        </div>
      ) : null}

      {/* Settings — opened by the gear; no dedicated URL. */}
      {isSelf && (
        <Sheet
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          desktop="right"
          desktopWidth="sm:w-[30rem]"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <p className="font-display text-lg font-bold">Settings</p>
            <button
              onClick={() => setSettingsOpen(false)}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
          <div
            data-lenis-prevent
            className="themed-scroll min-h-0 flex-1 overflow-y-auto p-4"
          >
            <SettingsPanel />
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** The signed-in user's usage at a glance: open chats + tokens used. */
function UsageCard() {
  const stats = useQuery(api.users.myProfileStats);
  return (
    <div className="grid grid-cols-2 gap-3">
      <Stat
        icon={<MessageCircle className="h-4 w-4 text-accent" />}
        label="Open chats"
        value={stats ? String(stats.chats) : "…"}
      />
      <Stat
        icon={<Sparkles className="h-4 w-4 text-accent" />}
        label="Tokens used"
        value={stats ? stats.tokensUsed.toLocaleString() : "…"}
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {icon}
        {label}
      </div>
      <p className="font-display mt-1 text-2xl font-extrabold tracking-tight">
        {value}
      </p>
    </div>
  );
}

/** Self controls: a Public/Private toggle + a gear that opens Settings. */
function OwnerControls({
  isPublic,
  onSettings,
}: {
  isPublic: boolean;
  onSettings: () => void;
}) {
  const setPublicProfile = useMutation(api.users.setPublicProfile);
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    try {
      await setPublicProfile({ isPublic: !isPublic });
      toast(
        isPublic ? "Profile is now private." : "Profile is now public.",
        "success",
      );
    } catch {
      toast("Couldn't update.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggle}
        disabled={saving}
        className={buttonClasses("subtle", "sm")}
        title={isPublic ? "Make private" : "Make public"}
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPublic ? (
          <Globe className="h-4 w-4" />
        ) : (
          <Lock className="h-4 w-4" />
        )}
        {isPublic ? "Public" : "Private"}
      </button>
      <button
        onClick={onSettings}
        aria-label="Settings"
        title="Settings"
        className={buttonClasses("ghost", "sm")}
      >
        <Settings className="h-4 w-4" />
      </button>
    </div>
  );
}
