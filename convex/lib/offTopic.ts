/**
 * Replies for messages that retrieval can't answer.
 *
 * When nothing relevant comes back from the rulebook, `http.ts` answers
 * without calling the model at all — so no prompt rule can shape what the
 * player sees here. That one canned reply used to serve every case, and it
 * was written for exactly one of them: a real rules question, phrased badly.
 * Said to someone who typed "hi", "thanks" or "what can you do?", being told
 * to rephrase using the game's own terminology reads as a broken chatbot.
 *
 * So these are deliberately conservative. A message is only treated as a
 * greeting or a capability question when it plainly is one — short, and
 * nothing else in it. Anything with real content falls through to the general
 * reply, because misreading a rules question as small talk is far worse than
 * answering small talk a bit flatly.
 *
 * Pure: no model, no network, no cost. Classification is a last resort, not a
 * router — most off-topic questions (strategy, opinions) retrieve something
 * and reach the model, where the system prompt handles them.
 */

export type OffTopicKind = "greeting" | "capability" | "unanswered";

/** Strip punctuation/emoji and collapse space, so "Hi!!" === "hi". */
function normalize(message: string): string {
  return message
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Whole-message greetings only. Each must match the entire normalized text —
// "hi, can I build two roads?" is a rules question with a greeting attached,
// and must never be answered as small talk.
const GREETINGS =
  /^(hi|hii+|hey+|heya|hello+|yo|sup|howdy|hiya|good (morning|afternoon|evening)|greetings|thanks|thank you|thx|ty|cheers|ok|okay|cool|nice|great|got it|bye|goodbye|see ya|test|testing)( there| mate| all| everyone)?$/;

// "What can you do?" in its common shapes — again, the whole message.
const CAPABILITY =
  /^(what|who|how) (can|do|are) (you|u)( do| help with| work| are you)?$|^(what|who) (is|are) (this|you|meepletron)$|^help$|^what (can|do) (i|you) ask$|^how does this work$/;

/** What kind of unanswerable message this is. Errs towards "unanswered". */
export function classifyOffTopic(message: string): OffTopicKind {
  const text = normalize(message);
  // A long message is doing something other than saying hello, whatever words
  // it opens with.
  if (text.length === 0 || text.length > 40) return "unanswered";
  if (GREETINGS.test(text)) return "greeting";
  if (CAPABILITY.test(text)) return "capability";
  return "unanswered";
}

/**
 * The reply for a message retrieval couldn't answer.
 *
 * `sources` names the loaded rulebook(s) so the general reply can say what it
 * actually looked in, rather than the vague "the loaded rulebook(s)".
 */
export function offTopicReply(message: string, sources: string[]): string {
  const where =
    sources.length === 1
      ? `the ${sources[0]} rulebook`
      : sources.length > 1
        ? `the ${sources.slice(0, -1).join(", ")} and ${sources[sources.length - 1]} rulebooks`
        : "the loaded rulebook";

  switch (classifyOffTopic(message)) {
    case "greeting":
      return `Hi! I answer rules questions from ${where} — ask me anything about how the game works and I'll quote the rule and show you the page. What's come up?`;

    case "capability":
      return `I'm a rules referee for ${where}. Ask me how something works — a cost, a timing question, whether a move is legal — and I'll answer from the manual and show you the passage. I don't cover strategy or anything outside the rulebook.`;

    // The honest version of the original message: it may be a wording
    // mismatch, but it may equally be a question the manual simply doesn't
    // answer, and the old copy only admitted the first.
    default:
      return `I couldn't find that in ${where}. I only answer from the manual, so either it's worded differently in there — try the phase, action or component involved — or it isn't covered. I don't cover strategy or anything outside the rulebook.`;
  }
}
