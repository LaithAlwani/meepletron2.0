"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Authenticated } from "convex/react";
import { usePreferences, DESTINATION_HREF } from "@/lib/usePreferences";

/**
 * Home-route behavior for signed-in visitors. Crawlers and signed-out users
 * always get the server-rendered {@link Landing}. Signed-in users see the
 * landing too (with a "Go to …" CTA) UNLESS they've turned on "Skip home page"
 * in settings — then they're sent straight to their default destination.
 */
export function SignedInRedirect() {
  return (
    <Authenticated>
      <MaybeRedirect />
    </Authenticated>
  );
}

function MaybeRedirect() {
  const { skipHome, defaultDestination } = usePreferences();
  const router = useRouter();
  useEffect(() => {
    if (skipHome) router.replace(DESTINATION_HREF[defaultDestination]);
  }, [skipHome, defaultDestination, router]);

  if (!skipHome) return null;
  // Opaque cover over the landing while the client-side redirect fires.
  return <div className="fixed inset-0 z-50 bg-background" aria-hidden />;
}
