"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export type FontSize = "sm" | "base" | "lg" | "xl";

export type Preferences = {
  fontSize: FontSize;
  reduceMotion: boolean;
  compact: boolean;
  enterToSend: boolean;
  showSources: boolean;
  emailUpdates: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  fontSize: "base",
  reduceMotion: false,
  compact: false,
  enterToSend: true,
  showSources: true,
  emailUpdates: false,
};

/** Root font-size (px) applied for each option — scales all rem-based sizing. */
export const FONT_SIZE_PX: Record<FontSize, number> = {
  sm: 15,
  base: 16,
  lg: 18,
  xl: 20,
};

/** The current user's preferences, with defaults filled in. */
export function usePreferences(): Preferences {
  const me = useQuery(api.users.me);
  return { ...DEFAULT_PREFERENCES, ...(me?.preferences ?? {}) };
}
