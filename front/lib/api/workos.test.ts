import { parseWorkOSJwtPayload, verifyWorkOSToken } from "@app/lib/api/workos";
import type { CryptoKey, JWTVerifyGetKey } from "jose";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  errors as joseErrors,
  SignJWT,
} from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

const ISSUER = "https://auth.example.com";

const jwksHolder = vi.hoisted(() => ({
  getKey: null as JWTVerifyGetKey | null,
}));

vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return {
    ...actual,
    createRemoteJWKSet: () => {
      const getKey: JWTVerifyGetKey = (...args) => {
        if (!jwksHolder.getKey) {
          throw new Error("JWKS not initialized");
        }
        return jwksHolder.getKey(...args);
      };
      return getKey;
    },
  };
});

describe("parseWorkOSJwtPayload", () => {
  it("accepts a valid payload with required fields", () => {
    const payload = {
      sub: "user_123",
      exp: 1_700_000_000,
    };

    const result = parseWorkOSJwtPayload(payload);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sub).toBe("user_123");
      expect(result.value.exp).toBe(1_700_000_000);
    }
  });

  it("accepts optional string and number claims", () => {
    const payload = {
      sub: "user_123",
      exp: 1_700_000_000,
      org_id: "org_abc",
      iat: 1_699_999_000,
    };

    const result = parseWorkOSJwtPayload(payload);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.org_id).toBe("org_abc");
      expect(result.value.iat).toBe(1_699_999_000);
    }
  });

  it("rejects a payload missing sub", () => {
    const result = parseWorkOSJwtPayload({
      exp: 1_700_000_000,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Invalid token payload.");
    }
  });

  it("rejects a payload missing exp", () => {
    const result = parseWorkOSJwtPayload({
      sub: "user_123",
    });

    expect(result.isErr()).toBe(true);
  });

  it("rejects a payload with invalid claim types", () => {
    const result = parseWorkOSJwtPayload({
      sub: "user_123",
      exp: 1_700_000_000,
      org_id: { nested: "object" },
    });

    expect(result.isErr()).toBe(true);
  });
});

describe("verifyWorkOSToken", () => {
  let signingKey: CryptoKey;
  let otherKey: CryptoKey;

  beforeAll(async () => {
    vi.stubEnv("WORKOS_CLIENT_ID", "client_test");
    vi.stubEnv("WORKOS_ISSUER_URL", ISSUER);

    const pair = await generateKeyPair("RS256");
    signingKey = pair.privateKey;
    otherKey = (await generateKeyPair("RS256")).privateKey;

    const jwk = await exportJWK(pair.publicKey);
    jwksHolder.getKey = createLocalJWKSet({
      keys: [{ ...jwk, kid: "key-1", alg: "RS256" }],
    });
  });

  function sign(
    key: CryptoKey,
    {
      issuer = ISSUER,
      exp = "5m",
    }: { issuer?: string; exp?: string | number } = {}
  ) {
    return new SignJWT({ sub: "user_123" })
      .setProtectedHeader({ alg: "RS256", kid: "key-1" })
      .setIssuer(issuer)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(key);
  }

  it("accepts a token signed by a WorkOS key", async () => {
    const result = await verifyWorkOSToken(await sign(signingKey));

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sub).toBe("user_123");
    }
  });

  it("returns a JWTExpired error for an expired token", async () => {
    const result = await verifyWorkOSToken(
      await sign(signingKey, { exp: Math.floor(Date.now() / 1000) - 60 })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(joseErrors.JWTExpired);
    }
  });

  it("rejects a token from another issuer", async () => {
    const result = await verifyWorkOSToken(
      await sign(signingKey, { issuer: "https://evil.example.com" })
    );

    expect(result.isErr()).toBe(true);
  });

  it("rejects a token signed by an unknown key", async () => {
    const result = await verifyWorkOSToken(await sign(otherKey));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).not.toBeInstanceOf(joseErrors.JWTExpired);
    }
  });
});
