interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Try to serve the exact file first (static assets, etc.)
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    // Missing static assets should 404, not fall through to SPA.
    if (path.startsWith("/assets/")) {
      return new Response("Not Found", { status: 404 });
    }

    // SPA fallback.
    return env.ASSETS.fetch(new URL("/index.html", url.origin));
  },
};
