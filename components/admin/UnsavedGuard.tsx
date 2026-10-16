"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

type Entry = { isDirty: () => boolean; save: () => Promise<void> };
type GuardApi = {
  register: (key: string, entry: Entry) => () => void;
};

const GuardCtx = createContext<GuardApi | null>(null);

/**
 * Register a form's dirty state + save with the page guard, so leaving the page
 * with unsaved changes prompts a Save/Discard/Stay dialog. `dirty`/`save` are
 * read live (via a ref), so they always reflect the latest render. A no-op when
 * rendered outside an {@link UnsavedGuardProvider} (e.g. a standalone form).
 */
export function useUnsavedForm(
  key: string,
  dirty: boolean,
  save: () => Promise<void>,
) {
  const ctx = useContext(GuardCtx);
  const ref = useRef({ dirty, save });
  // Keep the live values in a ref so the registered entry always reads the
  // latest render's dirty/save (updated in an effect, never during render).
  useEffect(() => {
    ref.current = { dirty, save };
  });
  useEffect(() => {
    if (!ctx) return;
    return ctx.register(key, {
      isDirty: () => ref.current.dirty,
      save: () => ref.current.save(),
    });
  }, [ctx, key]);
}

/**
 * Warns before leaving the page (in-app link navigation or a hard unload) while
 * any registered form has unsaved changes, with a Save option that persists the
 * dirty forms before continuing. In-app link clicks are intercepted in the
 * capture phase; hard reloads/closes fall back to the browser's native prompt.
 */
export function UnsavedGuardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const registry = useRef(new Map<string, Entry>());
  const [pending, setPending] = useState<string | null>(null); // target href
  const [saving, setSaving] = useState(false);

  const register = useCallback((key: string, entry: Entry) => {
    registry.current.set(key, entry);
    return () => {
      registry.current.delete(key);
    };
  }, []);

  const anyDirty = useCallback(
    () => [...registry.current.values()].some((e) => e.isDirty()),
    [],
  );
  const saveAll = useCallback(async () => {
    for (const e of registry.current.values()) {
      if (e.isDirty()) await e.save();
    }
  }, []);

  // Native prompt for hard reloads / tab close (can't show a custom dialog there).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (anyDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyDirty]);

  // Intercept in-app link clicks (capture phase, before Next's router handler).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      const href = anchor?.getAttribute("href");
      if (
        !anchor ||
        !href ||
        anchor.target === "_blank" ||
        href.startsWith("#") ||
        /^[a-z]+:/i.test(href) // http(s):, mailto:, etc. — external
      )
        return;
      if (!anyDirty()) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [anyDirty]);

  async function onSaveAndLeave() {
    const href = pending;
    setSaving(true);
    try {
      await saveAll();
    } catch {
      setSaving(false);
      toast("Couldn't save — fix the error and try again.", "error");
      return; // stay on the page
    }
    setSaving(false);
    setPending(null);
    if (href) router.push(href);
  }
  function onDiscard() {
    const href = pending;
    setPending(null);
    if (href) router.push(href);
  }

  return (
    <GuardCtx.Provider value={{ register }}>
      {children}
      {pending !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-auto fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl">
              <h2 className="text-lg font-semibold">Unsaved changes</h2>
              <p className="mt-2 text-sm text-muted">
                You have changes that haven&apos;t been saved. Save them before
                leaving?
              </p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  onClick={() => setPending(null)}
                  disabled={saving}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
                >
                  Stay
                </button>
                <button
                  onClick={onDiscard}
                  disabled={saving}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  Leave without saving
                </button>
                <button
                  onClick={onSaveAndLeave}
                  disabled={saving}
                  autoFocus
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save & leave"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </GuardCtx.Provider>
  );
}
