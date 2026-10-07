import {
  generateOAuthFinalizeNonce,
  hashOAuthFinalizeNonce,
  OAUTH_FINALIZE_NONCE_METADATA_KEY,
  oauthFinalizeNonceCookieName,
  oauthFinalizeNoncesMatch,
  scrubFinalizeNonceFromMetadata,
} from "@app/lib/api/oauth/finalize_binding";
import { describe, expect, it } from "vitest";

describe("oauth finalize binding helpers", () => {
  it("generates distinct high-entropy nonces", () => {
    const a = generateOAuthFinalizeNonce();
    const b = generateOAuthFinalizeNonce();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it("derives stable per-connection cookie names without echoing the id", () => {
    const connectionId = "con_abc123-secretportion";
    const name = oauthFinalizeNonceCookieName(connectionId);
    expect(name.startsWith("dust_oauth_finalize_")).toBe(true);
    expect(name).not.toContain(connectionId);
    expect(oauthFinalizeNonceCookieName(connectionId)).toBe(name);
    expect(oauthFinalizeNonceCookieName("con_other-secret")).not.toBe(name);
  });

  it("matches a stored digest against the plaintext cookie nonce", () => {
    const nonce = generateOAuthFinalizeNonce();
    const hash = hashOAuthFinalizeNonce(nonce);
    expect(hash).not.toEqual(nonce);
    expect(oauthFinalizeNoncesMatch(hash, nonce)).toBe(true);
    expect(oauthFinalizeNoncesMatch(hash, undefined)).toBe(false);
    expect(oauthFinalizeNoncesMatch(undefined, nonce)).toBe(false);
    expect(oauthFinalizeNoncesMatch(hash, "x".repeat(nonce.length))).toBe(
      false
    );
    // Comparing hash to itself (as if plaintext leaked into the cookie) fails.
    expect(oauthFinalizeNoncesMatch(hash, hash)).toBe(false);
  });

  it("scrubs the finalize nonce hash from connection metadata", () => {
    const metadata = {
      user_id: "user_1",
      [OAUTH_FINALIZE_NONCE_METADATA_KEY]: "abc",
      workspace_id: "ws_1",
    };
    expect(scrubFinalizeNonceFromMetadata(metadata)).toEqual({
      user_id: "user_1",
      workspace_id: "ws_1",
    });
  });
});
