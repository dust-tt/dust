import type { Context } from "hono";

export const PRIVATE_NO_STORE_CACHE_CONTROL = "private, no-store";

export function ensurePrivateNoStoreCache(response: Response): Response {
  if (!response.headers.has("Cache-Control")) {
    response.headers.set("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL);
  }
  return response;
}

export function applyPrivateNoStoreCacheHeader(ctx: Context): void {
  if (!ctx.res.headers.has("Cache-Control")) {
    ctx.res.headers.set("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL);
  }
}
