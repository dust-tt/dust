import { type ComponentType, lazy } from "react";

/**
 * Wrapper around React.lazy that handles chunk load failures
 * (e.g. after a deploy replaces old assets) by reloading the page.
 *
 * Only reloads in the SPA (Vite) context where old chunks are gone after deploy.
 * In Next.js, chunk failures are re-thrown so Next.js can handle them natively.
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
      // In SPA (Vite), reload to fetch fresh assets.
      window.location.reload();
      return new Promise<never>(() => {});
    })
  );
}
