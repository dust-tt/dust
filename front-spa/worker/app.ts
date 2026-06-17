/**
 * Worker for the main app SPA.
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
 * 2. Route sub-app paths to their dedicated index.html:
 *    - /share/*                → share/index.html
 *    - /oauth/*, /w/* /oauth/* → oauth/index.html
 *    - /email/*                → email/index.html
 *
 * 3. Fall back to the main index.html for all other paths (SPA routing).
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

    let fallback: string;
    if (path === "/share" || path.startsWith("/share/")) {
      fallback = "/share/index.html";
    } else if (
      path === "/oauth" ||
      path.startsWith("/oauth/") ||
      /^\/w\/[^/]+\/oauth(\/|$)/.test(path)
    ) {
      fallback = "/oauth/index.html";
    } else if (path === "/email" || path.startsWith("/email/")) {
      fallback = "/email/index.html";
    } else {
      fallback = "/index.html";
    }

    return env.ASSETS.fetch(new URL(fallback, url.origin));
  },
};
