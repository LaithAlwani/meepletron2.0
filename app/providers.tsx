"use client";

import { type ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/Confirm";
import { GuestUpgradeClaimer } from "@/components/auth/GuestUpgradeClaimer";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthProvider client={convex}>
      <ToastProvider>
        <ConfirmProvider>
          <GuestUpgradeClaimer />
          {children}
        </ConfirmProvider>
      </ToastProvider>
    </ConvexAuthProvider>
  );
}
