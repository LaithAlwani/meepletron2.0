"use client";

import { Suspense, use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { buttonClasses } from "@/components/ui/Button";
import { Die } from "@/components/ui/icons";

export default function ImportGamePage({
  params,
}: {
  params: Promise<{ bggId: string }>;
}) {
  const { bggId } = use(params);
  return (
    <Suspense fallback={<Importing title={null} cover={null} />}>
      <ImportRunner bggId={bggId} />
    </Suspense>
  );
}

function ImportRunner({ bggId }: { bggId: string }) {
  const params = useSearchParams();
  const title = params.get("title");
  const cover = params.get("cover");
  const router = useRouter();
  const importGame = useAction(api.images.importGame);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const { slug } = await importGame({
          bggId,
          title: title ?? undefined,
        });
        router.replace(`/boardgames/${slug}`);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Couldn't set up that game.",
        );
      }
    })();
  }, [bggId, title, importGame, router]);

  if (error) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <p className="font-medium text-foreground">{error}</p>
        <Link
          href="/boardgames"
          className={`mt-4 ${buttonClasses("ghost", "sm")}`}
        >
          Back to the library
        </Link>
      </div>
    );
  }
  return <Importing title={title} cover={cover} />;
}

function Importing({
  title,
  cover,
}: {
  title: string | null;
  cover: string | null;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <div className="relative">
        {/* Soft pulsing halo behind the cover while it loads. */}
        <span className="absolute -inset-2 animate-ping rounded-3xl bg-accent/15" />
        <div className="relative h-40 w-40 overflow-hidden rounded-2xl bg-surface-2 shadow-lg ring-1 ring-border">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-accent">
              <Die className="loader-bob h-10 w-10" />
            </div>
          )}
        </div>
      </div>
      <h1 className="font-display mt-6 text-xl font-extrabold tracking-tight">
        Setting up {title ? title : "this game"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        We&apos;re fetching the details for the first time — this only takes a
        moment.
      </p>
    </div>
  );
}
