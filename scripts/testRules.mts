/**
 * Runs the behavioural scenarios in `ruleScenarios.mts` against a real model
 * and reports which grounding guidelines it actually follows.
 *
 * It builds the prompt with the SAME `buildSystemPrompt` / `formatContext` the
 * chat uses, and resolves the model through the same `resolveChatModel` /
 * `chatProviderOptions` / `temperatureFor`, so a passing run says something
 * about production rather than about a copy of it that has since drifted.
 *
 * Usage:
 *   npm run test:rules                      # default model
 *   npm run test:rules -- --model=gpt-6-luna
 *   npm run test:rules -- --only=tie        # substring match on scenario id
 *   npm run test:rules -- --runs=3          # repeat each scenario (sampling)
 *   npm run test:rules -- --verbose         # print every answer
 *
 * Needs the provider key for the chosen model in the environment
 * (OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY). It makes one model call per
 * scenario per run and costs real money — a full pass is a fraction of a cent
 * on the cheap models, but it is not free and it is not deterministic.
 *
 * Exit code is non-zero if any scenario fails, so it can gate a release.
 */
import { generateText } from "ai";
import {
  buildSystemPrompt,
  formatContext,
  type RetrievedChunk,
} from "../convex/lib/prompts.ts";
import {
  resolveChatModel,
  chatProviderOptions,
  temperatureFor,
} from "../convex/lib/aiModels.ts";
import { DEFAULT_CHAT_MODEL, providerFor } from "../convex/lib/chatConfig.ts";
import {
  SCENARIOS,
  citationsResolve,
  type Result,
  type Scenario,
} from "./ruleScenarios.mts";

/* ---------------------------------------------------------------- args --- */

const argv = process.argv.slice(2);
const flag = (name: string) =>
  argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const has = (name: string) => argv.includes(`--${name}`);

const model = flag("model") ?? DEFAULT_CHAT_MODEL;
const only = flag("only");
const runs = Math.max(1, Number(flag("runs") ?? 1));
const verbose = has("verbose");

const KEY_FOR = {
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};
const keyName = KEY_FOR[providerFor(model)];
if (!process.env[keyName]) {
  console.error(
    `\n  ${keyName} is not set — ${model} runs on ${providerFor(model)}.\n` +
      `  These scenarios call a real model, so the key has to be present.\n`,
  );
  process.exit(2);
}

/* ------------------------------------------------------------- helpers --- */

/** The scenario's passages in the shape the real prompt builder expects. */
function toChunks(s: Scenario): RetrievedChunk[] {
  return s.passages.map((p, i) => ({
    // Ids are never rendered into the prompt; they exist so the scenario
    // chunk is the same shape retrieval produces.
    gameId: `scenario-${s.id}`,
    rulebookId: `scenario-${s.id}-${i}`,
    bgTitle: s.game,
    breadcrumb: p.breadcrumb,
    page: p.page,
    text: p.text,
    chunkType: "rules",
    scope: "base",
  }));
}

/** Citation indices the answer used, deduped and in order of first use. */
function citedNs(answer: string): number[] {
  const seen = new Set<number>();
  for (const m of answer.matchAll(/\[(\d+)\]/g)) seen.add(Number(m[1]));
  return [...seen];
}

async function answerFor(s: Scenario): Promise<string> {
  const system = buildSystemPrompt([s.game], formatContext(toChunks(s), []));
  const history = (s.history ?? []).map((h) => ({
    role: h.role,
    content: h.content,
  }));
  const { text } = await generateText({
    model: resolveChatModel(model),
    system,
    messages: [...history, { role: "user" as const, content: s.question }],
    temperature: temperatureFor(model, 0.2),
    providerOptions: chatProviderOptions(model, { thinkingBudget: 0 }),
  });
  return text.trim();
}

/* ----------------------------------------------------------------- run --- */

const chosen = only
  ? SCENARIOS.filter((s) => s.id.includes(only))
  : SCENARIOS;

if (chosen.length === 0) {
  console.error(`No scenario id contains "${only}".`);
  process.exit(2);
}

console.log(
  `\nRules guidelines — ${chosen.length} scenario(s) × ${runs} run(s) on ${model}\n`,
);

let failed = 0;
const flaky: string[] = [];

for (const s of chosen) {
  const failuresByRun: string[][] = [];

  for (let run = 0; run < runs; run++) {
    let answer: string;
    try {
      answer = await answerFor(s);
    } catch (e) {
      failuresByRun.push([`model call threw: ${String(e).slice(0, 160)}`]);
      continue;
    }
    const result: Result = {
      answer,
      citedNs: citedNs(answer),
      passageCount: s.passages.length,
    };
    // citationsResolve applies everywhere: an answer may never point at a
    // passage it wasn't given, whatever else the scenario is about.
    const checks = [citationsResolve, ...s.expect];
    const problems = checks
      .map((e) => {
        const why = e.check(result);
        return why ? `${e.label} — ${why}` : null;
      })
      .filter((x): x is string => x !== null);
    failuresByRun.push(problems);

    if (verbose) {
      console.log(`  ── ${s.id} (run ${run + 1})\n${indent(answer)}\n`);
    }
  }

  const badRuns = failuresByRun.filter((f) => f.length > 0);
  if (badRuns.length === 0) {
    console.log(`  PASS  ${s.id}`);
  } else if (badRuns.length < runs) {
    // Passed sometimes: worth knowing, since the guideline is probabilistic.
    flaky.push(s.id);
    console.log(`  FLAKY ${s.id}  (failed ${badRuns.length}/${runs} runs)`);
    console.log(`        guards: ${s.why}`);
    for (const p of badRuns[0]) console.log(`        · ${p}`);
  } else {
    failed++;
    console.log(`  FAIL  ${s.id}`);
    console.log(`        guards: ${s.why}`);
    for (const p of badRuns[0]) console.log(`        · ${p}`);
  }
}

function indent(s: string) {
  return s
    .split("\n")
    .map((l) => `       │ ${l}`)
    .join("\n");
}

const passed = chosen.length - failed - flaky.length;
console.log(
  `\n  ${passed} passed · ${flaky.length} flaky · ${failed} failed  (${model})\n`,
);
if (flaky.length > 0 && failed === 0) {
  console.log(
    "  Flaky means the guideline holds sometimes. Re-run with --runs=5 before\n" +
      "  concluding either way; a guideline that only holds most of the time is\n" +
      "  a prompt problem, not a test problem.\n",
  );
}
process.exit(failed > 0 ? 1 : 0);
