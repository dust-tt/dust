// Vite environment variables type declaration
declare global {
  interface ImportMeta {
    env?: {
      VITE_DUST_CLIENT_FACING_URL?: string;
      VITE_BASE_PATH?: string;
    };
  }
}

// Get the API base URL from environment variables.
// In Vite SPA: uses VITE_DUST_CLIENT_FACING_URL
// In Next.js: uses relative URLs
function getApiBaseUrl(): string | undefined {
  // Check for Vite env var first (SPA mode)
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_DUST_CLIENT_FACING_URL
  ) {
    return import.meta.env.VITE_DUST_CLIENT_FACING_URL;
  }
}

// Client-side fetch helper. This is a simple alias for the global fetch, used to satisfy
// the linter rule that discourages direct use of `fetch`. On the client, we cannot route
// through a proxy, so this is just a pass-through.
export function clientFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const baseUrl = getApiBaseUrl();

  // Only prepend base URL for relative paths (starting with /)
  if (baseUrl && typeof input === "string" && input.startsWith("/")) {
    input = `${baseUrl}${input}`;
    init = {
      ...init,
      credentials: "include",
    };
  }

  // eslint-disable-next-line no-restricted-globals
  return fetch(input, init);
}
