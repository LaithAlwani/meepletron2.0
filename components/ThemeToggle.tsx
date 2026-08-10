"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
  // Keep the mobile status-bar colour matched to the app's theme.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDark ? "#191512" : "#faf6ee");
}

/** Shared theme state — reads/writes localStorage and applies globally. */
function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem("theme") as Theme | null) ?? "system";
    setThemeState(stored);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyTheme(theme);
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme, mounted]);

  function setTheme(next: Theme) {
    setThemeState(next);
    localStorage.setItem("theme", next);
  }

  return { theme, setTheme, mounted };
}

const OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Compact single-row theme control: a label + a 3-way segmented icon toggle. */
export function ThemeMenu() {
  const { theme, setTheme, mounted } = useTheme();
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5">
      <span className="text-sm font-medium text-muted">Theme</span>
      <div
        role="group"
        aria-label="Theme"
        className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5"
      >
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const active = mounted && theme === o.value;
          return (
            <button
              key={o.value}
              onClick={() => setTheme(o.value)}
              aria-label={o.label}
              aria-pressed={active}
              title={o.label}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                active
                  ? "bg-surface text-accent shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Single cycling icon button (used where there's no dropdown, e.g. chat bar). */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme, mounted } = useTheme();

  function cycle() {
    setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
  }

  const Icon =
    !mounted || theme === "system" ? Monitor : theme === "light" ? Sun : Moon;

  return (
    <button
      onClick={cycle}
      aria-label={`Theme: ${theme}. Click to change.`}
      title={`Theme: ${theme}`}
      className={`flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground ${className}`}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}
