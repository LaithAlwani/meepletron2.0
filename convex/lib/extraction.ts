/**
 * Prompt + post-processing for Gemini rulebook → Markdown extraction. Pure.
 */

export function buildExtractionPrompt(
  startPage: number,
  endPage: number,
  knownIconTokens: string[],
  knownSections: string[],
): string {
  const iconHint =
    knownIconTokens.length > 0
      ? `\nIcon tokens already used earlier in this rulebook (reuse the SAME token for the same icon): ${knownIconTokens.join(", ")}.`
      : "";
  const sectionHint =
    knownSections.length > 0
      ? `\nSection headings already used earlier (reuse EXACT wording if the same section continues): ${knownSections.join(" | ")}.`
      : "";

  return `You are converting a board game rulebook to clean GitHub-flavored Markdown. This document contains pages ${startPage} to ${endPage} of the rulebook.

Rules:
- Transcribe the rules faithfully. Do NOT summarize, invent, or omit rules.
- Use Markdown headings (#, ##, ###) that mirror the rulebook's section structure.
- Preserve tables as Markdown tables and lists as Markdown lists.
- At the START of each page's content, emit a marker comment on its own line: \`<!-- page N -->\`, where N is the ACTUAL rulebook page number (between ${startPage} and ${endPage}).
- Normalize iconography to bracketed ALL-CAPS tokens, e.g. [WOOD], [VP], [BRICK]. If the pages define what icons mean, put those under a \`## Iconography\` section as a list like \`[WOOD] — one wood resource\`.
- Ignore purely decorative images; describe an image only if it conveys a rule.
- Output ONLY the Markdown. No preamble, no code fences around the whole thing.${iconHint}${sectionHint}`;
}

/** Bracketed ALL-CAPS icon tokens. */
const ICON_TOKEN_REGEX = /\[[A-Z0-9][A-Z0-9 _/-]*\]/g;

/** Clean up a batch's raw Markdown: clamp page markers, strip fences, join wraps. */
export function postProcessMarkdown(
  raw: string,
  startPage: number,
  endPage: number,
): string {
  let md = raw.trim();

  // Strip a leading/trailing ``` fence if the model wrapped the whole output.
  md = md.replace(/^```(?:markdown)?\s*\n/, "").replace(/\n```\s*$/, "");

  // Clamp out-of-range page markers into [startPage, endPage].
  md = md.replace(/<!--\s*page\s+(\d+)\s*-->/gi, (_m, n) => {
    const clamped = Math.min(endPage, Math.max(startPage, Number(n)));
    return `<!-- page ${clamped} -->`;
  });

  // Drop lines that are just image placeholders.
  md = md
    .split("\n")
    .filter((line) => !/^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(line))
    .join("\n");

  return md.trim();
}

/** Icon tokens appearing in the Markdown (deduped, uppercase). */
export function extractIconTokens(md: string): string[] {
  const found = md.match(ICON_TOKEN_REGEX) ?? [];
  return [...new Set(found.map((t) => t.toUpperCase()))];
}

/** `##`/`###` section headings appearing in the Markdown. */
export function extractSectionHeadings(md: string): string[] {
  const out: string[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (m) out.push(m[1].trim());
  }
  return [...new Set(out)];
}
