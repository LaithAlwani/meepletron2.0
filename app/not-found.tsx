import type { Metadata } from "next";
import { buttonClasses } from "@/components/ui/buttonStyles";
import Link from "next/link";
import Image from "next/image";
import { LayoutGrid, Heart } from "lucide-react";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="relative mb-6 inline-block">
          <Image src="/logo.webp" alt="Meepletron" width={120} height={120} priority />
          <span className="absolute -right-3 -top-3 rotate-12 rounded-full bg-accent px-3 py-1 text-sm font-bold text-accent-foreground shadow-md">
            404
          </span>
        </div>

        <h1 className="font-display mb-3 text-3xl font-extrabold sm:text-4xl">You drew an empty card</h1>
        <p className="mb-8 text-sm text-muted sm:text-base">
          This page isn&apos;t in the rulebook. Maybe it rolled off the table — or it
          never existed at all. Pick a path and keep playing.
        </p>

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/boardgames"
            className={buttonClasses("primary", "md")}
          >
            <LayoutGrid className="h-4 w-4" /> Browse board games
          </Link>
          <Link
            href="/favorites"
            className={buttonClasses("ghost", "md")}
          >
            <Heart className="h-4 w-4" /> Your favourites
          </Link>
        </div>
      </div>
    </div>
  );
}
