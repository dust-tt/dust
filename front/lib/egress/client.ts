import { getBaseUrl, getDefaultInit } from "@app/lib/api/config";
import { isString } from "@app/types/shared/utils/general";
import {
  EventSourcePolyfill,
  type EventSourcePolyfillInit,
} from "event-source-polyfill";

/**
 * Resolve the default RequestInit, merging it with `init` (caller takes precedence).
 * The resolver may be async (e.g. refreshing an expired token), so we always await.
 */
async function resolveInit(
  baseUrl: string,
  init?: RequestInit
): Promise<RequestInit | undefined> {
  let defaults = await getDefaultInit();
  if (!defaults && baseUrl) {
    defaults = { credentials: "include" };
  }

  if (!defaults) {
    return init;
  }

  const mergedHeaders =
    defaults.headers || init?.headers
      ? {
          ...defaults.headers,
          ...init?.headers,
        }
      : undefined;

  return {
    ...defaults,
    ...init,
    ...(mergedHeaders && { headers: mergedHeaders }),
  };
}

// Client-side fetch helper. This is a simple alias for the global fetch, used to satisfy
// the linter rule that discourages direct use of `fetch`. On the client, we cannot route
// through a proxy, so this is just a pass-through.
export async function clientFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // Only rewrite URLs when a base URL resolver is active (SPA context).
  // In Next.js, relative URLs work fine and should not be rewritten.
  const baseUrl = getBaseUrl();

  if (baseUrl && isString(input) && input.startsWith("/")) {
    input = `${baseUrl}${input}`;
  }

  init = await resolveInit(baseUrl, init);

  // eslint-disable-next-line no-restricted-globals
  return fetch(input, init);
}

// Client-side EventSource helper. Mirrors the URL-rewriting and header-merging
// logic of `clientFetch` so that SSE connections pick up the same auth context
// (Bearer tokens in the extension, cookies in the web app).
export async function clientEventSource(
  input: string,
  init?: EventSourcePolyfillInit
): Promise<EventSourcePolyfill> {
  const baseUrl = getBaseUrl();

  if (baseUrl && input.startsWith("/")) {
    input = `${baseUrl}${input}`;
  }

  // Resolve defaults (may refresh token).
  let defaults = await getDefaultInit();
  if (!defaults && baseUrl) {
    defaults = { credentials: "include" };
  }

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
