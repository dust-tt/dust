import { getBaseUrlFromResolver } from "@app/lib/api/config";

// Client-side fetch helper. This is a simple alias for the global fetch, used to satisfy
// the linter rule that discourages direct use of `fetch`. On the client, we cannot route
// through a proxy, so this is just a pass-through.
export function clientFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // Only rewrite URLs when a base URL resolver is active (SPA context).
  // In Next.js, relative URLs work fine and should not be rewritten.
  const baseUrl = getBaseUrlFromResolver();

  if (baseUrl && typeof input === "string") {
    if (input.startsWith("/")) {
      input = `${baseUrl}${input}`;
    }

    // Include credentials for all requests targeting the API (needed for
    // cross-origin requests from the SPA on app.dust.tt to the API on dust.tt).
    if (input.startsWith(baseUrl)) {
      init = { ...init, credentials: "include" };
    }
  }

  // eslint-disable-next-line no-restricted-globals
  return fetch(input, init);
}
