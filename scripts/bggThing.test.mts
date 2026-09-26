/**
 * Fixture test for the expansion-link parsers in convex/lib/bggThing.ts.
 *
 * BGG is unreachable from CI, so these run against hand-written responses shaped
 * like the real ones. Both parsers read the same `boardgameexpansion` link type
 * and are told apart only by `inbound`, so the thing worth pinning down is that
 * each direction ignores the other's links.
 *
 * Run: npm run test:bgg-thing
 */
import {
  parseExpansionLinks,
  parseExpansionParents,
} from "../convex/lib/bggThing.ts";

let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`, extra ?? "");
  }
}
const ids = (xs: { bggId: string }[]) => xs.map((x) => x.bggId);

/* A base game: its expansion links are outbound (no `inbound` attribute), and
   it also carries unrelated link types that must not be picked up. */
const BASE = `
<item type="boardgame" id="68448">
  <name type="primary" value="7 Wonders"/>
  <link type="boardgamecategory" id="1002" value="Card Game"/>
  <link type="boardgameexpansion" id="93287" value="7 Wonders: Leaders"/>
  <link type="boardgameexpansion" id="124164" value="7 Wonders: Cities"/>
  <link type="boardgameexpansion" id="169855" value="7 Wonders: Babel"/>
  <link type="boardgameintegration" id="173346" value="7 Wonders Duel"/>
  <link type="boardgamecompilation" id="256657" value="7 Wonders Anniversary"/>
</item>`;

/* An expansion: the same link type, but inbound, pointing back at its base. */
const EXPANSION = `
<item type="boardgameexpansion" id="93287">
  <name type="primary" value="7 Wonders: Leaders"/>
  <link type="boardgameexpansion" id="68448" value="7 Wonders" inbound="true"/>
</item>`;

/* A promo that expands several base games at once. */
const MULTI_PARENT = `
<item type="boardgameexpansion" id="999001">
  <link type="boardgameexpansion" id="68448" value="7 Wonders" inbound="true"/>
  <link type="boardgameexpansion" id="173346" value="7 Wonders Duel" inbound="true"/>
</item>`;

console.log("parseExpansionLinks (base game → its expansions)");
check(
  "finds every outbound expansion",
  JSON.stringify(ids(parseExpansionLinks(BASE))) ===
    JSON.stringify(["93287", "124164", "169855"]),
  ids(parseExpansionLinks(BASE)),
);
check(
  "ignores integration + compilation links",
  !ids(parseExpansionLinks(BASE)).some((id) =>
    ["173346", "256657"].includes(id),
  ),
);
check(
  "decodes the expansion name",
  parseExpansionLinks(BASE)[0]?.name === "7 Wonders: Leaders",
  parseExpansionLinks(BASE)[0],
);
check(
  "returns nothing for an expansion's inbound link",
  parseExpansionLinks(EXPANSION).length === 0,
  parseExpansionLinks(EXPANSION),
);

console.log("parseExpansionParents (expansion → its base games)");
check(
  "finds the inbound base game",
  JSON.stringify(ids(parseExpansionParents(EXPANSION))) ===
    JSON.stringify(["68448"]),
  ids(parseExpansionParents(EXPANSION)),
);
check(
  "returns nothing for a base game's outbound links",
  parseExpansionParents(BASE).length === 0,
  parseExpansionParents(BASE),
);
check(
  "keeps every base game of a multi-parent promo",
  JSON.stringify(ids(parseExpansionParents(MULTI_PARENT))) ===
    JSON.stringify(["68448", "173346"]),
  ids(parseExpansionParents(MULTI_PARENT)),
);

console.log("\nthe two directions are disjoint");
const both = `${BASE}\n${EXPANSION}`;
check(
  "a document with both only yields each direction's own links",
  parseExpansionLinks(both).length === 3 &&
    parseExpansionParents(both).length === 1,
  {
    links: ids(parseExpansionLinks(both)),
    parents: ids(parseExpansionParents(both)),
  },
);

console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
