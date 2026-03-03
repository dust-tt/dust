import { getBaseUrl, getDefaultInit } from "@app/lib/api/config";
import { isString } from "@app/types/shared/utils/general";

// Client-side fetch helper. This is a simple alias for the global fetch, used to satisfy
// the linter rule that discourages direct use of `fetch`. On the client, we cannot route
// through a proxy, so this is just a pass-through.
export function clientFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // Only rewrite URLs when a base URL resolver is active (SPA context).
  // In Next.js, relative URLs work fine and should not be rewritten.
  const baseUrl = getBaseUrl();

  if (baseUrl && isString(input) && input.startsWith("/")) {
    input = `${baseUrl}${input}`;
  }

  // Merge default RequestInit from the resolver (caller's init takes precedence,
  // headers are shallow-merged).
  // When no resolver is set but a baseUrlResolver is active (SPA context),
  // default to credentials: "include" for cross-origin cookie auth.
  const defaults =
    getDefaultInit() ?? (baseUrl ? { credentials: "include" } : null);
  if (defaults) {
    const mergedHeaders =
      defaults.headers || init?.headers
        ? {
            ...defaults.headers,
            ...init?.headers,
          }
        : undefined;

    init = {
      ...defaults,
      ...init,
      ...(mergedHeaders && { headers: mergedHeaders }),
    };
  }

  // eslint-disable-next-line no-restricted-globals
  return fetch(input, init);
}
