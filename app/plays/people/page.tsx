"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useQuery,
  useMutation,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeft, Pencil, Trash2, Mail, BadgeCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageTitle } from "@/components/ui/PageTitle";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { friendlyError } from "@/lib/friendlyError";
import { cn } from "@/lib/cn";

type Person = FunctionReturnType<typeof api.plays.myPeople>[number];

export default function PeoplePage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Link
        href="/plays"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        My plays
      </Link>
      <PageTitle>Friends</PageTitle>
      <p className="mt-1 text-sm text-muted">
        Friends you&apos;ve added who aren&apos;t on Meepletron yet. Fix a name or
        email, or remove someone you added by mistake.
      </p>

      <div className="mt-6">
        <AuthLoading>
          <PeopleSkeleton />
        </AuthLoading>
        <Unauthenticated>
          <div className="rounded-2xl border border-border bg-surface p-6 text-center">
            <p className="text-sm text-muted">Sign in to manage your friends.</p>
            <Link href="/auth" className={`mt-4 ${buttonClasses("primary", "sm")}`}>
              Sign in
            </Link>
          </div>
        </Unauthenticated>
        <Authenticated>
          <PeopleList />
        </Authenticated>
      </div>
    </div>
  );
}

function PeopleList() {
  const people = useQuery(api.plays.myPeople);
  if (people === undefined) return <PeopleSkeleton />;
  if (people.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
        <p className="font-medium">No friends yet.</p>
        <p className="mt-1 text-sm">
          People you add when logging a play show up here.
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border-muted overflow-hidden rounded-2xl border border-border-muted bg-surface">
      {people.map((p) => (
        <PersonRow key={p._id} person={p} />
      ))}
    </ul>
  );
}

function PersonRow({ person }: { person: Person }) {
  const update = useMutation(api.plays.updatePlayPerson);
  const remove = useMutation(api.plays.deletePlayPerson);
  const toast = useToast();
  const confirm = useConfirm();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(person.rawName);
  const [email, setEmail] = useState(person.email ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await update({ personId: person._id, name, email });
      setEditing(false);
      toast("Saved.", "success");
    } catch (e) {
      toast(friendlyError(e, "Couldn't save."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: `Remove ${person.rawName}?`,
      message:
        "They'll be removed from your saved players. Your past plays keep their name — history isn't changed.",
      confirmText: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await remove({ personId: person._id });
      toast("Removed.", "success");
    } catch (e) {
      toast(friendlyError(e, "Couldn't remove."), "error");
    }
  }

  if (editing) {
    return (
      <li className="p-3">
        <div className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-2 focus:ring-ring/40"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            type="email"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button
            onClick={() => {
              setEditing(false);
              setName(person.rawName);
              setEmail(person.email ?? "");
            }}
            className={buttonClasses("ghost", "sm")}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || !name.trim()}
            className={buttonClasses("primary", "sm")}
          >
            Save
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 p-3">
      {person.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={person.avatarUrl}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/12 text-sm font-bold text-accent">
          {person.name.replace(/^@/, "").charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
          {person.name}
          {person.linked && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-accent-2/15 px-1.5 py-px text-[10px] font-bold text-accent-2">
              <BadgeCheck className="h-3 w-3" />
              on Meepletron
            </span>
          )}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-subtle">
          {person.email ? (
            <span className="inline-flex items-center gap-1 truncate">
              <Mail className="h-3 w-3 shrink-0" />
              {person.email}
            </span>
          ) : (
            <span>no email</span>
          )}
          <span>·</span>
          <span>
            {person.playCount} {person.playCount === 1 ? "play" : "plays"}
          </span>
        </p>
      </div>
      {person.linked ? (
        <span className="text-xs text-subtle">Joined</span>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setEditing(true)}
            aria-label="Edit"
            title="Edit"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            aria-label="Remove"
            title="Remove"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors",
              "hover:bg-red-500/10 hover:text-red-500",
            )}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </li>
  );
}

function PeopleSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}
