/**
 * Split extracted rulebook Markdown into retrievable chunks. Pure.
 *
 * Strategy: break at ## / ### headings, carry a breadcrumb + nearest page
 * marker, keep tables/lists/legends whole, sub-split overly long prose, tag
 * quality flags, and drop duplicates.
 */

export type DraftChunk = {
  breadcrumb: string;
  page?: number;
  chunkType: "text" | "table" | "list" | "legend";
  scope: "main" | "variant";
  variantName?: string;
  text: string;
  flags: string[];
};

const MAX_CHARS = 2000;
const MIN_CHARS = 50;
const OVERLAP = 200;

const PAGE_MARKER = /<!--\s*page\s+(\d+)\s*-->/i;

type Section = {
  breadcrumb: string;
  page?: number;
  isLegend: boolean;
  scope: "main" | "variant";
  variantName?: string;
  lines: string[];
};

function isVariantHeading(h: string): boolean {
  return /\b(variant|solo|advanced|expert|optional)\b/i.test(h);
}

const normCrumb = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Is this leading crumb the document/game title? Exact normalized match, or one
 * is a prefix of the other (≥4 chars) to catch "Carcassonne" vs "Carcassonne
 * Big Box". The game name carries no retrieval/citation value inside its own
 * manual (the source game is tracked separately), so we strip it.
 */
function crumbIsTitle(leadN: string, titleN: string): boolean {
  if (!leadN || !titleN) return false;
  if (leadN === titleN) return true;
  const [short, long] =
    leadN.length <= titleN.length ? [leadN, titleN] : [titleN, leadN];
  return short.length >= 4 && long.startsWith(short);
}

export function chunkMarkdown(
  markdown: string,
  gameTitle?: string,
): DraftChunk[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];

  let h1 = "";
  let h2 = "";
  let h3 = "";
  let page: number | undefined;

  const buildSection = (): Section => {
    const crumbs = [h1, h2, h3].filter(Boolean);
    const headingText = h3 || h2 || h1 || "";
    return {
      breadcrumb: crumbs.join(" > "),
      page,
      isLegend: /icon|legend|glossary|symbol/i.test(headingText),
      scope: isVariantHeading(headingText) ? "variant" : "main",
      variantName: isVariantHeading(headingText) ? headingText : undefined,
      lines: [],
    };
  };

  let current: Section = buildSection();
  const flush = () => {
    if (current.lines.join("\n").trim()) sections.push(current);
  };

  for (const line of lines) {
    const pm = line.match(PAGE_MARKER);
    if (pm) {
      const newPage = Number(pm[1]);
      // A section that spans a page break must not stamp its page-2 content with
      // page 1 (that misattributes citations). Once a section already has
      // content on one page, a new page starts a fresh chunk with the SAME
      // breadcrumb but the correct page.
      const hasContent = current.lines.some((l) => l.trim());
      if (hasContent && current.page !== undefined && current.page !== newPage) {
        flush();
        page = newPage;
        current = buildSection();
      } else {
        page = newPage;
        current.page ??= page;
      }
      continue;
    }
    const h1m = line.match(/^#\s+(.+?)\s*$/);
    const h2m = line.match(/^##\s+(.+?)\s*$/);
    const h3m = line.match(/^###\s+(.+?)\s*$/);
    if (h1m) {
      flush();
      h1 = h1m[1].trim();
      h2 = "";
      h3 = "";
      current = buildSection();
      continue;
    }
    if (h2m) {
      flush();
      h2 = h2m[1].trim();
      h3 = "";
      current = buildSection();
      continue;
    }
    if (h3m) {
      flush();
      h3 = h3m[1].trim();
      current = buildSection();
      continue;
    }
    current.lines.push(line);
  }
  flush();

  // Decide whether to drop the leading breadcrumb crumb. Two signals: it matches
  // the game title, or a single leading crumb is shared by every section (a
  // document-title wrapper). Either way it's noise inside this manual.
  const titleN = gameTitle ? normCrumb(gameTitle) : "";
  const leads = sections
    .map((s) => s.breadcrumb.split(" > ")[0])
    .filter(Boolean);
  const sharedLeadN =
    leads.length > 0 && new Set(leads.map(normCrumb)).size === 1
      ? normCrumb(leads[0])
      : null;
  const effectiveBreadcrumb = (bc: string): string => {
    const parts = bc.split(" > ").filter(Boolean);
    if (parts.length === 0) return bc;
    const leadN = normCrumb(parts[0]);
    if (crumbIsTitle(leadN, titleN) || (sharedLeadN && leadN === sharedLeadN)) {
      return parts.slice(1).join(" > ");
    }
    return bc;
  };

  const out: DraftChunk[] = [];
  const seen = new Set<string>();

  for (const section of sections) {
    const text = section.lines.join("\n").trim();
    if (!text) continue;
    const breadcrumb = effectiveBreadcrumb(section.breadcrumb);

    const chunkType = section.isLegend
      ? "legend"
      : hasTable(text)
        ? "table"
        : isMostlyList(text)
          ? "list"
          : "text";

    // Keep tables/lists/legends whole; sub-split long prose.
    const pieces =
      chunkType === "text" && text.length > MAX_CHARS
        ? splitLongText(text)
        : [text];

    for (const piece of pieces) {
      const norm = piece.replace(/\s+/g, " ").trim().toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);

      out.push({
        breadcrumb,
        page: section.page,
        chunkType,
        scope: section.scope,
        variantName: section.variantName,
        text: piece,
        flags: qualityFlags(piece, breadcrumb, chunkType),
      });
    }
  }

  return out;
}

function hasTable(text: string): boolean {
  return /^\s*\|.+\|\s*$/m.test(text) && /\|\s*[-:]+\s*\|/.test(text);
}

function isMostlyList(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return false;
  const listLines = lines.filter((l) => /^\s*([-*+]|\d+\.)\s+/.test(l));
  return listLines.length / lines.length >= 0.6;
}

function splitLongText(text: string): string[] {
  const paragraphs = text.split(/\n\s*\n/);
  const pieces: string[] = [];
  let buf = "";
  for (const para of paragraphs) {
    if (buf && (buf + "\n\n" + para).length > MAX_CHARS) {
      pieces.push(buf.trim());
      const tail = buf.slice(-OVERLAP);
      buf = tail + "\n\n" + para;
    } else {
      buf = buf ? buf + "\n\n" + para : para;
    }
  }
  if (buf.trim()) pieces.push(buf.trim());
  return pieces;
}

function qualityFlags(
  text: string,
  breadcrumb: string,
  chunkType: string,
): string[] {
  const flags: string[] = [];
  if (text.length < MIN_CHARS) flags.push("too-short");
  if (text.length > 2500 && chunkType === "text") flags.push("too-long");
  if (!breadcrumb) flags.push("no-breadcrumb");

  const alnum = (text.match(/[a-zA-Z0-9]/g) ?? []).length;
  const junkRatio = 1 - alnum / Math.max(1, text.length);
  const longestAlpha = Math.max(
    0,
    ...(text.match(/[a-zA-Z]+/g) ?? []).map((w) => w.length),
  );
  if (junkRatio > 0.5 || longestAlpha < 3) flags.push("gibberish");

  return flags;
}
