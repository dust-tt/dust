import { webcrypto } from "node:crypto";
import type { JWTPayload, JWTVerifyOptions } from "jose";
import { jwtVerify, SignJWT } from "jose";

const HS256 = "HS256";

// Imported as a CryptoKey rather than raw bytes: jose type-checks raw keys with `instanceof`, which
// fails across realms (e.g. jsdom test environments).
function importSecret(secret: string): Promise<webcrypto.CryptoKey> {
  return webcrypto.subtle.importKey(
    "raw",
    Buffer.from(secret, "utf8"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * @cc [owner:avervaet,label:security] hs256-sign-claims
 * Tokens MUST be signed with HS256 over the UTF-8 bytes of `secret`. `iat` is set to now unless
 * `payload` carries one; `exp` is `iat + expiresInSeconds` when given, else `payload.exp` is kept
 * as is.
 */
export async function signHS256Jwt(
  payload: JWTPayload,
  secret: string,
  { expiresInSeconds }: { expiresInSeconds?: number } = {}
): Promise<string> {
  const iat = payload.iat ?? Math.floor(Date.now() / 1000);
  const jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: HS256, typ: "JWT" })
    .setIssuedAt(iat);
  if (expiresInSeconds !== undefined) {
    jwt.setExpirationTime(iat + Math.floor(expiresInSeconds));
  }
  return jwt.sign(await importSecret(secret));
}

/**
 * @cc [owner:avervaet,label:security] hs256-verify-only
 * Verification MUST only accept HS256 signatures and MUST throw on any invalid signature, expired
 * token or failed claim check rather than return a payload.
 */
export async function verifyHS256Jwt(
  token: string,
  secret: string,
  options: Omit<JWTVerifyOptions, "algorithms"> = {}
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, await importSecret(secret), {
    ...options,
    algorithms: [HS256],
  });
  return payload;
}
