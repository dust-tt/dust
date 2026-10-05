import { useEffect } from "react";

const HIGHLIGHT_CLASS = "is-target";
/** Keep the ring long enough for heavy admin pages (e.g. Credits) to settle. */
const HIGHLIGHT_MS = 4000;
/** Re-assert highlight after layout/data settle so the ring isn't lost early. */
const RELIGHT_DELAYS_MS = [400, 1200] as const;
const RETRY_MS = 100;
const RETRY_BUDGET_MS = 3000;

/**
 * Reads `#sectionId` from the URL and scrolls that `[data-admin-section]` into
 * view with a brief highlight. Retries briefly so late-mounted sections (after
 * skeletons) are still found.
 *
 * Same-page search jumps must set `window.location.hash` (see
 * `navigateToAdminSetting`) so this `hashchange` listener re-runs — React Router
 * hash updates use pushState and do not fire `hashchange`.
 */
export function useAdminSectionHighlight() {
  useEffect(() => {
    let cancelled = false;
    let highlightTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setInterval> | undefined;
    const relightTimers: ReturnType<typeof setTimeout>[] = [];

    const clearHighlightTimer = () => {
      if (highlightTimer !== undefined) {
        clearTimeout(highlightTimer);
        highlightTimer = undefined;
      }
    };

    const clearRelightTimers = () => {
      while (relightTimers.length > 0) {
        const timer = relightTimers.pop();
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      }
    };

    const clearRetryTimer = () => {
      if (retryTimer !== undefined) {
        clearInterval(retryTimer);
        retryTimer = undefined;
      }
    };

    const sectionIdFromHash = (): string | null => {
      const raw = window.location.hash.replace(/^#/, "");
      if (!raw) {
        return null;
      }
      // Support both `#agents` and `#agents?…` (hash-param style used elsewhere).
      const sectionId = raw.split("?")[0]?.trim();
      return sectionId || null;
    };

    const applyHighlight = (el: HTMLElement) => {
      el.classList.add(HIGHLIGHT_CLASS);
      clearHighlightTimer();
      highlightTimer = setTimeout(() => {
        el.classList.remove(HIGHLIGHT_CLASS);
      }, HIGHLIGHT_MS);
    };

    const tryHighlight = (sectionId: string): boolean => {
      const el = document.querySelector<HTMLElement>(
        `[data-admin-section="${CSS.escape(sectionId)}"]`
      );
      if (!el) {
        return false;
      }
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      applyHighlight(el);
      clearRelightTimers();
      for (const delay of RELIGHT_DELAYS_MS) {
        relightTimers.push(
          setTimeout(() => {
            if (cancelled || sectionIdFromHash() !== sectionId) {
              return;
            }
            const current = document.querySelector<HTMLElement>(
              `[data-admin-section="${CSS.escape(sectionId)}"]`
            );
            if (current) {
              applyHighlight(current);
            }
          }, delay)
        );
      }
      return true;
    };

    const run = () => {
      clearRetryTimer();
      clearHighlightTimer();
      clearRelightTimers();
      document
        .querySelectorAll<HTMLElement>(
          `.${HIGHLIGHT_CLASS}[data-admin-section]`
        )
        .forEach((el) => el.classList.remove(HIGHLIGHT_CLASS));

      const sectionId = sectionIdFromHash();
      if (!sectionId || cancelled) {
        return;
      }

      if (tryHighlight(sectionId)) {
        return;
      }

      const startedAt = Date.now();
      retryTimer = setInterval(() => {
        if (cancelled) {
          clearRetryTimer();
          return;
        }
        if (
          tryHighlight(sectionId) ||
          Date.now() - startedAt > RETRY_BUDGET_MS
        ) {
          clearRetryTimer();
        }
      }, RETRY_MS);
    };

    run();
    window.addEventListener("hashchange", run);

    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", run);
      clearRetryTimer();
      clearHighlightTimer();
      clearRelightTimers();
      document
        .querySelectorAll<HTMLElement>(
          `.${HIGHLIGHT_CLASS}[data-admin-section]`
        )
        .forEach((el) => el.classList.remove(HIGHLIGHT_CLASS));
    };
  }, []);
}
