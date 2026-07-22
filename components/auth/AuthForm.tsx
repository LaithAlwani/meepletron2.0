"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GUEST_UPGRADE_KEY } from "@/components/auth/GuestUpgradeClaimer";

type Flow = "signIn" | "signUp";

export function AuthForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const me = useQuery(api.users.me);
  const beginUpgrade = useMutation(api.guest.beginUpgrade);
  const isGuest = me?.isAnonymous === true;
  const [flow, setFlow] = useState<Flow>("signIn");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When a guest signs up/in, stash a claim token first so their chats and
  // favorites can migrate to the new account (Convex Auth doesn't auto-link).
  async function stashGuestUpgrade() {
    if (!isGuest) return;
    try {
      const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
      await beginUpgrade({ token });
      localStorage.setItem(GUEST_UPGRADE_KEY, token);
    } catch {
      /* upgrade is best-effort — don't block sign-in */
    }
  }

  async function handlePassword(formData: FormData) {
    setSubmitting(true);
    setError(null);
    try {
      await stashGuestUpgrade();
      formData.set("flow", flow);
      await signIn("password", formData);
      router.push("/boardgames");
    } catch {
      setError(
        flow === "signIn"
          ? "Could not sign in. Check your email and password."
          : "Could not sign up. That email may already be in use.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleProvider(provider: "google" | "anonymous") {
    setSubmitting(true);
    setError(null);
    try {
      if (provider === "google") await stashGuestUpgrade();
      await signIn(provider);
      if (provider === "anonymous") router.push("/boardgames");
      // Google redirects away and back; no local push needed.
    } catch {
      setError("Sign-in failed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">
          {flow === "signIn" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {flow === "signIn"
            ? "Sign in to save your chats and rulebook sources."
            : "Sign up to keep your chats across devices."}
        </p>
      </div>

      {isGuest && (
        <div className="mb-4 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 text-center text-sm">
          You&apos;re a guest — {flow === "signIn" ? "signing in" : "signing up"}{" "}
          will keep your current chats and favourites.
        </div>
      )}

      <form action={handlePassword} className="space-y-3">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={flow === "signIn" ? "current-password" : "new-password"}
            required
            minLength={8}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting
            ? "Please wait…"
            : flow === "signIn"
              ? "Sign in"
              : "Sign up"}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-muted">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-2">
        <button
          onClick={() => handleProvider("google")}
          disabled={submitting}
          className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 font-medium transition-colors hover:bg-surface-2 disabled:opacity-50"
        >
          Continue with Google
        </button>
        <button
          onClick={() => handleProvider("anonymous")}
          disabled={submitting}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
        >
          Continue as guest
        </button>
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        {flow === "signIn" ? "New here?" : "Already have an account?"}{" "}
        <button
          onClick={() => {
            setFlow(flow === "signIn" ? "signUp" : "signIn");
            setError(null);
          }}
          className="font-semibold text-accent hover:underline"
        >
          {flow === "signIn" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
