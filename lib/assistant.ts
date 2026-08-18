/**
 * Fired on `window` to pop the global assistant open from anywhere (the landing
 * page's "Ask the AI" buttons). Lives here so callers don't have to import the
 * whole GlobalAssistant module just to get the event name.
 */
export const OPEN_ASSISTANT_EVENT = "meepletron:open-assistant";

/** Open the floating assistant, wherever it's mounted. */
export function openAssistant() {
  window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT));
}
