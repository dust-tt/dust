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

    // SPA fallback: route sub-apps to their own index.html.
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
