/**
 * Worker for the poke (backoffice) SPA.
 *
 * With `run_worker_first = true`, this Worker sees every request. Hashed
 * `/assets/*` and other non-HTML static files are passed through to ASSETS.
 * HTML navigations use the SPA fallback so security headers always apply.
 */

import { applySecurityHeaders } from "./security_headers";

interface Env {
  ASSETS: Fetcher;
}

function isNonHtmlStaticResponse(response: Response): boolean {
  if (response.status === 404 || response.status >= 300) {
    return false;
  }
  const contentType = response.headers.get("content-type") ?? "";
  return !contentType.includes("text/html");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/assets/")) {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status === 404) {
        return applySecurityHeaders(
          new Response("Not Found", { status: 404 }),
          path
        );
      }
      return asset;
    }

    const maybeAsset = await env.ASSETS.fetch(request);
    if (isNonHtmlStaticResponse(maybeAsset)) {
      return maybeAsset;
    }

    return applySecurityHeaders(
      await env.ASSETS.fetch(new URL("/index.html", url.origin)),
      path
    );
  },
};
