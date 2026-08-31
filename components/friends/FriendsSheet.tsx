"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { X, Users, UserRound, Settings2, Mail, Check } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Sheet } from "@/components/ui/Sheet";
import { AvatarImg } from "@/components/ui/Avatar";

/**
 * A profile's friends list — the accepted friends (accounts), plus, when it's
 * your own profile, the people you've added in plays who aren't on Meepletron.
 */
export function FriendsSheet({
  open,
  onClose,
  username,
  isSelf,
}: {
  open: boolean;
  onClose: () => void;
  username: string;
  isSelf: boolean;
}) {
  const friends = useQuery(
    api.friends.listFriends,
    open ? { username } : "skip",
  );
  const people = useQuery(
    api.plays.myPlayPeople,
    open && isSelf ? {} : "skip",
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      desktop="center"
      desktopWidth="sm:max-w-md"
      mobileHeight="h-[75vh]"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-display text-lg font-bold">Friends</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <X className="h-4.5 w-4.5" />
        </button>
      </div>

      <div className="themed-scroll flex-1 overflow-y-auto px-4 py-3">
        {/* Friends (accounts) */}
        {friends === undefined ? (
          <p className="py-8 text-center text-sm text-subtle">Loading…</p>
        ) : friends.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center text-subtle">
            <Users className="h-7 w-7" />
            <p className="mt-2 text-sm">No friends yet.</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {friends.map((f) => (
              <li key={f._id}>
                <Link
                  href={f.username ? `/user/${f.username}` : "#"}
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/12 text-sm font-bold text-accent">
                    <AvatarImg
                      src={f.avatarUrl}
                      initial={f.name.charAt(0).toUpperCase()}
                    />
                  </span>
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-sm font-semibold">{f.name}</p>
                    {f.username && (
                      <p className="truncate text-xs font-semibold text-accent">
                        @{f.username}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* People you added in plays (self only) */}
        {isSelf && people && people.length > 0 && (
          <>
            <div className="mt-5 mb-1.5 flex items-center gap-2 px-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-subtle">
                People you play with
              </p>
              <span className="text-xs text-subtle">· not on Meepletron</span>
            </div>
            <ul className="space-y-1">
              {people.map((p) => (
                <li
                  key={p._id}
                  className="flex items-center gap-3 rounded-xl px-2 py-2"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-muted">
                    <UserRound className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="truncate text-xs text-subtle">
                      {p.playCount} {p.playCount === 1 ? "play" : "plays"}
                    </p>
                  </div>
                  {p.linked ? (
                    <span
                      title="Joined Meepletron"
                      className="inline-flex items-center gap-1 rounded-full bg-accent-2/12 px-2 py-0.5 text-[11px] font-semibold text-accent-2"
                    >
                      <Check className="h-3 w-3" />
                      Joined
                    </span>
                  ) : p.hasEmail ? (
                    <Mail className="h-4 w-4 shrink-0 text-subtle" />
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {isSelf && (
        <div className="border-t border-border p-3">
          <Link
            href="/plays/people"
            onClick={onClose}
            className="flex items-center justify-center gap-2 rounded-xl bg-surface-2 py-2.5 text-sm font-semibold text-muted transition-colors hover:text-foreground"
          >
            <Settings2 className="h-4 w-4" />
            Manage friends &amp; people
          </Link>
        </div>
      )}
    </Sheet>
  );
}
