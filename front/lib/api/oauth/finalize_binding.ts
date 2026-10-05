import config from "@app/lib/api/config";
import { isDevelopment, isTest } from "@app/types/shared/env";
import { createHash, randomBytes, timingSafeEqual } from "crypto";

/** Metadata key storing the per-connection finalize nonce set at setup. */
export const OAUTH_FINALIZE_NONCE_METADATA_KEY = "finalize_nonce";

/** Lifetime of the HttpOnly finalize-nonce cookie (matches WorkOS login nonce). */
export const OAUTH_FINALIZE_NONCE_MAX_AGE_SECONDS = 600;

const COOKIE_PREFIX = "dust_oauth_finalize_";

/**
 * Generates a cryptographically random nonce used to bind an OAuth setup to the
 * initiating browser via an HttpOnly cookie.
 */
export function generateOAuthFinalizeNonce(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Cookie name for a connection's finalize nonce. Hashed so concurrent OAuth
 * flows don't overwrite each other and so connection ids aren't echoed in
 * cookie names.
 */
export function oauthFinalizeNonceCookieName(connectionId: string): string {
  const hash = createHash("sha256")
    .update(connectionId)
    .digest("base64url")
    .slice(0, 16);
  return `${COOKIE_PREFIX}${hash}`;
}

export function oauthFinalizeNonceCookieOptions() {
  // Reuse the WorkOS session cookie domain so the nonce is visible on both
  // regional app hosts that share the parent domain. Skip in dev/test where
  // the env var is unset.
  const domain =
    isDevelopment() || isTest()
      ? undefined
      : config.getWorkOSSessionCookieDomain();
  return {
    path: "/",
    httpOnly: true,
    secure: !(isDevelopment() || isTest()),
    sameSite: "Lax" as const,
    ...(domain ? { domain } : {}),
  };
}

/**
 * Constant-time compare of the expected finalize nonce (from connection
 * metadata) and the value presented by the browser cookie.
 */
export function oauthFinalizeNoncesMatch(
  expected: string | undefined | null,
  presented: string | undefined | null
): boolean {
  if (!expected || !presented) {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
