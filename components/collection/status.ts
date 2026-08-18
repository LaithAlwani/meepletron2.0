import { Package, Heart, Repeat2, History, type LucideIcon } from "lucide-react";

/** The four collection lists, shared by the collection overview + per-list pages. */
export type CollFilter = "owned" | "wishlist" | "forTrade" | "prevOwned";

export type CollStatus = {
  filter: CollFilter;
  slug: string; // URL segment for /boardgames/collection/<slug>
  title: string;
  icon: LucideIcon;
  empty: string;
};

export const COLLECTION_STATUSES: CollStatus[] = [
  {
    filter: "owned",
    slug: "owned",
    title: "Owned",
    icon: Package,
    empty: "Mark games “Owned” from any card, or link BoardGameGeek.",
  },
  {
    filter: "wishlist",
    slug: "wishlist",
    title: "Wishlist",
    icon: Heart,
    empty: "Add games to your Wishlist from any card, or link BoardGameGeek.",
  },
  {
    filter: "forTrade",
    slug: "for-trade",
    title: "For trade",
    icon: Repeat2,
    empty: "Mark games “For trade” from any card, or on BoardGameGeek.",
  },
  {
    filter: "prevOwned",
    slug: "prev-owned",
    title: "Previously owned",
    icon: History,
    empty: "Mark games “Previously owned” from any card, or on BoardGameGeek.",
  },
];

export function statusBySlug(slug: string): CollStatus | undefined {
  return COLLECTION_STATUSES.find((s) => s.slug === slug);
}
