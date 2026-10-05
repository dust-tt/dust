import config from "@app/lib/api/config";
import { isDevelopment, isTest } from "@app/types/shared/env";
import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Metadata key storing the SHA-256 hash of the per-connection finalize nonce.
 * The plaintext nonce lives only in the HttpOnly cookie, never in connection
 * metadata (password-hash hygiene).
 */
export const OAUTH_FINALIZE_NONCE_METADATA_KEY = "finalize_nonce_hash";

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

/** SHA-256 digest of a finalize nonce, suitable for connection metadata. */
export function hashOAuthFinalizeNonce(nonce: string): string {
  return createHash("sha256").update(nonce).digest("base64url");
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
 * Constant-time compare of the expected finalize nonce hash (from connection
 * metadata) and the SHA-256 of the plaintext value presented by the browser
 * cookie.
 */
export function oauthFinalizeNoncesMatch(
  expectedHash: string | undefined | null,
  presentedNonce: string | undefined | null
): boolean {
  if (!expectedHash || !presentedNonce) {
    return false;
  }
  const a = Buffer.from(expectedHash);
  const b = Buffer.from(hashOAuthFinalizeNonce(presentedNonce));
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Returns connection metadata without the finalize-nonce hash key. */
export function scrubFinalizeNonceFromMetadata(
  metadata: Record<string, string>
): Record<string, string> {
  if (!(OAUTH_FINALIZE_NONCE_METADATA_KEY in metadata)) {
    return metadata;
  }
  const { [OAUTH_FINALIZE_NONCE_METADATA_KEY]: _removed, ...rest } = metadata;
  return rest;
}
