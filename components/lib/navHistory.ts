/**
 * Tracks how many *in-app* client navigations have happened this session, so a
 * "Back" control can tell whether a browser back() will stay inside the app
 * (there's an in-app history entry to return to) or should fall back to a parent
 * page (the page was opened directly, in a new tab, or from an external link).
 *
 * `window.history.length` can't tell us this — it counts the whole tab's history
 * including pages visited before the app. This counter only increments on
 * client-side route changes within the app (see `NavigationTracker`).
 */
let inAppNavigations = 0;

export function registerNavigation() {
  inAppNavigations += 1;
}

/** True once the user has navigated within the app at least once this session. */
export function canGoBack() {
  return inAppNavigations > 0;
}
