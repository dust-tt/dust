declare global {
  interface ImportMeta {
    env?: {
      VITE_DUST_CLIENT_FACING_URL?: string;
    };
  }
}

// Pluggable base URL resolver.
let baseUrlResolver: (() => string | undefined) | null = null;

export function setBaseUrlResolver(
  fn: (() => string | undefined) | null
): void {
  baseUrlResolver = fn;
}

function getSpaBaseUrl(): string | undefined {
  return typeof import.meta !== "undefined"
    ? import.meta.env?.VITE_DUST_CLIENT_FACING_URL
    : undefined;
}

function getApiBaseUrl(): string | undefined {
  // Use custom resolver if set, otherwise fall back to SPA build-time URL.
  return baseUrlResolver ? baseUrlResolver() : getSpaBaseUrl();
}

// Client-side fetch helper. This is a simple alias for the global fetch, used to satisfy
// the linter rule that discourages direct use of `fetch`. On the client, we cannot route
// through a proxy, so this is just a pass-through.
export function clientFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const baseUrl = getApiBaseUrl();

  // Only prepend base URL for relative paths (starting with /).
  if (baseUrl && typeof input === "string" && input.startsWith("/")) {
    input = `${baseUrl}${input}`;
    init = { ...init, credentials: "include" };
  }

  // eslint-disable-next-line no-restricted-globals
  return fetch(input, init);
}
