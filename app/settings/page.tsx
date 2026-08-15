"use client";

import Link from "next/link";
import {
  useMutation,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  usePreferences,
  type FontSize,
  type Preferences,
} from "@/lib/usePreferences";
import { BggAccountCard } from "@/components/settings/BggAccountCard";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-10">
      <h1 className="mb-1 text-2xl font-bold">Settings</h1>
      <p className="mb-6 text-sm text-muted">
        These preferences are saved to your account.
      </p>
      <AuthLoading>
        <p className="text-muted">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <div className="rounded-2xl border border-border-muted bg-surface p-6 text-center">
          <p className="text-sm text-muted">Sign in to change your settings.</p>
          <Link
            href="/auth"
            className="mt-3 inline-block rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            Sign in
          </Link>
        </div>
      </Unauthenticated>
      <Authenticated>
        <SettingsBody />
      </Authenticated>
    </div>
  );
}

const FONT_OPTIONS: { value: FontSize; label: string }[] = [
  { value: "sm", label: "Small" },
  { value: "base", label: "Default" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra large" },
];

function SettingsBody() {
  const prefs = usePreferences();
  const save = useMutation(api.users.updateSettings);

  function set(patch: Partial<Preferences>) {
    void save({ preferences: { ...prefs, ...patch } });
  }

  return (
    <div className="space-y-6">
      {/* BoardGameGeek */}
      <Section title="BoardGameGeek">
        <BggAccountCard />
      </Section>

      {/* Display */}
      <Section title="Display">
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
          label="Product update emails"
          hint="Occasional emails about new features."
          checked={prefs.emailUpdates}
          onChange={(v) => set({ emailUpdates: v })}
        />
      </Section>
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
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
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
