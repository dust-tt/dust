import { v4 as uuidv4 } from "uuid";

export const DUST_ANONYMOUS_ID_COOKIE = "_dust_aid";

const ANONYMOUS_ID_MAX_AGE_SECONDS = 31536000; // 1 year

/**
 * Reads the `_dust_aid` cookie from `document.cookie`; if absent, generates a
 * UUIDv4, sets it as a first-party cookie, and returns it.
 *
 * Client-side only. Returns `null` when called outside a browser context.
 */
export function getOrCreateAnonymousId(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const existing = readAnonymousIdFromDocumentCookie();
  if (existing) {
    return existing;
  }

  const id = uuidv4();
  document.cookie = `${DUST_ANONYMOUS_ID_COOKIE}=${id}; path=/; SameSite=Lax; Secure; max-age=${ANONYMOUS_ID_MAX_AGE_SECONDS}`;
  return id;
}

/**
 * Reads the `_dust_aid` value from `document.cookie`.
 * Returns `null` if the cookie is not present or we're not in a browser.
 */
function readAnonymousIdFromDocumentCookie(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  return parseDustAidFromCookieString(document.cookie);
}

/**
 * Server-side helper: parses the `_dust_aid` value from a raw `Cookie` header.
 * Returns `null` if not found.
 */
export function readAnonymousIdFromCookies(
  cookieHeader: string | undefined
): string | null {
  if (!cookieHeader) {
    return null;
  }
  return parseDustAidFromCookieString(cookieHeader);
}

function parseDustAidFromCookieString(cookies: string): string | null {
  const prefix = `${DUST_ANONYMOUS_ID_COOKIE}=`;
  const match = cookies.split("; ").find((c) => c.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}
