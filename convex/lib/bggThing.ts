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

  return {
    rating,
    ratingCount,
    weight,
    pollVotes,
    playerPoll: playerPoll.length ? playerPoll : undefined,
  };
}

/** Decode the HTML entities BGG uses in names/descriptions. */
function decodeEntities(s: string): string {
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
  const image =
    block.match(/<image>([^<]+)<\/image>/)?.[1] ??
    block.match(/<thumbnail>([^<]+)<\/thumbnail>/)?.[1];
  return {
    imageUrl: image ? decodeEntities(image).trim() : undefined,
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
