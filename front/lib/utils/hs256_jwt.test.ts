import { signHS256Jwt, verifyHS256Jwt } from "@app/lib/utils/hs256_jwt";
import { decodeProtectedHeader } from "jose";
import { describe, expect, it } from "vitest";

const SECRET = "test-secret";

// Signed by the previous JWT library, so tokens issued before the switch keep verifying.
const LEGACY_HS256_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJtZW1iZXJzaGlwSW52aXRhdGlvbklkIjo0MiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjQxMDI0NDQ4MDB9.DqBleiUY0xYG2W2X8aWYL868126lClABgMay4OpjFBo";
const LEGACY_HS512_TOKEN =
  "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJ0eXBlIjoieCIsImlhdCI6MTc5MDkzMDc3Nn0.t5SrcowEmIT58PfRFR4nShfbWRNQ6JhYEyIQX53EljHpV7bu8vPtMkPQ7caJHX_tvKls6gc7swmo4WwcvZh89w";

describe("hs256_jwt", () => {
  it("round-trips claims and sets iat and exp", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await signHS256Jwt({ foo: "bar" }, SECRET, {
      expiresInSeconds: 60,
    });

    expect(decodeProtectedHeader(token)).toEqual({ alg: "HS256", typ: "JWT" });
    const payload = await verifyHS256Jwt(token, SECRET);
    expect(payload.foo).toBe("bar");
    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.exp).toBe((payload.iat ?? 0) + 60);
  });

  it("keeps iat and exp carried by the payload", async () => {
    const token = await signHS256Jwt(
      { iat: 1700000000, exp: 4102444800 },
      SECRET
    );

    const payload = await verifyHS256Jwt(token, SECRET);
    expect(payload.iat).toBe(1700000000);
    expect(payload.exp).toBe(4102444800);
  });

  it("rejects a wrong secret", async () => {
    const token = await signHS256Jwt({ foo: "bar" }, "other-secret");

    await expect(verifyHS256Jwt(token, SECRET)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await signHS256Jwt(
      { iat: 1700000000, exp: 1700000060 },
      SECRET
    );

    await expect(verifyHS256Jwt(token, SECRET)).rejects.toThrow();
  });

  it("verifies tokens signed by the previous library", async () => {
    const payload = await verifyHS256Jwt(LEGACY_HS256_TOKEN, "legacy-secret");

    expect(payload.membershipInvitationId).toBe(42);
  });

  it("rejects other HMAC algorithms", async () => {
    await expect(
      verifyHS256Jwt(LEGACY_HS512_TOKEN, "legacy-secret")
    ).rejects.toThrow();
  });
});
