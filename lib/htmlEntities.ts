/**
 * Decode HTML entities to their characters — for text that arrives HTML-encoded
 * (notably BoardGameGeek descriptions, which use `&mdash;`, `&rsquo;`, numeric
 * refs, etc.). Pure + isomorphic, so it runs in client and server components.
 * Unknown named entities are left untouched.
 */
const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—", // —
  ndash: "–", // –
  hellip: "…", // …
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  sbquo: "‚",
  bdquo: "„",
  laquo: "«",
  raquo: "»",
  middot: "·",
  bull: "•",
  deg: "°",
  copy: "©",
  reg: "®",
  trade: "™",
  plusmn: "±",
  times: "×",
  divide: "÷",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  dagger: "†",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  ccedil: "ç",
  ntilde: "ñ",
};

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (whole, name: string) =>
      Object.prototype.hasOwnProperty.call(NAMED, name) ? NAMED[name] : whole,
    );
}
