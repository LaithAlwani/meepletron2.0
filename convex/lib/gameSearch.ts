/** Denormalized searchable text: title + designers + publishers + categories + mechanics. */
export function buildSearchText(fields: {
  title: string;
  designers?: string[];
  publishers?: string[];
  categories?: string[];
  gameMechanics?: string[];
}): string {
  return [
    fields.title,
    ...(fields.designers ?? []),
    ...(fields.publishers ?? []),
    ...(fields.categories ?? []),
    ...(fields.gameMechanics ?? []),
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Fuzzy game-name matching (used by the global assistant to resolve a spoken
// or typed game name to a real title, tolerant of spacing, punctuation and
// typos — "lord's of water deep" → "Lords of Waterdeep").
// ---------------------------------------------------------------------------

/** Lowercase + strip everything but letters/digits (drops spaces & punctuation). */
export function normalizeGameName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Lowercase word tokens (letters/digits), for order-independent token matching. */
function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Levenshtein edit distance between two short strings. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Similarity of two strings in [0, 1] via normalized edit distance. */
function ratio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

/**
 * Score how well a typed name matches a real game title, in [0, 1]. Combines a
 * whole-string fuzzy match (punctuation/spacing-insensitive) with a token-level
 * match so a partial or reordered name ("waterdeep", "root board game") still
 * scores. 1 = effectively identical; ~0 = unrelated.
 */
export function gameNameMatchScore(typed: string, title: string): number {
  const nq = normalizeGameName(typed);
  const nt = normalizeGameName(title);
  if (!nq || !nt) return 0;
  if (nq === nt) return 1;

  // Whole-string fuzzy similarity (handles typos across the full name).
  let score = ratio(nq, nt);

  // Substring containment (typed is a fragment of the title, or vice versa) —
  // e.g. "waterdeep" inside "lordsofwaterdeep".
  if (nt.includes(nq) || nq.includes(nt)) {
    const contain = Math.min(nq.length, nt.length) / Math.max(nq.length, nt.length);
    score = Math.max(score, 0.6 + 0.4 * contain);
  }

  // Token coverage: fraction of the typed words that fuzzily hit a title word.
  const qt = tokens(typed);
  const tt = tokens(title);
  if (qt.length && tt.length) {
    let hit = 0;
    for (const q of qt) {
      const best = Math.max(...tt.map((t) => (t === q ? 1 : ratio(q, t))));
      if (best >= 0.8) hit += best;
    }
    const coverage = hit / qt.length;
    score = Math.max(score, 0.5 + 0.45 * coverage - (coverage < 1 ? 0.1 : 0));
  }

  return Math.min(1, score);
}
