import { v4 as uuidv4 } from "uuid";

export const DUST_ANONYMOUS_ID_COOKIE = "_dust_aid";

const ANONYMOUS_ID_MAX_AGE_SECONDS = 31536000;

export function getRootCookieDomain(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (window.location.hostname === "localhost") {
    return null;
  }

  return ".dust.tt";
}

export function getPostHogCookieDomain(): string | undefined {
  const domain = getRootCookieDomain();
  return domain ?? undefined;
}

function buildDustAidCookieStringForDomain(
  value: string,
  domain: string | null
): string {
  const domainPart = domain ? `; domain=${domain}` : "";
  return `${DUST_ANONYMOUS_ID_COOKIE}=${value}; path=/${domainPart}; SameSite=Lax; Secure; max-age=${ANONYMOUS_ID_MAX_AGE_SECONDS}`;
}

export function buildDustAidCookieString(value: string): string {
  return buildDustAidCookieStringForDomain(value, getRootCookieDomain());
}

// Server-side cookie domain: `window` is unavailable in `getServerSideProps`, so
// derive the scope from the request host instead of `window.location`. Mirrors
// getRootCookieDomain(): share the id across *.dust.tt in production, host-only
// on localhost / preview hosts.
export function serverCookieDomainForHost(
  host: string | undefined
): string | null {
  if (!host) {
    return null;
  }

  const hostname = host.split(":")[0];
  if (hostname === "dust.tt" || hostname.endsWith(".dust.tt")) {
    return ".dust.tt";
  }

  return null;
}

// Build a `Set-Cookie` string for the anonymous id from the server. Kept in sync
// with buildDustAidCookieString() so an id minted server-side is read back
// identically by the client's getOrCreateAnonymousId().
export function buildDustAidServerCookieString(
  value: string,
  host: string | undefined
): string {
  return buildDustAidCookieStringForDomain(
    value,
    serverCookieDomainForHost(host)
  );
}

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

function readAnonymousIdFromDocumentCookie(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  return parseDustAidFromCookieString(document.cookie);
}

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
