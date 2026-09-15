import { finalizeUriForProvider } from "@app/lib/api/oauth/utils";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  getDevOAuthRedirectBaseUrl: vi.fn(),
  getAppUrl: vi.fn(),
  getLegacyOAuthRedirectBaseUrl: vi.fn(),
}));

vi.mock("@app/lib/api/config", () => ({ default: config }));

function connection(
  created: number,
  redirectUri?: string | null
): OAuthConnectionType {
  return {
    connection_id: "con_test",
    created,
    metadata: {},
    provider: "github",
    status: "finalized",
    redirect_uri: redirectUri,
  };
}

describe("finalizeUriForProvider", () => {
  beforeEach(() => {
    config.getAppUrl.mockReturnValue("https://app.dust.tt");
    config.getLegacyOAuthRedirectBaseUrl.mockReturnValue("https://eu.dust.tt");
    config.getDevOAuthRedirectBaseUrl.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("keeps the app URL when no use case is supplied", () => {
    expect(
      finalizeUriForProvider({ provider: "google_drive", connection: null })
    ).toBe("https://app.dust.tt/oauth/google_drive/finalize");
  });

  it.each([
    "https://dust.tt",
    "https://eu.dust.tt",
  ])("uses %s for a new data connector", (legacyBaseUrl) => {
    config.getLegacyOAuthRedirectBaseUrl.mockReturnValue(legacyBaseUrl);
    expect(
      finalizeUriForProvider({
        provider: "google_drive",
        connection: null,
        useCase: "connection",
      })
    ).toBe(`${legacyBaseUrl}/oauth/google_drive/finalize`);
  });

  it("uses the stored use case when a connector has no saved callback", () => {
    expect(
      finalizeUriForProvider({
        provider: "notion",
        connection: {
          ...connection(Date.now()),
          provider: "notion",
          metadata: { use_case: "connection" },
        },
      })
    ).toBe("https://eu.dust.tt/oauth/notion/finalize");
  });

  it("prefers the explicit use case over connection metadata", () => {
    expect(
      finalizeUriForProvider({
        provider: "notion",
        useCase: "platform_actions",
        connection: {
          ...connection(Date.now()),
          provider: "notion",
          metadata: { use_case: "connection" },
        },
      })
    ).toBe("https://app.dust.tt/oauth/notion/finalize");
  });

  it.each([
    "mcp",
    "mcp_static",
  ] as const)("uses the legacy base for a new %s client", (provider) => {
    expect(finalizeUriForProvider({ provider, connection: null })).toBe(
      `https://eu.dust.tt/oauth/${provider}/finalize`
    );
  });

  it.each([
    "mcp",
    "mcp_static",
  ] as const)("preserves an app callback already registered for %s", (provider) => {
    const redirectUri = `https://app.dust.tt/oauth/${provider}/finalize`;
    expect(
      finalizeUriForProvider({
        provider,
        connection: { ...connection(Date.now(), redirectUri), provider },
      })
    ).toBe(redirectUri);
  });

  it("returns a connection's stored redirect URI verbatim", () => {
    expect(
      finalizeUriForProvider({
        provider: "github",
        useCase: "connection",
        connection: connection(
          new Date("2026-01-01").getTime(),
          "https://us-api.dust.tt/oauth/github/finalize"
        ),
      })
    ).toBe("https://us-api.dust.tt/oauth/github/finalize");
  });

  it("keeps an app callback already saved for a connector", () => {
    const redirectUri = "https://app.dust.tt/oauth/notion/finalize";
    expect(
      finalizeUriForProvider({
        provider: "notion",
        useCase: "connection",
        connection: {
          ...connection(Date.now(), redirectUri),
          provider: "notion",
        },
      })
    ).toBe(redirectUri);
  });

  it("sends connections without a stored URI to the app URL", () => {
    expect(
      finalizeUriForProvider({
        provider: "github",
        connection: connection(new Date("2026-01-01").getTime(), null),
      })
    ).toBe("https://app.dust.tt/oauth/github/finalize");
  });

  it.each([
    "notion",
    "mcp",
    "mcp_static",
  ] as const)("prefers the development base URL for %s in development", (provider) => {
    vi.stubEnv("NODE_ENV", "development");
    config.getDevOAuthRedirectBaseUrl.mockReturnValue("https://dev.example");
    expect(
      finalizeUriForProvider({
        provider,
        connection: null,
        useCase: "connection",
      })
    ).toBe(`https://dev.example/oauth/${provider}/finalize`);
  });

  it("does not use the development base URL outside development", () => {
    vi.stubEnv("NODE_ENV", "production");
    config.getDevOAuthRedirectBaseUrl.mockReturnValue("https://dev.example");
    expect(
      finalizeUriForProvider({ provider: "notion", connection: null })
    ).toBe("https://app.dust.tt/oauth/notion/finalize");
  });
});
