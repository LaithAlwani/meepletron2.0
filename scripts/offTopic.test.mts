/**
 * Tests for the replies used when retrieval finds nothing.
 *
 * This path answers without the model, so nothing in the system prompt can
 * correct a bad classification — the regexes here ARE the behaviour. The risk
 * worth testing is the dangerous direction: a real rules question mistaken for
 * small talk gets small talk back instead of an answer.
 *
 * Run: npm run test:offtopic
 */
import { classifyOffTopic, offTopicReply } from "../convex/lib/offTopic.ts";

let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`, extra ?? "");
  }
}
const kind = (m: string) => classifyOffTopic(m);

console.log("\nOff-topic replies\n");

/* Greetings and sign-offs — the whole message, nothing else in it. */
for (const m of ["hi", "Hi!", "hello", "Helloo", "hey there", "yo", "sup",
                 "Good morning", "thanks", "Thank you!", "thx", "cheers",
                 "ok", "cool", "got it", "bye", "test"]) {
  check(`greeting: ${JSON.stringify(m)}`, kind(m) === "greeting", kind(m));
}

/* Capability questions. */
for (const m of ["what can you do", "What do you do?", "who are you",
                 "what is this", "help", "How does this work?"]) {
  check(`capability: ${JSON.stringify(m)}`, kind(m) === "capability", kind(m));
}

/* The direction that actually matters: real questions must NOT be small talk,
   even when they open with a greeting or are very short. */
for (const m of [
  "hi, can I build two roads in one turn?",
  "hey what does a settlement cost",
  "thanks — and what about cities?",
  "ok so how does scoring work",
  "can i trade",
  "how many cards",
  "what is a wonder",
  "who goes first",
  "is this legal",
  "what can you do with a joker card",
  "help me understand the end of round",
]) {
  check(`not small talk: ${JSON.stringify(m)}`, kind(m) === "unanswered", kind(m));
}

/* Empty and overlong input fall through safely. */
check("empty string is unanswered", kind("") === "unanswered");
check("whitespace is unanswered", kind("   ") === "unanswered");
check(
  "a long message is never a greeting",
  kind("hello ".repeat(20)) === "unanswered",
);

/* The replies themselves. */
const one = offTopicReply("hi", ["Splendor"]);
check("greeting reply names the game", one.includes("Splendor"), one);
check("greeting reply does not say rephrase", !/rephrase/i.test(one), one);

const miss = offTopicReply("how many points is an egg worth", ["Wingspan"]);
check("miss reply names the game", miss.includes("Wingspan"), miss);
check(
  "miss reply allows that it may simply not be covered",
  /isn't covered|is not covered/i.test(miss),
  miss,
);
check(
  "miss reply rules out strategy",
  /strategy/i.test(miss),
  miss,
);

const two = offTopicReply("hi", ["Catan", "Seafarers"]);
check("two rulebooks read naturally", two.includes("Catan and Seafarers"), two);
check(
  "no sources still reads sensibly",
  offTopicReply("hi", []).includes("the loaded rulebook"),
);

console.log(
  failures === 0 ? "\n  all passed\n" : `\n  ${failures} failed\n`,
);
process.exit(failures > 0 ? 1 : 0);
