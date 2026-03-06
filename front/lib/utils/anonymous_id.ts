import { v4 as uuidv4 } from "uuid";

export const DUST_ANONYMOUS_ID_COOKIE = "_dust_aid";

const ANONYMOUS_ID_MAX_AGE_SECONDS = 31536000; // 1 year

/**
 * Derives the root domain from the current hostname so the cookie is shared
 * across subdomains (e.g. `dust.tt` and `app.dust.tt`).
 *
 * - `app.dust.tt`  → `.dust.tt`
 * - `dust.tt`      → `.dust.tt`
 * - `localhost`    → `localhost` (no domain attribute needed)
 */
function getRootCookieDomain(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const hostname = window.location.hostname;

  // localhost / IP addresses: no domain attribute needed.
  if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null;
  }

  const parts = hostname.split(".");
  if (parts.length < 2) {
    return null;
  }

  // Take the last two parts: "dust.tt" from "app.dust.tt" or "dust.tt".
  return `.${parts.slice(-2).join(".")}`;
}

/**
 * Builds the cookie string for `_dust_aid` including the domain attribute
 * when applicable (production multi-subdomain setup).
 */
export function buildDustAidCookieString(value: string): string {
  const domain = getRootCookieDomain();
  const domainPart = domain ? `; domain=${domain}` : "";
  return `${DUST_ANONYMOUS_ID_COOKIE}=${value}; path=/${domainPart}; SameSite=Lax; Secure; max-age=${ANONYMOUS_ID_MAX_AGE_SECONDS}`;
}

/**
 * Reads the `_dust_aid` cookie from `document.cookie`; if absent, generates a
 * UUIDv4, sets it as a first-party cookie, and returns it.
 *
 * The cookie is set with `domain=.dust.tt` (derived at runtime) so it is
 * shared between `dust.tt` (marketing site) and `app.dust.tt` (app).
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
  document.cookie = buildDustAidCookieString(id);
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
