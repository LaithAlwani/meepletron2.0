"use client";

import { Sparkles } from "lucide-react";
import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui/buttonStyles";
import { openAssistant } from "@/lib/assistant";

/**
 * Pops the floating assistant open. Used from the (server-rendered) landing page
 * wherever we want a "try it right now" affordance instead of a link.
 */
export function AskAiButton({
  label = "Ask Meepletron",
  variant = "ghost",
  size = "lg",
  className,
}: {
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return (
    <button
      onClick={openAssistant}
      className={buttonClasses(variant, size, className)}
    >
      <Sparkles className="h-4.5 w-4.5" />
      {label}
    </button>
  );
}
