"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  usePaginatedQuery,
  useMutation,
  useQuery,
  useConvexAuth,
  Authenticated,
  Unauthenticated,
} from "convex/react";
import { X, Send, Heart, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useToast } from "@/components/ui/Toast";
import { relativeTime } from "@/lib/format";
import { Sheet } from "@/components/ui/Sheet";

/** Split a comment into text + clickable @mentions. */
function renderBody(text: string) {
  return text.split(/(@\w+)/g).map((part, i) =>
    /^@\w+$/.test(part) ? (
      <Link
        key={i}
        href={`/user/${part.slice(1)}`}
        className="font-semibold text-accent hover:underline"
      >
        {part}
      </Link>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

type CommentItem = FunctionReturnType<
  typeof api.posts.listComments
>["page"][number];

/** One comment: like + ⋮ menu (edit/delete) on the header line; inline edit. */
function CommentRow({
  c,
  onLike,
  onDelete,
  onEdit,
}: {
  c: CommentItem;
  onLike: () => void;
  onDelete: () => void;
  onEdit: (text: string) => Promise<unknown> | void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.text);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  async function save() {
    const body = draft.trim();
    if (!body) return;
    await onEdit(body);
    setEditing(false);
  }

  return (
    <li className="flex gap-2.5">
      {c.author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.author.avatarUrl}
          alt=""
          className="h-8 w-8 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/12 text-xs font-bold text-accent">
          {c.author.name.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {c.author.username ? (
            <Link
              href={`/user/${c.author.username}`}
              className="truncate text-sm font-semibold hover:text-accent"
            >
              {c.author.name}
            </Link>
          ) : (
            <span className="truncate text-sm font-semibold">
              {c.author.name}
            </span>
          )}
          <span className="shrink-0 text-xs text-subtle">
            {relativeTime(c.createdAt)}
            {c.editedAt ? " · edited" : ""}
          </span>

          <div ref={menuRef} className="relative ml-auto flex items-center gap-0.5">
            <button
              onClick={onLike}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-semibold transition-colors",
                c.myLike ? "text-red-500" : "text-subtle hover:text-foreground",
              )}
            >
              <Heart className={cn("h-3.5 w-3.5", c.myLike && "fill-current")} />
              {c.likeCount > 0 && c.likeCount}
            </button>
            {(c.canEdit || c.canDelete) && (
              <>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="Comment options"
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-subtle hover:bg-surface-2 hover:text-foreground"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <div className="animate-in absolute right-0 top-full z-10 mt-1 w-32 rounded-xl border border-border bg-surface p-1 shadow-xl">
                    {c.canEdit && (
                      <button
                        onClick={() => {
                          setDraft(c.text);
                          setEditing(true);
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    )}
                    {c.canDelete && (
                      <button
                        onClick={() => {
                          onDelete();
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {editing ? (
          <div className="mt-1">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              className="w-full"
            />
            <div className="mt-1 flex justify-end gap-2">
              <button
                onClick={() => setEditing(false)}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={!draft.trim()}
                className="rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap wrap-break-word text-sm text-foreground">
            {renderBody(c.text)}
          </p>
        )}
      </div>
    </li>
  );
}

/** The @mention being typed just before the caret, if any. */
function activeMention(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const m = /(?:^|\s)@(\w{1,30})$/.exec(before);
  if (!m) return null;
  return { start: caret - m[1].length - 1, query: m[1] };
}

/**
 * Comments for a post — a bottom sheet on mobile, a right-hand sidebar on
 * desktop. Comments on top (scrollable), composer pinned at the bottom with
 * @mention autocomplete.
 */
export function CommentsDrawer({
  open,
  onClose,
  postId,
}: {
  open: boolean;
  onClose: () => void;
  postId: Id<"posts">;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.posts.listComments,
    open ? { postId } : "skip",
    { initialNumItems: 20 },
  );
  const add = useMutation(api.posts.addComment);
  const del = useMutation(api.posts.deleteComment);
  const editC = useMutation(api.posts.editComment);
  const likeComment = useMutation(api.posts.toggleCommentReaction);
  const { isAuthenticated } = useConvexAuth();
  const toast = useToast();

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(
    null,
  );
  const [caret, setCaret] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const mentionHits =
    useQuery(
      api.users.searchUsers,
      mention && mention.query.length >= 2 ? { term: mention.query } : "skip",
    ) ?? [];

  useEffect(() => {
    const el = sentinel.current;
    if (!el || status !== "CanLoadMore") return;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && loadMore(20),
      { root: listRef.current, rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [status, loadMore]);

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    const pos = e.target.selectionStart ?? value.length;
    setText(value);
    setCaret(pos);
    setMention(activeMention(value, pos));
  }

  function pickMention(username: string) {
    if (!mention) return;
    const insert = `@${username} `;
    const next = text.slice(0, mention.start) + insert + text.slice(caret);
    setText(next);
    setMention(null);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        const p = mention.start + insert.length;
        el.focus();
        el.setSelectionRange(p, p);
        setCaret(p);
      }
    });
  }

  async function post() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await add({ postId, text: body });
      setText("");
      setMention(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't post comment", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} desktopWidth="sm:w-96" mobileMaxH="max-h-[85vh]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-lg font-bold">Comments</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Comments list */}
        <div ref={listRef} className="themed-scroll flex-1 overflow-y-auto px-4 py-3">
          {results.length === 0 && status !== "LoadingFirstPage" ? (
            <p className="py-8 text-center text-sm text-subtle">
              No comments yet — be the first.
            </p>
          ) : (
            <ul className="space-y-4">
              {results.map((c) => (
                <CommentRow
                  key={c._id}
                  c={c}
                  onLike={() => {
                    if (!isAuthenticated) {
                      toast("Sign in to like comments.", "info", {
                        label: "Sign in",
                        href: "/auth",
                      });
                      return;
                    }
                    void likeComment({ commentId: c._id });
                  }}
                  onDelete={() => void del({ commentId: c._id })}
                  onEdit={(newText) =>
                    editC({ commentId: c._id, text: newText })
                  }
                />
              ))}
            </ul>
          )}
          <div ref={sentinel} aria-hidden className="h-px" />
        </div>

        {/* Composer */}
        <div className="relative border-t border-border p-3">
          <Authenticated>
            {mention && mentionHits.length > 0 && (
              <ul className="absolute bottom-full left-3 right-3 mb-1 max-h-52 overflow-auto rounded-xl border border-border bg-surface p-1 shadow-xl">
                {mentionHits.map((u) => (
                  <li key={u._id}>
                    <button
                      onClick={() => pickMention(u.username ?? "")}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
                    >
                      {u.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u.avatarUrl}
                          alt=""
                          className="h-6 w-6 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">
                          {u.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {u.name}
                      </span>
                      {u.username && (
                        <span className="shrink-0 text-[11px] font-semibold text-accent">
                          @{u.username}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={text}
                onChange={onChange}
                onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
                onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
                placeholder="Add a comment… use @ to tag"
                rows={1}
                className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-2 focus:ring-ring/40"
              />
              <button
                onClick={post}
                disabled={busy || !text.trim()}
                aria-label="Post comment"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </Authenticated>
          <Unauthenticated>
            <p className="text-center text-sm text-muted">
              <Link href="/auth" className="font-semibold text-accent hover:underline">
                Sign in
              </Link>{" "}
              to join the conversation.
            </p>
          </Unauthenticated>
        </div>
    </Sheet>
  );
}
