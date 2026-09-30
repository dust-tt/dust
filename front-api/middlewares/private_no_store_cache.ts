import type { Context } from "hono";

export const PRIVATE_NO_STORE_CACHE_CONTROL = "private, no-store";

/**
 * @cc [owner:security,label:security;api] private-no-store-default
 * Session/cookie-authenticated API responses default to
 * `Cache-Control: private, no-store`. Handlers that intentionally set
 * `Cache-Control` (e.g. private file bytes with a short max-age) keep their
 * value; this helper never overwrites an existing header.
 */
export function ensurePrivateNoStoreCache(response: Response): Response {
  if (!response.headers.has("Cache-Control")) {
    response.headers.set("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL);
  }
  return response;
}

/**
 * After the handler runs, set private/no-store when no Cache-Control was set.
 * Use from auth middlewares so coverage is consistent across authenticated JSON.
 */
export function applyPrivateNoStoreCacheHeader(ctx: Context): void {
  if (!ctx.res.headers.has("Cache-Control")) {
    ctx.res.headers.set("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL);
  }
}
