import config from "@app/lib/api/config";
import { isDevelopment, isTest } from "@app/types/shared/env";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Metadata key storing a digest of the per-connection finalize nonce.
 * The plaintext nonce lives only in the HttpOnly cookie, never in connection
 * metadata.
 */
export const OAUTH_FINALIZE_NONCE_METADATA_KEY = "finalize_nonce_hash";

/** Lifetime of the HttpOnly finalize-nonce cookie (matches WorkOS login nonce). */
export const OAUTH_FINALIZE_NONCE_MAX_AGE_SECONDS = 600;

const COOKIE_PREFIX = "dust_oauth_finalize_";

// Public MAC context: the nonce is the HMAC key (high-entropy random token).
const FINALIZE_NONCE_MAC_CONTEXT = "dust.oauth.finalize.nonce.v1";

/**
 * Generates a cryptographically random nonce used to bind an OAuth setup to the
 * initiating browser via an HttpOnly cookie.
 */
export function generateOAuthFinalizeNonce(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Digest of a finalize nonce for connection metadata. HMAC-SHA256 with the
 * nonce as key so the stored value is not a raw SHA-256 of the cookie secret.
 */
export function hashOAuthFinalizeNonce(nonce: string): string {
  return createHmac("sha256", nonce)
    .update(FINALIZE_NONCE_MAC_CONTEXT)
    .digest("base64url");
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
 * Constant-time compare of the expected finalize nonce digest (from connection
 * metadata) and the HMAC of the plaintext value presented by the browser
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
