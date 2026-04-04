import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks (must be declared before vi.mock calls) ---

const {
  mockGetAuthorizationUrl,
  mockAuthenticateWithCode,
  mockListConnections,
  mockRevokeSession,
  mockGetLogoutUrl,
  mockGetSession,
  mockCheckUserRegionAffinity,
} = vi.hoisted(() => ({
  mockGetAuthorizationUrl: vi
    .fn()
    .mockReturnValue("https://workos.example/auth"),
  mockAuthenticateWithCode: vi.fn(),
  mockListConnections: vi.fn().mockResolvedValue({ data: [] }),
  mockRevokeSession: vi.fn(),
  mockGetLogoutUrl: vi.fn().mockReturnValue("https://workos.example/logout"),
  mockGetSession: vi.fn().mockResolvedValue(null),
  mockCheckUserRegionAffinity: vi.fn().mockResolvedValue({
    isErr: () => false,
    isOk: () => true,
    value: { hasAffinity: true, region: "us-central1" },
  }),
}));

// --- Mocks: only external services and side-effectful dependencies ---

vi.mock("@app/lib/api/workos/client", () => ({
  getWorkOS: () => ({
    userManagement: {
      getAuthorizationUrl: mockGetAuthorizationUrl,
      authenticateWithCode: mockAuthenticateWithCode,
      authenticateWithRefreshToken: vi
        .fn()
        .mockResolvedValue({ accessToken: "refreshed" }),
      revokeSession: mockRevokeSession,
      getLogoutUrl: mockGetLogoutUrl,
    },
    sso: { listConnections: mockListConnections },
  }),
}));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getAuthRedirectBaseUrl: () => "https://dust.tt",
    getWorkOSClientId: () => "client_test",
    getWorkOSCookiePassword: () => "a".repeat(32),
    getWorkOSSessionCookieDomain: () => undefined,
    getClientFacingUrl: () => "https://dust.tt",
    getAppUrl: () => "https://app.dust.tt",
    getStaticWebsiteUrl: () => "https://dust.tt",
    getApiBaseUrl: () => "https://dust.tt",
  },
}));

vi.mock("@app/lib/api/regions/config", () => ({
  config: {
    getCurrentRegion: () => "us-central1",
    getOtherRegionInfo: () => ({ url: "https://eu.dust.tt" }),
  },
  SUPPORTED_REGIONS: ["us-central1", "europe-west1"],
}));

vi.mock("@app/lib/api/regions/lookup", () => ({
  checkUserRegionAffinity: mockCheckUserRegionAffinity,
}));

vi.mock("@app/lib/auth", () => ({
  getSession: mockGetSession,
}));

vi.mock("@app/lib/resources/membership_invitation_resource", () => ({
  MembershipInvitationResource: {
    getPendingForToken: vi.fn(),
  },
}));

vi.mock("@app/lib/resources/user_resource", () => ({
  UserResource: {
    fetchByWorkOSUserId: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@app/lib/utils/utm", () => ({
  extractUTMParams: () => ({}),
}));

vi.mock("@app/logger/logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@app/lib/utils/statsd", () => ({
  getStatsDClient: () => ({ increment: vi.fn() }),
}));

vi.mock("iron-session", () => ({
  sealData: vi.fn().mockResolvedValue("sealed-session-data"),
}));

vi.mock("@app/lib/api/workos/types", () => ({
  isOrganizationSelectionRequiredError: vi.fn().mockReturnValue(false),
}));

vi.mock("@app/lib/cookies", () => ({
  DUST_HAS_SESSION: "dust-has-session",
}));

vi.mock("@app/types/shared/env", () => ({
  isDevelopment: () => true,
}));

// Real implementations for pure utilities (avoids mock drift).
vi.mock("@app/types/shared/utils/general", () => ({
  isString: (v: unknown): v is string => typeof v === "string",
}));

vi.mock("@app/types/shared/utils/url_utils", () => ({
  validateRelativePath: (path: string | string[] | undefined) => {
    if (typeof path !== "string" || path.trim() === "") {
      return { valid: false as const, sanitizedPath: null };
    }
    let decodedPath = path;
    try {
      for (let i = 0; i < 5; i++) {
        const next = decodeURIComponent(decodedPath);
        if (next === decodedPath) {
          break;
        }
        decodedPath = next;
      }
    } catch {
      return { valid: false as const, sanitizedPath: null };
    }
    if (decodedPath.startsWith("//")) {
      return { valid: false as const, sanitizedPath: null };
    }
    try {
      const parsed = new URL(decodedPath, "http://localhost");
      if (parsed.hostname !== "localhost") {
        return { valid: false as const, sanitizedPath: null };
      }
      const sanitized = parsed.pathname + parsed.search;
      return { valid: true as const, sanitizedPath: sanitized };
    } catch {
      return { valid: false as const, sanitizedPath: null };
    }
  },
}));

vi.mock("@workos-inc/node", () => ({
  GenericServerException: class GenericServerException extends Error {},
  OauthException: class OauthException extends Error {},
}));

// Must import handler AFTER mocks are set up.
import handler from "./[action]";

// --- Helpers ---

function makeFakeJwt(region = "us-central1", workspaceId = "ws-123"): string {
  return `header.${Buffer.from(
    JSON.stringify({
      "https://dust.tt/region": region,
      "https://dust.tt/workspaceId": workspaceId,
    })
  ).toString("base64")}.sig`;
}

function setupAuthMock(overrides: Record<string, unknown> = {}) {
  mockAuthenticateWithCode.mockResolvedValue({
    user: { id: "user-1", email: "test@example.com" },
    organizationId: "org-1",
    authenticationMethod: "GoogleOAuth",
    sealedSession: "sealed-data",
    accessToken: makeFakeJwt(),
    ...overrides,
  });
}

// --- Tests ---
// Note: This handler runs pre-authentication (it establishes sessions), so
// createPrivateApiMockRequest() is not applicable. We use createMocks()
// directly and set req.cookies manually where the handler reads nonce cookies.

describe("handler dispatch", () => {
  it("returns 400 for invalid action", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { action: "invalid" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: "Invalid action" });
  });
});

describe("GET /api/workos/login", () => {
  beforeEach(() => {
    mockGetAuthorizationUrl.mockClear();
  });

  it("sets a nonce cookie and includes nonce in state", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { action: "login" },
    });

    await handler(req, res);

    // Should redirect to WorkOS.
    expect(res._getRedirectUrl()).toBe("https://workos.example/auth");

    // Should set nonce cookie with correct attributes.
    const cookies = res.getHeader("Set-Cookie");
    const cookieStr = Array.isArray(cookies) ? cookies[0] : String(cookies);
    expect(cookieStr).toContain("workos_oauth_nonce=");
    expect(cookieStr).toContain("HttpOnly");
    expect(cookieStr).toContain("SameSite=Lax");
    expect(cookieStr).toContain("Path=/api/workos/callback");
    expect(cookieStr).toContain("Max-Age=600");

    // The state passed to getAuthorizationUrl should contain a nonce.
    const callArgs = mockGetAuthorizationUrl.mock.calls[0][0];
    const stateObj = JSON.parse(
      Buffer.from(callArgs.state, "base64").toString("utf-8")
    );
    expect(stateObj.nonce).toBeDefined();
    expect(typeof stateObj.nonce).toBe("string");
    expect(stateObj.nonce.length).toBeGreaterThan(0);
  });

  it("rejects untrusted redirect_uri and uses default", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { action: "login", redirect_uri: "https://evil.com/steal" },
    });

    await handler(req, res);

    const callArgs = mockGetAuthorizationUrl.mock.calls[0][0];
    expect(callArgs.redirectUri).toBe("https://dust.tt/api/workos/callback");
  });

  it("allows redirect_uri from trusted origins with correct path", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        action: "login",
        redirect_uri: "https://app.dust.tt/api/workos/callback",
      },
    });

    await handler(req, res);

    const callArgs = mockGetAuthorizationUrl.mock.calls[0][0];
    expect(callArgs.redirectUri).toBe(
      "https://app.dust.tt/api/workos/callback"
    );
  });

  it("rejects trusted origin with wrong path", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        action: "login",
        redirect_uri: "https://app.dust.tt/evil-redirect",
      },
    });

    await handler(req, res);

    const callArgs = mockGetAuthorizationUrl.mock.calls[0][0];
    expect(callArgs.redirectUri).toBe("https://dust.tt/api/workos/callback");
  });
});

describe("GET /api/workos/callback", () => {
  const validNonce = crypto.randomBytes(32).toString("base64url");

  function makeState(overrides: Record<string, unknown> = {}): string {
    return Buffer.from(
      JSON.stringify({ nonce: validNonce, ...overrides })
    ).toString("base64");
  }

  beforeEach(() => {
    mockAuthenticateWithCode.mockClear();
    setupAuthMock();
  });

  it("rejects callback when nonce cookie is missing", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { action: "callback", code: "auth-code", state: makeState() },
    });

    await handler(req, res);

    expect(res._getRedirectUrl()).toBe(
      "https://app.dust.tt/login-error?reason=nonce-mismatch&type=workos-callback"
    );
    expect(mockAuthenticateWithCode).not.toHaveBeenCalled();

    // Should clear the nonce cookie even on mismatch.
    const cookies = res.getHeader("Set-Cookie");
    const cookieStr = String(cookies);
    expect(cookieStr).toContain("workos_oauth_nonce=");
    expect(cookieStr).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("rejects callback when nonce does not match", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { action: "callback", code: "auth-code", state: makeState() },
    });
    req.cookies = { workos_oauth_nonce: "wrong-nonce" };

    await handler(req, res);

    expect(res._getRedirectUrl()).toBe(
      "https://app.dust.tt/login-error?reason=nonce-mismatch&type=workos-callback"
    );
    expect(mockAuthenticateWithCode).not.toHaveBeenCalled();
  });

  it("redirects to error on malformed state (invalid base64/JSON)", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        action: "callback",
        code: "auth-code",
        state: "!!!invalid!!!",
      },
    });
    req.cookies = { workos_oauth_nonce: validNonce };

    await handler(req, res);

    expect(res._getRedirectUrl()).toBe(
      "https://app.dust.tt/login-error?reason=invalid-state&type=workos-callback"
    );
    expect(mockAuthenticateWithCode).not.toHaveBeenCalled();
  });

  it("redirects to error when state is missing entirely", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { action: "callback", code: "auth-code" },
    });
    req.cookies = { workos_oauth_nonce: validNonce };

    await handler(req, res);

    // Missing state → nonce mismatch (empty object has no nonce field).
    expect(res._getRedirectUrl()).toBe(
      "https://app.dust.tt/login-error?reason=nonce-mismatch&type=workos-callback"
    );
    expect(mockAuthenticateWithCode).not.toHaveBeenCalled();
  });

  it("rejects callback when state has no nonce (legacy/tampered)", async () => {
    const stateNoNonce = Buffer.from(
      JSON.stringify({ returnTo: "/api/login" })
    ).toString("base64");
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { action: "callback", code: "auth-code", state: stateNoNonce },
    });
    req.cookies = { workos_oauth_nonce: validNonce };

    await handler(req, res);

    expect(res._getRedirectUrl()).toBe(
      "https://app.dust.tt/login-error?reason=nonce-mismatch&type=workos-callback"
    );
  });

  it("accepts callback when nonce matches and sets session cookie", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { action: "callback", code: "auth-code", state: makeState() },
    });
    req.cookies = { workos_oauth_nonce: validNonce };

    await handler(req, res);

    // Should have called authenticate.
    expect(mockAuthenticateWithCode).toHaveBeenCalled();

    // Should redirect to default returnTo.
    expect(res._getRedirectUrl()).toBe("/api/login");

    // Should set session cookies (array includes nonce clear + session + indicator).
    const cookies = res.getHeader("Set-Cookie");
    expect(Array.isArray(cookies)).toBe(true);
    const cookieArr = cookies as string[];

    // Nonce cookie should be cleared.
    expect(
      cookieArr.some(
        (c: string) =>
          c.includes("workos_oauth_nonce=") &&
          c.includes("Expires=Thu, 01 Jan 1970")
      )
    ).toBe(true);
    // Session cookie should be set.
    expect(
      cookieArr.some((c: string) =>
        c.includes("workos_session=sealed-session-data")
      )
    ).toBe(true);
  });

  it("redirects to other region when session region differs", async () => {
    setupAuthMock({ accessToken: makeFakeJwt("europe-west1") });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { action: "callback", code: "auth-code", state: makeState() },
    });
    req.cookies = { workos_oauth_nonce: validNonce };

    await handler(req, res);

    // Should redirect to the EU region login endpoint with returnTo.
    const redirectUrl = res._getRedirectUrl();
    expect(redirectUrl).toMatch(
      /^https:\/\/eu\.dust\.tt\/api\/workos\/login\?returnTo=/
    );
    // Should clear nonce cookie on cross-region redirect.
    const cookies = res.getHeader("Set-Cookie");
    const cookieStr = String(cookies);
    expect(cookieStr).toContain("workos_oauth_nonce=");
    expect(cookieStr).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("rejects callback when code is missing", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { action: "callback", state: makeState() },
    });
    req.cookies = { workos_oauth_nonce: validNonce };

    await handler(req, res);

    expect(res._getRedirectUrl()).toBe(
      "https://app.dust.tt/login-error?reason=invalid-code&type=workos-callback"
    );
    expect(mockAuthenticateWithCode).not.toHaveBeenCalled();
  });
});

describe("POST /api/workos/authenticate", () => {
  beforeEach(() => {
    mockAuthenticateWithCode.mockClear();
  });

  it("returns 400 when code is missing", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { action: "authenticate" },
      body: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: "Invalid code" });
  });

  it("returns 400 when grant_type is not a string", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { action: "authenticate" },
      body: { grant_type: 123 },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: "Invalid grant_type",
      type: "invalid_request_error",
    });
  });

  it("exchanges code for tokens on success", async () => {
    mockAuthenticateWithCode.mockResolvedValue({
      user: { id: "user-1" },
      accessToken: makeFakeJwt(),
      sealedSession: "sealed",
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { action: "authenticate" },
      body: { code: "auth-code", code_verifier: "verifier123" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockAuthenticateWithCode).toHaveBeenCalled();
  });

  it("returns 400 for refresh_token grant without token", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { action: "authenticate" },
      body: { grant_type: "refresh_token" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: "Invalid refresh token",
      type: "invalid_request_error",
    });
  });
});

describe("GET /api/workos/logout", () => {
  beforeEach(() => {
    mockGetSession.mockClear();
    mockRevokeSession.mockClear();
  });

  it("clears session cookies and redirects", async () => {
    mockGetSession.mockResolvedValue(null);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { action: "logout" },
    });

    await handler(req, res);

    // Should redirect to static website URL (default when no returnTo).
    expect(res._getRedirectUrl()).toBe("https://dust.tt");

    // Should clear both workos_session and indicator cookies.
    const cookies = res.getHeader("Set-Cookie");
    expect(Array.isArray(cookies)).toBe(true);
    const cookieArr = cookies as string[];
    expect(
      cookieArr.some(
        (c: string) =>
          c.includes("workos_session=") &&
          c.includes("Expires=Thu, 01 Jan 1970")
      )
    ).toBe(true);
    expect(
      cookieArr.some(
        (c: string) =>
          c.includes("dust-has-session=") &&
          c.includes("Expires=Thu, 01 Jan 1970")
      )
    ).toBe(true);
  });

  it("revokes WorkOS session when session exists", async () => {
    mockGetSession.mockResolvedValue({
      type: "workos",
      sessionId: "sess-to-revoke",
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { action: "logout" },
    });

    await handler(req, res);

    expect(mockRevokeSession).toHaveBeenCalledWith({
      sessionId: "sess-to-revoke",
    });
  });

  it("rejects absolute returnTo URLs", async () => {
    mockGetSession.mockResolvedValue(null);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { action: "logout", returnTo: "https://evil.com" },
    });

    await handler(req, res);

    // Should redirect to static website URL (default), not evil.com.
    expect(res._getRedirectUrl()).toBe("https://dust.tt");
  });
});

describe("POST /api/workos/revoke-session", () => {
  beforeEach(() => {
    mockRevokeSession.mockClear();
  });

  it("returns 405 for non-POST requests", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { action: "revoke-session" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({ error: "Method not allowed" });
  });

  it("returns 400 when session_id is missing", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { action: "revoke-session" },
      body: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: "Invalid session_id" });
  });

  it("revokes session and returns success", async () => {
    mockRevokeSession.mockResolvedValue(undefined);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { action: "revoke-session" },
      body: { session_id: "sess-1" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(mockRevokeSession).toHaveBeenCalledWith({ sessionId: "sess-1" });
  });
});
