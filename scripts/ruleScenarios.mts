/**
 * Behavioural scenarios for the grounded-answer guidelines.
 *
 * Each scenario is a fixed rulebook excerpt plus a question, paired with what
 * a compliant answer must and must not contain. They are deliberately NOT
 * assertions about plumbing — they check whether the model actually follows
 * the rules in `convex/lib/prompts.ts`, which is the only thing that decides
 * whether a player gets told something the manual never said.
 *
 * Every scenario here is a bug that reached a real player, or a rule we would
 * not notice breaking until one did. The `why` field names the guideline it
 * guards, so a failure says which rule stopped working rather than just
 * "scenario 4 failed".
 *
 * Pure data + pure predicates: no model, no network, no dependencies. The
 * runner in `testRules.mts` supplies the answers.
 */

export type Passage = {
  breadcrumb: string;
  page?: number;
  text: string;
};

/** What the model produced, plus what it was entitled to cite. */
export type Result = {
  /** The answer text, exactly as returned. */
  answer: string;
  /** Citation indices the answer actually used, e.g. [1, 3]. */
  citedNs: number[];
  /** How many passages it was given — valid indices are 1..passageCount. */
  passageCount: number;
};

/** A named check. Returns null when it passes, or why it failed. */
export type Expectation = {
  label: string;
  check: (r: Result) => string | null;
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

/** The answer mentions at least one of these (case/whitespace-insensitive). */
export function mentionsAny(...phrases: string[]): Expectation {
  return {
    label: `mentions one of: ${phrases.map((p) => `"${p}"`).join(", ")}`,
    check: (r) =>
      phrases.some((p) => norm(r.answer).includes(norm(p)))
        ? null
        : "none of those phrases appear",
  };
}

/** The answer mentions none of these — the usual shape of a fabrication. */
export function mentionsNone(...phrases: string[]): Expectation {
  return {
    label: `avoids: ${phrases.map((p) => `"${p}"`).join(", ")}`,
    check: (r) => {
      const hit = phrases.find((p) => norm(r.answer).includes(norm(p)));
      return hit ? `said "${hit}"` : null;
    },
  };
}

/** At least one citation — an answer drawn from the passages must show it. */
export const cites: Expectation = {
  label: "cites at least one passage",
  check: (r) => (r.citedNs.length > 0 ? null : "no [n] markers in the answer"),
};

/** No citations — a decline has nothing to cite, so citing one is a tell. */
export const citesNothing: Expectation = {
  label: "cites nothing",
  check: (r) =>
    r.citedNs.length === 0 ? null : `cited ${r.citedNs.map((n) => `[${n}]`).join("")}`,
};

/** Every [n] points at a passage that exists. Applied to every scenario. */
export const citationsResolve: Expectation = {
  label: "every citation resolves to a real passage",
  check: (r) => {
    const bad = r.citedNs.filter((n) => n < 1 || n > r.passageCount);
    return bad.length === 0
      ? null
      : `cited ${bad.map((n) => `[${n}]`).join("")} with only ${r.passageCount} passage(s)`;
  },
};

/** No ALL-CAPS icon tokens survive into the answer, e.g. "[WOOD]". */
export const noIconTokens: Expectation = {
  label: "no [ICON] tokens left in the answer",
  check: (r) => {
    const hits = r.answer.match(/\[[A-Z][A-Z0-9 _/-]*\]/g);
    return hits ? `left ${hits.join(", ")} in the text` : null;
  },
};

/** Keeps a single-fact answer from growing a tail of extra remarks. */
export function atMostSentences(n: number): Expectation {
  return {
    label: `at most ${n} sentence(s)`,
    check: (r) => {
      // Strip citation markers first so "[1]." isn't read as a sentence end.
      const plain = r.answer.replace(/\[\d+\]/g, "").trim();
      const count = plain.split(/[.!?](?:\s|$)/).filter((s) => s.trim()).length;
      return count <= n ? null : `wrote ${count} sentences`;
    },
  };
}

/** Multi-part answers must be scannable at the table, not a wall of prose. */
export const isBulleted: Expectation = {
  label: "formats multiple points as a bulleted list",
  check: (r) =>
    /^\s*[-*]\s+/m.test(r.answer) ? null : "no markdown bullets found",
};

export type Scenario = {
  id: string;
  /** The guideline this scenario exists to protect. */
  why: string;
  game: string;
  passages: Passage[];
  /** Prior turns, when the scenario is about how history is handled. */
  history?: { role: "user" | "assistant"; content: string }[];
  question: string;
  expect: Expectation[];
};

/* Phrases that mean "I can't answer that from the manual", in the various
   shapes the models reach for. Used by the scenarios that must decline. */
const DECLINES = [
  "doesn't address",
  "does not address",
  "doesn't cover",
  "does not cover",
  "couldn't find",
  "could not find",
  "doesn't say",
  "does not say",
  "isn't in the",
  "is not in the",
  "only answer",
  "outside what",
];

export const SCENARIOS: Scenario[] = [
  {
    id: "tie-breaker-stops-where-the-text-stops",
    why: "Never finish a rule the rulebook leaves open — the Splendor bug, where the real tie-break was followed by an invented one.",
    game: "Splendor",
    passages: [
      {
        breadcrumb: "End of the Game",
        page: 4,
        text: "In case of a tie, the player who has purchased the fewest development cards wins.",
      },
    ],
    question: "What happens in a tie?",
    expect: [
      mentionsAny("fewest"),
      // The fabrication that shipped, and its usual variants.
      mentionsNone(
        "still tied",
        "continues until",
        "play continues",
        "another round",
        "sudden death",
        "share the win",
        "shared victory",
      ),
      // And the over-correction: announcing a gap nobody asked about.
      mentionsNone("doesn't specify", "does not specify", "no further tie"),
      cites,
    ],
  },

  {
    id: "strategy-is-declined",
    why: "Not a strategy coach. The manual covers how the game is played, not how to play it well.",
    game: "Ticket to Ride",
    passages: [
      {
        breadcrumb: "Drawing Train Car Cards",
        page: 2,
        text: "On your turn you may draw two Train Car cards. If you take a face-up Locomotive card, it counts as your entire turn.",
      },
    ],
    question: "What's the best opening move?",
    expect: [
      mentionsAny(...DECLINES),
      mentionsNone("you should", "i recommend", "the best strategy", "aim to"),
      citesNothing,
    ],
  },

  {
    id: "absent-rule-is-not-invented",
    why: "Won't guess or fill a gap with general knowledge — the passages say nothing about this.",
    game: "Wingspan",
    passages: [
      {
        breadcrumb: "Gain Food · Using the Birdfeeder",
        page: 7,
        text: "If the birdfeeder is empty, refill it by rolling all 5 dice into it.",
      },
    ],
    question: "How many points is each egg worth at the end of the game?",
    expect: [mentionsAny(...DECLINES), citesNothing],
  },

  {
    id: "no-retraction-of-earlier-answers",
    why: "Earlier turns were grounded in passages no longer shown; their absence is not evidence they were wrong.",
    game: "Splendor",
    passages: [
      {
        breadcrumb: "Taking Gem Tokens",
        page: 3,
        text: "You may take three gem tokens of different colours, or two tokens of the same colour if at least four of that colour remain.",
      },
    ],
    history: [
      { role: "user", content: "How do cities score?" },
      {
        role: "assistant",
        content:
          "A city is worth 3 prestige points and is claimed by the first player to meet its requirement.",
      },
    ],
    question: "How many gems can I take on my turn?",
    expect: [
      mentionsAny("three", "3"),
      mentionsNone(
        "i need to correct",
        "correct my",
        "i apologize",
        "apologise",
        "earlier i said",
        "my previous answer",
        "my last answer",
        "i should clarify",
      ),
      cites,
    ],
  },

  {
    id: "icon-tokens-are-spelled-out",
    why: "Bracketed ALL-CAPS icon tokens are an ingestion artefact and must never reach the player.",
    game: "Everdell",
    passages: [
      {
        breadcrumb: "Resources",
        page: 5,
        text: "To build a Farm, pay [WOOD] [WOOD] and place the card in your city. A Farm produces one [BERRY] each season.",
      },
    ],
    question: "What does a Farm cost?",
    expect: [noIconTokens, mentionsAny("wood"), cites],
  },

  {
    id: "casual-wording-still-answers",
    why: "The strict rules must not tip into refusing a question that IS covered, just phrased casually.",
    game: "Monopoly",
    passages: [
      {
        breadcrumb: "Setup",
        page: 1,
        text: "Each player begins the game with 1500 in cash, distributed by the Banker.",
      },
    ],
    question: "How much money do I start with?",
    expect: [
      mentionsAny("1500", "1,500"),
      mentionsNone(...DECLINES),
      cites,
    ],
  },

  {
    id: "partial-coverage-names-the-gap",
    why: "When part of THEIR question isn't covered, say which part — this is the one case where naming a gap is right.",
    game: "Azul",
    passages: [
      {
        breadcrumb: "Scoring · End of Round",
        page: 4,
        text: "Score 1 point for each tile in the completed row, plus 1 point for each tile in the completed column.",
      },
    ],
    question: "How does round scoring work, and what's the penalty for the floor line?",
    expect: [mentionsAny("point"), mentionsAny(...DECLINES), cites],
  },

  {
    id: "single-fact-stays-short",
    why: "Answer the question asked, then stop — the cheap models pad where the stronger ones don't.",
    game: "Catan",
    passages: [
      {
        breadcrumb: "Building · Costs",
        page: 3,
        text: "A road costs 1 brick and 1 lumber.",
      },
      {
        breadcrumb: "Building · Settlements",
        page: 3,
        text: "A settlement costs 1 brick, 1 lumber, 1 wool and 1 grain.",
      },
    ],
    question: "What does a road cost?",
    expect: [mentionsAny("brick"), atMostSentences(2), cites],
  },

  {
    id: "multi-part-uses-bullets",
    why: "More than one point must be a bulleted list — scannable at the table, not a paragraph.",
    game: "Catan",
    passages: [
      {
        breadcrumb: "Turn Sequence",
        page: 2,
        text: "A turn has three parts, in order. First, roll both dice for resource production. Second, trade with other players or the bank. Third, build roads, settlements or cities, or buy a development card.",
      },
    ],
    question: "What are the steps of a turn?",
    expect: [isBulleted, cites],
  },

  {
    id: "wrong-game-is-flagged",
    why: "Asking about a game whose rulebook isn't loaded must not be answered from the one that is.",
    game: "Catan",
    passages: [
      {
        breadcrumb: "Building · Costs",
        page: 3,
        text: "A road costs 1 brick and 1 lumber.",
      },
    ],
    question: "In Wingspan, how do I gain food?",
    expect: [
      mentionsAny(...DECLINES, "isn't loaded", "is not loaded", "catan"),
      mentionsNone("birdfeeder", "roll all 5 dice"),
    ],
  },

  {
    id: "greeting-does-not-get-a-rules-lecture",
    why: "People talk to it like a chatbot. A greeting should get a short orientation, not 'rephrase using the game's own terms'.",
    game: "Catan",
    passages: [
      {
        breadcrumb: "Building · Costs",
        page: 3,
        text: "A road costs 1 brick and 1 lumber.",
      },
    ],
    question: "hi",
    expect: [
      atMostSentences(3),
      mentionsNone("rephrase", "try asking again with"),
      citesNothing,
    ],
  },
];
