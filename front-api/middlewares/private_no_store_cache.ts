import type { Context } from "hono";

export const PRIVATE_NO_STORE_CACHE_CONTROL = "private, no-store";

export function ensurePrivateNoStoreCache(response: Response): Response {
  if (response.headers.has("Cache-Control")) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function applyPrivateNoStoreCacheHeader(ctx: Context): void {
  if (!ctx.res.headers.has("Cache-Control")) {
    ctx.header("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL);
  }
}
