/**
 * Parsers for a BoardGameGeek `/xmlapi2/thing` item block.
 *
 * Pure functions with no Convex imports so they can run in any runtime (the V8
 * `bgg.ts` actions and the `"use node"` image/enrichment action both use them).
 * These are the regex parsers that used to live in `convex/bgg.ts`; they handle
 * a single `/thing` item, not a collection (see `lib/bggXml.ts` for that).
 */

function num(re: RegExp, s: string): number | undefined {
  const m = s.match(re);
  return m ? Number(m[1]) : undefined;
}

/** Parse the stats + suggested-players poll out of one BGG `<item>` block. */
export function parseItem(block: string) {
  const rating = num(/<average value="([\d.]+)"/, block);
  const ratingCount = num(/<usersrated value="(\d+)"/, block);
  const weight = num(/<averageweight value="([\d.]+)"/, block);

  const pollMatch = block.match(
    /<poll name="suggested_numplayers"[\s\S]*?<\/poll>/,
  );
  // Total number of poll voters (each votes across one or more player counts).
  const pollVotes = pollMatch
    ? num(/totalvotes="(\d+)"/, pollMatch[0])
    : undefined;
  const playerPoll: {
    count: number;
    plus?: boolean;
    best: number;
    recommended: number;
    notRecommended: number;
  }[] = [];
  if (pollMatch) {
    const re = /<results numplayers="([^"]+)">([\s\S]*?)<\/results>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(pollMatch[0]))) {
      // Buckets are "1".."N" and a trailing "N+" (e.g. "6+"); keep both, skip
      // anything non-numeric. "6+" is stored as { count: 6, plus: true }.
      const bucket = m[1].match(/^(\d+)(\+)?$/);
      if (!bucket) continue;
      const inner = m[2];
      playerPoll.push({
        count: Number(bucket[1]),
        ...(bucket[2] ? { plus: true } : {}),
        best: num(/value="Best" numvotes="(\d+)"/, inner) ?? 0,
        recommended: num(/value="Recommended" numvotes="(\d+)"/, inner) ?? 0,
        notRecommended:
          num(/value="Not Recommended" numvotes="(\d+)"/, inner) ?? 0,
      });
    }
  }

  // Community-suggested player age: the age bucket that got the most votes
  // (e.g. "12" from a poll where "12" leads). BGG's trailing bucket reads
  // "21 and up" → parseInt gives 21.
  const ageMatch = block.match(
    /<poll name="suggested_playerage"[\s\S]*?<\/poll>/,
  );
  let communityAge: number | undefined;
  if (ageMatch) {
    const re = /<result value="([^"]+)" numvotes="(\d+)"/g;
    let m: RegExpExecArray | null;
    let bestVotes = 0;
    while ((m = re.exec(ageMatch[0]))) {
      const votes = Number(m[2]);
      const age = parseInt(m[1], 10);
      if (votes > bestVotes && Number.isFinite(age) && age > 0) {
        bestVotes = votes;
        communityAge = age;
      }
    }
  }

  return {
    rating,
    ratingCount,
    weight,
    pollVotes,
    playerPoll: playerPoll.length ? playerPoll : undefined,
    communityAge,
  };
}

/**
 * Decode the HTML entities BGG uses in names/descriptions. BGG double-encodes in
 * the collection API (`&amp;#039;`), so after the XML parser turns that into the
 * literal `&#039;` this second pass is what actually yields `'`.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Parse the full editable metadata from a BGG /thing item block. */
export function parseFullItem(block: string) {
  const pos = (n?: number) => (n && n > 0 ? n : undefined);
  const strVal = (re: RegExp) => {
    const m = block.match(re);
    return m ? decodeEntities(m[1]).trim() : undefined;
  };
  const links = (type: string) => {
    const out: string[] = [];
    const re = new RegExp(`<link type="${type}"[^>]*value="([^"]*)"`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) out.push(decodeEntities(m[1]).trim());
    return out;
  };
  const playing = num(/<playingtime value="(\d+)"/, block);
  const year = strVal(/<yearpublished value="([^"]*)"/);
  const age = strVal(/<minage value="(\d+)"/);
  const descMatch = block.match(/<description>([\s\S]*?)<\/description>/);
  const imageTag = block.match(/<image>([^<]+)<\/image>/)?.[1];
  const thumbTag = block.match(/<thumbnail>([^<]+)<\/thumbnail>/)?.[1];
  const image = imageTag ?? thumbTag;
  const thumb = thumbTag ?? imageTag;
  return {
    // Full cover (falls back to thumbnail). Kept as `imageUrl` for existing
    // callers that download it into storage.
    imageUrl: image ? decodeEntities(image).trim() : undefined,
    // Small BGG thumbnail (falls back to the full image) for cards/lists.
    thumbnailUrl: thumb ? decodeEntities(thumb).trim() : undefined,
    title:
      strVal(/<name type="primary"[^>]*value="([^"]*)"/) ??
      strVal(/<name[^>]*value="([^"]*)"/),
    year: year && year !== "0" ? year : undefined,
    minPlayers: pos(num(/<minplayers value="(\d+)"/, block)),
    maxPlayers: pos(num(/<maxplayers value="(\d+)"/, block)),
    minPlayTime: pos(num(/<minplaytime value="(\d+)"/, block) ?? playing),
    maxPlayTime: pos(num(/<maxplaytime value="(\d+)"/, block) ?? playing),
    minAge: age && age !== "0" ? age : undefined,
    description: descMatch
      ? decodeEntities(descMatch[1]).replace(/\n{3,}/g, "\n\n").trim() ||
        undefined
      : undefined,
    designers: links("boardgamedesigner"),
    artists: links("boardgameartist"),
    publishers: links("boardgamepublisher"),
    categories: links("boardgamecategory"),
    gameMechanics: links("boardgamemechanic"),
  };
}

/** The item's BGG subtype, e.g. "boardgame" or "boardgameexpansion". */
export function parseItemType(block: string): string | undefined {
  return block.match(/<item[^>]*\btype="([^"]+)"/)?.[1];
}

/**
 * The base game(s) an expansion expands. On an expansion's /thing response the
 * base games are the `boardgameexpansion` links marked `inbound="true"` (an
 * outbound link on a base game points the other way, at its expansions). Usually
 * one; a few expansions target several base games.
 */
export function parseExpansionParents(
  block: string,
): { bggId: string; name: string }[] {
  const out: { bggId: string; name: string }[] = [];
  const re = /<link type="boardgameexpansion"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const tag = m[0];
    if (!/\binbound="true"/.test(tag)) continue;
    const id = tag.match(/\bid="(\d+)"/)?.[1];
    if (!id) continue;
    const name = tag.match(/\bvalue="([^"]*)"/)?.[1];
    out.push({ bggId: id, name: name ? decodeEntities(name).trim() : `BGG ${id}` });
  }
  return out;
}
