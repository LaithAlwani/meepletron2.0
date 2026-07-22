"use client";

import Image from "next/image";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="relative mb-6 inline-block">
          <Image src="/logo.webp" alt="Meepletron" width={120} height={120} priority />
          <span className="absolute -right-3 -top-3 rotate-12 rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white shadow-md">
            !
          </span>
        </div>

        <h1 className="mb-3 text-3xl font-bold sm:text-4xl">A rule went sideways</h1>
        <p className="mb-8 text-sm text-muted sm:text-base">
          Something went wrong on our end. Give it another roll — if it keeps
          happening, come back in a bit.
        </p>

        <button
          onClick={reset}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
