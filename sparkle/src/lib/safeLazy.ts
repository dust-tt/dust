import { type ComponentType, lazy } from "react";

export const FORCE_RELOAD_SESSION_KEY = "force_reload_at";
export const FORCE_RELOAD_INTERVAL_MS = 10_000;

/**
 * Wrapper around React.lazy that handles chunk load failures
 * (e.g. after a deploy replaces old assets) by reloading the page.
 *
 * Only reloads in the SPA (Vite) context where old chunks are gone after deploy.
 * In Next.js, chunk failures are re-thrown so Next.js can handle them natively.
 *
 * To avoid infinite reload loops, reuses the same "force_reload_at" sessionStorage
 * key as the SWR reload guard and skips the reload if one happened within the last
 * 60 seconds.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeLazy<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(() =>
    factory().catch((error) => {
      // In Next.js (detected via __NEXT_DATA__), let the framework handle errors.
      if (typeof window !== "undefined" && "__NEXT_DATA__" in window) {
        throw error;
      }

      // Guard against continuous reload loops.
      const lastReloadMs = sessionStorage.getItem(FORCE_RELOAD_SESSION_KEY);
      const nowMs = Date.now();
      const lastMs = lastReloadMs !== null ? Number(lastReloadMs) : Number.NaN;
      const shouldReload =
        !Number.isFinite(lastMs) || nowMs - lastMs > FORCE_RELOAD_INTERVAL_MS;

      if (!shouldReload) {
        throw error;
      }

      // In SPA (Vite), reload to fetch fresh assets.
      sessionStorage.setItem(FORCE_RELOAD_SESSION_KEY, nowMs.toString());
      window.location.reload();
      return new Promise<never>(() => {});
    })
  );
}
