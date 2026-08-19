/**
 * The fixed taxonomy of Top Games "categories" — the angle a list ranks games
 * from (player count, weight, genre, or just a fun opinion cut like "worst").
 * Shared by the Convex backend (validation + community roll-up) and the frontend
 * (dropdowns, labels). Pure constants only, so it's safe to import from both
 * `convex/` functions and the app.
 */

export type TopCategory = { key: string; label: string; hint: string };

export const TOP_CATEGORIES: readonly TopCategory[] = [
  // Broad
  { key: "overall", label: "Overall", hint: "Any kind of game" },
  // Player count
  { key: "solo", label: "Solo", hint: "1-player games" },
  { key: "two-player", label: "2-player", hint: "Best with two" },
  { key: "three-player", label: "3-player", hint: "Best with three" },
  { key: "four-player", label: "4-player", hint: "Best with four" },
  { key: "party", label: "Party", hint: "Big, social groups" },
  { key: "couples", label: "For couples", hint: "Great for two players" },
  { key: "family", label: "Family", hint: "All ages, easy to teach" },
  { key: "kids", label: "Kids", hint: "Made for younger players" },
  // Weight / length
  { key: "light", label: "Light / gateway", hint: "Quick, low complexity" },
  { key: "medium", label: "Medium weight", hint: "Some depth, moderate rules" },
  { key: "heavy", label: "Heavyweight", hint: "Complex, strategic" },
  { key: "quick", label: "Quick fillers", hint: "Under ~30 minutes" },
  { key: "epic", label: "Epic", hint: "Long, table-hogging games" },
  // Style / genre
  { key: "coop", label: "Cooperative", hint: "Everyone vs. the game" },
  { key: "war", label: "War games", hint: "Conflict & conquest" },
  { key: "eurogame", label: "Euro games", hint: "Efficiency & engine-building" },
  { key: "thematic", label: "Thematic / ameritrash", hint: "Story & dice drama" },
  { key: "deckbuilder", label: "Deck-builders", hint: "Build your deck as you play" },
  { key: "worker-placement", label: "Worker placement", hint: "Claim actions each round" },
  { key: "area-control", label: "Area control", hint: "Fight over the map" },
  { key: "deduction", label: "Social deduction", hint: "Bluffing & hidden roles" },
  { key: "dungeon-crawler", label: "Dungeon crawlers", hint: "Explore, fight, loot" },
  { key: "legacy", label: "Legacy & campaign", hint: "Games that evolve over plays" },
  { key: "abstract", label: "Abstract strategy", hint: "Pure, theme-light tactics" },
  { key: "dexterity", label: "Dexterity", hint: "Flick, stack, balance" },
  { key: "roll-and-write", label: "Roll & write", hint: "Roll dice, fill your sheet" },
  { key: "horror", label: "Horror", hint: "Spooky & tense" },
  { key: "expansions", label: "Best expansions", hint: "Add-ons & expansions" },
  // Opinion cuts
  { key: "underrated", label: "Underrated gems", hint: "Deserve more love" },
  { key: "worst", label: "Worst games", hint: "Your hall of shame" },
] as const;

export const TOP_CATEGORY_KEYS: readonly string[] = TOP_CATEGORIES.map(
  (c) => c.key,
);

export const DEFAULT_CATEGORY = "overall";

export function isTopCategory(key: string): boolean {
  return TOP_CATEGORY_KEYS.includes(key);
}

export function categoryLabel(key: string | null | undefined): string {
  return TOP_CATEGORIES.find((c) => c.key === key)?.label ?? "Overall";
}
