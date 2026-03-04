import { getBaseUrl, getDefaultInit } from "@app/lib/api/config";
import { isString } from "@app/types/shared/utils/general";
import {
  EventSourcePolyfill,
  type EventSourcePolyfillInit,
} from "event-source-polyfill";

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

// Client-side EventSource helper. Mirrors the URL-rewriting and header-merging
// logic of `clientFetch` so that SSE connections pick up the same auth context
// (Bearer tokens in the extension, cookies in the web app).
export function clientEventSource(
  input: string,
  init?: EventSourcePolyfillInit
): EventSourcePolyfill {
  const baseUrl = getBaseUrl();

  if (baseUrl && input.startsWith("/")) {
    input = `${baseUrl}${input}`;
  }

  // Merge default RequestInit headers from the resolver (caller's init takes
  // precedence, headers are shallow-merged). Map `credentials` to
  // `withCredentials` for the polyfill.
  const defaults =
    getDefaultInit() ?? (baseUrl ? { credentials: "include" } : null);

  if (defaults) {
    const defaultHeaders: Record<string, string> = {};
    if (defaults.headers) {
      // `defaults.headers` comes from RequestInit so it's a plain object.
      Object.assign(defaultHeaders, defaults.headers);
    }

    const mergedHeaders =
      Object.keys(defaultHeaders).length > 0 || init?.headers
        ? {
            ...defaultHeaders,
            ...init?.headers,
          }
        : undefined;

    // Map credentials → withCredentials (omit → false, include → true).
    // This mirrors clientFetch defaulting to credentials:"include" in the SPA
    // context so callers don't need to pass withCredentials explicitly.
    const withCredentials =
      defaults.credentials === "omit"
        ? false
        : defaults.credentials === "include"
          ? true
          : undefined;

    init = {
      ...init,
      ...(mergedHeaders && { headers: mergedHeaders }),
      ...(withCredentials !== undefined && { withCredentials }),
    };
  }

  return new EventSourcePolyfill(input, init);
}
