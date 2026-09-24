"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Authenticated } from "convex/react";

/**
 * Signed-in visitors have no logged-in home screen — send them into the app
 * (the Library). This mounts as a sibling of the server-rendered {@link Landing}:
 * crawlers and signed-out users keep the full, crawlable marketing page, while
 * signed-in users get covered and redirected so they never see a landing flash.
 */
export function SignedInRedirect() {
  return (
    <Authenticated>
      <Redirect />
    </Authenticated>
  );
}

function Redirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/boardgames");
  }, [router]);
  // Opaque cover over the landing while the client-side redirect fires.
  return <div className="fixed inset-0 z-50 bg-background" aria-hidden />;
}
