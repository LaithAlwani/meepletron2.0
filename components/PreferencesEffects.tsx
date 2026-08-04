"use client";

import { useEffect } from "react";
import { usePreferences, FONT_SIZE_PX } from "@/lib/usePreferences";

/**
 * Applies the current user's display preferences to the document root:
 * font size (scales all rem sizing), reduced motion, and compact density.
 * Rendered once in the layout; renders nothing.
 */
export function PreferencesEffects() {
  const { fontSize, reduceMotion, compact } = usePreferences();

  useEffect(() => {
    document.documentElement.style.fontSize = `${FONT_SIZE_PX[fontSize]}px`;
  }, [fontSize]);

  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
  }, [reduceMotion]);

  useEffect(() => {
    document.documentElement.classList.toggle("compact", compact);
  }, [compact]);

  return null;
}
