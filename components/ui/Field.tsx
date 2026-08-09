"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/cn";

const fieldBase =
  "w-full rounded-xl border border-border bg-surface text-sm text-foreground outline-none transition-shadow placeholder:text-subtle focus:border-accent/50 focus:ring-2 focus:ring-ring/40 disabled:opacity-60";

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, "px-3.5 py-2.5", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldBase, "px-3.5 py-2.5 resize-none", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";
