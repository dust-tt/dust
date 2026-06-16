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
 * 2. Permanently redirect legacy conversation URLs to their current path:
 *    - /w/:wId/assistant/:cId → /w/:wId/conversation/:cId (301)
 *    - /w/:wId/agent/:cId     → /w/:wId/conversation/:cId (301)
 *
 * 3. Route sub-app paths to their dedicated index.html:
 *    - /share/*                → share/index.html
 *    - /oauth/*, /w/* /oauth/* → oauth/index.html
 *    - /email/*                → email/index.html
 *
 * 4. Fall back to the main index.html for all other paths (SPA routing).
 */

interface Env {
  ASSETS: Fetcher;
}

// Legacy conversation URLs (/w/:wId/assistant/:cId and /w/:wId/agent/:cId) renamed to
// /w/:wId/conversation/:cId. The query string is preserved here; the URL fragment never reaches
// the server but is reapplied by the browser on a 301.
const LEGACY_CONVERSATION_PATH_REGEX =
  /^\/w\/([^/]+)\/(?:assistant|agent)\/([^/]+)\/?$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/assets/")) {
      return new Response("Not Found", { status: 404 });
    }

    const legacyConversationMatch = LEGACY_CONVERSATION_PATH_REGEX.exec(path);
    if (legacyConversationMatch) {
      const [, wId, cId] = legacyConversationMatch;
      return Response.redirect(
        `${url.origin}/w/${wId}/conversation/${cId}${url.search}`,
        301
      );
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
