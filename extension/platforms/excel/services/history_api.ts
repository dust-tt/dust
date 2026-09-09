/**
 * Restores the History API that Office.js disables.
 *
 * On load, office.js overwrites `window.history.replaceState` and
 * `window.history.pushState` with a non-function value, guarding against an
 * add-in navigating itself away. It runs before the app bundle, and it does so
 * in any page that includes office.js — the task pane in Excel, and equally the
 * task pane opened in a plain browser for development.
 *
 * The shared `front` routing hooks call both directly (`useHashParams`,
 * `useQueryParams`, `useSkillFromSearchParam`, `CellContext`, …), so without
 * this the task pane throws `window.history.replaceState is not a function`
 * while rendering and the whole React tree fails to its error boundary.
 *
 * The overwrite lands as an own property on the `history` instance, while
 * `History.prototype` still holds the native implementations — so they can be
 * put back. Doing so is safe: a same-document `pushState`/`replaceState` only
 * rewrites the URL and cannot navigate the task pane away, which is the
 * behaviour Office is actually protecting against.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:coding] history-api-restored-before-render
 * `restoreHistoryApi` must run before the React tree renders: the shared `front`
 * routing hooks call `history.pushState`/`replaceState` during render, and
 * office.js has already replaced both with a non-function by then.
 */
export const restoreHistoryApi = (): void => {
  for (const method of ["pushState", "replaceState"] as const) {
    if (typeof window.history[method] === "function") {
      continue;
    }

    const native = History.prototype[method];
    if (typeof native === "function") {
      window.history[method] = native.bind(window.history);
    }
  }
};
