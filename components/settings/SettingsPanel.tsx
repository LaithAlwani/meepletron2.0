"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Shield, ChevronRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  usePreferences,
  type FontSize,
  type Preferences,
} from "@/lib/usePreferences";
import { BggAccountCard } from "@/components/settings/BggAccountCard";
import { AccountSection } from "@/components/settings/AccountSection";
import { ThemeMenu } from "@/components/ThemeToggle";

const FONT_OPTIONS: { value: FontSize; label: string }[] = [
  { value: "sm", label: "Small" },
  { value: "base", label: "Default" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra large" },
];

/** The full account + preferences panel. Lives on the profile page. */
export function SettingsPanel() {
  const prefs = usePreferences();
  const me = useQuery(api.users.me);
  const isAdmin = me?.role === "admin";
  const save = useMutation(api.users.updateSettings);

  // Deep-link support: `#product-updates` (e.g. from the "request a rulebook"
  // nudge) scrolls to and briefly highlights that exact toggle.
  const [highlightUpdates, setHighlightUpdates] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#product-updates") return;
    const scroll = setTimeout(() => {
      document
        .getElementById("product-updates")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightUpdates(true);
    }, 150);
    const clear = setTimeout(() => setHighlightUpdates(false), 3200);
    return () => {
      clearTimeout(scroll);
      clearTimeout(clear);
    };
  }, []);

  function set(patch: Partial<Preferences>) {
    void save({ preferences: { ...prefs, ...patch } });
  }

  const allEmailOn =
    prefs.emailFriendRequests && prefs.emailComments && prefs.emailMentions;

  return (
    <div className="space-y-6">
      {/* Account */}
      <div>
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-subtle">
          Account
        </p>
        <AccountSection />
      </div>

      {/* BoardGameGeek */}
      <Section title="BoardGameGeek">
        <BggAccountCard />
      </Section>

      {/* Display */}
      <Section title="Display">
        <div className="py-2">
          <ThemeMenu />
        </div>
        <div className="px-4 py-3.5">
          <p className="text-sm font-medium text-foreground">Font size</p>
          <p className="mb-2.5 text-xs text-muted">
            Scales text across the whole app.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FONT_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => set({ fontSize: o.value })}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  prefs.fontSize === o.value
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-muted hover:bg-surface-2"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <Toggle
          label="Reduce motion"
          hint="Minimise animations and transitions."
          checked={prefs.reduceMotion}
          onChange={(v) => set({ reduceMotion: v })}
        />
        <Toggle
          label="Compact mode"
          hint="Tighter spacing throughout."
          checked={prefs.compact}
          onChange={(v) => set({ compact: v })}
        />
      </Section>

      {/* Chat */}
      <Section title="Chat">
        <Toggle
          label="Send with Enter"
          hint="Press Enter to send; Shift+Enter for a new line. When off, use ⌘/Ctrl+Enter."
          checked={prefs.enterToSend}
          onChange={(v) => set({ enterToSend: v })}
        />
        <Toggle
          label="Show source citations"
          hint="Show the rulebook passages behind each answer."
          checked={prefs.showSources}
          onChange={(v) => set({ showSources: v })}
        />
      </Section>

      {/* Notifications */}
      <Section title="Notifications">
        <Toggle
          label="Email notifications"
          hint="Master switch — turn every email nudge below on or off."
          checked={allEmailOn}
          onChange={(v) =>
            set({
              emailFriendRequests: v,
              emailComments: v,
              emailMentions: v,
            })
          }
        />
        <Toggle
          id="product-updates"
          highlight={highlightUpdates}
          label="Product update emails"
          hint="Occasional emails about new features, plus a heads-up when a rulebook you requested is added."
          checked={prefs.emailUpdates}
          onChange={(v) => set({ emailUpdates: v })}
        />
      </Section>

      {/* Admin — only for admins. */}
      {isAdmin && (
        <Section title="Admin">
          <Link
            href="/admin"
            className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
          >
            <Shield className="h-4.5 w-4.5 shrink-0 text-muted" />
            <span className="flex-1">Admin console</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
          </Link>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-subtle">
        {title}
      </p>
      <div className="divide-y divide-border-muted overflow-hidden rounded-2xl border border-border-muted bg-surface">
        {children}
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  id,
  highlight,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  id?: string;
  highlight?: boolean;
}) {
  return (
    <div
      id={id}
      className={`flex scroll-mt-24 items-center justify-between gap-4 px-4 py-3.5 transition-colors duration-500 ${
        highlight ? "bg-accent/10 ring-2 ring-inset ring-accent" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-surface-2 ring-1 ring-inset ring-border"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
