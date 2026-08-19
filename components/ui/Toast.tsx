"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "success" | "error" | "info";
type ToastAction = { label: string; href: string };
type Toast = {
  id: number;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
};

const ToastContext = createContext<{
  toast: (message: string, kind?: ToastKind, action?: ToastAction) => void;
} | null>(null);

const kindStyles: Record<ToastKind, string> = {
  success: "border-green-700 bg-green-600 text-white",
  error: "border-red-700 bg-red-600 text-white",
  info: "border-border bg-surface text-foreground",
};

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback(
    (message: string, kind: ToastKind = "info", action?: ToastAction) => {
      const id = ++counter;
      setToasts((prev) => [...prev, { id, message, kind, action }]);
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        action ? 6000 : 4000,
      );
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`animate-in pointer-events-auto flex w-fit max-w-[calc(100vw-1.5rem)] items-center gap-2 wrap-break-word rounded-lg border px-3.5 py-2 text-[13px] font-medium shadow-xl sm:max-w-sm sm:text-sm ${kindStyles[t.kind]}`}
          >
            <span>{t.message}</span>
            {t.action && (
              <Link
                href={t.action.href}
                onClick={() =>
                  setToasts((prev) => prev.filter((x) => x.id !== t.id))
                }
                className="shrink-0 font-bold underline underline-offset-2"
              >
                {t.action.label}
              </Link>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.toast;
}
