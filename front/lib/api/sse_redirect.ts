// SSE redirect logic for the middleware.
//
// Old SSE event paths (e.g. /api/w/:wId/assistant/conversations/:cId/events)
// are redirected to /api/sse/... so the ingress can route them to dedicated
// front-sse pods with a simple prefix rule.

// Matches old SSE event paths that need redirecting to /api/sse/.
const SSE_REDIRECT_PATTERNS = [
  /^\/api\/(v1\/)?w\/[^/]+\/assistant\/conversations\/[^/]+\/events$/,
  /^\/api\/(v1\/)?w\/[^/]+\/assistant\/conversations\/[^/]+\/messages\/[^/]+\/events$/,
];

/**
 * Returns the redirected pathname if the given path matches an old SSE event
 * endpoint, or null if no redirect is needed.
 */
export function getSseRedirectPathname(pathname: string): string | null {
  // Already on /api/sse/ — no redirect needed.
  if (pathname.startsWith("/api/sse/")) {
    return null;
  }

  for (const pattern of SSE_REDIRECT_PATTERNS) {
    if (pattern.test(pathname)) {
      return pathname.replace(/^\/api\//, "/api/sse/");
    }
  }

  return null;
}
