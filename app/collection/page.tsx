"use client";

import { CollectionSection } from "@/components/collection/CollectionSection";

/** "Collection" — the personal collection (BGG sync), a top-level page. */
export default function CollectionPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-3 nav:pt-8">
      <CollectionSection />
    </div>
  );
}
