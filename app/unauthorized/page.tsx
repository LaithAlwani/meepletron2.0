import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Unauthorized",
};

export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const isSignIn = reason === "signin";

  const heading = isSignIn ? "Pull up a chair first" : "It's not your turn";
  const subline = isSignIn
    ? "You'll need to sign in before joining this game. Grab a meeple, take a seat, and we'll deal you in."
    : "This area is reserved for the game master. You don't have the right card to play this round — but the rest of the table is still wide open.";

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="relative mb-6 inline-block">
          <Image src="/logo.webp" alt="Meepletron" width={120} height={120} priority />
          <span className="absolute -right-3 -top-3 rotate-12 rounded-full bg-red-500 px-3 py-1 text-sm font-bold text-white shadow-md">
            401
          </span>
        </div>

        <h1 className="mb-3 text-3xl font-bold sm:text-4xl">{heading}</h1>
        <p className="mb-8 text-sm text-muted sm:text-base">{subline}</p>

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          {isSignIn && (
            <Link
              href="/auth"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              🔑 Sign in
            </Link>
          )}
          <Link
            href="/boardgames"
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
              isSignIn
                ? "border border-border bg-surface hover:bg-surface-2"
                : "bg-accent text-accent-foreground shadow-sm hover:opacity-90"
            }`}
          >
            📖 Browse games
          </Link>
        </div>
      </div>
    </div>
  );
}
