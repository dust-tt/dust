/**
 * Worker for the poke (backoffice) SPA.
 *
 * Static assets (JS, CSS, images) are served directly by the Workers Static
 * Assets layer — this worker is NOT invoked for those requests.
 *
 * This worker only runs when no static file matched the request path
 * (not_found_handling = "none" in wrangler config). Its job is to:
 *
 * 1. Return 404 for missing assets under /assets/ (prevent SPA fallback
 *    from serving index.html with a 200 for broken JS/CSS imports).
 *
 * 2. Fall back to index.html for all other paths (SPA routing).
 */

interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/assets/")) {
      return new Response("Not Found", { status: 404 });
    }

    return env.ASSETS.fetch(new URL("/index.html", url.origin));
  },
};
