// Pluggable base URL resolver.
let baseUrlResolver: (() => string) | null = null;

export function setBaseUrlResolver(fn: (() => string) | null): void {
  baseUrlResolver = fn;
}

function getSpaBaseUrl(): string {
  return typeof import.meta !== "undefined"
    ? (import.meta.env?.VITE_DUST_CLIENT_FACING_URL ?? "")
    : "";
}

export function getApiBaseUrl(): string {
  // Use custom resolver if set, otherwise fall back to SPA build-time URL.
  // If resolver returns undefined, still fall back to SPA URL.
  const resolved = baseUrlResolver ? baseUrlResolver() : undefined;
  return resolved ?? getSpaBaseUrl();
}

// Client-side fetch helper. This is a simple alias for the global fetch, used to satisfy
// the linter rule that discourages direct use of `fetch`. On the client, we cannot route
// through a proxy, so this is just a pass-through.
export function clientFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const baseUrl = getApiBaseUrl();

  if (baseUrl.length > 0 && typeof input === "string") {
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
