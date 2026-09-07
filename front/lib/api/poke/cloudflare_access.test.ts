import { beforeEach, describe, expect, it, vi } from "vitest";

const TEAM_DOMAIN = "https://dust.cloudflareaccess.com";
const AUDIENCE = "test-aud-tag";
const CERTS_URL = `${TEAM_DOMAIN}/cdn-cgi/access/certs`;
const IDENTITY_URL = `${TEAM_DOMAIN}/cdn-cgi/access/get-identity`;

const ASSERTION = "assertion.jwt.value";
const IDENTITY_COOKIE = "cf-authorization-cookie-value";
const SUBJECT = "9f45d0f0-0000-4000-8000-000000000000";

const mocks = vi.hoisted(() => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  trustedFetch: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  config: {
    getCloudflareAccessTeamDomain: vi.fn(),
    getCloudflareAccessAudience: vi.fn(),
    getCloudflareAccessCertsUrl: vi.fn(),
    getCloudflareAccessIdentityUrl: vi.fn(),
    getCloudflareAccessIdentityRequired: vi.fn(),
  },
}));

vi.mock("jose", () => ({
  jwtVerify: mocks.jwtVerify,
  createRemoteJWKSet: mocks.createRemoteJWKSet,
}));

vi.mock("@app/lib/api/config", () => ({ default: mocks.config }));

vi.mock("@app/lib/egress/server", () => ({
  trustedFetch: mocks.trustedFetch,
}));

vi.mock("@app/logger/logger", () => ({ default: mocks.logger }));

import {
  authenticateCloudflareAccess,
  clearCloudflareAccessJwksCacheForTests,
} from "./cloudflare_access";

function headers(values: Record<string, string> = {}): Headers {
  return new Headers({
    "Cf-Access-Jwt-Assertion": ASSERTION,
    Cookie: `CF_Authorization=${IDENTITY_COOKIE}`,
    ...values,
  });
}

function verifiedAssertion(
  payload: Record<string, unknown> = {},
  protectedHeader: Record<string, unknown> = {}
) {
  return {
    payload: {
      sub: SUBJECT,
      email: "Operator@dust.tt",
      name: " Operator ",
      exp: 2_000_000_000,
      nbf: 1_000_000_000,
      ...payload,
    },
    protectedHeader: { alg: "RS256", kid: "key-1", ...protectedHeader },
  };
}

function identityResponse(
  body: unknown,
  { status = 200 }: { status?: number } = {}
) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

function unknownKeyError() {
  return Object.assign(
    new Error("no applicable key found in the JSON Web Key Set"),
    {
      code: "ERR_JWKS_NO_MATCHING_KEY",
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  clearCloudflareAccessJwksCacheForTests();

  mocks.config.getCloudflareAccessTeamDomain.mockReturnValue(TEAM_DOMAIN);
  mocks.config.getCloudflareAccessAudience.mockReturnValue(AUDIENCE);
  mocks.config.getCloudflareAccessCertsUrl.mockReturnValue(undefined);
  mocks.config.getCloudflareAccessIdentityUrl.mockReturnValue(undefined);
  mocks.config.getCloudflareAccessIdentityRequired.mockReturnValue(undefined);

  mocks.jwtVerify.mockResolvedValue(verifiedAssertion());
  mocks.trustedFetch.mockResolvedValue(
    identityResponse({
      user_uuid: SUBJECT,
      email: "operator@dust.tt",
      groups: [{ id: "g1", name: "engineering-mdm" }],
    })
  );
});

describe("configuration", () => {
  it("is disabled when no Access setting is configured", async () => {
    mocks.config.getCloudflareAccessTeamDomain.mockReturnValue(undefined);
    mocks.config.getCloudflareAccessAudience.mockReturnValue(undefined);

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "disabled",
    });
    expect(mocks.jwtVerify).not.toHaveBeenCalled();
  });

  it("rejects a partial configuration instead of falling back to WorkOS", async () => {
    mocks.config.getCloudflareAccessAudience.mockReturnValue(undefined);

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "partial_configuration",
    });
  });

  it("defaults the team domain when only an audience is configured", async () => {
    mocks.config.getCloudflareAccessTeamDomain.mockReturnValue(undefined);

    const result = await authenticateCloudflareAccess(headers());

    expect(result.kind).toBe("authenticated");
    expect(mocks.createRemoteJWKSet).toHaveBeenCalledWith(
      new URL("https://teamdust.cloudflareaccess.com/cdn-cgi/access/certs"),
      expect.any(Object)
    );
  });

  it("rejects a non-HTTPS certs URL override", async () => {
    mocks.config.getCloudflareAccessCertsUrl.mockReturnValue(
      "http://dust.cloudflareaccess.com/cdn-cgi/access/certs"
    );

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "non_https_certs_url",
    });
  });

  it("rejects a non-HTTPS identity URL override", async () => {
    mocks.config.getCloudflareAccessIdentityUrl.mockReturnValue(
      "http://dust.cloudflareaccess.com/cdn-cgi/access/get-identity"
    );

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "non_https_identity_url",
    });
  });

  it("rejects a team domain that cannot be an HTTPS origin", async () => {
    mocks.config.getCloudflareAccessTeamDomain.mockReturnValue("ftp://nope");

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "invalid_team_domain",
    });
  });

  it("accepts a bare team domain and derives both endpoints", async () => {
    mocks.config.getCloudflareAccessTeamDomain.mockReturnValue(
      "dust.cloudflareaccess.com/"
    );

    const result = await authenticateCloudflareAccess(headers());

    expect(result.kind).toBe("authenticated");
    expect(mocks.createRemoteJWKSet).toHaveBeenCalledWith(
      new URL(CERTS_URL),
      expect.any(Object)
    );
    expect(mocks.trustedFetch).toHaveBeenCalledWith(
      IDENTITY_URL,
      expect.any(Object)
    );
  });
});

describe("assertion requirement", () => {
  it("rejects a missing assertion header", async () => {
    const withoutAssertion = new Headers({
      Cookie: `CF_Authorization=${IDENTITY_COOKIE}`,
    });

    expect(await authenticateCloudflareAccess(withoutAssertion)).toEqual({
      kind: "rejected",
      reasonCode: "missing_assertion",
    });
  });

  it("rejects a blank assertion header", async () => {
    expect(
      await authenticateCloudflareAccess(
        headers({ "Cf-Access-Jwt-Assertion": "   " })
      )
    ).toEqual({ kind: "rejected", reasonCode: "missing_assertion" });
  });

  it("never accepts the authorization cookie as the assertion", async () => {
    const cookieOnly = new Headers({
      Cookie: `CF_Authorization=${IDENTITY_COOKIE}`,
    });

    expect(await authenticateCloudflareAccess(cookieOnly)).toEqual({
      kind: "rejected",
      reasonCode: "missing_assertion",
    });
    expect(mocks.jwtVerify).not.toHaveBeenCalled();
  });

  it("reads the assertion header case-insensitively", async () => {
    const lowercased = new Headers({
      "cf-access-jwt-assertion": ASSERTION,
      Cookie: `CF_Authorization=${IDENTITY_COOKIE}`,
    });

    const result = await authenticateCloudflareAccess(lowercased);

    expect(result.kind).toBe("authenticated");
    expect(mocks.jwtVerify).toHaveBeenCalledWith(ASSERTION, "mock-jwks", {
      algorithms: ["RS256"],
      issuer: TEAM_DOMAIN,
      audience: AUDIENCE,
    });
  });
});

describe("assertion verification", () => {
  it("rejects a malformed assertion", async () => {
    mocks.jwtVerify.mockRejectedValue(new Error("Invalid Compact JWS"));

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "invalid_assertion",
    });
  });

  it("rejects a bad signature", async () => {
    mocks.jwtVerify.mockRejectedValue(
      Object.assign(new Error("signature verification failed"), {
        code: "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
      })
    );

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "invalid_assertion",
    });
  });

  it("rejects a wrong issuer", async () => {
    mocks.jwtVerify.mockRejectedValue(
      Object.assign(new Error('unexpected "iss" claim value'), {
        code: "ERR_JWT_CLAIM_VALIDATION_FAILED",
      })
    );

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "invalid_assertion",
    });
  });

  it("rejects a wrong audience", async () => {
    mocks.jwtVerify.mockRejectedValue(
      Object.assign(new Error('unexpected "aud" claim value'), {
        code: "ERR_JWT_CLAIM_VALIDATION_FAILED",
      })
    );

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "invalid_assertion",
    });
  });

  it("rejects an expired assertion", async () => {
    mocks.jwtVerify.mockRejectedValue(
      Object.assign(new Error('"exp" claim timestamp check failed'), {
        code: "ERR_JWT_EXPIRED",
      })
    );

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "invalid_assertion",
    });
  });

  it("rejects a missing exp claim", async () => {
    mocks.jwtVerify.mockResolvedValue(verifiedAssertion({ exp: undefined }));

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "missing_claims",
    });
  });

  it("rejects a missing nbf claim", async () => {
    mocks.jwtVerify.mockResolvedValue(verifiedAssertion({ nbf: undefined }));

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "missing_claims",
    });
  });

  it("rejects a missing email claim", async () => {
    mocks.jwtVerify.mockResolvedValue(verifiedAssertion({ email: undefined }));

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "missing_claims",
    });
  });

  it("rejects a missing sub claim", async () => {
    mocks.jwtVerify.mockResolvedValue(verifiedAssertion({ sub: "" }));

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "missing_claims",
    });
  });

  it("rejects a header without kid", async () => {
    mocks.jwtVerify.mockResolvedValue(
      verifiedAssertion({}, { kid: undefined })
    );

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "missing_kid",
    });
  });

  it("rejects an algorithm other than RS256", async () => {
    mocks.jwtVerify.mockResolvedValue(verifiedAssertion({}, { alg: "HS256" }));

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "unsupported_algorithm",
    });
  });

  it("refreshes the key set once and retries on an unknown kid", async () => {
    mocks.jwtVerify
      .mockRejectedValueOnce(unknownKeyError())
      .mockResolvedValueOnce(verifiedAssertion());

    const result = await authenticateCloudflareAccess(headers());

    expect(result.kind).toBe("authenticated");
    expect(mocks.jwtVerify).toHaveBeenCalledTimes(2);
    expect(mocks.createRemoteJWKSet).toHaveBeenCalledTimes(2);
  });

  it("rejects when the kid is still unknown after one refresh", async () => {
    mocks.jwtVerify.mockRejectedValue(unknownKeyError());

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "unknown_kid",
    });
    expect(mocks.jwtVerify).toHaveBeenCalledTimes(2);
    expect(mocks.createRemoteJWKSet).toHaveBeenCalledTimes(2);
  });

  it("does not refresh the key set on a signature failure", async () => {
    mocks.jwtVerify.mockRejectedValue(new Error("signature mismatch"));

    await authenticateCloudflareAccess(headers());

    expect(mocks.jwtVerify).toHaveBeenCalledTimes(1);
    expect(mocks.createRemoteJWKSet).toHaveBeenCalledTimes(1);
  });

  it("reuses the cached key set across calls", async () => {
    await authenticateCloudflareAccess(headers());
    await authenticateCloudflareAccess(headers());

    expect(mocks.createRemoteJWKSet).toHaveBeenCalledTimes(1);
  });
});

describe("get-identity", () => {
  it("forwards only the authorization cookie", async () => {
    await authenticateCloudflareAccess(
      headers({
        Cookie: `other=leak; CF_Authorization=${IDENTITY_COOKIE}; another=leak`,
        "X-Custom": "leak",
      })
    );

    expect(mocks.trustedFetch).toHaveBeenCalledWith(IDENTITY_URL, {
      method: "GET",
      headers: { Cookie: `CF_Authorization=${IDENTITY_COOKIE}` },
      redirect: "manual",
      signal: expect.any(AbortSignal),
    });
  });

  it("attaches cross-checked group names", async () => {
    mocks.trustedFetch.mockResolvedValue(
      identityResponse({
        user_uuid: SUBJECT,
        email: "operator@dust.tt",
        groups: [
          { id: "g1", name: " Engineering-MDM " },
          { id: "g2", name: "support-mdm@teamdust.example" },
          { id: "g3", name: "engineering-mdm" },
          { id: "g4", name: "unrelated-group" },
        ],
      })
    );

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "authenticated",
      user: {
        subject: SUBJECT,
        email: "operator@dust.tt",
        name: "Operator",
        identity: {
          kind: "cross_checked",
          groupNames: [
            "engineering-mdm",
            "support-mdm@teamdust.example",
            "unrelated-group",
          ],
        },
      },
    });
  });

  it("treats an absent groups field as an empty cross-checked set", async () => {
    mocks.trustedFetch.mockResolvedValue(
      identityResponse({ user_uuid: SUBJECT, email: "operator@dust.tt" })
    );

    const result = await authenticateCloudflareAccess(headers());

    expect(result).toEqual({
      kind: "authenticated",
      user: expect.objectContaining({
        identity: { kind: "cross_checked", groupNames: [] },
      }),
    });
  });

  it("never lets identity fields override the verified principal", async () => {
    mocks.trustedFetch.mockResolvedValue(
      identityResponse({
        user_uuid: SUBJECT,
        email: "OPERATOR@dust.tt",
        name: "Spoofed Admin",
        sub: "spoofed-subject",
        groups: [{ name: "engineering-mdm" }],
      })
    );

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "authenticated",
      user: {
        subject: SUBJECT,
        email: "operator@dust.tt",
        name: "Operator",
        identity: { kind: "cross_checked", groupNames: ["engineering-mdm"] },
      },
    });
  });

  it("rejects a transport failure", async () => {
    mocks.trustedFetch.mockRejectedValue(new Error("timed out"));

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "identity_unavailable",
    });
  });

  it("rejects a redirect", async () => {
    mocks.trustedFetch.mockResolvedValue(
      identityResponse(null, { status: 302 })
    );

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "identity_redirect",
    });
  });

  it("rejects a non-2xx response", async () => {
    mocks.trustedFetch.mockResolvedValue(
      identityResponse(null, { status: 403 })
    );

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "identity_non_success",
    });
  });

  it("rejects a body that is not JSON", async () => {
    mocks.trustedFetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => {
        throw new Error("Unexpected token < in JSON");
      },
    });

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "invalid_identity_payload",
    });
  });

  it("rejects a body missing user_uuid", async () => {
    mocks.trustedFetch.mockResolvedValue(
      identityResponse({ email: "operator@dust.tt" })
    );

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "invalid_identity_payload",
    });
  });

  it("rejects a body whose groups are the wrong shape", async () => {
    mocks.trustedFetch.mockResolvedValue(
      identityResponse({
        user_uuid: SUBJECT,
        email: "operator@dust.tt",
        groups: ["engineering-mdm"],
      })
    );

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "invalid_identity_payload",
    });
  });
});

describe("identity cross-check", () => {
  it("rejects a user_uuid that does not match sub", async () => {
    mocks.trustedFetch.mockResolvedValue(
      identityResponse({
        user_uuid: "another-subject",
        email: "operator@dust.tt",
      })
    );

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "identity_subject_mismatch",
    });
  });

  it("rejects an email that does not match the assertion", async () => {
    mocks.trustedFetch.mockResolvedValue(
      identityResponse({ user_uuid: SUBJECT, email: "someone@dust.tt" })
    );

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "identity_email_mismatch",
    });
  });

  it("matches emails case-insensitively", async () => {
    mocks.trustedFetch.mockResolvedValue(
      identityResponse({ user_uuid: SUBJECT, email: "OPERATOR@DUST.TT" })
    );

    expect((await authenticateCloudflareAccess(headers())).kind).toBe(
      "authenticated"
    );
  });
});

describe("CLOUDFLARE_ACCESS_IDENTITY_REQUIRED", () => {
  it("rejects a missing cookie by default", async () => {
    const withoutCookie = new Headers({
      "Cf-Access-Jwt-Assertion": ASSERTION,
    });

    expect(await authenticateCloudflareAccess(withoutCookie)).toEqual({
      kind: "rejected",
      reasonCode: "missing_identity_cookie",
    });
    expect(mocks.trustedFetch).not.toHaveBeenCalled();
  });

  it("rejects a missing cookie for any value other than false", async () => {
    mocks.config.getCloudflareAccessIdentityRequired.mockReturnValue("0");
    const withoutCookie = new Headers({
      "Cf-Access-Jwt-Assertion": ASSERTION,
    });

    expect(await authenticateCloudflareAccess(withoutCookie)).toEqual({
      kind: "rejected",
      reasonCode: "missing_identity_cookie",
    });
  });

  it("rejects a blank cookie value", async () => {
    expect(
      await authenticateCloudflareAccess(
        headers({ Cookie: "CF_Authorization=" })
      )
    ).toEqual({ kind: "rejected", reasonCode: "missing_identity_cookie" });
  });

  it("rejects a cookie value that could inject into the outbound header", async () => {
    expect(
      await authenticateCloudflareAccess(
        headers({ Cookie: "CF_Authorization=abc\\def" })
      )
    ).toEqual({ kind: "rejected", reasonCode: "invalid_identity_cookie" });
    expect(mocks.trustedFetch).not.toHaveBeenCalled();
  });

  it("degrades to jwt_only when identity is optional and the cookie is absent", async () => {
    mocks.config.getCloudflareAccessIdentityRequired.mockReturnValue("false");
    const withoutCookie = new Headers({
      "Cf-Access-Jwt-Assertion": ASSERTION,
    });

    expect(await authenticateCloudflareAccess(withoutCookie)).toEqual({
      kind: "authenticated",
      user: {
        subject: SUBJECT,
        email: "operator@dust.tt",
        name: "Operator",
        identity: { kind: "jwt_only" },
      },
    });
    expect(mocks.trustedFetch).not.toHaveBeenCalled();
  });

  it("degrades to jwt_only when identity is optional and get-identity fails", async () => {
    mocks.config.getCloudflareAccessIdentityRequired.mockReturnValue("false");
    mocks.trustedFetch.mockResolvedValue(
      identityResponse(null, { status: 500 })
    );

    const result = await authenticateCloudflareAccess(headers());

    expect(result).toEqual({
      kind: "authenticated",
      user: expect.objectContaining({ identity: { kind: "jwt_only" } }),
    });
  });

  it("still rejects a mismatch when identity is optional", async () => {
    mocks.config.getCloudflareAccessIdentityRequired.mockReturnValue("false");
    mocks.trustedFetch.mockResolvedValue(
      identityResponse({
        user_uuid: "another-subject",
        email: "operator@dust.tt",
      })
    );

    expect(await authenticateCloudflareAccess(headers())).toEqual({
      kind: "rejected",
      reasonCode: "identity_subject_mismatch",
    });
  });

  it("still rejects a malformed cookie when identity is optional", async () => {
    mocks.config.getCloudflareAccessIdentityRequired.mockReturnValue("false");

    expect(
      await authenticateCloudflareAccess(
        headers({ Cookie: "CF_Authorization=abc def" })
      )
    ).toEqual({ kind: "rejected", reasonCode: "invalid_identity_cookie" });
  });
});

describe("secret containment", () => {
  const secrets = [ASSERTION, IDENTITY_COOKIE];

  function assertSecretFree(value: unknown) {
    const serialized = JSON.stringify(value) ?? "";
    for (const secret of secrets) {
      expect(serialized).not.toContain(secret);
    }
  }

  it("keeps secrets out of an authenticated result", async () => {
    assertSecretFree(await authenticateCloudflareAccess(headers()));
  });

  it("keeps secrets and JOSE messages out of a rejected result", async () => {
    mocks.jwtVerify.mockRejectedValue(
      new Error(`signature verification failed for ${ASSERTION}`)
    );

    const result = await authenticateCloudflareAccess(headers());

    assertSecretFree(result);
    expect(result).toEqual({
      kind: "rejected",
      reasonCode: "invalid_assertion",
    });
  });

  it("never logs from the authentication path", async () => {
    mocks.jwtVerify.mockRejectedValue(new Error(`bad token ${ASSERTION}`));

    await authenticateCloudflareAccess(headers());

    expect(mocks.logger.warn).not.toHaveBeenCalled();
    expect(mocks.logger.error).not.toHaveBeenCalled();
    expect(mocks.logger.info).not.toHaveBeenCalled();
  });
});
