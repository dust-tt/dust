import { type ComponentType, lazy } from "react";

import { reportToDatadog } from "./reportToDatadog";

export const FORCE_RELOAD_SESSION_KEY = "force_reload_at";
export const FORCE_RELOAD_INTERVAL_MS = 10_000;

export class ChunkLoadError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "ChunkLoadError";
  }
}

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

interface ProbeResult {
  summary: string;
  /** True when the chunk is definitively gone (404, or served as wrong content type). */
  chunkGone: boolean;
}

/**
 * Probe the chunk URL to gather diagnostic info and determine failure type.
 * A chunk is considered gone when:
 * - It returns 404 (Workers / standard static servers)
 * - It returns 200 but with non-JS content type (e.g. HTML from SPA fallback)
 * Never throws.
 */
async function probeChunk(url: string): Promise<ProbeResult> {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    const ct = res.headers.get("content-type") ?? "unknown";
    const cfRay = res.headers.get("cf-ray") ?? "none";
    const isJs = ct.includes("javascript");
    return {
      summary: `probe: status=${res.status}, content-type=${ct}, cf-ray=${cfRay}`,
      chunkGone: res.status === 404 || (res.ok && !isJs),
    };
  } catch (probeError) {
    return {
      summary: `probe: network error (${probeError instanceof Error ? probeError.message : String(probeError)})`,
      chunkGone: false,
    };
  }
}

const RETRY_DELAY_MS = 1_500;
const MAX_RETRIES = 2;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
 * 10 seconds.
 */

interface SafeLazyOptions {
  canReload?: () => boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeLazy<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  options?: SafeLazyOptions
) {
  return lazy(async () => {
    // In Next.js (detected via __NEXT_DATA__), let the framework handle errors.
    const isNextJs = typeof window !== "undefined" && "__NEXT_DATA__" in window;

    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await factory();
      } catch (error) {
        lastError = error;

        if (isNextJs) {
          throw error;
        }

        // Probe the chunk to determine if it's a 404 (chunk gone after deploy)
        // or a transient error (network hiccup) worth retrying.
        const chunkUrl = extractChunkUrl(error);
        const probe = chunkUrl
          ? await probeChunk(chunkUrl)
          : {
              summary: `unknown error: ${error instanceof Error ? error.message : String(error)}`,
              chunkGone: false,
            };

        // 404 = chunk is gone (new deploy), no point retrying.
        if (probe.chunkGone) {
          break;
        }

        // Transient error: retry after a delay.
        if (attempt < MAX_RETRIES) {
          reportToDatadog(error, {
            source: "safeLazy",
            event: "retry",
            attempt: attempt + 1,
            probe: probe.summary,
          });
          await delay(RETRY_DELAY_MS);
        }
      }
    }

    // All retries exhausted or chunk is gone — build diagnostic.
    const chunkUrl = extractChunkUrl(lastError);
    const probe = chunkUrl
      ? await probeChunk(chunkUrl)
      : { summary: "no URL found", chunkGone: false };
    const online = navigator.onLine ? "online" : "offline";
    const diagnostic = `[safeLazy] ${lastError instanceof Error ? lastError.message : String(lastError)} | ${probe.summary} | navigator=${online}`;

    // If the caller prevents reload (e.g. unsaved work), throw immediately.
    if (options?.canReload && !options.canReload()) {
      reportToDatadog(lastError, {
        source: "safeLazy",
        event: "reload_blocked",
        diagnostic,
      });
      throw new ChunkLoadError(diagnostic, lastError);
    }

    // Guard against continuous reload loops.
    const lastReloadMs = sessionStorage.getItem(FORCE_RELOAD_SESSION_KEY);
    const nowMs = Date.now();
    const lastMs = lastReloadMs !== null ? Number(lastReloadMs) : Number.NaN;
    const shouldReload =
      !Number.isFinite(lastMs) || nowMs - lastMs > FORCE_RELOAD_INTERVAL_MS;

    if (!shouldReload) {
      reportToDatadog(lastError, {
        source: "safeLazy",
        event: "reload_skipped",
        diagnostic,
      });
      throw new ChunkLoadError(diagnostic, lastError);
    }

    // Reload to fetch fresh assets after a deploy.
    reportToDatadog(lastError, {
      source: "safeLazy",
      event: "reload",
      diagnostic,
    });
    sessionStorage.setItem(FORCE_RELOAD_SESSION_KEY, nowMs.toString());
    window.location.reload();
    return new Promise<never>(() => {});
  });
}
