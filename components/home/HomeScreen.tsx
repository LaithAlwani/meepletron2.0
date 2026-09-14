"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { Skeleton } from "@/components/ui/Surface";
import { Landing } from "./Landing";

const Loading = () => (
  <div className="mx-auto max-w-2xl px-4 py-8">
    <Skeleton className="h-40 w-full rounded-2xl" />
  </div>
);

/** Signed-in users have no home dashboard — send them to their profile. */
function RedirectToApp() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/profile");
  }, [router]);
  return <Loading />;
}

/** The home route: a marketing landing for signed-out visitors. Signed-in users
 *  are redirected into the app — there's no logged-in home screen. */
export function HomeScreen() {
  return (
    <>
      <AuthLoading>
        <Loading />
      </AuthLoading>
      <Authenticated>
        <RedirectToApp />
      </Authenticated>
      <Unauthenticated>
        <Landing />
      </Unauthenticated>
    </>
  );
}
