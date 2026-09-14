import { finalizeUriForProvider } from "@app/lib/api/oauth/utils";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  getDevOAuthRedirectBaseUrl: vi.fn(),
  getAppUrl: vi.fn(),
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
    config.getDevOAuthRedirectBaseUrl.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("sends new connections to the app URL", () => {
    expect(
      finalizeUriForProvider({ provider: "google_drive", connection: null })
    ).toBe("https://app.dust.tt/oauth/google_drive/finalize");
  });

  it("returns a connection's stored redirect URI verbatim", () => {
    expect(
      finalizeUriForProvider({
        provider: "github",
        connection: connection(
          new Date("2026-01-01").getTime(),
          "https://us-api.dust.tt/oauth/github/finalize"
        ),
      })
    ).toBe("https://us-api.dust.tt/oauth/github/finalize");
  });

  it("sends connections without a stored URI to the app URL", () => {
    expect(
      finalizeUriForProvider({
        provider: "github",
        connection: connection(new Date("2026-01-01").getTime(), null),
      })
    ).toBe("https://app.dust.tt/oauth/github/finalize");
  });

  it("prefers the development base URL in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    config.getDevOAuthRedirectBaseUrl.mockReturnValue("https://dev.example");
    expect(
      finalizeUriForProvider({ provider: "notion", connection: null })
    ).toBe("https://dev.example/oauth/notion/finalize");
  });

  it("does not use the development base URL outside development", () => {
    vi.stubEnv("NODE_ENV", "production");
    config.getDevOAuthRedirectBaseUrl.mockReturnValue("https://dev.example");
    expect(
      finalizeUriForProvider({ provider: "notion", connection: null })
    ).toBe("https://app.dust.tt/oauth/notion/finalize");
  });
});
