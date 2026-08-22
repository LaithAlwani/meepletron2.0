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

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  // When set, shows a "Don't ask again" checkbox; if the user confirms with it
  // checked, this localStorage key is set and future confirms with the same key
  // resolve true immediately (no dialog).
  suppressKey?: string;
};

const ConfirmContext = createContext<
  ((options: ConfirmOptions) => Promise<boolean>) | null
>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [dontAsk, setDontAsk] = useState(false);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    if (
      opts.suppressKey &&
      typeof window !== "undefined" &&
      localStorage.getItem(opts.suppressKey) === "1"
    ) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setDontAsk(false);
      setOptions(opts);
    });
  }, []);

  const close = useCallback(
    (value: boolean) => {
      if (value && options?.suppressKey && dontAsk) {
        try {
          localStorage.setItem(options.suppressKey, "1");
        } catch {
          /* private mode — ignore */
        }
      }
      resolver.current?.(value);
      resolver.current = null;
      setOptions(null);
    },
    [options, dontAsk],
  );

  useEffect(() => {
    if (!options) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => close(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">{options.title}</h2>
            {options.message && (
              <p className="mt-2 text-sm text-muted">{options.message}</p>
            )}
            {options.suppressKey && (
              <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={dontAsk}
                  onChange={(e) => setDontAsk(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                Don&apos;t ask me again
              </label>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => close(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2"
              >
                {options.cancelText ?? "Cancel"}
              </button>
              <button
                onClick={() => close(true)}
                autoFocus
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 ${
                  options.danger ? "bg-red-600" : "bg-accent text-accent-foreground"
                }`}
              >
                {options.confirmText ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
