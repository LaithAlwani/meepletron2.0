/**
 * Offline self-test for the scenario expectations in `ruleScenarios.mts`.
 *
 * The live suite (`npm run test:rules`) is only worth what its assertions are
 * worth: a check that never fails would pass a fabricated answer and tell us
 * the guidelines hold. So this feeds the expectations answers we already know
 * the verdict for — including the real Splendor answers from the bug report —
 * and confirms the good ones pass and the bad ones fail.
 *
 * No model, no key, no network. Run: npm run test:scenarios
 */
import {
  SCENARIOS,
  citationsResolve,
  citesNothing,
  cites,
  noIconTokens,
  isBulleted,
  atMostSentences,
  type Result,
  type Scenario,
} from "./ruleScenarios.mts";

let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`, extra ?? "");
  }
}

const scenario = (id: string): Scenario => {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`no scenario "${id}"`);
  return s;
};

/** Run a scenario's own expectations over a hand-written answer. */
function verdict(s: Scenario, answer: string): string[] {
  const r: Result = {
    answer,
    citedNs: [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])),
    passageCount: s.passages.length,
  };
  return [citationsResolve, ...s.expect]
    .map((e) => (e.check(r) ? e.label : null))
    .filter((x): x is string => x !== null);
}

console.log("\nScenario expectations — offline self-test\n");

/* ---- the Splendor bug, verbatim ---------------------------------------- */

const tie = scenario("tie-breaker-stops-where-the-text-stops");

// What shipped and prompted the whole fix: correct rule, invented tail.
const SHIPPED_BAD =
  "The tied player who purchased the fewest development cards wins; if they're still tied, the game continues until the tie is broken [1].";
check(
  "catches the fabricated tie-break continuation",
  verdict(tie, SHIPPED_BAD).length > 0,
  verdict(tie, SHIPPED_BAD),
);

// The over-correction: accurate, but volunteering a gap nobody asked about.
const SHIPPED_OVEREAGER =
  "The tied player who purchased the fewest development cards wins; if they're still tied, the rules don't specify a further tie-breaker [1].";
check(
  "catches the unrequested “rules don't specify” tail",
  verdict(tie, SHIPPED_OVEREAGER).length > 0,
  verdict(tie, SHIPPED_OVEREAGER),
);

// What we actually want.
const WANTED = "The player who bought the fewest development cards wins [1].";
check("passes the correct answer", verdict(tie, WANTED).length === 0, verdict(tie, WANTED));

/* ---- a decline must not cite ------------------------------------------- */

const strat = scenario("strategy-is-declined");
check(
  "passes a clean strategy decline",
  verdict(strat, "The rulebook doesn't address strategy — I only answer from the manual.")
    .length === 0,
);
check(
  "catches strategy advice dressed as an answer",
  verdict(strat, "You should aim to take the longest route early on [1].").length > 0,
);

/* ---- retraction -------------------------------------------------------- */

const retr = scenario("no-retraction-of-earlier-answers");
check(
  "catches an apology for an earlier answer",
  verdict(
    retr,
    "You may take three gems [1]. I also need to correct my last answer about cities.",
  ).length > 0,
);
check(
  "passes an answer that leaves history alone",
  verdict(retr, "You can take three gem tokens of different colours [1].").length === 0,
);

/* ---- individual predicates --------------------------------------------- */

const res = (answer: string, passageCount = 2): Result => ({
  answer,
  citedNs: [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])),
  passageCount,
});

check("citationsResolve rejects an out-of-range [n]", !!citationsResolve.check(res("Yes [5].")));
check("citationsResolve allows an in-range [n]", !citationsResolve.check(res("Yes [2].")));
check("cites requires a marker", !!cites.check(res("Yes.")));
check("citesNothing rejects a cited decline", !!citesNothing.check(res("I can't say [1].")));
check("citesNothing allows an uncited decline", !citesNothing.check(res("I can't say.")));
check("noIconTokens catches a leaked token", !!noIconTokens.check(res("Pay [WOOD] twice.")));
check("noIconTokens ignores citation markers", !noIconTokens.check(res("Pay two wood [1].")));
check("isBulleted catches a prose list", !!isBulleted.check(res("First roll. Then trade.")));
check("isBulleted accepts markdown bullets", !isBulleted.check(res("- Roll\n- Trade")));
check(
  "atMostSentences ignores citation full stops",
  !atMostSentences(1).check(res("A road costs 1 brick and 1 lumber [1].")),
);
check(
  "atMostSentences catches a padded answer",
  !!atMostSentences(1).check(
    res("A road costs 1 brick and 1 lumber [1]. Note that roads cannot be moved later."),
  ),
);

/* ---- the scenario set itself ------------------------------------------- */

check("every scenario has a unique id", new Set(SCENARIOS.map((s) => s.id)).size === SCENARIOS.length);
check(
  "every scenario explains which guideline it guards",
  SCENARIOS.every((s) => s.why.trim().length > 20),
);
check(
  "every scenario has at least one passage and one expectation",
  SCENARIOS.every((s) => s.passages.length > 0 && s.expect.length > 0),
);

console.log(
  failures === 0
    ? "\n  all expectation checks passed\n"
    : `\n  ${failures} expectation check(s) failed\n`,
);
process.exit(failures > 0 ? 1 : 0);
