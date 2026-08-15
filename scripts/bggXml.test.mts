/**
 * Fixture test for convex/lib/bggXml.ts.
 *
 * BGG is unreachable from CI, so the parsers are exercised against hand-written
 * responses shaped like the real ones. They're pure functions with no Convex
 * imports precisely so this is possible.
 *
 * Run: npm run test:bgg-xml
 */
import { parseCollectionXml, parsePlaysXml } from "../convex/lib/bggXml.ts";

let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`, extra ?? "");
  }
}

// --- 1. A 202 "queued" body -------------------------------------------------
console.log("\n202 queued body:");
const queued = parseCollectionXml(
  `<?xml version="1.0" encoding="utf-8"?><message>Your request for this collection has been accepted and will be processed.</message>`,
);
check("classified as queued", !queued.ok && queued.reason === "queued", queued);

// --- 2. Invalid username arrives as HTTP 200 with <errors> ------------------
console.log("\ninvalid username (returned with HTTP 200):");
const bad = parseCollectionXml(
  `<?xml version="1.0"?><errors><error><message>Invalid username specified</message></error></errors>`,
);
check("classified as invalid_user", !bad.ok && bad.reason === "invalid_user", bad);
check(
  "carries BGG's message",
  !bad.ok && bad.message === "Invalid username specified",
  bad,
);

// --- 3. A real-shaped collection --------------------------------------------
const COLLECTION = `<?xml version="1.0" encoding="utf-8"?>
<items totalitems="3" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse" pubdate="Mon, 04 Aug 2025 10:00:00 +0000">
  <item objecttype="thing" objectid="13" subtype="boardgame" collid="111">
    <name sortindex="1">CATAN</name>
    <yearpublished>1995</yearpublished>
    <image>https://cf.geekdo-images.com/full/catan.jpg</image>
    <thumbnail>https://cf.geekdo-images.com/thumb/catan.jpg</thumbnail>
    <status own="1" prevowned="0" fortrade="0" want="0" wanttoplay="1" wanttobuy="0" wishlist="0" preordered="0" lastmodified="2024-01-02 03:04:05" />
    <numplays>7</numplays>
    <comment>Battered box, still great &amp; fun</comment>
    <stats minplayers="3" maxplayers="4" playingtime="120">
      <rating value="8">
        <usersrated value="120000" />
        <average value="7.1" />
      </rating>
    </stats>
  </item>
  <item objecttype="thing" objectid="325" subtype="boardgameexpansion" collid="112">
    <name sortindex="1">Catan: Seafarers</name>
    <yearpublished>1997</yearpublished>
    <thumbnail>https://cf.geekdo-images.com/thumb/seafarers.jpg</thumbnail>
    <status own="1" prevowned="0" fortrade="1" want="0" wanttoplay="0" wanttobuy="0" wishlist="0" preordered="0" />
    <numplays>0</numplays>
    <stats minplayers="3" maxplayers="4" playingtime="90">
      <rating value="N/A">
        <average value="7.0" />
      </rating>
    </stats>
  </item>
  <item objecttype="thing" objectid="0000" subtype="boardgame" collid="113">
    <name sortindex="1">Zero-Id Oddity</name>
    <status own="0" wishlist="1" />
  </item>
</items>`;

console.log("\ncollection:");
const col = parseCollectionXml(COLLECTION);
check("parsed ok", col.ok, col);
if (col.ok) {
  check("3 items", col.items.length === 3, col.items.length);
  check("total from attribute", col.total === 3, col.total);

  const [catan, seafarers, oddity] = col.items;

  check("id stays a string", catan.bggId === "13", catan.bggId);
  check("title", catan.title === "CATAN", catan.title);
  check("year", catan.year === "1995", catan.year);
  check("thumbnail", !!catan.thumbnailUrl, catan.thumbnailUrl);
  check("own flag", catan.own === true, catan.own);
  check("wantToPlay flag", catan.wantToPlay === true, catan.wantToPlay);
  check("wishlist absent, not false", catan.wishlist === undefined, catan.wishlist);
  check("THEIR rating, not the average", catan.userRating === 8, catan.userRating);
  check("numPlays", catan.numPlays === 7, catan.numPlays);
  check(
    "entities decoded in comment",
    catan.comment === "Battered box, still great & fun",
    catan.comment,
  );
  check("base game not flagged as expansion", catan.isExpansion === false);

  check("expansion detected via subtype", seafarers.isExpansion === true);
  check('rating "N/A" dropped', seafarers.userRating === undefined, seafarers.userRating);
  check("numPlays 0 dropped", seafarers.numPlays === undefined, seafarers.numPlays);
  check("forTrade flag", seafarers.forTrade === true);

  check(
    "leading-zero id preserved as string",
    oddity.bggId === "0000",
    oddity.bggId,
  );
  check("unowned wishlist item", oddity.own === false && oddity.wishlist === true);
}

// --- 4. Single-item collection (the isArray footgun) ------------------------
console.log("\nsingle-item collection (fast-xml-parser isArray footgun):");
const single = parseCollectionXml(
  `<items totalitems="1"><item objectid="13" subtype="boardgame"><name>CATAN</name><status own="1"/></item></items>`,
);
check("still an array of 1", single.ok && single.items.length === 1, single);

// --- 5. Empty collection ----------------------------------------------------
console.log("\nempty collection:");
const empty = parseCollectionXml(`<items totalitems="0"></items>`);
check("ok with zero items", empty.ok && empty.items.length === 0, empty);

// --- 6. Plays ---------------------------------------------------------------
const PLAYS = `<?xml version="1.0" encoding="utf-8"?>
<plays username="someone" userid="42" total="215" page="1">
  <play id="9001" date="2025-07-14" quantity="1" length="95" incomplete="0" nowinstats="0" location="Kitchen table">
    <item name="CATAN" objecttype="thing" objectid="13" />
    <comments>Close game &lt;3</comments>
    <players>
      <player username="alice" name="Alice" score="10" new="0" win="1" color="red" />
      <player name="Bob" score="8" new="1" win="0" />
    </players>
  </play>
  <play id="9002" date="2025-07-02" quantity="2" length="0">
    <item name="Azul" objecttype="thing" objectid="230802" />
  </play>
</plays>`;

console.log("\nplays:");
const plays = parsePlaysXml(PLAYS);
check("parsed ok", plays.ok, plays);
if (plays.ok) {
  check("2 plays", plays.plays.length === 2, plays.plays.length);
  check("total is the grand total, not the page", plays.total === 215, plays.total);

  const [p1, p2] = plays.plays;
  check("playId", p1.playId === "9001", p1.playId);
  check("bggId from nested item", p1.bggId === "13", p1.bggId);
  check("title from nested item", p1.title === "CATAN", p1.title);
  check("date", p1.date === "2025-07-14", p1.date);
  check("length", p1.lengthMinutes === 95, p1.lengthMinutes);
  check("location", p1.location === "Kitchen table", p1.location);
  check("comments entity-decoded", p1.comments === "Close game <3", p1.comments);
  check("2 players", p1.players?.length === 2, p1.players);
  check("winner flagged", p1.players?.[0].win === true);
  check("score kept as free-form string", p1.players?.[0].score === "10");
  check("loser: win omitted not false", p1.players?.[1].win === undefined);
  check("new player flagged", p1.players?.[1].isNew === true);

  check("quantity", p2.quantity === 2, p2.quantity);
  check("length 0 dropped", p2.lengthMinutes === undefined, p2.lengthMinutes);
  check("no players is undefined", p2.players === undefined);
}

// --- 7. Garbage -------------------------------------------------------------
console.log("\ngarbage input:");
const junk = parseCollectionXml("not xml at all <<<");
check("does not throw, reports failure", !junk.ok, junk);

console.log(
  failures === 0
    ? "\nAll parser checks passed.\n"
    : `\n${failures} CHECK(S) FAILED\n`,
);
process.exit(failures === 0 ? 0 : 1);
