import {
  generateOAuthFinalizeNonce,
  oauthFinalizeNonceCookieName,
  oauthFinalizeNoncesMatch,
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

  it("matches equal nonces and rejects missing or mismatched values", () => {
    const nonce = generateOAuthFinalizeNonce();
    expect(oauthFinalizeNoncesMatch(nonce, nonce)).toBe(true);
    expect(oauthFinalizeNoncesMatch(nonce, undefined)).toBe(false);
    expect(oauthFinalizeNoncesMatch(undefined, nonce)).toBe(false);
    expect(oauthFinalizeNoncesMatch(nonce, "x".repeat(nonce.length))).toBe(
      false
    );
  });
});
