import { statusBySlug } from "@/components/collection/status";

/**
 * What the mobile top bar shows for a route.
 *
 * `title` is empty for routes whose heading is data-dependent (a game, a play,
 * a list) — those pages fill it in through `useTopBarTitle`, and the bar shows
 * just the back arrow until the query resolves.
 *
 * `back` is the fallback destination for the arrow. `null` means the route has
 * no back arrow at all: the bottom-nav destinations, which have nowhere to
 * return to. Real in-app history wins over the fallback (see `useBackNav`).
 */
export type TopBarRoute = { title: string; back: string | null };

/** Routes that own their whole screen and get no bar. */
const EXCLUDED = [
  /^\/$/, // signed-out landing
  /^\/auth$/,
  /^\/who-goes-first$/,
  /^\/boardgames\/[^/]+\/chat/, // the chat shell has its own game navbar
  /^\/admin/, // the admin console has its own layout
];

/** The bottom-nav destinations + fixed pages, by exact path. */
const FIXED: Record<string, TopBarRoute> = {
  "/boardgames": { title: "Library", back: null },
  "/chats": { title: "Chats", back: null },
  "/top-games": { title: "Top Games", back: null },
  "/plays": { title: "My plays", back: null },
  "/profile": { title: "Profile", back: null },

  "/boardgames/all": { title: "All games", back: "/boardgames" },
  "/plays/people": { title: "Friends", back: "/plays" },
  "/notifications": { title: "Notifications", back: "/boardgames" },
  "/settings": { title: "Settings", back: "/profile" },
  "/tuckbox": { title: "Tuckbox", back: "/boardgames" },
  "/about": { title: "About", back: "/boardgames" },
  "/privacy": { title: "Privacy Policy", back: "/boardgames" },
  "/terms": { title: "Terms of Service", back: "/boardgames" },
  "/unauthorized": { title: "Not allowed", back: "/boardgames" },
};

/** Public profile collection lists — the slug names the list. */
const USER_LISTS: Record<string, string> = {
  owned: "Owned games",
  "for-sale": "For Sale",
  "for-trade": "For Sale", // links shared before the list was renamed
  wishlist: "Wishlist",
};

/**
 * The bar's content for a path, or `null` where the route gets no bar. Pure and
 * synchronous, so the bar paints its title in the first frame wherever the
 * route itself carries enough information.
 */
export function resolveTopBar(pathname: string): TopBarRoute | null {
  if (EXCLUDED.some((re) => re.test(pathname))) return null;

  const fixed = FIXED[pathname];
  if (fixed) return fixed;

  const seg = pathname.split("/").filter(Boolean);

  if (seg[0] === "boardgames") {
    // /boardgames/collection/<status>
    if (seg[1] === "collection" && seg[2]) {
      const status = statusBySlug(seg[2]);
      return status ? { title: status.title, back: "/boardgames" } : null;
    }
    // /boardgames/import/<bggId>
    if (seg[1] === "import" && seg[2]) {
      return { title: "Add game", back: "/boardgames" };
    }
    // /boardgames/<slug>/how-to-play
    if (seg[2] === "how-to-play") {
      return { title: "How to play", back: `/boardgames/${seg[1]}` };
    }
    // /boardgames/<slug> — the game's own title arrives from the page.
    if (seg[1]) return { title: "", back: "/boardgames" };
  }

  // /plays/<playId>
  if (seg[0] === "plays" && seg[1]) return { title: "", back: "/plays" };

  // /top-games/<listId>
  if (seg[0] === "top-games" && seg[1]) return { title: "", back: "/top-games" };

  if (seg[0] === "user" && seg[1]) {
    // /user/<username>/<list>
    if (seg[2]) {
      return {
        title: USER_LISTS[seg[2]] ?? "",
        back: `/user/${seg[1]}`,
      };
    }
    // /user/<username>
    return { title: `@${seg[1]}`, back: "/boardgames" };
  }

  return null;
}
