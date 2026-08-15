import { XMLParser } from "fast-xml-parser";
import type { Infer } from "convex/values";
import type {
  bggCollectionItemValidator,
  bggPlayItemValidator,
} from "./bggSyncTypes";

/**
 * BGG XML parsing for the sync pipeline.
 *
 * Pure functions with no Convex imports, so they can be exercised against saved
 * fixtures without a deployment — which matters, because CI has no route to
 * boardgamegeek.com.
 *
 * The regex parsers in convex/bgg.ts are deliberately left alone: they handle a
 * single `/thing` item and work. They cannot be stretched to a collection,
 * whose response is hundreds of items with nested `<stats><rating>` and
 * self-closing `<status/>` elements.
 */

export type BggCollectionItem = Infer<typeof bggCollectionItemValidator>;
export type BggPlayItem = Infer<typeof bggPlayItemValidator>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep everything as strings and coerce deliberately below. BGG object ids
  // are numeric-looking strings and `games.bggId` is a string — coercing to a
  // number and back is how leading-zero mismatches creep in.
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  // fast-xml-parser's one real footgun: a single-element list collapses to an
  // object instead of an array. Match on the full path rather than the tag
  // name — `item` is a repeated child of `<items>` in a collection but a
  // *single* child of each `<play>`, and forcing both to arrays breaks plays.
  // (jPath is a string in the default mode; the union covers `jPath: false`.)
  isArray: (_name, jpath) =>
    typeof jpath === "string" &&
    ["items.item", "plays.play", "plays.play.players.player"].includes(jpath),
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type Node = any;

/** Text content of an element, whether or not it also carries attributes. */
function text(node: Node): string | undefined {
  if (node === undefined || node === null) return undefined;
  if (typeof node === "string") return node.trim() || undefined;
  if (typeof node === "object" && "#text" in node) {
    const t = String(node["#text"]).trim();
    return t || undefined;
  }
  return undefined;
}

function attr(node: Node, name: string): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const raw = node[`@_${name}`];
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).trim();
  return s || undefined;
}

/** Numeric attribute, dropping BGG's "N/A" and other non-numeric placeholders. */
function numAttr(node: Node, name: string): number | undefined {
  const raw = attr(node, name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** BGG writes booleans as "1"/"0" attributes. */
function boolAttr(node: Node, name: string): boolean {
  return attr(node, name) === "1";
}

/** Only keep a positive integer (BGG uses 0 for "unknown"). */
function positive(n: number | undefined): number | undefined {
  return n !== undefined && n > 0 ? n : undefined;
}

export type ParseFailure = {
  ok: false;
  /** `queued` is BGG's 202 "still building your collection" body. */
  reason: "queued" | "invalid_user" | "unparseable";
  message?: string;
};

export type ParsedCollection =
  | { ok: true; items: BggCollectionItem[]; total: number }
  | ParseFailure;

export type ParsedPlays =
  | { ok: true; plays: BggPlayItem[]; total: number }
  | ParseFailure;

/**
 * Classify the non-item responses BGG can return with a 200 or 202 status.
 * Returns null when the document looks like real data.
 *
 * Worth stating plainly: an invalid username comes back as **HTTP 200** with an
 * `<errors>` body, so the status code alone can never decide this.
 */
function classify(doc: Node): ParseFailure | null {
  if (doc?.errors) {
    const err = doc.errors.error;
    const first = Array.isArray(err) ? err[0] : err;
    return {
      ok: false,
      reason: "invalid_user",
      message: text(first?.message) ?? "BoardGameGeek rejected that username.",
    };
  }
  // A bare <message> is the 202 "request accepted and queued" body.
  if (doc?.message !== undefined && !doc?.items && !doc?.plays) {
    return { ok: false, reason: "queued", message: text(doc.message) };
  }
  return null;
}

export function parseCollectionXml(xml: string): ParsedCollection {
  let doc: Node;
  try {
    doc = parser.parse(xml);
  } catch {
    return { ok: false, reason: "unparseable" };
  }

  const failure = classify(doc);
  if (failure) return failure;

  const container = doc?.items;
  if (!container) return { ok: false, reason: "unparseable" };

  const raw: Node[] = Array.isArray(container.item) ? container.item : [];
  const items: BggCollectionItem[] = [];

  for (const node of raw) {
    const bggId = attr(node, "objectid");
    // A collection row with no object id is unusable — it can't be matched,
    // deduped, or linked. Skip rather than inventing a key.
    if (!bggId) continue;

    const title = text(node.name);
    if (!title) continue;

    const status = node.status;
    const stats = node.stats;
    const year = text(node.yearpublished);

    items.push({
      bggId,
      title,
      year: year && year !== "0" ? year : undefined,
      thumbnailUrl: text(node.thumbnail),
      imageUrl: text(node.image),
      isExpansion: attr(node, "subtype") === "boardgameexpansion",
      own: boolAttr(status, "own"),
      prevOwned: boolAttr(status, "prevowned") || undefined,
      forTrade: boolAttr(status, "fortrade") || undefined,
      want: boolAttr(status, "want") || undefined,
      wantToPlay: boolAttr(status, "wanttoplay") || undefined,
      wishlist: boolAttr(status, "wishlist") || undefined,
      // <rating value="8"> is THEIR rating; "N/A" when unrated.
      userRating: numAttr(stats?.rating, "value"),
      numPlays: positive(Number(text(node.numplays) ?? "0")),
      comment: text(node.comment),
    });
  }

  const total = Number(attr(container, "totalitems") ?? items.length);
  return {
    ok: true,
    items,
    total: Number.isFinite(total) ? total : items.length,
  };
}

export function parsePlaysXml(xml: string): ParsedPlays {
  let doc: Node;
  try {
    doc = parser.parse(xml);
  } catch {
    return { ok: false, reason: "unparseable" };
  }

  const failure = classify(doc);
  if (failure) return failure;

  const container = doc?.plays;
  if (!container) return { ok: false, reason: "unparseable" };

  const raw: Node[] = Array.isArray(container.play) ? container.play : [];
  const plays: BggPlayItem[] = [];

  for (const node of raw) {
    const playId = attr(node, "id");
    const item = node.item;
    const bggId = attr(item, "objectid");
    const date = attr(node, "date");
    if (!playId || !bggId || !date) continue;

    const playerNodes: Node[] = Array.isArray(node.players?.player)
      ? node.players.player
      : [];
    const players = playerNodes
      .map((p) => ({
        name: attr(p, "name") ?? "",
        username: attr(p, "username"),
        score: attr(p, "score"),
        win: boolAttr(p, "win") || undefined,
        isNew: boolAttr(p, "new") || undefined,
        color: attr(p, "color"),
      }))
      .filter((p) => p.name);

    plays.push({
      playId,
      bggId,
      title: attr(item, "name") ?? "Unknown game",
      date,
      quantity: numAttr(node, "quantity") ?? 1,
      lengthMinutes: positive(numAttr(node, "length")),
      incomplete: boolAttr(node, "incomplete") || undefined,
      location: attr(node, "location"),
      comments: text(node.comments),
      players: players.length ? players : undefined,
    });
  }

  const total = Number(attr(container, "total") ?? plays.length);
  return {
    ok: true,
    plays,
    total: Number.isFinite(total) ? total : plays.length,
  };
}
