import { type ComponentType, lazy } from "react";

export const FORCE_RELOAD_SESSION_KEY = "force_reload_at";
export const FORCE_RELOAD_INTERVAL_MS = 10_000;

/**
 * Try to extract the chunk URL from the dynamic import error message.
 * Vite typically produces messages like:
 *   "Failed to fetch dynamically imported module: https://…/Foo-AbCd1234.js"
 */
function extractChunkUrl(error: unknown): string | null {
  const msg = error instanceof Error ? error.message : String(error);
  const match = msg.match(/https?:\/\/\S+\.js\b/);
  return match ? match[0] : null;
}

/**
 * Probe the chunk URL to gather diagnostic info for error reporting.
 * Returns a short summary string (never throws).
 */
async function probeChunk(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    const ct = res.headers.get("content-type") ?? "unknown";
    const cfRay = res.headers.get("cf-ray") ?? "none";
    return `probe: status=${res.status}, content-type=${ct}, cf-ray=${cfRay}`;
  } catch (probeError) {
    return `probe: network error (${probeError instanceof Error ? probeError.message : String(probeError)})`;
  }
}

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
    factory().catch(async (error) => {
      // In Next.js (detected via __NEXT_DATA__), let the framework handle errors.
      if (typeof window !== "undefined" && "__NEXT_DATA__" in window) {
        throw error;
      }

      // Enrich the error with diagnostic information.
      const chunkUrl = extractChunkUrl(error);
      const probeInfo = chunkUrl ? await probeChunk(chunkUrl) : "no URL found";
      const online = navigator.onLine ? "online" : "offline";
      const diagnostic = `[safeLazy] ${error instanceof Error ? error.message : String(error)} | ${probeInfo} | navigator=${online}`;

      // Guard against continuous reload loops.
      const lastReloadMs = sessionStorage.getItem(FORCE_RELOAD_SESSION_KEY);
      const nowMs = Date.now();
      const lastMs = lastReloadMs !== null ? Number(lastReloadMs) : Number.NaN;
      const shouldReload =
        !Number.isFinite(lastMs) || nowMs - lastMs > FORCE_RELOAD_INTERVAL_MS;

      if (!shouldReload) {
        throw new Error(diagnostic, { cause: error });
      }

      // In SPA (Vite), reload to fetch fresh assets.
      console.warn(diagnostic + " | reloading page");
      sessionStorage.setItem(FORCE_RELOAD_SESSION_KEY, nowMs.toString());
      window.location.reload();
      return new Promise<never>(() => {});
    })
  );
}
